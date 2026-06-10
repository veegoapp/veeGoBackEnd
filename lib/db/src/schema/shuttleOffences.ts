import {
  pgTable, serial, integer, timestamp, pgEnum, unique, index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const offenceActorTypeEnum = pgEnum("offence_actor_type", [
  "passenger",
  "driver",
]);

export const offenceActionEnum = pgEnum("offence_action", [
  "warning",
  "fined",
  "suspended",
]);

/**
 * One row per (userId, actorType).
 * offenceCount is incremented on every new no-show.
 * lastAction reflects the most recent enforcement action taken.
 */
export const shuttleOffencesTable = pgTable(
  "shuttle_offences",
  {
    id:           serial("id").primaryKey(),
    userId:       integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    actorType:    offenceActorTypeEnum("actor_type").notNull(),
    offenceCount: integer("offence_count").notNull().default(1),
    lastAction:   offenceActionEnum("last_action").notNull().default("warning"),
    lastOffenceAt: timestamp("last_offence_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt:    timestamp("created_at",    { withTimezone: true }).notNull().defaultNow(),
    updatedAt:    timestamp("updated_at",    { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    unique("uq_shuttle_offences_user_actor").on(table.userId, table.actorType),
    index("idx_shuttle_offences_user_id").on(table.userId),
    index("idx_shuttle_offences_actor_type").on(table.actorType),
    index("idx_shuttle_offences_last_offence").on(table.lastOffenceAt),
  ],
);

export const insertShuttleOffenceSchema = createInsertSchema(shuttleOffencesTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertShuttleOffence = z.infer<typeof insertShuttleOffenceSchema>;
export type ShuttleOffence = typeof shuttleOffencesTable.$inferSelect;
