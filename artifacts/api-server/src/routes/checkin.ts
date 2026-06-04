import { Router } from "express";
import path from "node:path";
import crypto from "node:crypto";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { db, driversTable, driverCheckInsTable } from "@workspace/db";
import { eq, desc, and, gte } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { detectFace } from "../lib/face-detection";
import { getIO } from "../socket";
import { SOCKET_EVENTS, SOCKET_ROOMS } from "../lib/socket-events";

const router = Router();

// ─── Supabase storage ─────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { realtime: { transport: ws } },
);

const BUCKET = process.env.SUPABASE_BUCKET ?? "uploads";

// ─── Multer (selfie upload, 8 MB max) ─────────────────────────────────────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed (jpeg, png, webp)"));
    }
  },
});

// ─── POST /driver/checkin ─────────────────────────────────────────────────────
// Body (multipart/form-data):
//   file      — required, the selfie image
//   tripId    — optional, numeric string; present for shuttle_trip_start check-ins

router.post(
  "/driver/checkin",
  authenticate,
  requireRole("driver"),
  upload.single("file"),
  async (req, res): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
      }

      // Resolve the driver record
      const [driver] = await db
        .select({
          id:               driversTable.id,
          isOnline:         driversTable.isOnline,
          checkInRequired:  driversTable.checkInRequired,
          checkInDeadline:  driversTable.checkInDeadline,
        })
        .from(driversTable)
        .where(eq(driversTable.userId, req.user!.id));

      if (!driver) {
        res.status(404).json({ error: "Driver profile not found" });
        return;
      }

      // Parse optional tripId
      const rawTripId = req.body.tripId ? parseInt(req.body.tripId as string, 10) : null;
      if (req.body.tripId !== undefined && (rawTripId === null || isNaN(rawTripId))) {
        res.status(400).json({ error: "Invalid tripId" });
        return;
      }

      const checkInType = rawTripId ? "shuttle_trip_start" : "periodic_online";

      // Upload selfie to Supabase storage
      const ext = path.extname(req.file.originalname).toLowerCase() || ".jpg";
      const filename = `${Date.now()}_${crypto.randomBytes(6).toString("hex")}${ext}`;
      const storagePath = `checkins/driver_${driver.id}/${checkInType}/${filename}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false,
        });

      if (uploadError) {
        res.status(500).json({ error: "Failed to upload selfie", detail: uploadError.message });
        return;
      }

      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
      const imageUrl = urlData.publicUrl;

      // Run face detection
      const faceDetected = await detectFace(req.file.buffer);

      // Insert check-in record
      const now = new Date();
      const [checkin] = await db
        .insert(driverCheckInsTable)
        .values({
          driverId:     driver.id,
          tripId:       rawTripId ?? undefined,
          checkInType,
          imageUrl,
          faceDetected,
          submittedAt:  now,
        })
        .returning();

      // If face detected — clear the check-in gate on the driver
      if (faceDetected) {
        await db
          .update(driversTable)
          .set({
            checkInRequired: false,
            checkInDeadline: null,
            lastCheckInAt:   now,
          })
          .where(eq(driversTable.id, driver.id));

        getIO()
          .to(SOCKET_ROOMS.DRIVER(req.user!.id))
          .emit(SOCKET_EVENTS.DRIVER_CHECKIN_APPROVED, {
            checkinId:   checkin.id,
            checkInType,
            submittedAt: now,
          });
      } else {
        getIO()
          .to(SOCKET_ROOMS.DRIVER(req.user!.id))
          .emit(SOCKET_EVENTS.DRIVER_CHECKIN_REJECTED, {
            checkinId:   checkin.id,
            checkInType,
            submittedAt: now,
            reason:      "No face detected in the image — please retake your selfie in a well-lit area.",
          });
      }

      res.status(201).json({
        ...checkin,
        message: faceDetected
          ? "Check-in accepted"
          : "No face detected — please retake your selfie",
      });
    } catch (err) {
      console.error("POST /driver/checkin error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ─── GET /driver/checkin/status ───────────────────────────────────────────────
// Returns the driver's current check-in gate state and recent check-in history.

router.get(
  "/driver/checkin/status",
  authenticate,
  requireRole("driver"),
  async (req, res): Promise<void> => {
    try {
      const [driver] = await db
        .select({
          id:               driversTable.id,
          isOnline:         driversTable.isOnline,
          onlineSince:      driversTable.onlineSince,
          checkInRequired:  driversTable.checkInRequired,
          checkInDeadline:  driversTable.checkInDeadline,
          lastCheckInAt:    driversTable.lastCheckInAt,
        })
        .from(driversTable)
        .where(eq(driversTable.userId, req.user!.id));

      if (!driver) {
        res.status(404).json({ error: "Driver profile not found" });
        return;
      }

      // Fetch last 5 check-ins for the driver
      const recentCheckins = await db
        .select()
        .from(driverCheckInsTable)
        .where(eq(driverCheckInsTable.driverId, driver.id))
        .orderBy(desc(driverCheckInsTable.submittedAt))
        .limit(5);

      res.json({
        checkInRequired:  driver.checkInRequired,
        checkInDeadline:  driver.checkInDeadline,
        lastCheckInAt:    driver.lastCheckInAt,
        isOnline:         driver.isOnline,
        onlineSince:      driver.onlineSince,
        recentCheckins,
      });
    } catch (err) {
      console.error("GET /driver/checkin/status error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ─── GET /admin/checkins ──────────────────────────────────────────────────────
// Step 9 — admin list with optional filters: driverId, faceDetected, checkInType

router.get(
  "/admin/checkins",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    try {
      const page  = Math.max(1, parseInt((req.query.page  as string) || "1",  10));
      const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || "50", 10)));
      const offset = (page - 1) * limit;

      const driverIdRaw = req.query.driverId ? parseInt(req.query.driverId as string, 10) : null;
      const faceDetectedRaw = req.query.faceDetected;
      const checkInTypeRaw  = req.query.checkInType as string | undefined;

      const conditions: ReturnType<typeof eq>[] = [];

      if (driverIdRaw && !isNaN(driverIdRaw)) {
        conditions.push(eq(driverCheckInsTable.driverId, driverIdRaw));
      }
      if (faceDetectedRaw === "true" || faceDetectedRaw === "false") {
        conditions.push(eq(driverCheckInsTable.faceDetected, faceDetectedRaw === "true"));
      }
      if (checkInTypeRaw === "shuttle_trip_start" || checkInTypeRaw === "periodic_online") {
        conditions.push(eq(driverCheckInsTable.checkInType, checkInTypeRaw));
      }

      // Optional date range
      const since = req.query.since ? new Date(req.query.since as string) : null;
      if (since && !isNaN(since.getTime())) {
        conditions.push(gte(driverCheckInsTable.submittedAt, since) as ReturnType<typeof eq>);
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [rows, countRows] = await Promise.all([
        db
          .select({
            checkin:     driverCheckInsTable,
            driverName:  driversTable.name,
            driverPhone: driversTable.phone,
          })
          .from(driverCheckInsTable)
          .leftJoin(driversTable, eq(driverCheckInsTable.driverId, driversTable.id))
          .where(where)
          .orderBy(desc(driverCheckInsTable.submittedAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ count: driverCheckInsTable.id })
          .from(driverCheckInsTable)
          .where(where),
      ]);

      const data = rows.map(({ checkin, driverName, driverPhone }) => ({
        ...checkin,
        driver: { name: driverName, phone: driverPhone },
      }));

      res.json({ data, total: countRows.length, page, limit });
    } catch (err) {
      console.error("GET /admin/checkins error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
