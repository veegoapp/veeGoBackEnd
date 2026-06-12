import { pgTable, serial, text, timestamp, numeric, boolean, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const routesTable = pgTable("routes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  nameAr: text("name_ar"),
  fromLocation: text("from_location").notNull(),
  fromLocationAr: text("from_location_ar"),
  toLocation: text("to_location").notNull(),
  toLocationAr: text("to_location_ar"),
  estimatedDuration: integer("estimated_duration").notNull(),
  basePrice: numeric("base_price", { precision: 10, scale: 2 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const stationsTable = pgTable("stations", {
  id: serial("id").primaryKey(),
  routeId: integer("route_id").notNull().references(() => routesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  nameAr: text("name_ar"),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  order: integer("order").notNull(),
  direction: text("direction").notNull().default("outbound"),
  segmentPrice: numeric("segment_price", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRouteSchema = createInsertSchema(routesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRoute = z.infer<typeof insertRouteSchema>;
export type Route = typeof routesTable.$inferSelect;

export const insertStationSchema = createInsertSchema(stationsTable).omit({ id: true, createdAt: true });
export type InsertStation = z.infer<typeof insertStationSchema>;
export type Station = typeof stationsTable.$inferSelect;
