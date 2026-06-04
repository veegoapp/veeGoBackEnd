import { db, driversTable, ridesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { getIO } from "../socket";
import { SOCKET_EVENTS, SOCKET_ROOMS } from "./socket-events";
import { logger } from "./logger";
import { loadSetting, saveSetting } from "./settings";

// ─── Config ──────────────────────────────────────────────────────────────────

const SURGE_INTERVAL_MS = parseInt(process.env.SURGE_INTERVAL_MS ?? "300000", 10);

/** Vehicle types evaluated on every tick. Extend here to add new types. */
const VEHICLE_TYPES = ["car", "bike"] as const;
type VehicleType = (typeof VEHICLE_TYPES)[number];

/** Prefix for per-vehicle-type settings keys used to persist state across restarts. */
const SETTINGS_KEY_PREFIX = "surge_auto_";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SurgeTier = "none" | "low" | "medium" | "high";

export interface SurgeState {
  multiplier:    number;
  tier:          SurgeTier;
  ratio:         number;
  isActive:      boolean;
  calculatedAt:  Date;
}

// ─── In-memory store ──────────────────────────────────────────────────────────

const DEFAULT_SURGE: SurgeState = {
  multiplier:   1.0,
  tier:         "none",
  ratio:        0,
  isActive:     false,
  calculatedAt: new Date(0),
};

/**
 * Single source of truth for surge state, keyed by vehicle type.
 * Pre-seeded from DB on startup; updated every tick.
 * JavaScript's single-threaded event loop means Map.set() + Map.get()
 * are always atomic — no lock needed.
 */
const surgeMap = new Map<string, SurgeState>(
  VEHICLE_TYPES.map((vt) => [vt, { ...DEFAULT_SURGE }]),
);

// ─── Tier calculation ─────────────────────────────────────────────────────────

/**
 * Maps a demand/supply ratio to a surge tier and multiplier.
 *
 * Tier thresholds (rides searching ÷ online drivers):
 *   < 2.0  → none    (1.0×)
 *   2 – 3  → low     (1.3×)
 *   3 – 5  → medium  (1.6×)
 *   ≥ 5    → high    (2.0× hard cap)
 */
function tierFromRatio(ratio: number): { multiplier: number; tier: SurgeTier } {
  if (ratio >= 5.0) return { multiplier: 2.0, tier: "high" };
  if (ratio >= 3.0) return { multiplier: 1.6, tier: "medium" };
  if (ratio >= 2.0) return { multiplier: 1.3, tier: "low" };
  return { multiplier: 1.0, tier: "none" };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Synchronous O(1) getter used by POST /rides/request and GET /rides/estimate.
 * Never touches the database — always returns the latest in-memory value.
 * Returns DEFAULT_SURGE for unknown vehicle types so ride creation
 * is never blocked even before the first tick fires.
 */
export function getCurrentSurge(vehicleType: string): SurgeState {
  return surgeMap.get(vehicleType) ?? { ...DEFAULT_SURGE };
}

/**
 * Returns the current surge state for every vehicle type.
 * Used by the admin endpoint and the passenger-connect snapshot.
 */
export function getAllSurgeStates(): Record<string, SurgeState> {
  return Object.fromEntries(surgeMap.entries());
}

// ─── Startup seed ─────────────────────────────────────────────────────────────

/**
 * Called once at server startup before the HTTP server accepts requests.
 * Pre-populates the in-memory map from the last persisted DB values so
 * there is no surge-blind window between restart and the first tick.
 */
export async function initSurgePricing(): Promise<void> {
  for (const vt of VEHICLE_TYPES) {
    try {
      const persisted = await loadSetting<SurgeState | null>(
        `${SETTINGS_KEY_PREFIX}${vt}`,
        null,
      );
      if (persisted) {
        surgeMap.set(vt, {
          ...persisted,
          // JSON round-trip turns Date into string — restore the type.
          calculatedAt: new Date(persisted.calculatedAt),
        });
        logger.info(
          { vehicleType: vt, multiplier: persisted.multiplier, tier: persisted.tier },
          "Surge state seeded from DB",
        );
      }
    } catch (err) {
      logger.warn({ err, vehicleType: vt }, "Could not seed surge state from DB; using default");
    }
  }
}

// ─── Tick function ────────────────────────────────────────────────────────────

/** Guards against overlapping ticks if a DB query takes longer than the interval. */
let isCalculating = false;

async function runSurgeTick(): Promise<void> {
  if (isCalculating) {
    logger.warn("Surge tick skipped — previous tick still running");
    return;
  }
  isCalculating = true;

  try {
    // Both COUNT queries run in parallel — one DB round-trip per tick.
    const [demandRows, supplyRows] = await Promise.all([
      // Demand: rides actively looking for a driver, grouped by vehicle type.
      db
        .select({
          vehicleType: ridesTable.vehicleType,
          count:       sql<number>`count(*)::int`,
        })
        .from(ridesTable)
        .where(eq(ridesTable.status, "searching"))
        .groupBy(ridesTable.vehicleType),

      // Supply: drivers that are online and available, grouped by vehicle type.
      db
        .select({
          vehicleType: driversTable.vehicleType,
          count:       sql<number>`count(*)::int`,
        })
        .from(driversTable)
        .where(
          sql`${driversTable.status} = 'online'
          AND ${driversTable.isOnline} = true
          AND ${driversTable.vehicleType} IS NOT NULL`,
        )
        .groupBy(driversTable.vehicleType),
    ]);

    const demandMap = new Map<string, number>();
    for (const row of demandRows) {
      if (row.vehicleType) demandMap.set(row.vehicleType, row.count as number);
    }

    const supplyMap = new Map<string, number>();
    for (const row of supplyRows) {
      if (row.vehicleType) supplyMap.set(row.vehicleType, row.count as number);
    }

    const io  = getIO();
    const now = new Date();

    for (const vt of VEHICLE_TYPES) {
      const searching = demandMap.get(vt) ?? 0;
      const online    = supplyMap.get(vt) ?? 0;

      // Edge case: zero demand AND zero supply → no meaningful ratio → no surge.
      // Using max(online, 1) prevents division-by-zero for all other cases.
      const ratio =
        searching === 0 && online === 0
          ? 0
          : searching / Math.max(online, 1);

      const { multiplier, tier } = tierFromRatio(ratio);
      const isActive = multiplier > 1.0;

      const previous = surgeMap.get(vt) ?? { ...DEFAULT_SURGE };
      const changed  = previous.multiplier !== multiplier;

      const newState: SurgeState = {
        multiplier,
        tier,
        ratio,
        isActive,
        calculatedAt: now,
      };

      surgeMap.set(vt, newState);

      logger.debug(
        {
          vehicleType: vt,
          searching,
          online,
          ratio:      ratio.toFixed(2),
          multiplier,
          tier,
          changed,
        },
        "Surge tick evaluated",
      );

      // Only write to DB and emit over WebSocket when the multiplier changes.
      // This keeps DB writes and socket traffic minimal during quiet periods.
      if (changed) {
        // Persist — survives the next server restart (read back by initSurgePricing).
        await saveSetting(`${SETTINGS_KEY_PREFIX}${vt}`, newState);

        // Broadcast to the dedicated passenger room.
        if (io) {
          io.to(SOCKET_ROOMS.PASSENGERS_ALL).emit(SOCKET_EVENTS.SURGE_UPDATED, {
            vehicleType:        vt,
            multiplier,
            previousMultiplier: previous.multiplier,
            tier,
            ratio:              parseFloat(ratio.toFixed(2)),
            isActive,
          });
        }

        logger.info(
          {
            vehicleType:        vt,
            previousMultiplier: previous.multiplier,
            multiplier,
            tier,
            ratio:              ratio.toFixed(2),
          },
          "Surge multiplier changed",
        );
      }
    }
  } catch (err) {
    logger.error({ err }, "Surge pricing tick failed");
  } finally {
    isCalculating = false;
  }
}

// ─── Job lifecycle ────────────────────────────────────────────────────────────

let intervalHandle: ReturnType<typeof setInterval> | null = null;

/**
 * Starts the surge pricing background job.
 * Fires one immediate tick so surge is accurate from the first request,
 * then repeats on the configured interval (default 5 minutes).
 * Safe to call multiple times — idempotent.
 */
export function startSurgePricingJob(): void {
  if (intervalHandle) return;

  // Immediate tick — passengers see correct surge the moment the server is ready,
  // rather than waiting up to SURGE_INTERVAL_MS for the first scheduled tick.
  runSurgeTick().catch((err) =>
    logger.error({ err }, "Surge pricing initial tick failed"),
  );

  intervalHandle = setInterval(() => {
    runSurgeTick().catch((err) =>
      logger.error({ err }, "Surge pricing tick error"),
    );
  }, SURGE_INTERVAL_MS);

  logger.info(
    { intervalMs: SURGE_INTERVAL_MS, vehicleTypes: VEHICLE_TYPES },
    "Surge pricing job started",
  );
}

/** Stops the job cleanly. Used in tests and graceful shutdown. */
export function stopSurgePricingJob(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
