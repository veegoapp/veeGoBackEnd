import path from "node:path";
import { createRequire } from "node:module";
import sharp from "sharp";
import { logger } from "./logger.js";

// ─── Types ────────────────────────────────────────────────────────────────────

type TinyFaceDetectorOptions = new (opts?: { scoreThreshold?: number; inputSize?: number }) => unknown;

interface FaceApiModule {
  nets: {
    tinyFaceDetector: {
      loadFromDisk: (modelPath: string) => Promise<void>;
      isLoaded: boolean;
    };
  };
  TinyFaceDetectorOptions: TinyFaceDetectorOptions;
  detectSingleFace: (
    input: unknown,
    options: unknown,
  ) => Promise<{ score: number } | undefined>;
}

// ─── State ────────────────────────────────────────────────────────────────────

let faceapi: FaceApiModule | null = null;
let initPromise: Promise<void> | null = null;

// ─── Initialization ───────────────────────────────────────────────────────────

async function initialize(): Promise<void> {
  if (faceapi) return;

  logger.info("face-detection: loading WASM backend...");

  // Import the WASM-backed face-api build (no native bindings required).
  // face-api.node-wasm.js registers the TF.js WASM backend and sets it as
  // the active backend on the shared @tensorflow/tfjs module instance.
  const mod = await import(
    /* webpackIgnore: true */
    "@vladmandic/face-api/dist/face-api.node-wasm.js"
  );
  faceapi = mod as unknown as FaceApiModule;

  // The WASM backend initializes asynchronously — wait until it is ready
  // before attempting to load or run any models.
  const tf = await import("@tensorflow/tfjs");
  await tf.ready();

  // Resolve model directory bundled inside the installed package.
  const req = createRequire(import.meta.url);
  const pkgRoot = path.dirname(
    req.resolve("@vladmandic/face-api/package.json"),
  );
  const modelPath = path.join(pkgRoot, "model");

  if (!faceapi.nets.tinyFaceDetector.isLoaded) {
    await faceapi.nets.tinyFaceDetector.loadFromDisk(modelPath);
  }

  logger.info("face-detection: ready (tiny-face-detector loaded, WASM backend)");
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Pre-warm: loads models at startup so the first detectFace() call is fast.
 * Safe to call multiple times — initialization runs exactly once.
 */
export async function warmupFaceDetection(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = initialize().catch((err) => {
    logger.error({ err }, "face-detection: initialization failed — face detection will be unavailable");
    faceapi = null;
    initPromise = null; // allow retry on next request
  });
  return initPromise;
}

/**
 * Returns true if a human face is detected in the image buffer.
 * Accepts any image format that sharp can decode (JPEG, PNG, WebP).
 * Resizes to max 640 px before processing to bound memory and latency.
 * Returns false if the face-detection module failed to initialize.
 */
export async function detectFace(imageBuffer: Buffer): Promise<boolean> {
  await warmupFaceDetection();

  if (!faceapi) {
    logger.warn("face-detection: module unavailable, returning faceDetected=false");
    return false;
  }

  // Resize + strip alpha → raw RGB pixels
  const { data, info } = await sharp(imageBuffer)
    .resize(640, 640, { fit: "inside", withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;

  // Import @tensorflow/tfjs — this resolves to the same module instance that
  // face-api.node-wasm.js already registered the WASM backend on.
  const tf = await import("@tensorflow/tfjs");
  await tf.ready();

  // Build a [height, width, 3] uint8 tensor from raw RGB pixels.
  // face-api accepts tf.Tensor3D at runtime despite the HTMLImageElement typedef.
  const tensor = tf.tensor3d(
    new Uint8Array(data),
    [height, width, 3] as [number, number, number],
  );

  try {
    const detection = await faceapi.detectSingleFace(
      tensor,
      new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5 }),
    );
    const found = detection !== undefined && detection !== null;
    logger.debug({ width, height, found }, "face-detection: scan complete");
    return found;
  } finally {
    tensor.dispose();
  }
}
