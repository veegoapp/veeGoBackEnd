import { pgTable, serial, integer, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ridesTable } from "./rides";

export const rideEventsTable = pgTable("ride_events", {
  id: serial("id").primaryKey(),
  rideId: integer("ride_id").notNull().references(() => ridesTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_ride_events_ride_id").on(table.rideId),
  index("idx_ride_events_type").on(table.type),
]);

export const insertRideEventSchema = createInsertSchema(rideEventsTable).omit({ id: true, createdAt: true });
export type InsertRideEvent = z.infer<typeof insertRideEventSchema>;
export type RideEvent = typeof rideEventsTable.$inferSelect;
