import { pgTable, serial, integer, numeric, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { driversTable } from "./drivers";
import { tripsTable } from "./trips";

export const earningStatusEnum = pgEnum("earning_status", ["pending", "confirmed", "paid"]);

export const driverEarningsTable = pgTable("driver_earnings", {
  id: serial("id").primaryKey(),
  driverId: integer("driver_id").notNull().references(() => driversTable.id, { onDelete: "cascade" }),
  tripId: integer("trip_id").references(() => tripsTable.id, { onDelete: "set null" }),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  status: earningStatusEnum("status").notNull().default("pending"),
  date: timestamp("date", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_driver_earnings_driver_id").on(table.driverId),
  index("idx_driver_earnings_trip_id").on(table.tripId),
  index("idx_driver_earnings_status").on(table.status),
]);

export const insertDriverEarningsSchema = createInsertSchema(driverEarningsTable).omit({ id: true, createdAt: true });
export type InsertDriverEarnings = z.infer<typeof insertDriverEarningsSchema>;
export type DriverEarnings = typeof driverEarningsTable.$inferSelect;
