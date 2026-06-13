import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import router from "./routes";
import { logger } from "./lib/logger";
import { traceMiddleware } from "./lib/trace";

const app: Express = express();

// ─── CORS whitelist ────────────────────────────────────────────────────────────
const isProduction = process.env.NODE_ENV === "production";

const allowedOrigins: string[] = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
  "http://localhost:5000",
  "http://localhost:5173",
  "http://localhost:8080",
];

// في الـ Production: استخدم الدومين الحقيقي بتاعك بس
if (isProduction) {
  const productionOrigin = process.env.ALLOWED_ORIGIN;
  if (productionOrigin) {
    allowedOrigins.length = 0; // امسح الـ localhost كلها
    allowedOrigins.push(productionOrigin);
  } else {
    logger.warn("ALLOWED_ORIGIN غير مضبوط في الـ Production — CORS هيبقى مقيد جداً");
  }
} else {
  // في التطوير فقط: اسمح بـ Replit و Expo
  if (process.env.REPLIT_DEV_DOMAIN) {
    allowedOrigins.push(`https://${process.env.REPLIT_DEV_DOMAIN}`);
  }
}

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      // طلبات من السيرفر نفسه (بدون origin) مسموح بيها دايماً
      callback(null, true);
      return;
    }

    const allowed = allowedOrigins.some((o) => origin.startsWith(o));

    if (allowed) {
      callback(null, true);
    } else if (!isProduction && (
      /^https:\/\/[^.]+\.replit\.dev(:\d+)?$/.test(origin) ||
      /^https:\/\/[^.]+\.kirk\.replit\.dev(:\d+)?$/.test(origin) ||
      /^https:\/\/[^.]+\.expo\.dev(:\d+)?$/.test(origin)
    )) {
      // في التطوير بس: اسمح بـ Replit و Expo
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
