import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const staffRolesTable = pgTable("staff_roles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  permissions: text("permissions").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type StaffRole = typeof staffRolesTable.$inferSelect;
export type InsertStaffRole = typeof staffRolesTable.$inferInsert;
