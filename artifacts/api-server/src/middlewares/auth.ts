import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../lib/jwt";
import { db, usersTable, staffRolesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

declare global {
  namespace Express {
    interface Request {
      user?: { id: number; role: string; permissions: string[]; staffRoleId: number | null };
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = verifyAccessToken(token);
    const [user] = await db.select({
      id: usersTable.id,
      role: usersTable.role,
      isBlocked: usersTable.isBlocked,
      staffRoleId: usersTable.staffRoleId,
    })
      .from(usersTable)
      .where(eq(usersTable.id, payload.userId));

    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    if (user.isBlocked) {
      res.status(403).json({ error: "Account is blocked" });
      return;
    }

    let permissions: string[] = [];
    if (user.role === "admin" && user.staffRoleId) {
      const [staffRole] = await db.select({ permissions: staffRolesTable.permissions })
        .from(staffRolesTable)
        .where(eq(staffRolesTable.id, user.staffRoleId));
      permissions = staffRole?.permissions ?? [];
    }

    req.user = { id: user.id, role: user.role, permissions, staffRoleId: user.staffRoleId };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (req.user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    if (req.user.staffRoleId === null) {
      next();
      return;
    }
    if (!req.user.permissions.includes(permission)) {
      res.status(403).json({ error: `Missing permission: ${permission}` });
      return;
    }
    next();
  };
}
