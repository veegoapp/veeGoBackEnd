import { pgTable, serial, text, timestamp, integer, boolean, pgEnum, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { supportTicketsTable } from "./support";
import { tripsTable } from "./trips";

export const chatSenderTypeEnum = pgEnum("chat_sender_type", ["admin", "passenger", "driver", "system"]);

export const chatMessagesTable = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").references(() => supportTicketsTable.id, { onDelete: "cascade" }),
  tripId: integer("trip_id").references(() => tripsTable.id, { onDelete: "cascade" }),
  senderId: integer("sender_id"),
  senderType: chatSenderTypeEnum("sender_type").notNull(),
  message: text("message").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_chat_messages_ticket_id").on(table.ticketId),
  index("idx_chat_messages_trip_id").on(table.tripId),
  index("idx_chat_messages_sender_id").on(table.senderId),
  index("idx_chat_messages_created_at").on(table.createdAt),
]);

export const insertChatMessageSchema = createInsertSchema(chatMessagesTable).omit({ id: true, createdAt: true });
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessagesTable.$inferSelect;
