import pg from "pg";

const { Pool } = pg;

const connectionString = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("No database connection string found.");

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes("neon.tech") ? { rejectUnauthorized: false } : undefined,
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`
      ALTER TABLE trips
        ADD COLUMN IF NOT EXISTS accepted_at  TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS arrived_at   TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS started_at   TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
    `);
    console.log("✓ trips: lifecycle timestamp columns added");

    await client.query(`
      CREATE TABLE IF NOT EXISTS trip_events (
        id         SERIAL PRIMARY KEY,
        trip_id    INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        type       TEXT NOT NULL,
        metadata   JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log("✓ trip_events table created");

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_trip_events_trip_id   ON trip_events(trip_id);
      CREATE INDEX IF NOT EXISTS idx_trip_events_type      ON trip_events(type);
      CREATE INDEX IF NOT EXISTS idx_trip_events_created_at ON trip_events(created_at);
    `);
    console.log("✓ trip_events indexes created");

    await client.query("COMMIT");
    console.log("Migration complete.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
