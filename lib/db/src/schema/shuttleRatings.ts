import {
  pgTable, serial, integer, smallint, timestamp,
  uniqueIndex, index, check,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";
import { tripsTable } from "./trips";

/**
 * One rating per (tripId, raterId).
 * A passenger rates the driver; a driver rates each boarded passenger.
 * rateeId is always a userId (not a driverId).
 */
export const shuttleRatingsTable = pgTable(
  "shuttle_ratings",
  {
    id:        serial("id").primaryKey(),
    tripId:    integer("trip_id").notNull().references(() => tripsTable.id, { onDelete: "cascade" }),
    raterId:   integer("rater_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    rateeId:   integer("ratee_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    stars:     smallint("stars").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_shuttle_rating_trip_rater").on(table.tripId, table.raterId),
    index("idx_shuttle_ratings_trip_id").on(table.tripId),
    index("idx_shuttle_ratings_ratee_id").on(table.rateeId),
    index("idx_shuttle_ratings_rater_id").on(table.raterId),
    check("shuttle_stars_range", sql`${table.stars} >= 1 AND ${table.stars} <= 5`),
  ],
);

export const insertShuttleRatingSchema = createInsertSchema(shuttleRatingsTable).omit({
  id: true, createdAt: true,
});
export type InsertShuttleRating = z.infer<typeof insertShuttleRatingSchema>;
export type ShuttleRating = typeof shuttleRatingsTable.$inferSelect;
