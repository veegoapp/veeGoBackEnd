import { pgTable, serial, text, integer, numeric, boolean, timestamp } from "drizzle-orm/pg-core";

export const carCategoriesTable = pgTable("car_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  minYear: integer("min_year").notNull(),
  maxYear: integer("max_year"),
  baseFare: numeric("base_fare", { precision: 10, scale: 2 }).notNull(),
  perKmRate: numeric("per_km_rate", { precision: 10, scale: 2 }).notNull(),
  perMinuteRate: numeric("per_minute_rate", { precision: 10, scale: 2 }).notNull(),
  minimumFare: numeric("minimum_fare", { precision: 10, scale: 2 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CarCategory = typeof carCategoriesTable.$inferSelect;
