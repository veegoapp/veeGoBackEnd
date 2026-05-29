import { pgTable, serial, text, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ridePricingTable = pgTable("ride_pricing", {
  id: serial("id").primaryKey(),
  vehicleType: text("vehicle_type").notNull().unique(),
  baseFare: numeric("base_fare", { precision: 10, scale: 2 }).notNull(),
  perKmRate: numeric("per_km_rate", { precision: 10, scale: 2 }).notNull(),
  perMinuteRate: numeric("per_minute_rate", { precision: 10, scale: 2 }).notNull().default("0"),
  minimumFare: numeric("minimum_fare", { precision: 10, scale: 2 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertRidePricingSchema = createInsertSchema(ridePricingTable).omit({ id: true });
export type InsertRidePricing = z.infer<typeof insertRidePricingSchema>;
export type RidePricing = typeof ridePricingTable.$inferSelect;
