import { Router } from "express";
import { db, driverDocumentsTable, driversTable, usersTable, notificationsTable } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { z } from "zod";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { getIO } from "../socket";

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { realtime: { transport: ws } },
);

const BUCKET = process.env.SUPABASE_BUCKET ?? "uploads";

const upload = multer({
  storage: multer.memoryStorage(),
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

// Documents required for auto-activation (criminal_record is NOT required)
const REQUIRED_DOCS_FOR_ACTIVATION = [
  "national_id_front",
  "national_id_back",
  "driving_license_front",
  "driving_license_back",
  "vehicle_license_front",
  "vehicle_license_back",
  "profile_photo",
  "vehicle_photo",
] as const;

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

    const ext = path.extname(req.file.originalname).toLowerCase() || ".jpg";
    const filename = `${Date.now()}_${crypto.randomBytes(6).toString("hex")}${ext}`;
    const storagePath = `drivers/driver_${driverId}/${typeValidation.data}/${filename}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      });

    if (uploadError) {
      res.status(500).json({ error: "Failed to upload file to storage", detail: uploadError.message });
      return;
    }

    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(storagePath);

    const fileUrl = urlData.publicUrl;

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

  // Auto-activation check: only trigger when a document is approved
  if (parsed.data.verificationStatus === "approved") {
    const driverId = updated.driverId;

    // Fetch all documents for this driver
    const allDocs = await db
      .select({ type: driverDocumentsTable.type, verificationStatus: driverDocumentsTable.verificationStatus })
      .from(driverDocumentsTable)
      .where(eq(driverDocumentsTable.driverId, driverId));

    // For each required type, check if at least one document of that type is approved
    const approvedTypes = new Set(
      allDocs
        .filter(d => d.verificationStatus === "approved")
        .map(d => d.type),
    );

    const allRequiredApproved = REQUIRED_DOCS_FOR_ACTIVATION.every(type => approvedTypes.has(type));

    if (allRequiredApproved) {
      // Fetch driver to get userId and current activation state
      const [driver] = await db
        .select({ id: driversTable.id, userId: driversTable.userId, isActive: driversTable.isActive })
        .from(driversTable)
        .where(eq(driversTable.id, driverId));

      if (driver && !driver.isActive) {
        // Activate driver account
        await db.update(driversTable).set({ isActive: true }).where(eq(driversTable.id, driverId));
        await db.update(usersTable).set({ isVerified: true }).where(eq(usersTable.id, driver.userId));

        // Create activation notification
        await db.insert(notificationsTable).values({
          userId: driver.userId,
          title: "Account Activated / تم تفعيل حسابك",
          body: "Your account has been approved. You can now start working. / تمت الموافقة على حسابك. يمكنك الآن البدء في العمل.",
        });

        // Emit socket event to driver's personal room
        const io = getIO();
        if (io) {
          io.to(`driver:${driver.userId}`).emit("driver:account:activated", {
            driverId,
            userId: driver.userId,
            message: "Your account has been activated.",
            activatedAt: new Date().toISOString(),
          });
        }
      }
    }
  }

  // Fix 2: Criminal record reactivation — if criminal_record just approved and driver is suspended
  if (parsed.data.verificationStatus === "approved" && updated.type === "criminal_record") {
    try {
      const driverId = updated.driverId;
      const [driver] = await db
        .select({ id: driversTable.id, userId: driversTable.userId, status: driversTable.status })
        .from(driversTable)
        .where(eq(driversTable.id, driverId));

      if (driver && driver.status === "suspended") {
        await db.update(driversTable).set({ status: "offline" }).where(eq(driversTable.id, driver.id));

        const [notif] = await db.insert(notificationsTable).values({
          userId: driver.userId,
          title: "Account Reactivated – Criminal Record Approved",
          body: "Your criminal record certificate has been approved. Your account has been reactivated. You can now go online.",
        }).returning();

        const io = getIO();
        if (io) {
          io.to(`driver:${driver.userId}`).emit("driver:account:reactivated", {
            driverId: driver.id,
            userId: driver.userId,
            message: "Criminal record approved. Account reactivated.",
            reactivatedAt: new Date().toISOString(),
          });
          if (notif) {
            io.to(`driver:${driver.userId}`).emit("notification:new", {
              id: String(notif.id),
              category: "activation",
              title: notif.title,
              body: notif.body,
              time: notif.createdAt instanceof Date ? notif.createdAt.toISOString() : String(notif.createdAt),
            });
          }
        }
      }
    } catch (_reactivErr) {
      // Non-fatal; document update already saved
    }
  }

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
