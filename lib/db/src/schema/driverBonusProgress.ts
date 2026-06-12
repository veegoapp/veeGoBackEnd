import { pgTable, serial, integer, numeric, boolean, timestamp, index, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { driversTable } from "./drivers";
import { driverBonusTargetsTable } from "./driverBonusTargets";

export const driverBonusProgressTable = pgTable("driver_bonus_progress", {
  id: serial("id").primaryKey(),
  driverId: integer("driver_id").notNull().references(() => driversTable.id, { onDelete: "cascade" }),
  targetId: integer("target_id").notNull().references(() => driverBonusTargetsTable.id, { onDelete: "cascade" }),
  currentValue: numeric("current_value", { precision: 12, scale: 2 }).notNull().default("0"),
  isCompleted: boolean("is_completed").notNull().default(false),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique("uq_driver_bonus_progress").on(table.driverId, table.targetId),
  index("idx_driver_bonus_progress_driver_id").on(table.driverId),
  index("idx_driver_bonus_progress_target_id").on(table.targetId),
  index("idx_driver_bonus_progress_completed").on(table.isCompleted),
]);

export const insertDriverBonusProgressSchema = createInsertSchema(driverBonusProgressTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDriverBonusProgress = z.infer<typeof insertDriverBonusProgressSchema>;
export type DriverBonusProgress = typeof driverBonusProgressTable.$inferSelect;
