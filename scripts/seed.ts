import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../lib/db/src/schema";

const { Pool } = pg;

const connectionString = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("No DATABASE_URL set");

const isNeon = connectionString.includes("neon.tech");
const pool = new Pool({
  connectionString,
  ssl: isNeon ? { rejectUnauthorized: false } : undefined,
});
const db = drizzle(pool, { schema });

async function seed() {
  console.log("🌱 Seeding database...\n");

  // ─── 1. Staff Roles ───────────────────────────────────────────────
  console.log("→ Staff roles...");
  const [supportRole, dispatchRole, financeRole] = await db
    .insert(schema.staffRolesTable)
    .values([
      {
        name: "Support Agent",
        description: "Handles customer support tickets and user issues",
        permissions: ["view_users", "view_bookings", "manage_support", "view_trips"],
      },
      {
        name: "Dispatcher",
        description: "Manages trips, drivers, and live operations",
        permissions: ["view_users", "manage_trips", "manage_drivers", "manage_buses", "view_bookings"],
      },
      {
        name: "Finance Manager",
        description: "Manages pricing, earnings, and financial reports",
        permissions: ["view_users", "view_bookings", "manage_pricing", "view_earnings", "manage_promos"],
      },
    ])
    .returning();
  console.log("  ✓ 3 staff roles created");

  // ─── 2. Users ─────────────────────────────────────────────────────
  console.log("→ Users...");
  const adminPassword = await bcrypt.hash("Admin@123", 12);
  const driverPassword = await bcrypt.hash("Driver@123", 12);
  const alicePassword = await bcrypt.hash("Alice@123", 12);
  const staffPassword = await bcrypt.hash("Staff@123", 12);

  const [adminUser, driverUser, aliceUser, dispatchUser] = await db
    .insert(schema.usersTable)
    .values([
      {
        name: "Super Admin",
        email: "admin@shuttleops.com",
        phone: "+2340000000001",
        password: adminPassword,
        role: "admin",
        isVerified: true,
        walletBalance: "0",
      },
      {
        name: "Emeka Okafor",
        email: "emeka.driver@shuttleops.com",
        phone: "+2340000000002",
        password: driverPassword,
        role: "driver",
        isVerified: true,
        walletBalance: "15000",
      },
      {
        name: "Alice Johnson",
        email: "alice@example.com",
        phone: "+2340000000003",
        password: alicePassword,
        role: "user",
        isVerified: true,
        walletBalance: "5000",
      },
      {
        name: "Dispatch Manager",
        email: "dispatch@shuttleops.com",
        phone: "+2340000000004",
        password: staffPassword,
        role: "admin",
        isVerified: true,
        staffRoleId: dispatchRole.id,
        walletBalance: "0",
      },
    ])
    .returning();
  console.log("  ✓ 4 users created (admin, driver, passenger, staff)");

  // ─── 3. Buses ─────────────────────────────────────────────────────
  console.log("→ Buses...");
  const [bus1, bus2, bus3] = await db
    .insert(schema.busesTable)
    .values([
      {
        plateNumber: "LND-001-ABJ",
        capacity: 18,
        model: "Toyota HiAce",
        currentLatitude: 9.0579,
        currentLongitude: 7.4951,
        isActive: true,
      },
      {
        plateNumber: "LND-002-ABJ",
        capacity: 14,
        model: "Mercedes Sprinter",
        currentLatitude: 6.5244,
        currentLongitude: 3.3792,
        isActive: true,
      },
      {
        plateNumber: "LND-003-ABJ",
        capacity: 22,
        model: "Coaster Bus",
        currentLatitude: 9.0765,
        currentLongitude: 7.3986,
        isActive: true,
      },
    ])
    .returning();
  console.log("  ✓ 3 buses created");

  // ─── 4. Driver profile ────────────────────────────────────────────
  console.log("→ Driver profile...");
  const [driver1] = await db
    .insert(schema.driversTable)
    .values([
      {
        userId: driverUser.id,
        name: driverUser.name,
        phone: driverUser.phone,
        licenseNumber: "DRV-NG-20240001",
        nationalId: "NIN-112233445",
        rating: "4.80",
        assignedBusId: bus1.id,
        vehicleType: "minibus",
        currentLatitude: 9.0579,
        currentLongitude: 7.4951,
        isOnline: true,
        status: "online",
        isActive: true,
      },
    ])
    .returning();
  console.log("  ✓ 1 driver profile created");

  // ─── 5. Routes ────────────────────────────────────────────────────
  console.log("→ Routes...");
  const [routeABJ, routeLAG, routePH] = await db
    .insert(schema.routesTable)
    .values([
      {
        name: "Abuja City Express",
        fromLocation: "Wuse Market",
        toLocation: "Garki District",
        estimatedDuration: 35,
        basePrice: "800.00",
        isActive: true,
      },
      {
        name: "Lagos Island Connect",
        fromLocation: "Ikeja",
        toLocation: "Victoria Island",
        estimatedDuration: 55,
        basePrice: "1200.00",
        isActive: true,
      },
      {
        name: "Port Harcourt Metro",
        fromLocation: "Trans-Amadi",
        toLocation: "Rumuola",
        estimatedDuration: 25,
        basePrice: "600.00",
        isActive: true,
      },
    ])
    .returning();
  console.log("  ✓ 3 routes created");

  // ─── 6. Stations ──────────────────────────────────────────────────
  console.log("→ Stations...");
  await db.insert(schema.stationsTable).values([
    // Abuja City Express — outbound
    { routeId: routeABJ.id, name: "Wuse Market Terminal", latitude: 9.0579, longitude: 7.4951, order: 1, direction: "outbound", segmentPrice: "0.00" },
    { routeId: routeABJ.id, name: "Zone 4 Junction", latitude: 9.0521, longitude: 7.4887, order: 2, direction: "outbound", segmentPrice: "200.00" },
    { routeId: routeABJ.id, name: "Area 11 Stop", latitude: 9.0463, longitude: 7.4811, order: 3, direction: "outbound", segmentPrice: "400.00" },
    { routeId: routeABJ.id, name: "Garki District Hub", latitude: 9.0378, longitude: 7.4731, order: 4, direction: "outbound", segmentPrice: "800.00" },
    // Abuja City Express — inbound
    { routeId: routeABJ.id, name: "Garki District Hub", latitude: 9.0378, longitude: 7.4731, order: 1, direction: "inbound", segmentPrice: "0.00" },
    { routeId: routeABJ.id, name: "Area 11 Stop", latitude: 9.0463, longitude: 7.4811, order: 2, direction: "inbound", segmentPrice: "200.00" },
    { routeId: routeABJ.id, name: "Zone 4 Junction", latitude: 9.0521, longitude: 7.4887, order: 3, direction: "inbound", segmentPrice: "400.00" },
    { routeId: routeABJ.id, name: "Wuse Market Terminal", latitude: 9.0579, longitude: 7.4951, order: 4, direction: "inbound", segmentPrice: "800.00" },

    // Lagos Island Connect — outbound
    { routeId: routeLAG.id, name: "Ikeja Bus Stop", latitude: 6.5954, longitude: 3.3378, order: 1, direction: "outbound", segmentPrice: "0.00" },
    { routeId: routeLAG.id, name: "Ojota Junction", latitude: 6.5684, longitude: 3.3792, order: 2, direction: "outbound", segmentPrice: "300.00" },
    { routeId: routeLAG.id, name: "CMS Terminal", latitude: 6.4541, longitude: 3.3947, order: 3, direction: "outbound", segmentPrice: "700.00" },
    { routeId: routeLAG.id, name: "Victoria Island Stop", latitude: 6.4281, longitude: 3.4219, order: 4, direction: "outbound", segmentPrice: "1200.00" },

    // Port Harcourt Metro — outbound
    { routeId: routePH.id, name: "Trans-Amadi Terminal", latitude: 4.8396, longitude: 7.0134, order: 1, direction: "outbound", segmentPrice: "0.00" },
    { routeId: routePH.id, name: "Rumola Stop", latitude: 4.8502, longitude: 7.0245, order: 2, direction: "outbound", segmentPrice: "200.00" },
    { routeId: routePH.id, name: "Rumuola Hub", latitude: 4.8618, longitude: 7.0351, order: 3, direction: "outbound", segmentPrice: "600.00" },
  ]);
  console.log("  ✓ 15 stations created");

  // ─── 7. Trips ─────────────────────────────────────────────────────
  console.log("→ Trips...");
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const makeTime = (base: Date, addHours: number, addMinutes = 0) => {
    const d = new Date(base);
    d.setHours(addHours, addMinutes, 0, 0);
    return d;
  };

  const trips = await db.insert(schema.tripsTable).values([
    // Today — scheduled
    {
      routeId: routeABJ.id,
      busId: bus1.id,
      driverId: driver1.id,
      departureTime: makeTime(now, 7, 0),
      arrivalTime: makeTime(now, 7, 35),
      totalSeats: 18,
      availableSeats: 14,
      price: "800.00",
      status: "scheduled",
      recurringType: "daily",
      isActive: true,
    },
    {
      routeId: routeABJ.id,
      busId: bus1.id,
      driverId: driver1.id,
      departureTime: makeTime(now, 12, 0),
      arrivalTime: makeTime(now, 12, 35),
      totalSeats: 18,
      availableSeats: 18,
      price: "800.00",
      status: "scheduled",
      recurringType: "daily",
      isActive: true,
    },
    {
      routeId: routeABJ.id,
      busId: bus1.id,
      driverId: driver1.id,
      departureTime: makeTime(now, 17, 30),
      arrivalTime: makeTime(now, 18, 5),
      totalSeats: 18,
      availableSeats: 18,
      price: "800.00",
      status: "scheduled",
      recurringType: "daily",
      isActive: true,
    },
    // Lagos route — tomorrow
    {
      routeId: routeLAG.id,
      busId: bus2.id,
      driverId: null,
      departureTime: makeTime(tomorrow, 8, 0),
      arrivalTime: makeTime(tomorrow, 8, 55),
      totalSeats: 14,
      availableSeats: 14,
      price: "1200.00",
      status: "scheduled",
      recurringType: "weekdays",
      isActive: true,
    },
    {
      routeId: routeLAG.id,
      busId: bus2.id,
      driverId: null,
      departureTime: makeTime(tomorrow, 17, 0),
      arrivalTime: makeTime(tomorrow, 17, 55),
      totalSeats: 14,
      availableSeats: 14,
      price: "1200.00",
      status: "scheduled",
      recurringType: "weekdays",
      isActive: true,
    },
    // PH route — today
    {
      routeId: routePH.id,
      busId: bus3.id,
      driverId: null,
      departureTime: makeTime(now, 9, 0),
      arrivalTime: makeTime(now, 9, 25),
      totalSeats: 22,
      availableSeats: 22,
      price: "600.00",
      status: "scheduled",
      recurringType: "daily",
      isActive: true,
    },
  ]).returning();
  console.log("  ✓ 6 trips created");

  // ─── 8. Booking for Alice ─────────────────────────────────────────
  console.log("→ Booking for Alice...");
  await db.insert(schema.bookingsTable).values([
    {
      userId: aliceUser.id,
      tripId: trips[0].id,
      seatCount: 2,
      totalPrice: "1600.00",
      status: "confirmed",
      paymentStatus: "paid",
    },
  ]);
  console.log("  ✓ 1 booking created (Alice on Abuja Express morning trip)");

  // ─── 9. Zones ─────────────────────────────────────────────────────
  console.log("→ Zones...");
  const [zoneAbuja, zoneLagos, zonePH] = await db.insert(schema.zonesTable).values([
    {
      name: "Abuja Central",
      description: "Federal Capital Territory central zone",
      centerLat: 9.0579,
      centerLng: 7.4951,
      radiusKm: 15,
      services: ["shuttle", "ride", "charter"],
      isActive: true,
    },
    {
      name: "Lagos Mainland",
      description: "Lagos metropolitan mainland zone",
      centerLat: 6.5244,
      centerLng: 3.3792,
      radiusKm: 20,
      services: ["shuttle", "ride"],
      isActive: true,
    },
    {
      name: "Port Harcourt City",
      description: "Port Harcourt urban zone",
      centerLat: 4.8396,
      centerLng: 7.0134,
      radiusKm: 10,
      services: ["shuttle", "ride"],
      isActive: true,
    },
  ]).returning();
  console.log("  ✓ 3 zones created");

  // ─── 10. Zone Pricing ─────────────────────────────────────────────
  console.log("→ Zone pricing...");
  await db.insert(schema.zonePricingTable).values([
    { zoneId: zoneAbuja.id, vehicleType: "minibus", baseFare: "500.00", perKmRate: "80.00", minimumFare: "400.00" },
    { zoneId: zoneAbuja.id, vehicleType: "sedan", baseFare: "350.00", perKmRate: "120.00", minimumFare: "300.00" },
    { zoneId: zoneAbuja.id, vehicleType: "suv", baseFare: "500.00", perKmRate: "160.00", minimumFare: "450.00" },
    { zoneId: zoneLagos.id, vehicleType: "minibus", baseFare: "600.00", perKmRate: "90.00", minimumFare: "500.00" },
    { zoneId: zoneLagos.id, vehicleType: "sedan", baseFare: "400.00", perKmRate: "130.00", minimumFare: "350.00" },
    { zoneId: zoneLagos.id, vehicleType: "suv", baseFare: "600.00", perKmRate: "180.00", minimumFare: "550.00" },
    { zoneId: zonePH.id, vehicleType: "minibus", baseFare: "450.00", perKmRate: "75.00", minimumFare: "350.00" },
    { zoneId: zonePH.id, vehicleType: "sedan", baseFare: "300.00", perKmRate: "110.00", minimumFare: "250.00" },
  ]);
  console.log("  ✓ 8 zone pricing entries created");

  // ─── 11. Ride Pricing ─────────────────────────────────────────────
  console.log("→ Ride pricing...");
  await db.insert(schema.ridePricingTable).values([
    { vehicleType: "sedan", baseFare: "350.00", perKmRate: "120.00", perMinuteRate: "10.00", minimumFare: "300.00" },
    { vehicleType: "suv", baseFare: "500.00", perKmRate: "160.00", perMinuteRate: "15.00", minimumFare: "450.00" },
    { vehicleType: "minibus", baseFare: "500.00", perKmRate: "80.00", perMinuteRate: "8.00", minimumFare: "400.00" },
    { vehicleType: "tricycle", baseFare: "200.00", perKmRate: "60.00", perMinuteRate: "5.00", minimumFare: "150.00" },
  ]);
  console.log("  ✓ 4 ride pricing entries created");

  // ─── 12. Promo Codes ──────────────────────────────────────────────
  console.log("→ Promo codes...");
  const expiry2025 = new Date("2026-12-31T23:59:59Z");
  await db.insert(schema.promoCodesTable).values([
    {
      code: "WELCOME20",
      discountType: "percentage",
      discountValue: "20.00",
      expiryDate: expiry2025,
      maxUsage: 500,
      usedCount: 0,
      isActive: true,
    },
    {
      code: "FLAT500",
      discountType: "fixed",
      discountValue: "500.00",
      expiryDate: expiry2025,
      maxUsage: 200,
      usedCount: 0,
      isActive: true,
    },
    {
      code: "FIRSTRIDE",
      discountType: "percentage",
      discountValue: "30.00",
      expiryDate: expiry2025,
      maxUsage: 1000,
      usedCount: 0,
      isActive: true,
    },
    {
      code: "WEEKEND10",
      discountType: "percentage",
      discountValue: "10.00",
      expiryDate: expiry2025,
      maxUsage: null,
      usedCount: 0,
      isActive: true,
    },
  ]);
  console.log("  ✓ 4 promo codes created");

  // ─── Summary ──────────────────────────────────────────────────────
  console.log("\n✅ Seed complete!\n");
  console.log("Credentials:");
  console.log("  Admin       → admin@shuttleops.com     / Admin@123");
  console.log("  Dispatcher  → dispatch@shuttleops.com  / Staff@123");
  console.log("  Driver      → emeka.driver@shuttleops.com / Driver@123");
  console.log("  Passenger   → alice@example.com        / Alice@123");

  await pool.end();
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
