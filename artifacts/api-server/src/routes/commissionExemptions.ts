import { Router } from "express";
import { db, driverCommissionExemptionsTable, driversTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { z } from "zod";

const router = Router();

const CreateExemptionBody = z.object({
  driverId: z.number().int().positive(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  reason: z.string().optional(),
});

const UpdateExemptionBody = z.object({
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  reason: z.string().optional(),
  isActive: z.boolean().optional(),
});

// ─── List exemptions ──────────────────────────────────────────────────────────
router.get("/admin/commission-exemptions", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const driverIdRaw = req.query.driverId as string | undefined;
  const driverId = driverIdRaw ? parseInt(driverIdRaw) : undefined;

  const baseQuery = db
    .select({
      id:          driverCommissionExemptionsTable.id,
      driverId:    driverCommissionExemptionsTable.driverId,
      startsAt:    driverCommissionExemptionsTable.startsAt,
      endsAt:      driverCommissionExemptionsTable.endsAt,
      reason:      driverCommissionExemptionsTable.reason,
      isActive:    driverCommissionExemptionsTable.isActive,
      createdAt:   driverCommissionExemptionsTable.createdAt,
      driverName:  driversTable.name,
      driverPhone: driversTable.phone,
    })
    .from(driverCommissionExemptionsTable)
    .leftJoin(driversTable, eq(driverCommissionExemptionsTable.driverId, driversTable.id))
    .orderBy(desc(driverCommissionExemptionsTable.createdAt));

  const rows = driverId
    ? await baseQuery.where(eq(driverCommissionExemptionsTable.driverId, driverId))
    : await baseQuery;

  res.json({ data: rows });
});

// ─── Create exemption ─────────────────────────────────────────────────────────
router.post("/admin/commission-exemptions", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = CreateExemptionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid data" }); return; }

  const [driver] = await db.select({ id: driversTable.id }).from(driversTable).where(eq(driversTable.id, parsed.data.driverId));
  if (!driver) { res.status(404).json({ error: "Driver not found" }); return; }

  const [exemption] = await db
    .insert(driverCommissionExemptionsTable)
    .values({
      driverId: parsed.data.driverId,
      startsAt: new Date(parsed.data.startsAt),
      endsAt:   new Date(parsed.data.endsAt),
      reason:   parsed.data.reason,
    })
    .returning();

  res.status(201).json(exemption);
});

// ─── Update exemption ─────────────────────────────────────────────────────────
router.patch("/admin/commission-exemptions/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateExemptionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid data" }); return; }

  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.startsAt) updateData.startsAt = new Date(parsed.data.startsAt);
  if (parsed.data.endsAt)   updateData.endsAt   = new Date(parsed.data.endsAt);

  const [updated] = await db
    .update(driverCommissionExemptionsTable)
    .set(updateData)
    .where(eq(driverCommissionExemptionsTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Exemption not found" }); return; }
  res.json(updated);
});

// ─── Delete exemption ─────────────────────────────────────────────────────────
router.delete("/admin/commission-exemptions/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db
    .delete(driverCommissionExemptionsTable)
    .where(eq(driverCommissionExemptionsTable.id, id))
    .returning();

  if (!deleted) { res.status(404).json({ error: "Exemption not found" }); return; }
  res.sendStatus(204);
});

export default router;
