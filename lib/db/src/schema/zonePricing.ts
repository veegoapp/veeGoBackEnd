import { pgTable, serial, integer, text, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { zonesTable } from "./zones";

export const zonePricingTable = pgTable("zone_pricing", {
  id: serial("id").primaryKey(),
  zoneId: integer("zone_id").notNull().references(() => zonesTable.id, { onDelete: "cascade" }),
  vehicleType: text("vehicle_type").notNull(),
  baseFare: numeric("base_fare", { precision: 10, scale: 2 }).notNull(),
  perKmRate: numeric("per_km_rate", { precision: 10, scale: 2 }).notNull(),
  minimumFare: numeric("minimum_fare", { precision: 10, scale: 2 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertZonePricingSchema = createInsertSchema(zonePricingTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertZonePricing = z.infer<typeof insertZonePricingSchema>;
export type ZonePricing = typeof zonePricingTable.$inferSelect;
