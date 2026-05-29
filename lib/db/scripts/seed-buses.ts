/**
 * Seed: Starter buses
 * Idempotent — skips existing plate numbers
 */
import pg from "pg";

const { Pool } = pg;

const connectionString = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("No DATABASE connection string found.");

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes("neon.tech") ? { rejectUnauthorized: false } : undefined,
});

const BUSES = [
  { plateNumber: "Q T S - 1 0 1", capacity: 14, model: "Toyota Coaster 2022", isActive: true },
  { plateNumber: "Q T S - 1 0 2", capacity: 14, model: "Toyota Coaster 2022", isActive: true },
  { plateNumber: "Q T S - 2 0 1", capacity: 30, model: "Hyundai County 2021", isActive: true },
  { plateNumber: "Q T S - 2 0 2", capacity: 30, model: "Hyundai County 2021", isActive: true },
  { plateNumber: "Q T S - 3 0 1", capacity: 45, model: "Mercedes Sprinter 519 CDI 2023", isActive: true },
  { plateNumber: "Q T S - 3 0 2", capacity: 45, model: "Mercedes Sprinter 519 CDI 2023", isActive: true },
  { plateNumber: "Q T S - 4 0 1", capacity: 50, model: "King Long XMQ6127 2022", isActive: true },
  { plateNumber: "Q T S - 4 0 2", capacity: 50, model: "King Long XMQ6127 2022", isActive: true },
  { plateNumber: "Q T S - 5 0 1", capacity: 14, model: "Nissan Urvan 2023", isActive: false },
  { plateNumber: "Q T S - 5 0 2", capacity: 14, model: "Nissan Urvan 2023", isActive: false },
];

export async function seedBuses(): Promise<{ inserted: number; skipped: number }> {
  const client = await pool.connect();
  let inserted = 0;
  let skipped = 0;

  try {
    await client.query("BEGIN");
    console.log("🚌 Seeding buses...");

    for (const bus of BUSES) {
      const result = await client.query(
        `INSERT INTO buses (plate_number, capacity, model, is_active)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (plate_number) DO NOTHING
         RETURNING id`,
        [bus.plateNumber, bus.capacity, bus.model, bus.isActive]
      );

      if (result.rows.length > 0) {
        inserted++;
        console.log(`  ✓ Bus: ${bus.plateNumber} — ${bus.model} (${bus.capacity} seats)`);
      } else {
        skipped++;
        console.log(`  ↻ Skipped (exists): ${bus.plateNumber}`);
      }
    }

    await client.query("COMMIT");
    console.log(`\n✅ Buses seed complete: ${inserted} inserted, ${skipped} skipped.\n`);
    return { inserted, skipped };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedBuses()
    .then(() => pool.end())
    .catch((err) => { console.error("❌ Buses seed failed:", err); process.exit(1); });
}
