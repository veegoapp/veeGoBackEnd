import { Router } from "express";
import {
  db,
  vehicleBrandsTable,
  vehicleModelsTable,
  vehicleColorsTable,
} from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { z } from "zod";

const router = Router();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const BrandIdParam  = z.object({ id: z.coerce.number().int().positive() });
const ModelIdParam  = z.object({ id: z.coerce.number().int().positive() });
const ColorIdParam  = z.object({ id: z.coerce.number().int().positive() });

const CreateBrandBody = z.object({
  name:      z.string().min(1),
  isChinese: z.boolean().default(false),
  isActive:  z.boolean().default(true),
});

const UpdateBrandBody = z.object({
  name:      z.string().min(1).optional(),
  isChinese: z.boolean().optional(),
  isActive:  z.boolean().optional(),
});

const BulkImportBrandsBody = z.object({
  brands: z.array(z.object({
    name:      z.string().min(1),
    isChinese: z.boolean().default(false),
  })).min(1),
});

const BulkImportBrandsWithModelsBody = z.object({
  brands: z.array(z.object({
    name:      z.string().min(1),
    isChinese: z.boolean().default(false),
    models:    z.array(z.object({
      name:    z.string().min(1),
      minYear: z.number().int().min(1900),
      maxYear: z.number().int().optional(),
    })).default([]),
  })).min(1),
});

const CreateModelBody = z.object({
  brandId: z.number().int().positive(),
  name:    z.string().min(1),
  minYear: z.number().int().min(1900),
  maxYear: z.number().int().optional(),
  isActive: z.boolean().default(true),
});

const UpdateModelBody = z.object({
  name:    z.string().min(1).optional(),
  minYear: z.number().int().min(1900).optional(),
  maxYear: z.number().int().nullable().optional(),
  isActive: z.boolean().optional(),
});

const CreateColorBody = z.object({
  nameAr:  z.string().min(1),
  nameEn:  z.string().min(1),
  hexCode: z.string().optional(),
  isActive: z.boolean().default(true),
});

const UpdateColorBody = z.object({
  nameAr:  z.string().min(1).optional(),
  nameEn:  z.string().min(1).optional(),
  hexCode: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

// ─── BRANDS: public ───────────────────────────────────────────────────────────

router.get("/vehicles/brands", authenticate, async (_req, res): Promise<void> => {
  const brands = await db
    .select()
    .from(vehicleBrandsTable)
    .where(eq(vehicleBrandsTable.isActive, true))
    .orderBy(asc(vehicleBrandsTable.name));
  res.json({ data: brands });
});

router.get("/vehicles/brands/:id/models", authenticate, async (req, res): Promise<void> => {
  const params = BrandIdParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid brand id" }); return; }

  const models = await db
    .select()
    .from(vehicleModelsTable)
    .where(and(
      eq(vehicleModelsTable.brandId, params.data.id),
      eq(vehicleModelsTable.isActive, true),
    ))
    .orderBy(asc(vehicleModelsTable.name));
  res.json({ data: models });
});

router.get("/vehicles/models/:id/years", authenticate, async (req, res): Promise<void> => {
  const params = ModelIdParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid model id" }); return; }

  const [model] = await db
    .select()
    .from(vehicleModelsTable)
    .where(eq(vehicleModelsTable.id, params.data.id));

  if (!model) { res.status(404).json({ error: "Model not found" }); return; }

  const currentYear = new Date().getFullYear();
  const maxYear     = Math.min(model.maxYear ?? currentYear, currentYear);
  const years: number[] = [];
  for (let y = model.minYear; y <= maxYear; y++) years.push(y);

  res.json(years);
});

router.get("/vehicles/colors", authenticate, async (_req, res): Promise<void> => {
  const colors = await db
    .select()
    .from(vehicleColorsTable)
    .where(eq(vehicleColorsTable.isActive, true))
    .orderBy(asc(vehicleColorsTable.nameEn));
  res.json({ data: colors });
});

// ─── BRANDS: admin CRUD ───────────────────────────────────────────────────────

router.get("/admin/vehicle-catalog/brands", authenticate, requireRole("admin"), async (_req, res): Promise<void> => {
  const brands = await db
    .select()
    .from(vehicleBrandsTable)
    .orderBy(asc(vehicleBrandsTable.name));
  res.json({ data: brands });
});

router.post("/admin/vehicle-catalog/brands", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = CreateBrandBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [brand] = await db.insert(vehicleBrandsTable).values(parsed.data).returning();
  res.status(201).json(brand);
});

router.post("/admin/vehicle-catalog/brands/bulk", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = BulkImportBrandsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const inserted = await db
    .insert(vehicleBrandsTable)
    .values(parsed.data.brands)
    .onConflictDoNothing()
    .returning();

  res.status(201).json({ inserted: inserted.length, data: inserted });
});

