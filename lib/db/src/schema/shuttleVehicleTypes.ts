import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { shuttleVehicleTypeEnum } from "./routeSchedules";

export const shuttleVehicleTypesTable = pgTable("shuttle_vehicle_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: shuttleVehicleTypeEnum("type").notNull(),
  minYear: integer("min_year").notNull(),
  capacity: integer("capacity").notNull(),
  minPassengers: integer("min_passengers").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertShuttleVehicleTypeSchema = createInsertSchema(shuttleVehicleTypesTable).omit({ id: true, createdAt: true });
export type InsertShuttleVehicleType = z.infer<typeof insertShuttleVehicleTypeSchema>;
export type ShuttleVehicleType = typeof shuttleVehicleTypesTable.$inferSelect;
