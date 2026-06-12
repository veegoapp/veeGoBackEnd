import { pgTable, serial, integer, text, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { vehicleBrandsTable } from "./vehicleBrands";

export const vehicleModelsTable = pgTable("vehicle_models", {
  id: serial("id").primaryKey(),
  brandId: integer("brand_id").notNull().references(() => vehicleBrandsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  nameAr: text("name_ar"),
  minYear: integer("min_year").notNull(),
  maxYear: integer("max_year"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("uq_vehicle_models_brand_name").on(table.brandId, table.name),
]);

export type VehicleModel = typeof vehicleModelsTable.$inferSelect;
