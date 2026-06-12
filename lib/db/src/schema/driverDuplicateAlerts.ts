import { pgTable, serial, integer, text, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { driversTable } from "./drivers";
import { usersTable } from "./users";

export const duplicateMatchTypeEnum = pgEnum("duplicate_match_type", [
  "phone",
  "national_id",
  "vehicle_license",
]);

export const driverDuplicateAlertsTable = pgTable("driver_duplicate_alerts", {
  id: serial("id").primaryKey(),
  newDriverId: integer("new_driver_id").notNull().references(() => driversTable.id),
  existingDriverId: integer("existing_driver_id").notNull().references(() => driversTable.id),
  matchType: duplicateMatchTypeEnum("match_type").notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedBy: integer("resolved_by").references(() => usersTable.id),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_dup_alerts_new_driver").on(table.newDriverId),
  index("idx_dup_alerts_existing_driver").on(table.existingDriverId),
]);

export const insertDriverDuplicateAlertSchema = createInsertSchema(driverDuplicateAlertsTable).omit({ id: true, createdAt: true });
export type InsertDriverDuplicateAlert = z.infer<typeof insertDriverDuplicateAlertSchema>;
export type DriverDuplicateAlert = typeof driverDuplicateAlertsTable.$inferSelect;