router.post("/admin/vehicle-brands/bulk-import", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = BulkImportBrandsWithModelsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  let brandsCreated = 0;
  let brandsUpdated = 0;
  let modelsCreated = 0;
  let modelsUpdated = 0;

  for (const brandInput of parsed.data.brands) {
    const { models, ...brandData } = brandInput;

    const existing = await db
      .select({ id: vehicleBrandsTable.id })
      .from(vehicleBrandsTable)
      .where(eq(vehicleBrandsTable.name, brandData.name));

    let brandId: number;

    if (existing.length === 0) {
      const [created] = await db
        .insert(vehicleBrandsTable)
        .values(brandData)
        .returning({ id: vehicleBrandsTable.id });
      brandId = created.id;
      brandsCreated++;
    } else {
      await db
        .update(vehicleBrandsTable)
        .set({ isChinese: brandData.isChinese })
        .where(eq(vehicleBrandsTable.name, brandData.name));
      brandId = existing[0].id;
      brandsUpdated++;
    }

    for (const modelInput of models) {
      const existingModel = await db
        .select({ id: vehicleModelsTable.id })
        .from(vehicleModelsTable)
        .where(and(
          eq(vehicleModelsTable.brandId, brandId),
          eq(vehicleModelsTable.name, modelInput.name),
        ));

      if (existingModel.length === 0) {
        await db.insert(vehicleModelsTable).values({ ...modelInput, brandId });
        modelsCreated++;
      } else {
        await db
          .update(vehicleModelsTable)
          .set({ minYear: modelInput.minYear, maxYear: modelInput.maxYear ?? null })
          .where(eq(vehicleModelsTable.id, existingModel[0].id));
        modelsUpdated++;
      }
    }
  }

  res.status(200).json({ brandsCreated, brandsUpdated, modelsCreated, modelsUpdated });
});

router.patch("/admin/vehicle-catalog/brands/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = BrandIdParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid brand id" }); return; }
  const parsed = UpdateBrandBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (Object.keys(parsed.data).length === 0) { res.status(400).json({ error: "No fields to update" }); return; }

  const [updated] = await db
    .update(vehicleBrandsTable)
    .set(parsed.data)
    .where(eq(vehicleBrandsTable.id, params.data.id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Brand not found" }); return; }
  res.json(updated);
});

router.delete("/admin/vehicle-catalog/brands/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = BrandIdParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid brand id" }); return; }
  const [deleted] = await db
    .delete(vehicleBrandsTable)
    .where(eq(vehicleBrandsTable.id, params.data.id))
    .returning();
  if (!deleted) { res.status(404).json({ error: "Brand not found" }); return; }
  res.sendStatus(204);
});

// ─── MODELS: admin CRUD ───────────────────────────────────────────────────────

router.get("/admin/vehicle-catalog/models", authenticate, requireRole("admin"), async (_req, res): Promise<void> => {
  const models = await db
    .select({
      id:        vehicleModelsTable.id,
      brandId:   vehicleModelsTable.brandId,
      name:      vehicleModelsTable.name,
      minYear:   vehicleModelsTable.minYear,
      maxYear:   vehicleModelsTable.maxYear,
      isActive:  vehicleModelsTable.isActive,
      createdAt: vehicleModelsTable.createdAt,
      brandName: vehicleBrandsTable.name,
    })
    .from(vehicleModelsTable)
    .leftJoin(vehicleBrandsTable, eq(vehicleModelsTable.brandId, vehicleBrandsTable.id))
    .orderBy(asc(vehicleBrandsTable.name), asc(vehicleModelsTable.name));
  res.json({ data: models });
});

router.post("/admin/vehicle-catalog/models", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = CreateModelBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [brand] = await db.select({ id: vehicleBrandsTable.id }).from(vehicleBrandsTable).where(eq(vehicleBrandsTable.id, parsed.data.brandId));
  if (!brand) { res.status(404).json({ error: "Brand not found" }); return; }

  const [model] = await db.insert(vehicleModelsTable).values(parsed.data).returning();
  res.status(201).json(model);
});

router.patch("/admin/vehicle-catalog/models/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = ModelIdParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid model id" }); return; }
  const parsed = UpdateModelBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (Object.keys(parsed.data).length === 0) { res.status(400).json({ error: "No fields to update" }); return; }

  const [updated] = await db
    .update(vehicleModelsTable)
    .set(parsed.data)
    .where(eq(vehicleModelsTable.id, params.data.id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Model not found" }); return; }
  res.json(updated);
});

router.delete("/admin/vehicle-catalog/models/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = ModelIdParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid model id" }); return; }
  const [deleted] = await db
    .delete(vehicleModelsTable)
    .where(eq(vehicleModelsTable.id, params.data.id))
    .returning();
  if (!deleted) { res.status(404).json({ error: "Model not found" }); return; }
  res.sendStatus(204);
});

// ─── COLORS: admin CRUD ───────────────────────────────────────────────────────

router.get("/admin/vehicle-catalog/colors", authenticate, requireRole("admin"), async (_req, res): Promise<void> => {
  const colors = await db
    .select()
    .from(vehicleColorsTable)
    .orderBy(asc(vehicleColorsTable.nameEn));
  res.json({ data: colors });
});

router.post("/admin/vehicle-catalog/colors", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = CreateColorBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [color] = await db.insert(vehicleColorsTable).values(parsed.data).returning();
  res.status(201).json(color);
});

router.patch("/admin/vehicle-catalog/colors/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = ColorIdParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid color id" }); return; }
  const parsed = UpdateColorBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (Object.keys(parsed.data).length === 0) { res.status(400).json({ error: "No fields to update" }); return; }

  const [updated] = await db
    .update(vehicleColorsTable)
    .set(parsed.data)
    .where(eq(vehicleColorsTable.id, params.data.id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Color not found" }); return; }
  res.json(updated);
});

router.delete("/admin/vehicle-catalog/colors/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = ColorIdParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid color id" }); return; }
  const [deleted] = await db
    .delete(vehicleColorsTable)
    .where(eq(vehicleColorsTable.id, params.data.id))
    .returning();
  if (!deleted) { res.status(404).json({ error: "Color not found" }); return; }
  res.sendStatus(204);
});

export default router;
