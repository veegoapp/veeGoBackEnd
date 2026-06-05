import { pgTable, serial, text, timestamp, boolean, integer, jsonb, numeric, pgEnum, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const serviceTypeEnum = pgEnum("service_type", ["shuttle", "car", "motorcycle", "delivery"]);
export const displayModeEnum = pgEnum("display_mode", ["live", "coming_soon", "unavailable", "maintenance"]);
export const unavailableActionEnum = pgEnum("unavailable_action", ["none", "show_message", "hide_service"]);

export const serviceControlsTable = pgTable("service_controls", {
  id: serial("id").primaryKey(),
  serviceType: serviceTypeEnum("service_type").notNull().unique(),
  isEnabled: boolean("is_enabled").notNull().default(true),
  displayMode: displayModeEnum("display_mode").notNull().default("live"),
  unavailableMessage: text("unavailable_message"),
  unavailableAction: unavailableActionEnum("unavailable_action").notNull().default("none"),
  activeZoneIds: integer("active_zone_ids").array().notNull().default([]),
  maintenanceEta: timestamp("maintenance_eta", { withTimezone: true }),
  maxActiveRides: integer("max_active_rides"),
  updatedBy: integer("updated_by").references(() => usersTable.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("idx_service_controls_type").on(table.serviceType),
]);

export const serviceControlLogsTable = pgTable("service_control_logs", {
  id: serial("id").primaryKey(),
  serviceType: serviceTypeEnum("service_type").notNull(),
  changedBy: integer("changed_by").references(() => usersTable.id, { onDelete: "set null" }),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  changes: jsonb("changes").notNull(),
}, (table) => [
  index("idx_service_control_logs_type").on(table.serviceType),
  index("idx_service_control_logs_changed_at").on(table.changedAt),
]);

export const serviceSettingsTable = pgTable("service_settings", {
  id: serial("id").primaryKey(),
  serviceType: serviceTypeEnum("service_type").notNull().unique(),
  minDriverRating: numeric("min_driver_rating", { precision: 3, scale: 1 }).notNull().default("0.0"),
  requiredLicenseTypes: text("required_license_types").array().notNull().default([]),
  requireInsurance: boolean("require_insurance").notNull().default(false),
  requireBackgroundCheck: boolean("require_background_check").notNull().default(false),
  maxActiveRidesPerDriver: integer("max_active_rides_per_driver").notNull().default(1),
  updatedBy: integer("updated_by").references(() => usersTable.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("idx_service_settings_type").on(table.serviceType),
]);

export const insertServiceControlSchema = createInsertSchema(serviceControlsTable).omit({ id: true, updatedAt: true });
export const insertServiceControlLogSchema = createInsertSchema(serviceControlLogsTable).omit({ id: true, changedAt: true });
export const insertServiceSettingsSchema = createInsertSchema(serviceSettingsTable).omit({ id: true, updatedAt: true });

export type ServiceControl = typeof serviceControlsTable.$inferSelect;
export type InsertServiceControl = z.infer<typeof insertServiceControlSchema>;
export type ServiceControlLog = typeof serviceControlLogsTable.$inferSelect;
export type InsertServiceControlLog = z.infer<typeof insertServiceControlLogSchema>;
export type ServiceSettings = typeof serviceSettingsTable.$inferSelect;
export type InsertServiceSettings = z.infer<typeof insertServiceSettingsSchema>;
