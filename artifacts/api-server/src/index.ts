import http from "http";
import app from "./app";
import { initSocket } from "./socket";
import { logger } from "./lib/logger";
import { pool, db, ridePricingTable, vehicleColorsTable, carCategoriesTable, settingsTable } from "@workspace/db";
import { startRideTimeoutJob } from "./lib/ride-timeout";
import { startCheckinMonitor } from "./lib/checkin-monitor";
import { startShuttleJob } from "./lib/shuttle-job";
import { startDriverNoShowMonitor } from "./lib/driver-noshow-monitor";
import { initSurgePricing, startSurgePricingJob } from "./lib/surge-pricing";
import { initWaitingTimers } from "./lib/waiting-timer";
import { initNoShowTimers } from "./lib/no-show-monitor";
import { warmupFaceDetection } from "./lib/face-detection";
import { registerDefaultHandlers } from "./lib/jobQueue";
import { recoverActiveDispatches } from "./lib/dispatch-manager";
import { seedSuperAdmin } from "./lib/seed";

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
  await seedSuperAdmin();
  // Seed default delivery pricing if not already present
  try {
    await db.insert(ridePricingTable).values({
      vehicleType: "delivery",
      baseFare: "5.00",
      perKmRate: "3.00",
      perMinuteRate: "0.50",
      minimumFare: "15.00",
      isActive: true,
    }).onConflictDoNothing();
  } catch (_seedErr) {
    // Non-fatal if delivery pricing already exists
  }

  // Seed scooter pricing (Fix 3)
  try {
    await db.insert(ridePricingTable).values({
      vehicleType: "scooter",
      baseFare: "3.00",
      perKmRate: "2.00",
      perMinuteRate: "0.30",
      minimumFare: "8.00",
      isActive: true,
    }).onConflictDoNothing();
  } catch (_seedErr) { /* non-fatal */ }

  // Seed car categories (Fix 2)
  try {
    const CAR_CATEGORIES = [
      { slug: "economy",      name: "Economy",      minYear: 2000, maxYear: 2007, baseFare: "10.00", perKmRate: "3.50", perMinuteRate: "0.50", minimumFare: "15.00", isActive: true, sortOrder: 1 },
      { slug: "economy_plus", name: "Economy Plus", minYear: 2008, maxYear: 2019, baseFare: "12.00", perKmRate: "4.00", perMinuteRate: "0.75", minimumFare: "20.00", isActive: true, sortOrder: 2 },
      { slug: "comfort",      name: "Comfort",      minYear: 2020, maxYear: null, baseFare: "15.00", perKmRate: "5.00", perMinuteRate: "1.00", minimumFare: "25.00", isActive: true, sortOrder: 3 },
    ] as const;
    for (const cat of CAR_CATEGORIES) {
      await db.insert(carCategoriesTable).values(cat).onConflictDoNothing();
    }
  } catch (_seedErr) { /* non-fatal */ }

  // Seed vehicle colors
  try {
    const COLORS = [
      { nameAr: "أبيض", nameEn: "White",  hexCode: "#FFFFFF" },
      { nameAr: "أسود", nameEn: "Black",  hexCode: "#000000" },
      { nameAr: "رمادي", nameEn: "Gray",  hexCode: "#808080" },
      { nameAr: "فضي",  nameEn: "Silver", hexCode: "#C0C0C0" },
      { nameAr: "أحمر", nameEn: "Red",    hexCode: "#FF0000" },
      { nameAr: "أزرق", nameEn: "Blue",   hexCode: "#0000FF" },
      { nameAr: "أخضر", nameEn: "Green",  hexCode: "#008000" },
      { nameAr: "بني",  nameEn: "Brown",  hexCode: "#8B4513" },
      { nameAr: "بيج",  nameEn: "Beige",  hexCode: "#F5F5DC" },
      { nameAr: "ذهبي", nameEn: "Gold",   hexCode: "#FFD700" },
    ];
    for (const c of COLORS) {
      await db.insert(vehicleColorsTable).values(c).onConflictDoNothing();
    }
  } catch (_seedErr) { /* non-fatal */ }

  // Seed default settings keys (Fix 4)
  try {
    const DEFAULT_SETTINGS = [
      { key: "commission_rate",               value: "15" },
      { key: "dispatch_radius_km",            value: "5"  },
      { key: "dispatch_max_radius_km",        value: "7"  },
      { key: "dispatch_offer_timeout_seconds",value: "15" },
      { key: "no_show_fee_egp",               value: "15" },
      { key: "cancellation_grace_hours",      value: "10" },
    ];
    for (const s of DEFAULT_SETTINGS) {
      await db.insert(settingsTable).values(s).onConflictDoNothing();
    }
  } catch (_seedErr) { /* non-fatal */ }
  await registerDefaultHandlers();
  // Seed in-memory surge map from DB before the socket server starts accepting
  // connections — passengers receive an accurate snapshot immediately on connect.
  await initSurgePricing();
  // Re-hydrate in-memory waiting timers for any rides already in driver_arrived state.
  await initWaitingTimers();
  // Re-hydrate no-show timers; rides past the window will be cancelled on the next tick.
  await initNoShowTimers();

  const httpServer = http.createServer(app);
  initSocket(httpServer);
  startRideTimeoutJob();
  startCheckinMonitor();
  // Start after initSocket so the first tick's WebSocket emit has a live server.
  startSurgePricingJob();

  // Pre-warm face-detection models in the background (non-blocking)
  warmupFaceDetection().catch((err) =>
    logger.error({ err }, "Face-detection warmup failed on startup"),
  );

  startShuttleJob();
  startDriverNoShowMonitor();

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
