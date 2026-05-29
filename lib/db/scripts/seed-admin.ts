/**
 * Seed: Admin accounts and staff roles
 * Idempotent — safe to run multiple times
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

const ALL_PERMISSIONS = [
  "view_dashboard",
  "view_routes", "edit_routes",
  "view_trips", "edit_trips",
  "view_drivers", "edit_drivers",
  "view_buses", "edit_buses",
  "view_passengers", "edit_passengers",
  "view_bookings", "edit_bookings",
  "view_wallet", "edit_wallet",
  "view_support", "edit_support",
  "view_suggestions",
  "view_verification", "edit_verification",
  "view_analytics",
  "view_staff", "edit_staff",
  "view_settings", "edit_settings",
  "view_promo", "edit_promo",
  "view_live_tracking",
  "view_driver_analytics",
  "view_notifications",
];

const STAFF_ROLES = [
  {
    name: "Super Admin",
    description: "Full access to all system features and settings",
    permissions: ALL_PERMISSIONS,
  },
  {
    name: "Operations",
    description: "Manages routes, trips, buses, and drivers",
    permissions: [
      "view_dashboard",
      "view_routes", "edit_routes",
      "view_trips", "edit_trips",
      "view_drivers", "edit_drivers",
      "view_buses", "edit_buses",
      "view_bookings",
      "view_live_tracking",
      "view_analytics",
      "view_driver_analytics",
      "view_notifications",
    ],
  },
  {
    name: "Support",
    description: "Handles passenger support tickets and verifications",
    permissions: [
      "view_dashboard",
      "view_passengers",
      "view_bookings",
      "view_support", "edit_support",
      "view_suggestions",
      "view_verification", "edit_verification",
      "view_notifications",
    ],
  },
  {
    name: "Finance",
    description: "Manages wallet transactions, promo codes, and financial reports",
    permissions: [
      "view_dashboard",
      "view_bookings",
      "view_wallet", "edit_wallet",
      "view_promo", "edit_promo",
      "view_analytics",
    ],
  },
];

const SEED_ACCOUNTS: Array<{ name: string; email: string; phone: string; password: string; role: "admin" | "driver" | "user" }> = [
  {
    name: "Super Admin",
    email: "admin@shuttleops.com",
    phone: "01000000000",
    password: "password123",
    role: "admin",
  },
  {
    name: "Demo Driver",
    email: "driver@shuttleops.com",
    phone: "01099000001",
    password: "password123",
    role: "driver",
  },
  {
    name: "Alice",
    email: "alice@example.com",
    phone: "01099000002",
    password: "password123",
    role: "user",
  },
];

export async function seedAdmin(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    console.log("🔑 Seeding staff roles...");
    for (const role of STAFF_ROLES) {
      await client.query(
        `INSERT INTO staff_roles (name, description, permissions)
         VALUES ($1, $2, $3)
         ON CONFLICT (name) DO UPDATE
           SET description = EXCLUDED.description,
               permissions = EXCLUDED.permissions,
               updated_at = NOW()`,
        [role.name, role.description, role.permissions]
      );
      console.log(`  ✓ Role: ${role.name} (${role.permissions.length} permissions)`);
    }

    console.log("\n👤 Seeding accounts...");
    for (const account of SEED_ACCOUNTS) {
      const hash = bcrypt.hashSync(account.password, 12);
      const result = await client.query(
        `INSERT INTO users (name, email, phone, password, role, is_verified, is_blocked, wallet_balance)
         VALUES ($1, $2, $3, $4, $5, true, false, 0)
         ON CONFLICT (email) DO UPDATE
           SET name = EXCLUDED.name,
               password = EXCLUDED.password,
               role = EXCLUDED.role,
               is_verified = true,
               updated_at = NOW()
         RETURNING id, name, email, role`,
        [account.name, account.email, account.phone, hash, account.role]
      );
      console.log(`  ✓ ${account.role}: ${result.rows[0]?.email} (id: ${result.rows[0]?.id})`);
    }

    await client.query("COMMIT");
    console.log("\n✅ Admin seed complete.\n");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedAdmin()
    .then(() => pool.end())
    .catch((err) => { console.error("❌ Admin seed failed:", err); process.exit(1); });
}
