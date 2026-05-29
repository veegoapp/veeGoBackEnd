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
      ALTER TABLE drivers
        ADD COLUMN IF NOT EXISTS vehicle_type TEXT;
    `);
    console.log("✓ drivers: vehicle_type column added");

    await client.query(`
      CREATE TABLE IF NOT EXISTS ride_pricing (
        id              SERIAL PRIMARY KEY,
        vehicle_type    TEXT NOT NULL UNIQUE,
        base_fare       NUMERIC(10,2) NOT NULL,
        per_km_rate     NUMERIC(10,2) NOT NULL,
        per_minute_rate NUMERIC(10,2) NOT NULL DEFAULT 0,
        minimum_fare    NUMERIC(10,2) NOT NULL,
        is_active       BOOLEAN NOT NULL DEFAULT TRUE,
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log("✓ ride_pricing table created");

    await client.query(`
      INSERT INTO ride_pricing (vehicle_type, base_fare, per_km_rate, per_minute_rate, minimum_fare)
      VALUES
        ('car',  10.00, 5.00, 0.50, 20.00),
        ('bike',  6.00, 3.00, 0.30, 12.00)
      ON CONFLICT (vehicle_type) DO NOTHING;
    `);
    console.log("✓ ride_pricing seed rows inserted");

    await client.query(`
      CREATE TABLE IF NOT EXISTS rides (
        id                        SERIAL PRIMARY KEY,
        passenger_id              INTEGER NOT NULL REFERENCES users(id),
        driver_id                 INTEGER REFERENCES drivers(id),
        vehicle_type              TEXT NOT NULL,
        pickup_latitude           REAL NOT NULL,
        pickup_longitude          REAL NOT NULL,
        pickup_address            TEXT NOT NULL,
        dropoff_latitude          REAL NOT NULL,
        dropoff_longitude         REAL NOT NULL,
        dropoff_address           TEXT NOT NULL,
        distance_km               NUMERIC(8,3),
        estimated_duration_minutes INTEGER,
        estimated_price           NUMERIC(10,2),
        final_price               NUMERIC(10,2),
        status                    TEXT NOT NULL DEFAULT 'requested',
        cancel_reason             TEXT,
        cancel_note               TEXT,
        requested_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        driver_assigned_at        TIMESTAMPTZ,
        driver_arrived_at         TIMESTAMPTZ,
        started_at                TIMESTAMPTZ,
        completed_at              TIMESTAMPTZ,
        cancelled_at              TIMESTAMPTZ,
        created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log("✓ rides table created");

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_rides_passenger_id  ON rides(passenger_id);
      CREATE INDEX IF NOT EXISTS idx_rides_driver_id     ON rides(driver_id);
      CREATE INDEX IF NOT EXISTS idx_rides_vehicle_type  ON rides(vehicle_type);
      CREATE INDEX IF NOT EXISTS idx_rides_status        ON rides(status);
      CREATE INDEX IF NOT EXISTS idx_rides_requested_at  ON rides(requested_at);
    `);
    console.log("✓ rides indexes created");

    await client.query(`
      CREATE TABLE IF NOT EXISTS ride_events (
        id         SERIAL PRIMARY KEY,
        ride_id    INTEGER NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
        type       TEXT NOT NULL,
        metadata   JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log("✓ ride_events table created");

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ride_events_ride_id    ON ride_events(ride_id);
      CREATE INDEX IF NOT EXISTS idx_ride_events_type       ON ride_events(type);
      CREATE INDEX IF NOT EXISTS idx_ride_events_created_at ON ride_events(created_at);
    `);
    console.log("✓ ride_events indexes created");

    await client.query("COMMIT");
    console.log("\nMigration complete.");
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
