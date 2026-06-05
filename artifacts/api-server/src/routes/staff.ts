import { Router } from "express";
import { db, usersTable, staffRolesTable } from "@workspace/db";
import { eq, and, ilike } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { authenticate, requireRole } from "../middlewares/auth";
import { z } from "zod";

const router = Router();

const ALL_PERMISSIONS = [
  "view_dashboard",
  "view_routes", "edit_routes",
  "view_trips", "edit_trips",
  "view_drivers", "edit_drivers",
  "view_buses", "edit_buses",
  "view_passengers", "edit_passengers",
  "view_bookings", "edit_bookings",
  "view_wallet", "edit_wallet",
  "view_support", "edit_support",
  "view_suggestions",
  "view_verification", "edit_verification",
  "view_analytics",
  "view_staff", "edit_staff",
  "view_settings", "edit_settings",
  "view_promo", "edit_promo",
  "view_live_tracking",
  "view_driver_analytics",
  "view_notifications",
];

router.get("/admin/permissions/all", authenticate, requireRole("admin"), (req, res) => {
  res.json({ permissions: ALL_PERMISSIONS });
});

router.get("/admin/roles", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const roles = await db.select().from(staffRolesTable).orderBy(staffRolesTable.createdAt);
  res.json({ data: roles, total: roles.length });
});

router.post("/admin/roles", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const schema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    permissions: z.array(z.string()).default([]),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [role] = await db.insert(staffRolesTable).values(parsed.data).returning();
  res.status(201).json(role);
});

router.patch("/admin/roles/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const schema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    permissions: z.array(z.string()).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [updated] = await db.update(staffRolesTable).set(parsed.data).where(eq(staffRolesTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Role not found" }); return; }
  res.json(updated);
});

router.delete("/admin/roles/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.update(usersTable).set({ staffRoleId: null }).where(eq(usersTable.staffRoleId, id));
  await db.delete(staffRolesTable).where(eq(staffRolesTable.id, id));
  res.json({ success: true });
});

function safeStaff(user: Record<string, unknown>) {
  const { password, refreshToken, ...rest } = user;
  return rest;
}

router.get("/admin/staff", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const search = typeof req.query.search === "string" ? req.query.search : undefined;

  const conditions = [eq(usersTable.role, "admin")];
  if (search) conditions.push(ilike(usersTable.name, `%${search}%`));

  const data = await db.select().from(usersTable).where(and(...conditions)).orderBy(usersTable.createdAt);

  const roles = await db.select().from(staffRolesTable);
  const rolesMap = new Map(roles.map(r => [r.id, r]));

  const result = data.map(u => ({
    ...safeStaff(u as Record<string, unknown>),
    staffRole: u.staffRoleId ? rolesMap.get(u.staffRoleId) ?? null : null,
  }));

  res.json({ data: result, total: result.length });
});

router.post("/admin/staff", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const schema = z.object({
    name: z.string().min(1),
    email: z.string().email(),
    phone: z.string().min(1),
    password: z.string().min(8),
    staffRoleId: z.number().int().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, parsed.data.email));
  if (existing.length > 0) { res.status(400).json({ error: "Email already in use" }); return; }

  const hashedPassword = await bcrypt.hash(parsed.data.password, 12);
  const [user] = await db.insert(usersTable).values({
    name: parsed.data.name,
    email: parsed.data.email,
    phone: parsed.data.phone,
    password: hashedPassword,
    role: "admin",
    staffRoleId: parsed.data.staffRoleId ?? null,
  }).returning();

  res.status(201).json(safeStaff(user as Record<string, unknown>));
});

router.delete("/admin/staff/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  if (req.user?.id === id) { res.status(400).json({ error: "Cannot delete your own account" }); return; }
  const [deleted] = await db.delete(usersTable).where(and(eq(usersTable.id, id), eq(usersTable.role, "admin"))).returning({ id: usersTable.id });
  if (!deleted) { res.status(404).json({ error: "Staff member not found" }); return; }
  res.json({ success: true });
});

router.patch("/admin/staff/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const schema = z.object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    staffRoleId: z.number().int().nullable().optional(),
    isBlocked: z.boolean().optional(),
    password: z.string().min(8).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.password) {
    updateData.password = await bcrypt.hash(parsed.data.password, 12);
  } else {
    delete updateData.password;
  }

  const [updated] = await db.update(usersTable).set(updateData).where(eq(usersTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Staff user not found" }); return; }
  res.json(safeStaff(updated as Record<string, unknown>));
});

export default router;
