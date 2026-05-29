import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

export async function loadSetting<T>(key: string, defaultValue: T): Promise<T> {
  try {
    const [row] = await db
      .select({ value: settingsTable.value })
      .from(settingsTable)
      .where(eq(settingsTable.key, key));
    if (!row) return defaultValue;
    return JSON.parse(row.value) as T;
  } catch (err) {
    logger.warn({ err, key }, "Failed to load setting from DB, using default");
    return defaultValue;
  }
}

export async function saveSetting<T>(key: string, value: T): Promise<void> {
  const stringValue = JSON.stringify(value);
  await db
    .insert(settingsTable)
    .values({ key, value: stringValue })
    .onConflictDoUpdate({
      target: settingsTable.key,
      set: { value: stringValue },
    });
}
