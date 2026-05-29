/**
 * Verify: Database state — prints counts of all key tables
 */
import pg from "pg";

const { Pool } = pg;

const connectionString = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("No DATABASE connection string found.");

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes("neon.tech") ? { rejectUnauthorized: false } : undefined,
});

export async function verifyDb(): Promise<void> {
  const client = await pool.connect();
  try {
    console.log("🔍 Verifying database state...\n");

    const checks: Array<{ label: string; query: string }> = [
      { label: "Admin users",        query: "SELECT COUNT(*) FROM users WHERE role = 'admin'" },
      { label: "Driver users",       query: "SELECT COUNT(*) FROM users WHERE role = 'driver'" },
      { label: "Passenger users",    query: "SELECT COUNT(*) FROM users WHERE role = 'user'" },
      { label: "Staff roles",        query: "SELECT COUNT(*) FROM staff_roles" },
      { label: "Routes (total)",     query: "SELECT COUNT(*) FROM routes" },
      { label: "Routes (active)",    query: "SELECT COUNT(*) FROM routes WHERE is_active = true" },
      { label: "Stations",           query: "SELECT COUNT(*) FROM stations" },
      { label: "Buses (total)",      query: "SELECT COUNT(*) FROM buses" },
      { label: "Buses (active)",     query: "SELECT COUNT(*) FROM buses WHERE is_active = true" },
      { label: "Drivers",            query: "SELECT COUNT(*) FROM drivers" },
      { label: "Trips (total)",      query: "SELECT COUNT(*) FROM trips" },
      { label: "Trips (daily)",      query: "SELECT COUNT(*) FROM trips WHERE recurring_type = 'daily'" },
      { label: "Trips (scheduled)",  query: "SELECT COUNT(*) FROM trips WHERE status = 'scheduled'" },
      { label: "Bookings",           query: "SELECT COUNT(*) FROM bookings" },
      { label: "Support tickets",    query: "SELECT COUNT(*) FROM support_tickets" },
    ];

    for (const check of checks) {
      const res = await client.query(check.query);
      const count = parseInt(res.rows[0].count, 10);
      const icon = count > 0 ? "✓" : "⚠";
      console.log(`  ${icon} ${check.label.padEnd(26)} ${String(count).padStart(5)}`);
    }

    console.log("\n📋 Route summary (first 15):");
    const routes = await client.query(
      `SELECT r.id, r.name, r.base_price, r.estimated_duration,
              COUNT(s.id)::int AS station_count,
              COUNT(t.id)::int AS trip_count
       FROM routes r
       LEFT JOIN stations s ON s.route_id = r.id
       LEFT JOIN trips t ON t.route_id = r.id
       GROUP BY r.id
       ORDER BY r.id
       LIMIT 15`
    );
    for (const r of routes.rows) {
      console.log(`  [${String(r.id).padStart(2)}] ${r.name.padEnd(50)} ${r.station_count} stops | ${r.trip_count} trips | EGP ${r.base_price} | ${r.estimated_duration}min`);
    }

    const total = await client.query("SELECT COUNT(*) FROM routes");
    const totalCount = parseInt(total.rows[0].count, 10);
    if (totalCount > 15) console.log(`  ... and ${totalCount - 15} more routes`);

    console.log("\n📋 Staff roles:");
    const roles = await client.query(
      `SELECT name, array_length(permissions, 1) AS perm_count FROM staff_roles ORDER BY id`
    );
    for (const r of roles.rows) {
      console.log(`  ${r.name.padEnd(22)} ${r.perm_count ?? 0} permissions`);
    }

    const warnings: string[] = [];
    const adminCount = parseInt((await client.query("SELECT COUNT(*) FROM users WHERE role='admin'")).rows[0].count, 10);
    const routeCount = parseInt((await client.query("SELECT COUNT(*) FROM routes")).rows[0].count, 10);
    const busCount   = parseInt((await client.query("SELECT COUNT(*) FROM buses")).rows[0].count, 10);
    const tripCount  = parseInt((await client.query("SELECT COUNT(*) FROM trips")).rows[0].count, 10);

    if (adminCount  === 0) warnings.push("No admin users — run: pnpm seed:admin");
    if (routeCount  === 0) warnings.push("No routes — run: pnpm seed:routes");
    if (busCount    === 0) warnings.push("No buses — run: pnpm seed:buses");
    if (tripCount   === 0) warnings.push("No trips — run: pnpm seed:trips");

    if (warnings.length > 0) {
      console.log("\n⚠️  Warnings:");
      for (const w of warnings) console.log(`  • ${w}`);
    } else {
      console.log("\n✅ Database looks healthy.");
    }
  } finally {
    client.release();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  verifyDb()
    .then(() => pool.end())
    .catch((err) => { console.error("❌ Verify failed:", err); process.exit(1); });
}
