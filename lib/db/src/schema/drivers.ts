import { pgTable, serial, text, timestamp, integer, boolean, numeric, real, pgEnum, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { busesTable } from "./buses";

export const driverStatusEnum = pgEnum("driver_status", ["offline", "online", "busy", "suspended"]);

export const driversTable = pgTable("drivers", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  licenseNumber: text("license_number"),
  nationalId: text("national_id"),
  rating: numeric("rating", { precision: 3, scale: 2 }).notNull().default("5.0"),
  assignedBusId: integer("assigned_bus_id").references(() => busesTable.id),
  vehicleType: text("vehicle_type"),
  currentLatitude: real("current_latitude"),
  currentLongitude: real("current_longitude"),
  currentSpeed: real("current_speed"),
  currentHeading: real("current_heading"),
  isOnline: boolean("is_online").notNull().default(false),
  status: driverStatusEnum("status").notNull().default("offline"),
  isActive: boolean("is_active").notNull().default(true),
  locationUpdatedAt: timestamp("location_updated_at", { withTimezone: true }),
  onlineSince:      timestamp("online_since",       { withTimezone: true }),
  checkInRequired:  boolean("checkin_required").notNull().default(false),
  checkInDeadline:  timestamp("checkin_deadline",   { withTimezone: true }),
  lastCheckInAt:    timestamp("last_checkin_at",    { withTimezone: true }),

  commissionRate: numeric("commission_rate", { precision: 5, scale: 4 }),

  // ── Smart dispatch stats (Feature 2) ──────────────────────────────────────
  // Used to compute acceptance rate = totalAccepted / totalDispatched.
  // Incremented in dispatchBatch() and onAccepted() respectively.
  totalDispatched: integer("total_dispatched").notNull().default(0),
  totalAccepted:   integer("total_accepted").notNull().default(0),

  // ── Fair ride distribution (Feature 4) ───────────────────────────────────
  // Timestamp of the last RIDE_OFFER sent to this driver. Drivers who received
  // an offer in the last 10 minutes get a -0.1 score penalty in findNextBatch()
  // so they are deprioritised in favour of drivers who haven't been offered recently.
  lastDispatchedAt: timestamp("last_dispatched_at", { withTimezone: true }),

  // ── Cooldown after repeated rejections (Feature 3) ────────────────────────
  // consecutiveRejections counts back-to-back expired-without-accepting rounds.
  // Resets to 0 on acceptance. At 3 rejections, cooldownUntil is set +10 min.
  consecutiveRejections: integer("consecutive_rejections").notNull().default(0),
  cooldownUntil:         timestamp("cooldown_until", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("idx_drivers_user_id").on(table.userId),
  index("idx_drivers_assigned_bus_id").on(table.assignedBusId),
  index("idx_drivers_status").on(table.status),
  index("idx_drivers_is_online").on(table.isOnline),
  index("idx_drivers_cooldown_until").on(table.cooldownUntil),
]);

export const insertDriverSchema = createInsertSchema(driversTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDriver = z.infer<typeof insertDriverSchema>;
export type Driver = typeof driversTable.$inferSelect;
