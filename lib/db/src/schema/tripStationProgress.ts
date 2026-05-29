import { pgTable, serial, integer, timestamp, pgEnum, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tripsTable } from "./trips";
import { stationsTable } from "./routes";

export const stationProgressStatusEnum = pgEnum("station_progress_status", ["pending", "arrived", "completed"]);

export const tripStationProgressTable = pgTable("trip_station_progress", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").notNull().references(() => tripsTable.id, { onDelete: "cascade" }),
  stationId: integer("station_id").notNull().references(() => stationsTable.id, { onDelete: "cascade" }),
  status: stationProgressStatusEnum("status").notNull().default("pending"),
  arrivedAt: timestamp("arrived_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("trip_station_unique").on(t.tripId, t.stationId),
]);

export const insertTripStationProgressSchema = createInsertSchema(tripStationProgressTable).omit({ id: true, createdAt: true });
export type InsertTripStationProgress = z.infer<typeof insertTripStationProgressSchema>;
export type TripStationProgress = typeof tripStationProgressTable.$inferSelect;
