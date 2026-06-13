import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const SUPER_ADMIN_EMAIL    = process.env.SUPER_ADMIN_EMAIL;
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;
const SUPER_ADMIN_NAME     = process.env.SUPER_ADMIN_NAME  ?? "Super Admin";
const SUPER_ADMIN_PHONE    = process.env.SUPER_ADMIN_PHONE ?? "+0000000000";

export async function seedSuperAdmin(): Promise<void> {
  if (!SUPER_ADMIN_EMAIL || !SUPER_ADMIN_PASSWORD) {
    logger.warn(
      "SUPER_ADMIN_EMAIL or SUPER_ADMIN_PASSWORD is not set — skipping super admin seed. " +
      "Add them to your environment variables to create the initial admin account."
    );
    return;
  }

  try {
    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, SUPER_ADMIN_EMAIL));

    if (existing) {
      logger.info({ email: SUPER_ADMIN_EMAIL }, "Super admin already exists — skipping seed");
      return;
    }

    const hashedPassword = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 12);

    await db.insert(usersTable).values({
      name: SUPER_ADMIN_NAME,
      email: SUPER_ADMIN_EMAIL,
      phone: SUPER_ADMIN_PHONE,
      password: hashedPassword,
      role: "admin",
      isVerified: true,
    });

    logger.info({ email: SUPER_ADMIN_EMAIL }, "Super admin account created successfully");
  } catch (err) {
    logger.error({ err }, "Failed to seed super admin account");
  }
}
