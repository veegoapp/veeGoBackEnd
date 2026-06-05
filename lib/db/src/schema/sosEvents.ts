import { pgTable, serial, integer, real, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { ridesTable } from "./rides";

export const sosEventsTable = pgTable("sos_events", {
  id:            serial("id").primaryKey(),
  userId:        integer("user_id").notNull().references(() => usersTable.id),
  rideId:        integer("ride_id").references(() => ridesTable.id, { onDelete: "set null" }),
  role:          text("role").notNull(),
  latitude:      real("latitude").notNull(),
  longitude:     real("longitude").notNull(),
  triggeredAt:   timestamp("triggered_at", { withTimezone: true }).notNull().defaultNow(),
  status:        text("status").notNull().default("active"),
  notes:         text("notes"),
  resolvedById:  integer("resolved_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  resolvedAt:    timestamp("resolved_at", { withTimezone: true }),
}, (table) => [
  index("idx_sos_events_ride_id").on(table.rideId),
  index("idx_sos_events_user_id").on(table.userId),
  index("idx_sos_events_status").on(table.status),
]);

export const insertSosEventSchema = createInsertSchema(sosEventsTable).omit({ id: true, triggeredAt: true });
export type InsertSosEvent = z.infer<typeof insertSosEventSchema>;
export type SosEvent = typeof sosEventsTable.$inferSelect;
