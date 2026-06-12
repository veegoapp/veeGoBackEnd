import { Router } from "express";
import { db, promoCodesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { writeAuditLog, getClientIp } from "../lib/auditLog";
import {
  ListPromoCodesQueryParams,
  CreatePromoCodeBody,
  ValidatePromoCodeBody,
  UpdatePromoCodeParams,
  UpdatePromoCodeBody,
  DeletePromoCodeParams,
} from "@workspace/api-zod";

const router = Router();

function formatPromo(p: Record<string, unknown>) {
  return {
    ...p,
    discountValue: typeof p.discountValue === "string" ? parseFloat(p.discountValue as string) : p.discountValue,
  };
}

router.post("/promo/validate", authenticate, async (req, res): Promise<void> => {
  const parsed = ValidatePromoCodeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [promo] = await db.select().from(promoCodesTable).where(eq(promoCodesTable.code, parsed.data.code));
  if (!promo || !promo.isActive) { res.status(404).json({ error: "Promo code not found or inactive" }); return; }
  if (promo.expiryDate && new Date(promo.expiryDate) < new Date()) { res.status(400).json({ error: "Promo code expired" }); return; }
  if (promo.maxUsage && promo.usedCount >= promo.maxUsage) { res.status(400).json({ error: "Promo code usage limit reached" }); return; }
  res.json(formatPromo(promo as Record<string, unknown>));
});

router.get("/promo", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = ListPromoCodesQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { page = 1, limit = 20 } = parsed.data;
  const offset = (page - 1) * limit;
  const [data, countResult] = await Promise.all([
    db.select().from(promoCodesTable).limit(limit).offset(offset).orderBy(promoCodesTable.createdAt),
    db.select({ count: sql<number>`count(*)::int` }).from(promoCodesTable),
  ]);
  res.json({ data: data.map(p => formatPromo(p as Record<string, unknown>)), total: countResult[0].count, page, limit });
});

router.post("/promo", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = CreatePromoCodeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [promo] = await db.insert(promoCodesTable).values({
    ...parsed.data,
    discountValue: String(parsed.data.discountValue),
    expiryDate: parsed.data.expiryDate ? new Date(parsed.data.expiryDate) : undefined,
  }).returning();
  void writeAuditLog({
    userId: req.user?.id,
    action: "CREATE",
    entityType: "promo_code",
    entityId: promo.id,
    newData: formatPromo(promo as Record<string, unknown>),
    ipAddress: getClientIp(req),
    userAgent: req.headers["user-agent"] ?? null,
  });
  res.status(201).json(formatPromo(promo as Record<string, unknown>));
});

router.patch("/promo/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = UpdatePromoCodeParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdatePromoCodeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [existing] = await db.select().from(promoCodesTable).where(eq(promoCodesTable.id, params.data.id));
  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.discountValue !== undefined) updateData.discountValue = String(parsed.data.discountValue);
  if (parsed.data.expiryDate) updateData.expiryDate = new Date(parsed.data.expiryDate);
  const [updated] = await db.update(promoCodesTable).set(updateData).where(eq(promoCodesTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Promo code not found" }); return; }
  void writeAuditLog({
    userId: req.user?.id,
    action: "UPDATE",
    entityType: "promo_code",
    entityId: updated.id,
    oldData: existing ? formatPromo(existing as Record<string, unknown>) : null,
    newData: formatPromo(updated as Record<string, unknown>),
    ipAddress: getClientIp(req),
    userAgent: req.headers["user-agent"] ?? null,
  });
  res.json(formatPromo(updated as Record<string, unknown>));
});

router.delete("/promo/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = DeletePromoCodeParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [deleted] = await db.delete(promoCodesTable).where(eq(promoCodesTable.id, params.data.id)).returning();
  if (!deleted) { res.status(404).json({ error: "Promo code not found" }); return; }
  void writeAuditLog({
    userId: req.user?.id,
    action: "DELETE",
    entityType: "promo_code",
    entityId: deleted.id,
    oldData: formatPromo(deleted as Record<string, unknown>),
    ipAddress: getClientIp(req),
    userAgent: req.headers["user-agent"] ?? null,
  });
  res.sendStatus(204);
});

export default router;
