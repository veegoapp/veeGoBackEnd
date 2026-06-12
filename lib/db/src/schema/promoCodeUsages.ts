import { pgTable, serial, integer, timestamp, index, unique } from "drizzle-orm/pg-core";
import { promoCodesTable } from "./promoCodes";
import { usersTable } from "./users";

export const promoCodeUsagesTable = pgTable("promo_code_usages", {
  id: serial("id").primaryKey(),
  promoCodeId: integer("promo_code_id").notNull().references(() => promoCodesTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  usedAt: timestamp("used_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_promo_code_usages_promo_id").on(table.promoCodeId),
  index("idx_promo_code_usages_user_id").on(table.userId),
  index("idx_promo_code_usages_promo_user").on(table.promoCodeId, table.userId),
  unique("uq_promo_code_usages_promo_user_time").on(table.promoCodeId, table.userId, table.usedAt),
]);

export type PromoCodeUsage = typeof promoCodeUsagesTable.$inferSelect;
