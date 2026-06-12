import { Router } from "express";
import { db, vehiclesTable, driversTable } from "@workspace/db";
import { eq, sql, ilike, and, type SQL } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { writeAuditLog, getClientIp } from "../lib/auditLog";
import { resolveCarCategory } from "../lib/car-category";
import { z } from "zod";

const router = Router();

const ListVehiclesQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.enum(["pending", "verified", "rejected", "suspended"]).optional(),
  vehicleType: z.enum(["car", "motorcycle", "van", "minibus"]).optional(),
});

const VehicleIdParam = z.object({ id: z.coerce.number().int() });

const CreateVehicleBody = z.object({
  driverId:    z.number().int(),
  plateNumber: z.string().min(1),
  make:        z.string().min(1),
  model:       z.string().min(1),
  year:        z.number().int().min(1900).max(new Date().getFullYear() + 1),
  color:       z.string().min(1),
  vehicleType: z.enum(["car", "motorcycle", "van", "minibus"]),
  status:      z.enum(["pending", "verified", "rejected", "suspended"]).optional(),
  isActive:    z.boolean().optional(),
  brandId:     z.number().int().optional(),
  modelId:     z.number().int().optional(),
  colorId:     z.number().int().optional(),
});

const UpdateVehicleBody = z.object({
  plateNumber: z.string().min(1).optional(),
  make:        z.string().min(1).optional(),
  model:       z.string().min(1).optional(),
  year:        z.number().int().min(1900).optional(),
  color:       z.string().min(1).optional(),
  vehicleType: z.enum(["car", "motorcycle", "van", "minibus"]).optional(),
  status:      z.enum(["pending", "verified", "rejected", "suspended"]).optional(),
  isActive:    z.boolean().optional(),
  brandId:     z.number().int().nullable().optional(),
  modelId:     z.number().int().nullable().optional(),
  colorId:     z.number().int().nullable().optional(),
});

async function resolveCategoryId(year: number, brandId?: number | null): Promise<number | null> {
  try {
    const result = await resolveCarCategory(year, brandId ?? undefined);
    return result.categoryId;
  } catch {
    return null;
  }
}

router.get("/vehicles", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = ListVehiclesQuery.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { page, limit, search, status, vehicleType } = parsed.data;
  const offset = (page - 1) * limit;

  const conditions: SQL[] = [];
  if (search) {
    conditions.push(
      sql`(${ilike(vehiclesTable.plateNumber, `%${search}%`)} OR ${ilike(vehiclesTable.make, `%${search}%`)} OR ${ilike(vehiclesTable.model, `%${search}%`)})`
    );
  }
  if (status) conditions.push(eq(vehiclesTable.status, status));
  if (vehicleType) conditions.push(eq(vehiclesTable.vehicleType, vehicleType));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [data, countResult] = await Promise.all([
    db
      .select({
        id: vehiclesTable.id,
        driverId: vehiclesTable.driverId,
        plateNumber: vehiclesTable.plateNumber,
        make: vehiclesTable.make,
        model: vehiclesTable.model,
        year: vehiclesTable.year,
        color: vehiclesTable.color,
        vehicleType: vehiclesTable.vehicleType,
        status: vehiclesTable.status,
        isActive: vehiclesTable.isActive,
        createdAt: vehiclesTable.createdAt,
        updatedAt: vehiclesTable.updatedAt,
        driverName: driversTable.name,
        driverPhone: driversTable.phone,
      })
      .from(vehiclesTable)
      .leftJoin(driversTable, eq(vehiclesTable.driverId, driversTable.id))
      .where(where)
      .orderBy(vehiclesTable.createdAt)
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(vehiclesTable)
      .where(where),
  ]);

  res.json({ data, total: countResult[0].count, page, limit });
});

router.post("/vehicles", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = CreateVehicleBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  let categoryId: number | null = null;
  if (parsed.data.vehicleType === "car") {
    categoryId = await resolveCategoryId(parsed.data.year, parsed.data.brandId);
  }

  const [vehicle] = await db.insert(vehiclesTable).values({
    ...parsed.data,
    ...(categoryId !== null ? { categoryId } : {}),
  }).returning();
  void writeAuditLog({
    userId: req.user?.id,
    action: "CREATE",
    entityType: "vehicle",
    entityId: vehicle.id,
    newData: vehicle as unknown as Record<string, unknown>,
    ipAddress: getClientIp(req),
    userAgent: req.headers["user-agent"] ?? null,
  });
  res.status(201).json(vehicle);
});

router.get("/vehicles/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = VehicleIdParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [vehicle] = await db
    .select({
      id: vehiclesTable.id,
      driverId: vehiclesTable.driverId,
      plateNumber: vehiclesTable.plateNumber,
      make: vehiclesTable.make,
      model: vehiclesTable.model,
      year: vehiclesTable.year,
      color: vehiclesTable.color,
      vehicleType: vehiclesTable.vehicleType,
      status: vehiclesTable.status,
      isActive: vehiclesTable.isActive,
      createdAt: vehiclesTable.createdAt,
      updatedAt: vehiclesTable.updatedAt,
      driverName: driversTable.name,
      driverPhone: driversTable.phone,
    })
    .from(vehiclesTable)
    .leftJoin(driversTable, eq(vehiclesTable.driverId, driversTable.id))
    .where(eq(vehiclesTable.id, params.data.id));
  if (!vehicle) { res.status(404).json({ error: "Vehicle not found" }); return; }
  res.json(vehicle);
});

router.patch("/vehicles/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = VehicleIdParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateVehicleBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [existing] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Vehicle not found" }); return; }

  const effectiveVehicleType = parsed.data.vehicleType ?? existing.vehicleType;
  const effectiveYear        = parsed.data.year        ?? existing.year;
  let categoryId: number | null | undefined;
  if (effectiveVehicleType === "car" && (parsed.data.vehicleType !== undefined || parsed.data.year !== undefined || parsed.data.brandId !== undefined)) {
    categoryId = await resolveCategoryId(effectiveYear, parsed.data.brandId !== undefined ? parsed.data.brandId : existing.brandId);
  }

  const [updated] = await db
    .update(vehiclesTable)
    .set({
      ...parsed.data,
      ...(categoryId !== undefined ? { categoryId } : {}),
    })
    .where(eq(vehiclesTable.id, params.data.id))
    .returning();
  void writeAuditLog({
    userId: req.user?.id,
    action: "UPDATE",
    entityType: "vehicle",
    entityId: updated.id,
    oldData: existing as unknown as Record<string, unknown>,
    newData: updated as unknown as Record<string, unknown>,
    ipAddress: getClientIp(req),
    userAgent: req.headers["user-agent"] ?? null,
  });
  res.json(updated);
});

router.delete("/vehicles/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = VehicleIdParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [deleted] = await db
    .delete(vehiclesTable)
    .where(eq(vehiclesTable.id, params.data.id))
    .returning();
  if (!deleted) { res.status(404).json({ error: "Vehicle not found" }); return; }
  void writeAuditLog({
    userId: req.user?.id,
    action: "DELETE",
    entityType: "vehicle",
    entityId: deleted.id,
    oldData: deleted as unknown as Record<string, unknown>,
    ipAddress: getClientIp(req),
    userAgent: req.headers["user-agent"] ?? null,
  });
  res.sendStatus(204);
});

export default router;
