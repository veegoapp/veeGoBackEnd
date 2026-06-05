import { pgTable, serial, timestamp, integer, numeric, pgEnum, text, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { routesTable } from "./routes";
import { busesTable } from "./buses";
import { driversTable } from "./drivers";
import { routeSchedulesTable } from "./routeSchedules";

export const tripStatusEnum = pgEnum("trip_status", [
  "scheduled",
  "waiting_driver",
  "driver_assigned",
  "boarding",
  "active",
  "completed",
  "cancelled",
]);

export const recurringTypeEnum = pgEnum("recurring_type", [
  "one_time",
  "daily",
  "weekdays",
  "weekends",
  "custom",
]);

export const tripsTable = pgTable("trips", {
  id: serial("id").primaryKey(),
  routeId: integer("route_id").notNull().references(() => routesTable.id),
  scheduleId: integer("schedule_id").references(() => routeSchedulesTable.id, { onDelete: "set null" }),
  busId: integer("bus_id").references(() => busesTable.id),
  driverId: integer("driver_id").references(() => driversTable.id),
  departureTime: timestamp("departure_time", { withTimezone: true }).notNull(),
  arrivalTime: timestamp("arrival_time", { withTimezone: true }).notNull(),
  availableSeats: integer("available_seats").notNull(),
  totalSeats: integer("total_seats").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  status: tripStatusEnum("status").notNull().default("scheduled"),
  isActive: boolean("is_active").notNull().default(true),
  recurringType: recurringTypeEnum("recurring_type").notNull().default("one_time"),
  weekdays: text("weekdays"),
  cancelReason: text("cancel_reason"),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  arrivedAt: timestamp("arrived_at", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("idx_trips_route_id").on(table.routeId),
  index("idx_trips_bus_id").on(table.busId),
  index("idx_trips_driver_id").on(table.driverId),
  index("idx_trips_status").on(table.status),
  index("idx_trips_departure_time").on(table.departureTime),
]);

export const insertTripSchema = createInsertSchema(tripsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTrip = z.infer<typeof insertTripSchema>;
export type Trip = typeof tripsTable.$inferSelect;
