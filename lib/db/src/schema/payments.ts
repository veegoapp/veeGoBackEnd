import { pgTable, serial, text, timestamp, integer, numeric, pgEnum, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { bookingsTable } from "./bookings";
import { ridesTable } from "./rides";

export const paymentMethodEnum = pgEnum("payment_method", ["wallet", "cash", "card"]);
export const paymentTxStatusEnum = pgEnum("payment_tx_status", ["pending", "completed", "failed", "refunded"]);

export const paymentsTable = pgTable("payments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  bookingId: integer("booking_id").references(() => bookingsTable.id, { onDelete: "set null" }),
  rideId: integer("ride_id").references(() => ridesTable.id, { onDelete: "set null" }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  method: paymentMethodEnum("method").notNull().default("wallet"),
  status: paymentTxStatusEnum("status").notNull().default("pending"),
  transactionRef: text("transaction_ref"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("idx_payments_user_id").on(table.userId),
  index("idx_payments_booking_id").on(table.bookingId),
  index("idx_payments_ride_id").on(table.rideId),
  index("idx_payments_status").on(table.status),
  index("idx_payments_created_at").on(table.createdAt),
]);

export const insertPaymentSchema = createInsertSchema(paymentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof paymentsTable.$inferSelect;
