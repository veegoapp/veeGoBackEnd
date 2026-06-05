import { pgTable, serial, integer, text, timestamp, index, unique } from "drizzle-orm/pg-core";
import { ridesTable } from "./rides";

export const rideShareTokensTable = pgTable("ride_share_tokens", {
  id:        serial("id").primaryKey(),
  rideId:    integer("ride_id").notNull().references(() => ridesTable.id, { onDelete: "cascade" }),
  token:     text("token").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (table) => [
  unique("ride_share_tokens_token_unique").on(table.token),
  index("idx_ride_share_tokens_token").on(table.token),
  index("idx_ride_share_tokens_ride_id").on(table.rideId),
]);

export type RideShareToken = typeof rideShareTokensTable.$inferSelect;
