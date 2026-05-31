import { pgTable, serial, integer, real, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { driversTable } from "./drivers";

export const driverLocationsTable = pgTable("driver_locations", {
  id: serial("id").primaryKey(),
  driverId: integer("driver_id").notNull().references(() => driversTable.id, { onDelete: "cascade" }),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  speed: real("speed"),
  heading: real("heading"),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_driver_locations_driver_id").on(table.driverId),
  index("idx_driver_locations_recorded_at").on(table.recordedAt),
]);

export const insertDriverLocationSchema = createInsertSchema(driverLocationsTable).omit({ id: true, recordedAt: true });
export type InsertDriverLocation = z.infer<typeof insertDriverLocationSchema>;
export type DriverLocation = typeof driverLocationsTable.$inferSelect;
