/**
 * Seed: Real transportation routes from the imported dataset
 * Source: lib/db/data/routes.json (50 real Egyptian routes)
 * Idempotent — upserts by route name, replaces stations each run
 */
import pg from "pg";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";

const { Pool } = pg;
const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const connectionString = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("No DATABASE connection string found.");

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes("neon.tech") ? { rejectUnauthorized: false } : undefined,
});

interface RawStop {
  lat: number;
  lng: number;
  name: string;
  stop_order: number;
}

interface RawRoute {
  name: string;
  description?: string;
  estimated_duration_mins: number;
  bookings_open: boolean;
  route_stops: RawStop[];
}

function pricingForDuration(durationMins: number): string {
  if (durationMins <= 60)  return (15 + Math.round((durationMins / 60) * 10)).toFixed(2);
  if (durationMins <= 100) return (25 + Math.round(((durationMins - 60) / 40) * 20)).toFixed(2);
  return (45 + Math.round(((durationMins - 100) / 50) * 30)).toFixed(2);
}

function normalizeStationName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

function isValidCoordinate(lat: number, lng: number): boolean {
  return (
    typeof lat === "number" && typeof lng === "number" &&
    !isNaN(lat) && !isNaN(lng) &&
    lat >= -90 && lat <= 90 &&
    lng >= -180 && lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

function fromLocation(route: RawRoute): string {
  const firstStop = route.route_stops
    .slice()
    .sort((a, b) => a.stop_order - b.stop_order)[0];
  return firstStop ? normalizeStationName(firstStop.name) : route.name.split("→")[0]?.trim() ?? "Unknown";
}

function toLocation(route: RawRoute): string {
  const sorted = route.route_stops.slice().sort((a, b) => a.stop_order - b.stop_order);
  const lastStop = sorted[sorted.length - 1];
  return lastStop ? normalizeStationName(lastStop.name) : route.name.split("→")[1]?.trim()?.replace(/#\d+$/, "").trim() ?? "Unknown";
}

export async function seedRoutes(): Promise<{ routesUpserted: number; stationsInserted: number }> {
  const client = await pool.connect();
  let routesUpserted = 0;
  let stationsInserted = 0;

  try {
    const rawData: RawRoute[] = require(path.join(__dirname, "../data/routes.json"));

    await client.query("BEGIN");

    console.log(`🗺️  Importing ${rawData.length} routes from dataset...\n`);

    for (const raw of rawData) {
      const validStops = raw.route_stops
        .filter(s => isValidCoordinate(s.lat, s.lng))
        .sort((a, b) => a.stop_order - b.stop_order);

      if (validStops.length < 2) {
        console.log(`  ⚠ Skipped (too few valid stops): ${raw.name}`);
        continue;
      }

      const durationMins = raw.estimated_duration_mins ?? Math.round(validStops.length * 6);
      const price = pricingForDuration(durationMins);
      const isActive = raw.bookings_open !== false;
      const from = fromLocation(raw);
      const to = toLocation(raw);

      // Upsert route — SELECT first, then INSERT or UPDATE
      const existing = await client.query(
        `SELECT id FROM routes WHERE name = $1 LIMIT 1`,
        [raw.name]
      );

      let routeId: number;
      if (existing.rows.length > 0) {
        routeId = existing.rows[0].id;
        await client.query(
          `UPDATE routes
           SET from_location = $1, to_location = $2, estimated_duration = $3,
               base_price = $4, is_active = $5, updated_at = NOW()
           WHERE id = $6`,
          [from, to, durationMins, price, isActive, routeId]
        );
      } else {
        const result = await client.query(
          `INSERT INTO routes (name, from_location, to_location, estimated_duration, base_price, is_active)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [raw.name, from, to, durationMins, price, isActive]
        );
        routeId = result.rows[0].id;
      }
      routesUpserted++;

      // Replace stations for this route
      await client.query(`DELETE FROM stations WHERE route_id = $1`, [routeId]);

      for (let i = 0; i < validStops.length; i++) {
        const stop = validStops[i];
        const name = normalizeStationName(stop.name);
        await client.query(
          `INSERT INTO stations (route_id, name, latitude, longitude, "order")
           VALUES ($1, $2, $3, $4, $5)`,
          [routeId, name, stop.lat, stop.lng, i + 1]
        );
        stationsInserted++;
      }

      console.log(
        `  ✓ [${String(routeId).padStart(2, "0")}] ${raw.name.padEnd(50)} ${validStops.length} stops | EGP ${price} | ${raw.estimated_duration_mins}min`
      );
    }

    await client.query("COMMIT");
    console.log(`\n✅ Routes import complete: ${routesUpserted} routes, ${stationsInserted} stations.\n`);
    return { routesUpserted, stationsInserted };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedRoutes()
    .then(() => pool.end())
    .catch((err) => { console.error("❌ Routes seed failed:", err); process.exit(1); });
}
