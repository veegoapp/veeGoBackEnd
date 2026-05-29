import { pgTable, serial, timestamp, integer, numeric, pgEnum, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { tripsTable } from "./trips";
import { promoCodesTable } from "./promoCodes";

export const bookingStatusEnum = pgEnum("booking_status", [
  "pending",
  "confirmed",
  "cancelled",
  "completed",
  "boarded",
  "absent",
]);
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "paid", "refunded"]);

export const bookingsTable = pgTable("bookings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  tripId: integer("trip_id").notNull().references(() => tripsTable.id),
  seatCount: integer("seat_count").notNull(),
  totalPrice: numeric("total_price", { precision: 10, scale: 2 }).notNull(),
  status: bookingStatusEnum("status").notNull().default("confirmed"),
  paymentStatus: paymentStatusEnum("payment_status").notNull().default("paid"),
  promoCodeId: integer("promo_code_id").references(() => promoCodesTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("idx_bookings_user_id").on(table.userId),
  index("idx_bookings_trip_id").on(table.tripId),
  index("idx_bookings_status").on(table.status),
  index("idx_bookings_promo_code_id").on(table.promoCodeId),
]);

export const insertBookingSchema = createInsertSchema(bookingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookingsTable.$inferSelect;
