import { pgTable, serial, text, timestamp, integer, boolean, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const busesTable = pgTable("buses", {
  id: serial("id").primaryKey(),
  plateNumber: text("plate_number").notNull().unique(),
  capacity: integer("capacity").notNull(),
  model: text("model").notNull(),
  currentLatitude: real("current_latitude"),
  currentLongitude: real("current_longitude"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertBusSchema = createInsertSchema(busesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBus = z.infer<typeof insertBusSchema>;
export type Bus = typeof busesTable.$inferSelect;
