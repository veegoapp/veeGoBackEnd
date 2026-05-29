import { pgTable, serial, integer, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tripsTable } from "./trips";

export const tripEventsTable = pgTable("trip_events", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").notNull().references(() => tripsTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTripEventSchema = createInsertSchema(tripEventsTable).omit({ id: true, createdAt: true });
export type InsertTripEvent = z.infer<typeof insertTripEventSchema>;
export type TripEvent = typeof tripEventsTable.$inferSelect;
