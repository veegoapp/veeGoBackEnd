import { Router } from "express";
import { db, auditLogsTable, usersTable } from "@workspace/db";
import { eq, desc, and, gte, lte, ilike, sql } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { z } from "zod";

const router = Router();

const ListAuditLogsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  action: z.string().optional(),
  entityType: z.string().optional(),
  userId: z.coerce.number().int().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

const AuditLogIdParam = z.object({ id: z.coerce.number().int() });

router.get("/admin/audit-logs", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = ListAuditLogsQuery.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { page, limit, action, entityType, userId, from, to } = parsed.data;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (action) conditions.push(eq(auditLogsTable.action, action));
  if (entityType) conditions.push(eq(auditLogsTable.entityType, entityType));
  if (userId) conditions.push(eq(auditLogsTable.userId, userId));
  if (from) conditions.push(gte(auditLogsTable.createdAt, new Date(from)));
  if (to) conditions.push(lte(auditLogsTable.createdAt, new Date(to)));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countResult] = await Promise.all([
    db
      .select({
        id: auditLogsTable.id,
        userId: auditLogsTable.userId,
        action: auditLogsTable.action,
        entityType: auditLogsTable.entityType,
        entityId: auditLogsTable.entityId,
        oldData: auditLogsTable.oldData,
        newData: auditLogsTable.newData,
        ipAddress: auditLogsTable.ipAddress,
        userAgent: auditLogsTable.userAgent,
        createdAt: auditLogsTable.createdAt,
        adminName: usersTable.name,
        adminEmail: usersTable.email,
      })
      .from(auditLogsTable)
      .leftJoin(usersTable, eq(auditLogsTable.userId, usersTable.id))
      .where(where)
      .orderBy(desc(auditLogsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLogsTable)
      .where(where),
  ]);

  res.json({ data: rows, total: countResult[0].count, page, limit });
});

router.get("/admin/audit-logs/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = AuditLogIdParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [row] = await db
    .select({
      id: auditLogsTable.id,
      userId: auditLogsTable.userId,
      action: auditLogsTable.action,
      entityType: auditLogsTable.entityType,
      entityId: auditLogsTable.entityId,
      oldData: auditLogsTable.oldData,
      newData: auditLogsTable.newData,
      ipAddress: auditLogsTable.ipAddress,
      userAgent: auditLogsTable.userAgent,
      createdAt: auditLogsTable.createdAt,
      adminName: usersTable.name,
      adminEmail: usersTable.email,
    })
    .from(auditLogsTable)
    .leftJoin(usersTable, eq(auditLogsTable.userId, usersTable.id))
    .where(eq(auditLogsTable.id, params.data.id));

  if (!row) { res.status(404).json({ error: "Audit log not found" }); return; }
  res.json(row);
});

router.get("/admin/audit-logs/distinct/actions", authenticate, requireRole("admin"), async (_req, res): Promise<void> => {
  const rows = await db
    .selectDistinct({ action: auditLogsTable.action })
    .from(auditLogsTable)
    .orderBy(auditLogsTable.action);
  res.json(rows.map((r) => r.action));
});

router.get("/admin/audit-logs/distinct/entity-types", authenticate, requireRole("admin"), async (_req, res): Promise<void> => {
  const rows = await db
    .selectDistinct({ entityType: auditLogsTable.entityType })
    .from(auditLogsTable)
    .orderBy(auditLogsTable.entityType);
  res.json(rows.map((r) => r.entityType));
});

export default router;
