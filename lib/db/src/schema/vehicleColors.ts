import { pgTable, serial, text, boolean, uniqueIndex } from "drizzle-orm/pg-core";

export const vehicleColorsTable = pgTable("vehicle_colors", {
  id: serial("id").primaryKey(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  hexCode: text("hex_code"),
  isActive: boolean("is_active").notNull().default(true),
}, (table) => [
  uniqueIndex("uq_vehicle_colors_name_en").on(table.nameEn),
]);

export type VehicleColor = typeof vehicleColorsTable.$inferSelect;
