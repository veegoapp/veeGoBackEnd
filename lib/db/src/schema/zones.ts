import { pgTable, serial, text, timestamp, boolean, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const zonesTable = pgTable("zones", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  centerLat: real("center_lat").notNull(),
  centerLng: real("center_lng").notNull(),
  radiusKm: real("radius_km").notNull().default(5),
  services: text("services").array().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertZoneSchema = createInsertSchema(zonesTable).omit({
  id: true, createdAt: true, updatedAt: true,
});

export type InsertZone = z.infer<typeof insertZoneSchema>;
export type Zone = typeof zonesTable.$inferSelect;
