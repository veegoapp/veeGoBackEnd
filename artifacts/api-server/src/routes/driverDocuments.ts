import { Router } from "express";
import { db, driverDocumentsTable, driversTable } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const router = Router();

const UPLOADS_DIR = path.join(process.cwd(), "uploads", "drivers");

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const driverId = req.params.driverId || req.body.driverId || "unknown";
    const type = req.body.type || "misc";
    const dir = path.join(UPLOADS_DIR, `driver_${driverId}`, type);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    cb(null, `${Date.now()}_${crypto.randomBytes(6).toString("hex")}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed (jpeg, png, webp)"));
    }
  },
});

const ListDocumentsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  verificationStatus: z.enum(["pending", "approved", "rejected"]).optional(),
  type: z.enum([
    "national_id_front", "national_id_back",
    "driving_license_front", "driving_license_back",
    "vehicle_license_front", "vehicle_license_back",
    "vehicle_photo", "profile_photo", "trip_selfie", "criminal_record",
  ]).optional(),
});

const UpdateDocumentBody = z.object({
  verificationStatus: z.enum(["pending", "approved", "rejected"]).optional(),
  adminNotes: z.string().optional(),
});

router.get("/driver-documents", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = ListDocumentsQuery.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { page, limit, verificationStatus, type } = parsed.data;
  const offset = (page - 1) * limit;

  const conditions: any[] = [];
  if (verificationStatus) conditions.push(eq(driverDocumentsTable.verificationStatus, verificationStatus));
  if (type) conditions.push(eq(driverDocumentsTable.type, type));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [docs, countResult] = await Promise.all([
    db.select({
      doc: driverDocumentsTable,
      driverName: driversTable.name,
      driverPhone: driversTable.phone,
    })
      .from(driverDocumentsTable)
      .leftJoin(driversTable, eq(driverDocumentsTable.driverId, driversTable.id))
      .where(where)
      .orderBy(desc(driverDocumentsTable.uploadedAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(driverDocumentsTable).where(where),
  ]);

  const data = docs.map(({ doc, driverName, driverPhone }) => ({
    ...doc,
    driver: { name: driverName, phone: driverPhone },
  }));

  res.json({ data, total: countResult[0].count, page, limit });
});

router.get("/driver-documents/by-driver/:driverId", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const driverId = parseInt(req.params.driverId as string);
  if (isNaN(driverId)) { res.status(400).json({ error: "Invalid driverId" }); return; }

  const [driver] = await db.select({ id: driversTable.id, name: driversTable.name, phone: driversTable.phone })
    .from(driversTable).where(eq(driversTable.id, driverId));
  if (!driver) { res.status(404).json({ error: "Driver not found" }); return; }

  const docs = await db.select().from(driverDocumentsTable)
    .where(eq(driverDocumentsTable.driverId, driverId))
    .orderBy(driverDocumentsTable.type, desc(driverDocumentsTable.uploadedAt));

  res.json({ driver, documents: docs });
});

router.post("/driver-documents/upload/:driverId",
  authenticate,
  upload.single("file"),
  async (req, res): Promise<void> => {
    const driverId = parseInt(req.params.driverId as string);
    if (isNaN(driverId)) { res.status(400).json({ error: "Invalid driverId" }); return; }
    if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }

    const typeValidation = z.enum([
      "national_id_front", "national_id_back",
      "driving_license_front", "driving_license_back",
      "vehicle_license_front", "vehicle_license_back",
      "vehicle_photo", "profile_photo", "trip_selfie", "criminal_record",
    ]).safeParse(req.body.type);
    if (!typeValidation.success) { res.status(400).json({ error: "Invalid document type" }); return; }

    const relativePath = path.relative(process.cwd(), req.file.path).replace(/\\/g, "/");
    const fileUrl = `/api/uploads/${relativePath.replace(/^uploads\//, "")}`;

    const [doc] = await db.insert(driverDocumentsTable).values({
      driverId,
      type: typeValidation.data,
      fileUrl,
      mimeType: req.file.mimetype,
    }).returning();

    res.status(201).json(doc);
  }
);

router.patch("/driver-documents/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateDocumentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [updated] = await db.update(driverDocumentsTable).set(parsed.data).where(eq(driverDocumentsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Document not found" }); return; }
  res.json(updated);
});

router.get("/driver-documents/stats", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const rows = await db.select({
    status: driverDocumentsTable.verificationStatus,
    count: sql<number>`count(*)::int`,
  }).from(driverDocumentsTable).groupBy(driverDocumentsTable.verificationStatus);

  const stats: Record<string, number> = { pending: 0, approved: 0, rejected: 0 };
  for (const row of rows) stats[row.status] = row.count;
  res.json(stats);
});

export default router;
