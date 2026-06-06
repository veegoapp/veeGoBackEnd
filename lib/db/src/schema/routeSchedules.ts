import { pgTable, serial, integer, boolean, timestamp, date, text, index, unique, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { routesTable } from "./routes";

export const shuttleVehicleTypeEnum = pgEnum("shuttle_vehicle_type", [
  "hiace",
  "minibus",
]);

export const VEHICLE_CAPACITY: Record<"hiace" | "minibus", number> = {
  hiace: 14,
  minibus: 28,
};

export const VEHICLE_MIN_THRESHOLD: Record<"hiace" | "minibus", number> = {
  hiace: 7,
  minibus: 14,
};

export const routeSchedulesTable = pgTable("route_schedules", {
  id: serial("id").primaryKey(),
  routeId: integer("route_id").notNull().references(() => routesTable.id, { onDelete: "cascade" }),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to").notNull(),
  vehicleType: shuttleVehicleTypeEnum("vehicle_type").notNull().default("hiace"),
  defaultCapacity: integer("default_capacity").notNull().default(14),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("idx_route_schedules_route_id").on(table.routeId),
  index("idx_route_schedules_is_active").on(table.isActive),
]);

export const scheduleSlotsTable = pgTable("schedule_slots", {
  id: serial("id").primaryKey(),
  scheduleId: integer("schedule_id").notNull().references(() => routeSchedulesTable.id, { onDelete: "cascade" }),
  dayOfWeek: integer("day_of_week").notNull(),
  departureTime: text("departure_time").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_schedule_slots_schedule_id").on(table.scheduleId),
  unique("uq_schedule_slots_day_time").on(table.scheduleId, table.dayOfWeek, table.departureTime),
]);

export const insertRouteScheduleSchema = createInsertSchema(routeSchedulesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRouteSchedule = z.infer<typeof insertRouteScheduleSchema>;
export type RouteSchedule = typeof routeSchedulesTable.$inferSelect;

export const insertScheduleSlotSchema = createInsertSchema(scheduleSlotsTable).omit({ id: true, createdAt: true });
export type InsertScheduleSlot = z.infer<typeof insertScheduleSlotSchema>;
export type ScheduleSlot = typeof scheduleSlotsTable.$inferSelect;
