import { pgTable, serial, integer, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { driversTable } from "./drivers";

export const driverCommissionExemptionsTable = pgTable("driver_commission_exemptions", {
  id: serial("id").primaryKey(),
  driverId: integer("driver_id").notNull().references(() => driversTable.id, { onDelete: "cascade" }),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  reason: text("reason"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("idx_driver_commission_exemptions_driver_id").on(table.driverId),
  index("idx_driver_commission_exemptions_dates").on(table.startsAt, table.endsAt),
]);

export const insertDriverCommissionExemptionSchema = createInsertSchema(driverCommissionExemptionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDriverCommissionExemption = z.infer<typeof insertDriverCommissionExemptionSchema>;
export type DriverCommissionExemption = typeof driverCommissionExemptionsTable.$inferSelect;
