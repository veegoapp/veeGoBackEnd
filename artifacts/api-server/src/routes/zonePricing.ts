import { Router } from "express";
import { db, zonePricingTable, zonesTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { z } from "zod";

const router = Router();

const ZonePricingBody = z.object({
  zoneId: z.number().int().positive(),
  vehicleType: z.enum(["car", "bike"]),
  baseFare: z.number().positive(),
  perKmRate: z.number().nonnegative(),
  minimumFare: z.number().positive(),
  isActive: z.boolean().optional().default(true),
});

const ZonePricingPatchBody = ZonePricingBody.partial().omit({ zoneId: true, vehicleType: true });
const IdParam = z.object({ id: z.coerce.number().int().positive() });

function parseRow(r: Record<string, unknown>) {
  return {
    ...r,
    baseFare: parseFloat(r.baseFare as string),
    perKmRate: parseFloat(r.perKmRate as string),
    minimumFare: parseFloat(r.minimumFare as string),
  };
}

router.get("/admin/zone-pricing", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const { vehicleType } = req.query as Record<string, string>;
    const conditions: ReturnType<typeof eq>[] = [];
    if (vehicleType && ["car", "bike"].includes(vehicleType)) {
      conditions.push(eq(zonePricingTable.vehicleType, vehicleType));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        id: zonePricingTable.id,
        zoneId: zonePricingTable.zoneId,
        zoneName: zonesTable.name,
        vehicleType: zonePricingTable.vehicleType,
        baseFare: zonePricingTable.baseFare,
        perKmRate: zonePricingTable.perKmRate,
        minimumFare: zonePricingTable.minimumFare,
        isActive: zonePricingTable.isActive,
        createdAt: zonePricingTable.createdAt,
        updatedAt: zonePricingTable.updatedAt,
      })
      .from(zonePricingTable)
      .leftJoin(zonesTable, eq(zonePricingTable.zoneId, zonesTable.id))
      .where(where)
      .orderBy(zonesTable.name, zonePricingTable.vehicleType);

    res.json({ data: rows.map((r) => parseRow(r as unknown as Record<string, unknown>)) });
  } catch {
    res.status(500).json({ error: "Failed to fetch zone pricing" });
  }
});

router.post("/admin/zone-pricing", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = ZonePricingBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid data" }); return; }
  try {
    const { baseFare, perKmRate, minimumFare, ...rest } = parsed.data;
    const [row] = await db
      .insert(zonePricingTable)
      .values({
        ...rest,
        baseFare: baseFare.toString(),
        perKmRate: perKmRate.toString(),
        minimumFare: minimumFare.toString(),
      })
      .returning();
    const zoneRow = await db.select({ name: zonesTable.name }).from(zonesTable).where(eq(zonesTable.id, row.zoneId));
    res.status(201).json(parseRow({ ...row as unknown as Record<string, unknown>, zoneName: zoneRow[0]?.name ?? "" }));
  } catch (err: unknown) {
    const msg = (err as { message?: string }).message ?? "";
    if (msg.includes("unique") || msg.includes("duplicate")) {
      res.status(409).json({ error: "A price entry for this zone and vehicle type already exists" });
    } else {
      res.status(500).json({ error: "Failed to create zone pricing" });
    }
  }
});

router.patch("/admin/zone-pricing/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = IdParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = ZonePricingPatchBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid data" }); return; }
  try {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.baseFare !== undefined) updates.baseFare = parsed.data.baseFare.toString();
    if (parsed.data.perKmRate !== undefined) updates.perKmRate = parsed.data.perKmRate.toString();
    if (parsed.data.minimumFare !== undefined) updates.minimumFare = parsed.data.minimumFare.toString();
    if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;

    const [updated] = await db
      .update(zonePricingTable)
      .set(updates as Parameters<typeof db.update>[0] extends infer T ? any : never)
      .where(eq(zonePricingTable.id, params.data.id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Zone pricing not found" }); return; }

    const zoneRow = await db.select({ name: zonesTable.name }).from(zonesTable).where(eq(zonesTable.id, updated.zoneId));
    res.json(parseRow({ ...updated as unknown as Record<string, unknown>, zoneName: zoneRow[0]?.name ?? "" }));
  } catch {
    res.status(500).json({ error: "Failed to update zone pricing" });
  }
});

router.delete("/admin/zone-pricing/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = IdParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [deleted] = await db.delete(zonePricingTable).where(eq(zonePricingTable.id, params.data.id)).returning();
  if (!deleted) { res.status(404).json({ error: "Zone pricing not found" }); return; }
  res.sendStatus(204);
});

export default router;
