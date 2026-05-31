import { Router } from "express";
import { db, serviceControlsTable, serviceControlLogsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { getIO } from "../socket";
import { SOCKET_EVENTS, SOCKET_ROOMS } from "../lib/socket-events";
import { z } from "zod";

const router = Router();

const SERVICE_TYPES = ["shuttle", "car", "motorcycle", "delivery"] as const;
type ServiceType = typeof SERVICE_TYPES[number];

const ServiceTypeParam = z.object({
  type: z.enum(SERVICE_TYPES),
});

const ServiceControlPatchBody = z.object({
  isEnabled: z.boolean().optional(),
  displayMode: z.enum(["live", "coming_soon", "unavailable", "maintenance"]).optional(),
  unavailableMessage: z.string().nullable().optional(),
  unavailableAction: z.enum(["none", "show_message", "hide_service"]).optional(),
  activeZoneIds: z.array(z.number().int().positive()).optional(),
  maintenanceEta: z.string().datetime().nullable().optional(),
  maxActiveRides: z.number().int().min(1).nullable().optional(),
});

const DEFAULT_CONTROL = {
  isEnabled: true,
  displayMode: "live" as const,
  unavailableMessage: null,
  unavailableAction: "none" as const,
  activeZoneIds: [] as number[],
  maintenanceEta: null,
  maxActiveRides: null,
};

async function ensureServiceControl(type: ServiceType) {
  const [existing] = await db
    .select()
    .from(serviceControlsTable)
    .where(eq(serviceControlsTable.serviceType, type));

  if (existing) return existing;

  const [created] = await db
    .insert(serviceControlsTable)
    .values({ serviceType: type, ...DEFAULT_CONTROL })
    .returning();
  return created;
}

async function getLastLogs(type: ServiceType, limit = 10) {
  return db
    .select({
      id: serviceControlLogsTable.id,
      serviceType: serviceControlLogsTable.serviceType,
      changedBy: serviceControlLogsTable.changedBy,
      changedAt: serviceControlLogsTable.changedAt,
      changes: serviceControlLogsTable.changes,
    })
    .from(serviceControlLogsTable)
    .where(eq(serviceControlLogsTable.serviceType, type))
    .orderBy(desc(serviceControlLogsTable.changedAt))
    .limit(limit);
}

async function writeControlLog(type: ServiceType, changedBy: number | undefined, before: Record<string, unknown>, after: Record<string, unknown>) {
  const diff: Record<string, { before: unknown; after: unknown }> = {};
  for (const key of Object.keys(after)) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      diff[key] = { before: before[key], after: after[key] };
    }
  }
  if (Object.keys(diff).length === 0) return;
  await db.insert(serviceControlLogsTable).values({
    serviceType: type,
    changedBy: changedBy ?? null,
    changes: diff,
  });
}

// ─── ADMIN endpoints (role: admin) ───────────────────────────────────────────

router.get("/admin/services/:type/control", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = ServiceTypeParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid service type" }); return; }

  try {
    const control = await ensureServiceControl(params.data.type);
    const logs = await getLastLogs(params.data.type, 10);
    res.json({ ...control, logs });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch service control" });
  }
});

router.patch("/admin/services/:type/control", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = ServiceTypeParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid service type" }); return; }

  const parsed = ServiceControlPatchBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  try {
    const current = await ensureServiceControl(params.data.type);

    const updateData: Record<string, unknown> = { updatedBy: req.user?.id ?? null, updatedAt: new Date() };
    if (parsed.data.isEnabled !== undefined) updateData.isEnabled = parsed.data.isEnabled;
    if (parsed.data.displayMode !== undefined) updateData.displayMode = parsed.data.displayMode;
    if ("unavailableMessage" in parsed.data) updateData.unavailableMessage = parsed.data.unavailableMessage;
    if (parsed.data.unavailableAction !== undefined) updateData.unavailableAction = parsed.data.unavailableAction;
    if (parsed.data.activeZoneIds !== undefined) updateData.activeZoneIds = parsed.data.activeZoneIds;
    if ("maintenanceEta" in parsed.data) updateData.maintenanceEta = parsed.data.maintenanceEta ? new Date(parsed.data.maintenanceEta) : null;
    if ("maxActiveRides" in parsed.data) updateData.maxActiveRides = parsed.data.maxActiveRides;

    const [updated] = await db
      .update(serviceControlsTable)
      .set(updateData as Partial<typeof serviceControlsTable.$inferInsert>)
      .where(eq(serviceControlsTable.serviceType, params.data.type))
      .returning();

    await writeControlLog(
      params.data.type,
      req.user?.id,
      current as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
    );

    const io = getIO();
    if (io) {
      const broadcastPayload = {
        serviceType: updated.serviceType,
        isEnabled: updated.isEnabled,
        displayMode: updated.displayMode,
        unavailableMessage: updated.unavailableMessage,
        unavailableAction: updated.unavailableAction,
        activeZoneIds: updated.activeZoneIds,
        maintenanceEta: updated.maintenanceEta,
        changedBy: req.user?.id ?? null,
        changedAt: new Date().toISOString(),
      };
      io.to(SOCKET_ROOMS.ADMIN).emit(SOCKET_EVENTS.SERVICE_CONTROL_CHANGED, broadcastPayload);
      io.emit(SOCKET_EVENTS.SERVICE_CONTROL_CHANGED, broadcastPayload);
    }

    const logs = await getLastLogs(params.data.type, 10);
    res.json({ ...updated, logs });
  } catch (err) {
    res.status(500).json({ error: "Failed to update service control" });
  }
});

