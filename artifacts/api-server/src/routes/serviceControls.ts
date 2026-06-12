import { Router } from "express";
import { db, serviceControlsTable, serviceControlLogsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { loadSetting, saveSetting } from "../lib/settings";
import { getIO } from "../socket";
import { SOCKET_EVENTS, SOCKET_ROOMS } from "../lib/socket-events";
import {
  toPublic,
  toInternal,
  PUBLIC_SERVICE_TYPES,
  type InternalServiceType,
} from "../lib/service-map";
import { z } from "zod";

const router = Router();

// Accepts both public-facing names ("scooter") and the legacy internal
// name ("motorcycle") so the admin dashboard doesn't break mid-migration.
// Responses always use the public name ("scooter").
const ServiceTypeParam = z.object({
  type: z.enum(["car", "shuttle", "delivery", "scooter", "motorcycle"]),
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

const ServiceSettingsPatchBody = z.object({
  minDriverRating: z.number().min(0).max(5).optional(),
  requiredLicenseTypes: z.array(z.string()).optional(),
  requireInsurance: z.boolean().optional(),
  requireBackgroundCheck: z.boolean().optional(),
  maxActiveRidesPerDriver: z.number().int().min(1).max(20).optional(),
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

type ServiceRequirements = {
  minDriverRating: number;
  requiredLicenseTypes: string[];
  requireInsurance: boolean;
  requireBackgroundCheck: boolean;
  maxActiveRidesPerDriver: number;
};

const DEFAULT_SERVICE_REQUIREMENTS: ServiceRequirements = {
  minDriverRating: 0,
  requiredLicenseTypes: [],
  requireInsurance: false,
  requireBackgroundCheck: false,
  maxActiveRidesPerDriver: 1,
};

async function ensureServiceControl(type: InternalServiceType) {
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


async function getLastLogs(type: InternalServiceType, limit = 10) {
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

async function writeControlLog(type: InternalServiceType, changedBy: number | undefined, before: Record<string, unknown>, after: Record<string, unknown>) {
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

/** Map a raw DB control row to the public-facing shape. */
function mapControl(row: Record<string, unknown>) {
  return {
    ...row,
    serviceType: toPublic(row.serviceType as string),
  };
}


// ─── ADMIN: SERVICE CONTROL endpoints ────────────────────────────────────────

router.get("/admin/services/:type/control", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = ServiceTypeParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid service type" }); return; }

  const internalType = toInternal(params.data.type)!;

  try {
    const control = await ensureServiceControl(internalType);
    const logs = await getLastLogs(internalType, 10);
    const mappedLogs = logs.map(l => ({ ...l, serviceType: toPublic(l.serviceType as string) }));
    res.json({ ...mapControl(control as unknown as Record<string, unknown>), logs: mappedLogs });
  } catch {
    res.status(500).json({ error: "Failed to fetch service control" });
  }
});

router.patch("/admin/services/:type/control", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = ServiceTypeParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid service type" }); return; }

  const parsed = ServiceControlPatchBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const internalType = toInternal(params.data.type)!;

  try {
    const current = await ensureServiceControl(internalType);

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
      .where(eq(serviceControlsTable.serviceType, internalType))
      .returning();

    await writeControlLog(
      internalType,
      req.user?.id,
      current as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
    );

    const io = getIO();
    if (io) {
      const broadcastPayload = {
        serviceType: toPublic(updated.serviceType),
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

    const logs = await getLastLogs(internalType, 10);
    const mappedLogs = logs.map(l => ({ ...l, serviceType: toPublic(l.serviceType as string) }));
    res.json({ ...mapControl(updated as unknown as Record<string, unknown>), logs: mappedLogs });
  } catch {
    res.status(500).json({ error: "Failed to update service control" });
  }
});

router.post("/admin/services/:type/control/reset", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = ServiceTypeParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid service type" }); return; }

  const internalType = toInternal(params.data.type)!;

  try {
    const current = await ensureServiceControl(internalType);

    const [updated] = await db
      .update(serviceControlsTable)
      .set({ ...DEFAULT_CONTROL, updatedBy: req.user?.id ?? null, updatedAt: new Date() })
      .where(eq(serviceControlsTable.serviceType, internalType))
      .returning();

    await writeControlLog(
      internalType,
      req.user?.id,
      current as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
    );

    const io = getIO();
    if (io) {
      const broadcastPayload = {
        serviceType: toPublic(updated.serviceType),
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

    const logs = await getLastLogs(internalType, 10);
    const mappedLogs = logs.map(l => ({ ...l, serviceType: toPublic(l.serviceType as string) }));
    res.json({ ...mapControl(updated as unknown as Record<string, unknown>), logs: mappedLogs });
  } catch {
    res.status(500).json({ error: "Failed to reset service control" });
  }
});

// ─── ADMIN: SERVICE SETTINGS endpoints ───────────────────────────────────────

router.get("/admin/services/:type/settings", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = ServiceTypeParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid service type" }); return; }

  const internalType = toInternal(params.data.type)!;

  try {
    const settings = await loadSetting<ServiceRequirements>(`service_req:${internalType}`, DEFAULT_SERVICE_REQUIREMENTS);
    res.json({ serviceType: toPublic(internalType), ...settings });
  } catch {
    res.status(500).json({ error: "Failed to fetch service settings" });
  }
});

router.patch("/admin/services/:type/settings", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = ServiceTypeParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid service type" }); return; }

  const parsed = ServiceSettingsPatchBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const internalType = toInternal(params.data.type)!;

  try {
    const current = await loadSetting<ServiceRequirements>(`service_req:${internalType}`, DEFAULT_SERVICE_REQUIREMENTS);
    const updated: ServiceRequirements = {
      ...current,
      ...(parsed.data.minDriverRating !== undefined ? { minDriverRating: parsed.data.minDriverRating } : {}),
      ...(parsed.data.requiredLicenseTypes !== undefined ? { requiredLicenseTypes: parsed.data.requiredLicenseTypes } : {}),
      ...(parsed.data.requireInsurance !== undefined ? { requireInsurance: parsed.data.requireInsurance } : {}),
      ...(parsed.data.requireBackgroundCheck !== undefined ? { requireBackgroundCheck: parsed.data.requireBackgroundCheck } : {}),
      ...(parsed.data.maxActiveRidesPerDriver !== undefined ? { maxActiveRidesPerDriver: parsed.data.maxActiveRidesPerDriver } : {}),
    };
    await saveSetting(`service_req:${internalType}`, updated);

    const io = getIO();
    if (io) {
      const broadcastPayload = {
        serviceType: toPublic(internalType),
        ...updated,
        changedBy: req.user?.id ?? null,
        changedAt: new Date().toISOString(),
      };
      io.to(SOCKET_ROOMS.ADMIN).emit(SOCKET_EVENTS.SERVICE_SETTINGS_CHANGED, broadcastPayload);
      io.emit(SOCKET_EVENTS.SERVICE_SETTINGS_CHANGED, broadcastPayload);
    }

    res.json({ serviceType: toPublic(internalType), ...updated });
  } catch {
    res.status(500).json({ error: "Failed to update service settings" });
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
      byType[row.serviceType] = mapControl(row as unknown as Record<string, unknown>);
    }

    const INTERNAL_TYPES: InternalServiceType[] = ["car", "shuttle", "delivery", "motorcycle"];
    for (const type of INTERNAL_TYPES) {
      if (!byType[type]) {
        const created = await ensureServiceControl(type);
        byType[type] = mapControl({
          serviceType: created.serviceType,
          isEnabled: created.isEnabled,
          displayMode: created.displayMode,
          unavailableMessage: created.unavailableMessage,
          unavailableAction: created.unavailableAction,
          activeZoneIds: created.activeZoneIds,
          maintenanceEta: created.maintenanceEta,
        });
      }
    }

    res.json({ data: Object.values(byType) });
  } catch {
    res.status(500).json({ error: "Failed to fetch service controls" });
  }
});

router.get("/services/:type/control", authenticate, async (req, res): Promise<void> => {
  const params = ServiceTypeParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid service type" }); return; }

  const internalType = toInternal(params.data.type)!;

  try {
    const control = await ensureServiceControl(internalType);
    res.json(mapControl({
      serviceType: control.serviceType,
      isEnabled: control.isEnabled,
      displayMode: control.displayMode,
      unavailableMessage: control.unavailableMessage,
      unavailableAction: control.unavailableAction,
      activeZoneIds: control.activeZoneIds,
      maintenanceEta: control.maintenanceEta,
    }));
  } catch {
    res.status(500).json({ error: "Failed to fetch service control" });
  }
});

router.get("/services/:type/settings", authenticate, async (req, res): Promise<void> => {
  const params = ServiceTypeParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid service type" }); return; }

  const internalType = toInternal(params.data.type)!;

  try {
    const settings = await loadSetting<ServiceRequirements>(`service_req:${internalType}`, DEFAULT_SERVICE_REQUIREMENTS);
    res.json({ serviceType: toPublic(internalType), ...settings });
  } catch {
    res.status(500).json({ error: "Failed to fetch service settings" });
  }
});

export default router;
