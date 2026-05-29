import { pgTable, serial, text, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { driversTable } from "./drivers";

export const suggestionTypeEnum = pgEnum("suggestion_type", ["new_route", "new_station", "route_edit"]);
export const suggestionStatusEnum = pgEnum("suggestion_status", ["pending", "approved", "rejected"]);

export const routeSuggestionsTable = pgTable("route_suggestions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  driverId: integer("driver_id").references(() => driversTable.id, { onDelete: "set null" }),
  type: suggestionTypeEnum("type").notNull().default("new_route"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  startLocation: text("start_location"),
  endLocation: text("end_location"),
  status: suggestionStatusEnum("status").notNull().default("pending"),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type RouteSuggestion = typeof routeSuggestionsTable.$inferSelect;
