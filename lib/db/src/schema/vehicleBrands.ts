import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const vehicleBrandsTable = pgTable("vehicle_brands", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  serviceType: text("service_type").notNull().default("car"),
  isChinese: boolean("is_chinese").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type VehicleBrand = typeof vehicleBrandsTable.$inferSelect;
