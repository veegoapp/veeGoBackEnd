import { pgTable, serial, text, timestamp, integer, pgEnum, index } from "drizzle-orm/pg-core";
import { driversTable } from "./drivers";
import { tripsTable } from "./trips";

export const documentTypeEnum = pgEnum("document_type", [
  "national_id_front",
  "national_id_back",
  "driving_license_front",
  "driving_license_back",
  "vehicle_license_front",
  "vehicle_license_back",
  "vehicle_photo",
  "profile_photo",
  "trip_selfie",
  "criminal_record",
]);

export const docVerificationStatusEnum = pgEnum("doc_verification_status", [
  "pending",
  "approved",
  "rejected",
]);

export const driverDocumentsTable = pgTable("driver_documents", {
  id: serial("id").primaryKey(),
  driverId: integer("driver_id").notNull().references(() => driversTable.id, { onDelete: "cascade" }),
  tripId: integer("trip_id").references(() => tripsTable.id, { onDelete: "set null" }),
  type: documentTypeEnum("type").notNull(),
  fileUrl: text("file_url").notNull(),
  mimeType: text("mime_type").default("image/jpeg"),
  verificationStatus: docVerificationStatusEnum("verification_status").notNull().default("pending"),
  adminNotes: text("admin_notes"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_driver_docs_driver_id").on(table.driverId),
  index("idx_driver_docs_trip_id").on(table.tripId),
  index("idx_driver_docs_verification_status").on(table.verificationStatus),
]);

export type DriverDocument = typeof driverDocumentsTable.$inferSelect;
