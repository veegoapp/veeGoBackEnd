import { pgTable, serial, text, timestamp, integer, boolean, numeric, real, pgEnum, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { busesTable } from "./buses";

export const driverStatusEnum = pgEnum("driver_status", ["offline", "online", "busy", "suspended"]);

export const driversTable = pgTable("drivers", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  licenseNumber: text("license_number"),
  nationalId: text("national_id"),
  rating: numeric("rating", { precision: 3, scale: 2 }).notNull().default("5.0"),
  assignedBusId: integer("assigned_bus_id").references(() => busesTable.id),
  vehicleType: text("vehicle_type"),
  currentLatitude: real("current_latitude"),
  currentLongitude: real("current_longitude"),
  currentSpeed: real("current_speed"),
  currentHeading: real("current_heading"),
  isOnline: boolean("is_online").notNull().default(false),
  status: driverStatusEnum("status").notNull().default("offline"),
  isActive: boolean("is_active").notNull().default(true),
  locationUpdatedAt: timestamp("location_updated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("idx_drivers_user_id").on(table.userId),
  index("idx_drivers_assigned_bus_id").on(table.assignedBusId),
  index("idx_drivers_status").on(table.status),
  index("idx_drivers_is_online").on(table.isOnline),
]);

export const insertDriverSchema = createInsertSchema(driversTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDriver = z.infer<typeof insertDriverSchema>;
export type Driver = typeof driversTable.$inferSelect;
