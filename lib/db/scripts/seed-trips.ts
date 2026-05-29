/**
 * Seed: Placeholder drivers + realistic recurring trip schedules
 * Idempotent — skips existing daily trips per route/hour/minute
 */
import pg from "pg";
import bcrypt from "bcryptjs";

const { Pool } = pg;

const connectionString = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("No DATABASE connection string found.");

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes("neon.tech") ? { rejectUnauthorized: false } : undefined,
});

const PLACEHOLDER_DRIVERS = [
  { name: "Ahmed Hassan",   phone: "01011000001", email: "driver1@shuttleops.com", licenseNumber: "DL-10001", nationalId: "28801010001001" },
  { name: "Mohamed Ali",    phone: "01011000002", email: "driver2@shuttleops.com", licenseNumber: "DL-10002", nationalId: "28901020002002" },
  { name: "Khaled Ibrahim", phone: "01011000003", email: "driver3@shuttleops.com", licenseNumber: "DL-10003", nationalId: "29001030003003" },
  { name: "Omar Mahmoud",   phone: "01011000004", email: "driver4@shuttleops.com", licenseNumber: "DL-10004", nationalId: "29101040004004" },
  { name: "Youssef Samir",  phone: "01011000005", email: "driver5@shuttleops.com", licenseNumber: "DL-10005", nationalId: "29201050005005" },
];

function pricingForDuration(durationMins: number): string {
  if (durationMins <= 60)  return (15 + Math.round((durationMins / 60) * 10)).toFixed(2);
  if (durationMins <= 100) return (25 + Math.round(((durationMins - 60) / 40) * 20)).toFixed(2);
  return (45 + Math.round(((durationMins - 100) / 50) * 30)).toFixed(2);
}

function departureTimesForDuration(durationMins: number): string[] {
  if (durationMins <= 70) {
    return [
      "06:00","06:30","07:00","07:30","08:00","08:30",
      "09:00","09:30","10:00","10:30","11:00",
      "12:00","13:00","14:00","15:00",
      "16:00","17:00","17:30","18:00","18:30","19:00","19:30","20:00",
    ];
  }
  if (durationMins <= 100) {
    return ["06:00","07:00","08:00","09:00","10:00","11:00","12:00","13:30","15:00","16:30","18:00","19:30"];
  }
  // long-distance
  return ["06:00","08:00","10:00","13:00","16:00","19:00"];
}

function seatsForDuration(durationMins: number): { total: number } {
  if (durationMins <= 70)  return { total: 14 };
  if (durationMins <= 100) return { total: 30 };
  return { total: 45 };
}

