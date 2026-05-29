/**
 * Shared user-response helpers.
 * Extracted so that both /auth/me and /users/me return identical shapes.
 */

import { db, usersTable, staffRolesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function getPermissions(staffRoleId: number | null): Promise<string[]> {
  if (!staffRoleId) return [];
  const [role] = await db
    .select({ permissions: staffRolesTable.permissions })
    .from(staffRolesTable)
    .where(eq(staffRolesTable.id, staffRoleId));
  return role?.permissions ?? [];
}

export function safeUserResponse(
  user: typeof usersTable.$inferSelect,
  permissions: string[],
) {
  const {
    password,
    refreshToken,
    otpCode,
    otpExpiresAt,
    passwordResetToken,
    passwordResetExpiresAt,
    ...rest
  } = user;
  return { ...rest, walletBalance: parseFloat(rest.walletBalance), permissions };
}
