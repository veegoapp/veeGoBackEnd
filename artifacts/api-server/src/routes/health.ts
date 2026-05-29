import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

router.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

router.get("/health/db", async (_req, res): Promise<void> => {
  const start = Date.now();
  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    const latencyMs = Date.now() - start;
    res.json({
      status: "ok",
      database: "connected",
      latencyMs,
      provider: "neon",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "Database health check failed");
    res.status(503).json({
      status: "error",
      database: "disconnected",
      error: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
