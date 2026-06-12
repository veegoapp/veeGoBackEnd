import { pgTable, serial, integer, text, real, numeric, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { driversTable } from "./drivers";
import { promoCodesTable } from "./promoCodes";

export const ridesTable = pgTable("rides", {
  id: serial("id").primaryKey(),
  passengerId: integer("passenger_id").notNull().references(() => usersTable.id),
  driverId: integer("driver_id").references(() => driversTable.id),
  vehicleType: text("vehicle_type").notNull(),
  requestedCategory: text("requested_category"),
  pickupLatitude: real("pickup_latitude").notNull(),
  pickupLongitude: real("pickup_longitude").notNull(),
  pickupAddress: text("pickup_address").notNull(),
  dropoffLatitude: real("dropoff_latitude").notNull(),
  dropoffLongitude: real("dropoff_longitude").notNull(),
  dropoffAddress: text("dropoff_address").notNull(),
  recipientName: text("recipient_name"),
  recipientPhone: text("recipient_phone"),
  distanceKm: numeric("distance_km", { precision: 8, scale: 3 }),
  estimatedDurationMinutes: integer("estimated_duration_minutes"),
  estimatedPrice: numeric("estimated_price", { precision: 10, scale: 2 }),
  finalPrice: numeric("final_price", { precision: 10, scale: 2 }),
  waitingCharge: numeric("waiting_charge", { precision: 10, scale: 2 }).default("0.00"),
  promoCodeId: integer("promo_code_id").references(() => promoCodesTable.id),
  status: text("status").notNull().default("requested"),
  cancelReason: text("cancel_reason"),
  cancelNote: text("cancel_note"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  driverAssignedAt: timestamp("driver_assigned_at", { withTimezone: true }),
  driverArrivedAt: timestamp("driver_arrived_at", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("idx_rides_passenger_id").on(table.passengerId),
  index("idx_rides_driver_id").on(table.driverId),
  index("idx_rides_status").on(table.status),
  index("idx_rides_requested_at").on(table.requestedAt),
  index("idx_rides_promo_code_id").on(table.promoCodeId),
]);

export const insertRideSchema = createInsertSchema(ridesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRide = z.infer<typeof insertRideSchema>;
export type Ride = typeof ridesTable.$inferSelect;
