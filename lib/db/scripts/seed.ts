/**
 * Full database seed — orchestrates all sub-seeds in order
 * Idempotent — safe to run on an existing database
 */
import { seedAdmin } from "./seed-admin.js";
import { seedRoutes } from "./seed-routes.js";
import { seedBuses } from "./seed-buses.js";
import { seedTrips } from "./seed-trips.js";
import { verifyDb } from "./verify-db.js";
import pg from "pg";

const { Pool } = pg;

const connectionString = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("No DATABASE connection string found.");

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes("neon.tech") ? { rejectUnauthorized: false } : undefined,
});

async function seed(): Promise<void> {
  console.log("╔══════════════════════════════════════╗");
  console.log("║      ShuttleOps — Database Seed      ║");
  console.log("╚══════════════════════════════════════╝\n");

  const dbUrl = connectionString ?? "";
  const provider = dbUrl.includes("neon.tech") ? "Neon PostgreSQL" : "PostgreSQL";
  console.log(`📡 Provider  : ${provider}`);
  console.log(`🔗 Database  : ${dbUrl.split("@")[1]?.split("?")[0] ?? "unknown"}`);
  console.log(`🕒 Started   : ${new Date().toISOString()}\n`);

  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
    console.log("✓ Database connection verified\n");
  } finally {
    client.release();
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  await seedAdmin();

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  await seedRoutes();

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  await seedBuses();

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  await seedTrips();

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  await verifyDb();

  console.log("\n╔══════════════════════════════════════╗");
  console.log("║       Seed complete — all done!      ║");
  console.log("╚══════════════════════════════════════╝\n");
}

seed()
  .then(() => pool.end())
  .catch((err) => {
    console.error("\n❌ Seed failed:", err);
    process.exit(1);
  });
