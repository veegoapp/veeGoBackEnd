import { Router } from "express";
import { db, shuttleVehicleTypesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { z } from "zod/v4";

const router = Router();

const CreateShuttleVehicleTypeBody = z.object({
  name: z.string().min(1),
  type: z.enum(["hiace", "minibus"]),
  minYear: z.number().int().min(1990).max(new Date().getFullYear() + 1),
  capacity: z.number().int().min(1).max(100),
  minPassengers: z.number().int().min(1).max(100),
  isActive: z.boolean().optional().default(true),
});

const UpdateShuttleVehicleTypeBody = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(["hiace", "minibus"]).optional(),
  minYear: z.number().int().min(1990).max(new Date().getFullYear() + 1).optional(),
  capacity: z.number().int().min(1).max(100).optional(),
  minPassengers: z.number().int().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
});

router.get("/admin/shuttle/vehicle-types", authenticate, requireRole("admin"), async (_req, res): Promise<void> => {
  try {
    const rows = await db.select().from(shuttleVehicleTypesTable).orderBy(shuttleVehicleTypesTable.id);
    res.json({ data: rows });
  } catch {
    res.status(500).json({ error: "Failed to fetch shuttle vehicle types" });
  }
});

router.post("/admin/shuttle/vehicle-types", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = CreateShuttleVehicleTypeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid data" });
    return;
  }
  const { name, type, minYear, capacity, minPassengers, isActive } = parsed.data;
  if (minPassengers > capacity) {
    res.status(400).json({ error: "minPassengers cannot exceed capacity" });
    return;
  }
  const [created] = await db
    .insert(shuttleVehicleTypesTable)
    .values({ name, type, minYear, capacity, minPassengers, isActive: isActive ?? true })
    .returning();
  res.status(201).json({ data: created });
});

router.patch("/admin/shuttle/vehicle-types/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const parsed = UpdateShuttleVehicleTypeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid data" });
    return;
  }
  if (Object.keys(parsed.data).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }
  const [existing] = await db.select().from(shuttleVehicleTypesTable).where(eq(shuttleVehicleTypesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Shuttle vehicle type not found" }); return; }

  const updates = parsed.data;
  const newCapacity = updates.capacity ?? existing.capacity;
  const newMinPassengers = updates.minPassengers ?? existing.minPassengers;
  if (newMinPassengers > newCapacity) {
    res.status(400).json({ error: "minPassengers cannot exceed capacity" });
    return;
  }

  const [updated] = await db
    .update(shuttleVehicleTypesTable)
    .set(updates)
    .where(eq(shuttleVehicleTypesTable.id, id))
    .returning();
  res.json({ data: updated });
});

router.delete("/admin/shuttle/vehicle-types/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [existing] = await db.select().from(shuttleVehicleTypesTable).where(eq(shuttleVehicleTypesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Shuttle vehicle type not found" }); return; }

  const [deactivated] = await db
    .update(shuttleVehicleTypesTable)
    .set({ isActive: false })
    .where(eq(shuttleVehicleTypesTable.id, id))
    .returning();
  res.json({ data: deactivated, message: "Shuttle vehicle type deactivated" });
});

router.get("/shuttle/vehicle-types", authenticate, async (_req, res): Promise<void> => {
  try {
    const rows = await db
      .select()
      .from(shuttleVehicleTypesTable)
      .where(eq(shuttleVehicleTypesTable.isActive, true))
      .orderBy(shuttleVehicleTypesTable.type);
    res.json({ data: rows });
  } catch {
    res.status(500).json({ error: "Failed to fetch shuttle vehicle types" });
  }
});

export default router;
