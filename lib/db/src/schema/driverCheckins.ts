import { pgTable, serial, integer, text, boolean, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { driversTable } from "./drivers";
import { tripsTable } from "./trips";

export const checkInTypeEnum = pgEnum("checkin_type", [
  "shuttle_trip_start",
  "periodic_online",
]);

export const driverCheckInsTable = pgTable("driver_checkins", {
  id:           serial("id").primaryKey(),
  driverId:     integer("driver_id").notNull().references(() => driversTable.id, { onDelete: "cascade" }),
  tripId:       integer("trip_id").references(() => tripsTable.id, { onDelete: "set null" }),
  checkInType:  checkInTypeEnum("checkin_type").notNull(),
  imageUrl:     text("image_url").notNull(),
  faceDetected: boolean("face_detected").notNull().default(false),
  submittedAt:  timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt:    timestamp("created_at",   { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_driver_checkins_driver_id").on(table.driverId),
  index("idx_driver_checkins_trip_id").on(table.tripId),
  index("idx_driver_checkins_type").on(table.checkInType),
  index("idx_driver_checkins_submitted").on(table.submittedAt),
  index("idx_driver_checkins_face").on(table.driverId, table.faceDetected, table.submittedAt),
]);

export const insertDriverCheckInSchema = createInsertSchema(driverCheckInsTable).omit({ id: true, createdAt: true });
export type InsertDriverCheckIn = z.infer<typeof insertDriverCheckInSchema>;
export type DriverCheckIn = typeof driverCheckInsTable.$inferSelect;
