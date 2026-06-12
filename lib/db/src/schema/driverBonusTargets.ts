import { pgTable, serial, text, numeric, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const driverBonusTargetsTable = pgTable("driver_bonus_targets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  serviceType: text("service_type").notNull().default("all"),
  targetType: text("target_type").notNull(),
  targetValue: numeric("target_value", { precision: 12, scale: 2 }).notNull(),
  bonusAmount: numeric("bonus_amount", { precision: 10, scale: 2 }).notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  isDeleted: boolean("is_deleted").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("idx_driver_bonus_targets_active").on(table.isActive),
  index("idx_driver_bonus_targets_dates").on(table.startsAt, table.endsAt),
]);

export const insertDriverBonusTargetSchema = createInsertSchema(driverBonusTargetsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDriverBonusTarget = z.infer<typeof insertDriverBonusTargetSchema>;
export type DriverBonusTarget = typeof driverBonusTargetsTable.$inferSelect;
