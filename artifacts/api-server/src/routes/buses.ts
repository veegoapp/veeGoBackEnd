import { Router } from "express";
import { db, busesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { writeAuditLog, getClientIp } from "../lib/auditLog";
import {
  ListBusesQueryParams,
  GetBusParams,
  CreateBusBody,
  UpdateBusParams,
  UpdateBusBody,
  DeleteBusParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/buses", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = ListBusesQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { page = 1, limit = 20 } = parsed.data;
  const offset = (page - 1) * limit;
  const [data, countResult] = await Promise.all([
    db.select().from(busesTable).limit(limit).offset(offset).orderBy(busesTable.createdAt),
    db.select({ count: sql<number>`count(*)::int` }).from(busesTable),
  ]);
  res.json({ data, total: countResult[0].count, page, limit });
});

router.post("/buses", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = CreateBusBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [bus] = await db.insert(busesTable).values(parsed.data).returning();
  void writeAuditLog({
    userId: req.user?.id,
    action: "CREATE",
    entityType: "bus",
    entityId: bus.id,
    newData: bus as unknown as Record<string, unknown>,
    ipAddress: getClientIp(req),
    userAgent: req.headers["user-agent"] ?? null,
  });
  res.status(201).json(bus);
});

router.get("/buses/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = GetBusParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [bus] = await db.select().from(busesTable).where(eq(busesTable.id, params.data.id));
  if (!bus) { res.status(404).json({ error: "Bus not found" }); return; }
  res.json(bus);
});

router.patch("/buses/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = UpdateBusParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateBusBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [existing] = await db.select().from(busesTable).where(eq(busesTable.id, params.data.id));
  const [updated] = await db.update(busesTable).set(parsed.data).where(eq(busesTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Bus not found" }); return; }
  void writeAuditLog({
    userId: req.user?.id,
    action: "UPDATE",
    entityType: "bus",
    entityId: updated.id,
    oldData: existing ? (existing as unknown as Record<string, unknown>) : null,
    newData: updated as unknown as Record<string, unknown>,
    ipAddress: getClientIp(req),
    userAgent: req.headers["user-agent"] ?? null,
  });
  res.json(updated);
});

router.delete("/buses/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = DeleteBusParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [deleted] = await db.delete(busesTable).where(eq(busesTable.id, params.data.id)).returning();
  if (!deleted) { res.status(404).json({ error: "Bus not found" }); return; }
  void writeAuditLog({
    userId: req.user?.id,
    action: "DELETE",
    entityType: "bus",
    entityId: deleted.id,
    oldData: deleted as unknown as Record<string, unknown>,
    ipAddress: getClientIp(req),
    userAgent: req.headers["user-agent"] ?? null,
  });
  res.sendStatus(204);
});

export default router;
