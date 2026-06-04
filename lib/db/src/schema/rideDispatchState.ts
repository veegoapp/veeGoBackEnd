import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { ridesTable } from "./rides";

export const rideDispatchStateTable = pgTable("ride_dispatch_state", {
  id: serial("id").primaryKey(),
  rideId: integer("ride_id").notNull().unique().references(() => ridesTable.id, { onDelete: "cascade" }),
  currentRound: integer("current_round").notNull().default(1),
  notifiedIds: integer("notified_ids").array().notNull().default([]),
  currentRoundIds: integer("current_round_ids").array().notNull().default([]),
  roundStartedAt: timestamp("round_started_at", { withTimezone: true }).notNull().defaultNow(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("idx_ride_dispatch_state_ride_id").on(table.rideId),
  index("idx_ride_dispatch_state_status").on(table.status),
]);

export type RideDispatchState = typeof rideDispatchStateTable.$inferSelect;
