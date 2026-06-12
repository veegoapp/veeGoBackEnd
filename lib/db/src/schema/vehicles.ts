import { pgTable, serial, text, timestamp, integer, boolean, pgEnum, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { driversTable } from "./drivers";
import { vehicleBrandsTable } from "./vehicleBrands";
import { vehicleModelsTable } from "./vehicleModels";
import { vehicleColorsTable } from "./vehicleColors";
import { carCategoriesTable } from "./carCategories";

export const vehicleTypeEnum = pgEnum("vehicle_type", ["car", "motorcycle", "van", "minibus"]);
export const vehicleStatusEnum = pgEnum("vehicle_status", ["pending", "verified", "rejected", "suspended"]);

export const vehiclesTable = pgTable("vehicles", {
  id: serial("id").primaryKey(),
  driverId: integer("driver_id").notNull().references(() => driversTable.id, { onDelete: "cascade" }),
  plateNumber: text("plate_number").notNull().unique(),
  make: text("make").notNull(),
  model: text("model").notNull(),
  year: integer("year").notNull(),
  color: text("color").notNull(),
  vehicleType: vehicleTypeEnum("vehicle_type").notNull().default("car"),
  status: vehicleStatusEnum("status").notNull().default("pending"),
  isActive: boolean("is_active").notNull().default(true),
  brandId: integer("brand_id").references(() => vehicleBrandsTable.id, { onDelete: "set null" }),
  modelId: integer("model_id").references(() => vehicleModelsTable.id, { onDelete: "set null" }),
  colorId: integer("color_id").references(() => vehicleColorsTable.id, { onDelete: "set null" }),
  categoryId: integer("category_id").references(() => carCategoriesTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("idx_vehicles_driver_id").on(table.driverId),
  index("idx_vehicles_status").on(table.status),
  index("idx_vehicles_vehicle_type").on(table.vehicleType),
  index("idx_vehicles_category_id").on(table.categoryId),
]);

export const insertVehicleSchema = createInsertSchema(vehiclesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVehicle = z.infer<typeof insertVehicleSchema>;
export type Vehicle = typeof vehiclesTable.$inferSelect;
