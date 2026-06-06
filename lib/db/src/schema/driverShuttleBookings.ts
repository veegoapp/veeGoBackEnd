import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  timestamp,
  date,
  pgEnum,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { routesTable } from "./routes";
import { driversTable } from "./drivers";

// ─── Route Time Slots ──────────────────────────────────────────────────────────
// Each shuttle route has fixed departure time slots (e.g. "08:00", "09:00").
// Drivers book one of these slots for a full week.

export const routeTimeSlotsTable = pgTable(
  "route_time_slots",
  {
    id: serial("id").primaryKey(),
    routeId: integer("route_id")
      .notNull()
      .references(() => routesTable.id, { onDelete: "cascade" }),
    departureTime: text("departure_time").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_route_time_slots_route_id").on(table.routeId),
    unique("uq_route_time_slots_route_time").on(table.routeId, table.departureTime),
  ],
);

export const insertRouteTimeSlotSchema = createInsertSchema(routeTimeSlotsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertRouteTimeSlot = z.infer<typeof insertRouteTimeSlotSchema>;
export type RouteTimeSlot = typeof routeTimeSlotsTable.$inferSelect;

// ─── Driver Shuttle Booking Status ────────────────────────────────────────────

export const driverShuttleBookingStatusEnum = pgEnum(
  "driver_shuttle_booking_status",
  ["active", "cancelled", "pending_renewal", "expired"],
);

// ─── Driver Shuttle Bookings ──────────────────────────────────────────────────
// A driver claims a route + time slot for one full week (Sunday → Thursday).
// UNIQUE constraint on (routeId, timeSlotId, weekStart) prevents double-booking.

export const driverShuttleBookingsTable = pgTable(
  "driver_shuttle_bookings",
  {
    id: serial("id").primaryKey(),
    driverId: integer("driver_id")
      .notNull()
      .references(() => driversTable.id, { onDelete: "cascade" }),
    routeId: integer("route_id")
      .notNull()
      .references(() => routesTable.id, { onDelete: "cascade" }),
    timeSlotId: integer("time_slot_id")
      .notNull()
      .references(() => routeTimeSlotsTable.id, { onDelete: "cascade" }),
    weekStart: date("week_start").notNull(),
    weekEnd: date("week_end").notNull(),
    status: driverShuttleBookingStatusEnum("status").notNull().default("active"),
    renewalNotifiedAt: timestamp("renewal_notified_at", { withTimezone: true }),
    renewalDeadline: timestamp("renewal_deadline", { withTimezone: true }),
    renewalConfirmedAt: timestamp("renewal_confirmed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: text("cancelled_by"),
    cancelReason: text("cancel_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_dsb_driver_id").on(table.driverId),
    index("idx_dsb_route_id").on(table.routeId),
    index("idx_dsb_time_slot_id").on(table.timeSlotId),
    index("idx_dsb_week_start").on(table.weekStart),
    index("idx_dsb_status").on(table.status),
    unique("uq_dsb_route_slot_week").on(table.routeId, table.timeSlotId, table.weekStart),
  ],
);

export const insertDriverShuttleBookingSchema = createInsertSchema(
  driverShuttleBookingsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDriverShuttleBooking = z.infer<typeof insertDriverShuttleBookingSchema>;
export type DriverShuttleBooking = typeof driverShuttleBookingsTable.$inferSelect;