async function ensureDrivers(client: pg.PoolClient): Promise<number[]> {
  const passwordHash = bcrypt.hashSync("Driver@123456", 12);
  const driverIds: number[] = [];

  for (const d of PLACEHOLDER_DRIVERS) {
    // Upsert user
    const userResult = await client.query(
      `INSERT INTO users (name, email, phone, password, role, is_verified, is_blocked, wallet_balance)
       VALUES ($1, $2, $3, $4, 'driver', true, false, 0)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [d.name, d.email, d.phone, passwordHash]
    );
    const userId: number = userResult.rows[0].id;

    // Check if driver record already exists for this user
    const existing = await client.query(
      `SELECT id FROM drivers WHERE user_id = $1 LIMIT 1`,
      [userId]
    );

    let driverId: number;
    if (existing.rows.length > 0) {
      driverId = existing.rows[0].id;
    } else {
      const inserted = await client.query(
        `INSERT INTO drivers (user_id, name, phone, license_number, national_id, is_active, status)
         VALUES ($1, $2, $3, $4, $5, true, 'offline')
         RETURNING id`,
        [userId, d.name, d.phone, d.licenseNumber, d.nationalId]
      );
      driverId = inserted.rows[0].id;
    }

    driverIds.push(driverId);
    console.log(`  ✓ Driver: ${d.name} (user_id: ${userId}, driver_id: ${driverId})`);
  }

  return driverIds;
}

export async function seedTrips(): Promise<{ driversSeeded: number; tripsSeeded: number }> {
  const client = await pool.connect();
  let tripsSeeded = 0;

  try {
    await client.query("BEGIN");

    // 1. Ensure placeholder drivers
    console.log("🧑‍✈️  Ensuring placeholder drivers...");
    const driverIds = await ensureDrivers(client);
    console.log(`  → ${driverIds.length} drivers ready\n`);

    // 2. Fetch active buses
    const busResult = await client.query(
      `SELECT id, capacity FROM buses WHERE is_active = true ORDER BY id`
    );
    const buses = busResult.rows as { id: number; capacity: number }[];

    if (buses.length === 0) {
      console.log("⚠️  No active buses found. Run pnpm seed:buses first.");
      await client.query("ROLLBACK");
      return { driversSeeded: driverIds.length, tripsSeeded: 0 };
    }

    // 3. Fetch all routes
    const routeResult = await client.query(
      `SELECT id, name, estimated_duration, base_price FROM routes ORDER BY id`
    );
    const routes = routeResult.rows as { id: number; name: string; estimated_duration: number; base_price: string }[];

    console.log(`🗓️  Generating schedules for ${routes.length} routes...\n`);

    // Base date: today at midnight UTC+2 (Cairo time)
    const now = new Date();
    const baseDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    let busIndex = 0;
    let driverIndex = 0;

    for (const route of routes) {
      const durationMins = route.estimated_duration;
      const departureTimes = departureTimesForDuration(durationMins);
      const price = pricingForDuration(durationMins);
      const seats = seatsForDuration(durationMins);
      let routeTrips = 0;

      for (const timeStr of departureTimes) {
        const [hours, minutes] = timeStr.split(":").map(Number);

        // Idempotency: check if this daily trip slot already exists
        const existing = await client.query(
          `SELECT id FROM trips
           WHERE route_id = $1
             AND recurring_type = 'daily'
             AND EXTRACT(HOUR  FROM departure_time AT TIME ZONE 'UTC') = $2
             AND EXTRACT(MINUTE FROM departure_time AT TIME ZONE 'UTC') = $3
           LIMIT 1`,
          [route.id, hours, minutes]
        );

        if (existing.rows.length > 0) {
          busIndex++;
          driverIndex++;
          continue;
        }

        const departureTime = new Date(baseDate);
        departureTime.setUTCHours(hours, minutes, 0, 0);
        const arrivalTime = new Date(departureTime.getTime() + durationMins * 60_000);

        const bus = buses[busIndex % buses.length];
        const driverId = driverIds[driverIndex % driverIds.length];

        await client.query(
          `INSERT INTO trips (
             route_id, bus_id, driver_id,
             departure_time, arrival_time,
             available_seats, total_seats,
             price, status, is_active, recurring_type, weekdays
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'scheduled',true,'daily',NULL)`,
          [route.id, bus.id, driverId, departureTime.toISOString(), arrivalTime.toISOString(),
           seats.total, seats.total, price]
        );

        routeTrips++;
        tripsSeeded++;
        busIndex++;
        driverIndex++;
      }

      const icon = routeTrips > 0 ? "✓" : "↻";
      console.log(
        `  ${icon} ${route.name.padEnd(48)} ${String(routeTrips).padStart(2)} trips | EGP ${price} | ${durationMins}min`
      );
    }

    await client.query("COMMIT");
    console.log(`\n✅ Trips seed complete: ${driverIds.length} drivers ready, ${tripsSeeded} trips created.\n`);
    return { driversSeeded: driverIds.length, tripsSeeded };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedTrips()
    .then(() => pool.end())
    .catch((err) => { console.error("❌ Trips seed failed:", err); process.exit(1); });
}
