/**
 * Reset: Truncate all tables (DEVELOPMENT ONLY)
 * Requires NODE_ENV=development and CONFIRM_RESET=yes
 */
import pg from "pg";

const { Pool } = pg;

if (process.env.NODE_ENV !== "development") {
  console.error("❌ reset-db can only run in NODE_ENV=development");
  process.exit(1);
}

if (process.env.CONFIRM_RESET !== "yes") {
  console.error("❌ Set CONFIRM_RESET=yes to proceed with database reset.");
  console.error("   Example: CONFIRM_RESET=yes NODE_ENV=development pnpm reset:db");
  process.exit(1);
}

const connectionString = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("No DATABASE connection string found.");

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes("neon.tech") ? { rejectUnauthorized: false } : undefined,
});

const TABLES_IN_ORDER = [
  "trip_station_progress",
  "bookings",
  "wallet_transactions",
  "driver_earnings",
  "driver_documents",
  "notifications",
  "support_messages",
  "support_tickets",
  "route_suggestions",
  "promo_codes",
  "trips",
  "stations",
  "routes",
  "drivers",
  "buses",
  "staff_roles",
  "users",
];

async function resetDb(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    console.log("⚠️  RESETTING DATABASE (development only)...\n");

    for (const table of TABLES_IN_ORDER) {
      await client.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`);
      console.log(`  ✓ Truncated: ${table}`);
    }

    await client.query("COMMIT");
    console.log("\n✅ Database reset complete. Run pnpm seed to restore base data.\n");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

resetDb()
  .then(() => pool.end())
  .catch((err) => { console.error("❌ Reset failed:", err); process.exit(1); });
