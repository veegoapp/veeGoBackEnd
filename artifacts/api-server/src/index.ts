import http from "http";
import app from "./app";
import { initSocket } from "./socket";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";
import { startRideTimeoutJob } from "./lib/ride-timeout";
import { startCheckinMonitor } from "./lib/checkin-monitor";
import { warmupFaceDetection } from "./lib/face-detection";
import { registerDefaultHandlers } from "./lib/jobQueue";
import { recoverActiveDispatches } from "./lib/dispatch-manager";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const _dbUrl = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;
if (!_dbUrl) {
  throw new Error(
    "DATABASE_URL (or NEON_DATABASE_URL) is required but was not set. " +
    "Add it to your Replit Secrets before starting the server."
  );
}

async function verifyDatabaseConnection(retries = 5, delayMs = 2000): Promise<void> {
  const connectionString = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
  const provider = connectionString.includes("neon.tech") ? "Neon PostgreSQL" : "PostgreSQL";
  const maskedUrl = connectionString.replace(/:\/\/[^@]+@/, "://***:***@");
  logger.info({ provider, maskedUrl }, "Active database connection");

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const client = await pool.connect();
      await client.query("SELECT 1");
      client.release();
      logger.info({ provider }, "Database connection verified");
      return;
    } catch (err) {
      if (attempt === retries) {
        logger.error({ err, attempts: retries }, "Database connection failed after all retries");
        process.exit(1);
      }
      logger.warn({ err, attempt, retries, nextRetryMs: delayMs }, "Database connection attempt failed, retrying...");
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

const CORE_TABLES = ["users", "rides", "drivers", "trips", "bookings"];

async function verifyCoreTables(): Promise<void> {
  const client = await pool.connect();
  try {
    const result = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1)`,
      [CORE_TABLES]
    );
    const found = result.rows.map((r) => r.tablename);
    const missing = CORE_TABLES.filter((t) => !found.includes(t));
    if (missing.length > 0) {
      logger.error(
        { missing },
        "Required database tables are missing. " +
        "Run `pnpm --filter @workspace/db run push` to create them, " +
        "or use `pnpm --filter @workspace/api-server run dev` which runs push automatically."
      );
      process.exit(1);
    }
    logger.info({ tables: found }, "Core database tables verified");
  } finally {
    client.release();
  }
}

async function main() {
  await verifyDatabaseConnection();
  await verifyCoreTables();
  await registerDefaultHandlers();

  const httpServer = http.createServer(app);
  initSocket(httpServer);
  startRideTimeoutJob();
  startCheckinMonitor();

  // Pre-warm face-detection models in the background (non-blocking)
  warmupFaceDetection().catch((err) =>
    logger.error({ err }, "Face-detection warmup failed on startup"),
  );

  httpServer.listen(port, () => {
    recoverActiveDispatches().catch((err) =>
      logger.error({ err }, "Dispatch recovery failed on startup"),
    );
    logger.info({ port }, "Server listening");
  });

  httpServer.on("error", (err) => {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  });
}

main();