router.post("/admin/services/:type/control/reset", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = ServiceTypeParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid service type" }); return; }

  try {
    const current = await ensureServiceControl(params.data.type);

    const [updated] = await db
      .update(serviceControlsTable)
      .set({ ...DEFAULT_CONTROL, updatedBy: req.user?.id ?? null, updatedAt: new Date() })
      .where(eq(serviceControlsTable.serviceType, params.data.type))
      .returning();

    await writeControlLog(
      params.data.type,
      req.user?.id,
      current as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
    );

    const io = getIO();
    if (io) {
      const broadcastPayload = {
        serviceType: updated.serviceType,
        isEnabled: updated.isEnabled,
        displayMode: updated.displayMode,
        unavailableMessage: updated.unavailableMessage,
        unavailableAction: updated.unavailableAction,
        activeZoneIds: updated.activeZoneIds,
        maintenanceEta: updated.maintenanceEta,
        changedBy: req.user?.id ?? null,
        changedAt: new Date().toISOString(),
      };
      io.to(SOCKET_ROOMS.ADMIN).emit(SOCKET_EVENTS.SERVICE_CONTROL_CHANGED, broadcastPayload);
      io.emit(SOCKET_EVENTS.SERVICE_CONTROL_CHANGED, broadcastPayload);
    }

    const logs = await getLastLogs(params.data.type, 10);
    res.json({ ...updated, logs });
  } catch (err) {
    res.status(500).json({ error: "Failed to reset service control" });
  }
});

// ─── PUBLIC endpoints (JWT required, no admin role) ──────────────────────────

const PUBLIC_FIELDS = {
  serviceType: serviceControlsTable.serviceType,
  isEnabled: serviceControlsTable.isEnabled,
  displayMode: serviceControlsTable.displayMode,
  unavailableMessage: serviceControlsTable.unavailableMessage,
  unavailableAction: serviceControlsTable.unavailableAction,
  activeZoneIds: serviceControlsTable.activeZoneIds,
  maintenanceEta: serviceControlsTable.maintenanceEta,
} as const;

router.get("/services/control", authenticate, async (_req, res): Promise<void> => {
  try {
    const rows = await db.select(PUBLIC_FIELDS).from(serviceControlsTable);

    const byType: Record<string, unknown> = {};
    for (const row of rows) {
      byType[row.serviceType] = row;
    }

    for (const type of SERVICE_TYPES) {
      if (!byType[type]) {
        const created = await ensureServiceControl(type);
        byType[type] = {
          serviceType: created.serviceType,
          isEnabled: created.isEnabled,
          displayMode: created.displayMode,
          unavailableMessage: created.unavailableMessage,
          unavailableAction: created.unavailableAction,
          activeZoneIds: created.activeZoneIds,
          maintenanceEta: created.maintenanceEta,
        };
      }
    }

    res.json({ data: Object.values(byType) });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch service controls" });
  }
});

router.get("/services/:type/control", authenticate, async (req, res): Promise<void> => {
  const params = ServiceTypeParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid service type" }); return; }

  try {
    const control = await ensureServiceControl(params.data.type);
    res.json({
      serviceType: control.serviceType,
      isEnabled: control.isEnabled,
      displayMode: control.displayMode,
      unavailableMessage: control.unavailableMessage,
      unavailableAction: control.unavailableAction,
      activeZoneIds: control.activeZoneIds,
      maintenanceEta: control.maintenanceEta,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch service control" });
  }
});

export default router;
