import { pgTable, serial, text, timestamp, integer, numeric, pgEnum, index, check } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";
import { driversTable } from "./drivers";
import { tripsTable } from "./trips";
import { ridesTable } from "./rides";

export const ratingContextEnum = pgEnum("rating_context", ["trip", "ride"]);

export const ratingsTable = pgTable("ratings", {
  id: serial("id").primaryKey(),
  raterId: integer("rater_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  driverId: integer("driver_id").notNull().references(() => driversTable.id, { onDelete: "cascade" }),
  tripId: integer("trip_id").references(() => tripsTable.id, { onDelete: "set null" }),
  rideId: integer("ride_id").references(() => ridesTable.id, { onDelete: "set null" }),
  context: ratingContextEnum("context").notNull().default("trip"),
  score: numeric("score", { precision: 2, scale: 1 }).notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_ratings_driver_id").on(table.driverId),
  index("idx_ratings_rater_id").on(table.raterId),
  index("idx_ratings_context").on(table.context),
  check("score_range", sql`${table.score} >= 1 AND ${table.score} <= 5`),
]);

export const insertRatingSchema = createInsertSchema(ratingsTable).omit({ id: true, createdAt: true });
export type InsertRating = z.infer<typeof insertRatingSchema>;
export type Rating = typeof ratingsTable.$inferSelect;
