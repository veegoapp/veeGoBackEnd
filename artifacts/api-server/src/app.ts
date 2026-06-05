import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import swaggerUi from "swagger-ui-express";
import router from "./routes";
import { logger } from "./lib/logger";
import swaggerSpec from "./lib/swagger";
import { traceMiddleware } from "./lib/trace";

const app: Express = express();

// ─── CORS whitelist ────────────────────────────────────────────────────────────
const allowedOrigins: string[] = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
  "http://localhost:5000",
  "http://localhost:5173",
  "http://localhost:8080",
];
if (process.env.REPLIT_DEV_DOMAIN) {
  allowedOrigins.push(`https://${process.env.REPLIT_DEV_DOMAIN}`);
}

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (
      !origin ||
      allowedOrigins.some((o) => origin.startsWith(o)) ||
      /^https:\/\/[^.]+\.replit\.dev(:\d+)?$/.test(origin) ||
      /^https:\/\/[^.]+\.kirk\.replit\.dev(:\d+)?$/.test(origin) ||
      /^https:\/\/[^.]+\.expo\.dev(:\d+)?$/.test(origin)
    ) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin not allowed — ${origin}`));
    }
  },
  credentials: true,
};

app.set("trust proxy", 1);
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use(cors(corsOptions));

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/auth", authLimiter);
app.use("/api/driver/auth", authLimiter);
app.use("/api", apiLimiter);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(traceMiddleware);

app.use("/api", router);

// ─── Swagger docs ─────────────────────────────────────────────────────────────
const serveSpec = (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", "attachment; filename=openapi.json");
  res.send(swaggerSpec);
};

app.get("/api/docs/json", serveSpec);
app.get("/api/swagger.json", serveSpec);
app.get("/api/openapi.json", serveSpec);

app.use(
  "/api/docs",
  (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;",
    );
    next();
  },
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, { customSiteTitle: "VeeGo API Docs" }),
);

// ─── 404 handler ──────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

// ─── Global error handler ──────────────────────────────────────────────────────
// Express 5 automatically forwards async route errors here.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : "Internal server error";
  logger.error({ err }, "Unhandled route error");
  if (!res.headersSent) {
    res.status(500).json({ error: message });
  }
});

export default app;
