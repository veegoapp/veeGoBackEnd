import { db, ridesTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { getIO } from "../socket";
import { SOCKET_EVENTS, SOCKET_ROOMS } from "./socket-events";
import { loadSetting } from "./settings";
import { logger } from "./logger";

// ─── Config ───────────────────────────────────────────────────────────────────

const FREE_WINDOW_MINUTES = 3;
const FREE_WINDOW_MS      = FREE_WINDOW_MINUTES * 60 * 1_000;
const CHARGE_TICK_MS      = 30 * 1_000;

const DEFAULT_RATE_PER_MINUTE = 2.00;
const DEFAULT_MAX_CHARGE      = 20.00;
const RATE_SETTING_KEY        = "waiting_charge_per_minute";
const CAP_SETTING_KEY         = "max_waiting_charge";

// ─── In-memory state ──────────────────────────────────────────────────────────

interface WaitingEntry {
  passengerId:      number;
  arrivedAt:        Date;
  /** Rate snapshotted at timer start — immune to mid-ride setting changes. */
  ratePerMinute:    number;
  /** Cap snapshotted at timer start — maximum billable amount. */
  maxCharge:        number;
  /** How many WAITING_CHARGE_UPDATED events have been sent (for UX continuity on recovery). */
  chargedMinutes:   number;
  freeWindowHandle: ReturnType<typeof setTimeout>  | null;
  chargeHandle:     ReturnType<typeof setInterval> | null;
}

/** In-memory map: rideId → timer state. */
const timers = new Map<number, WaitingEntry>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function readRate(): Promise<number> {
  try {
    const raw = await loadSetting<string>(RATE_SETTING_KEY, String(DEFAULT_RATE_PER_MINUTE));
    const parsed = parseFloat(raw);
    return isNaN(parsed) || parsed < 0 ? DEFAULT_RATE_PER_MINUTE : parsed;
  } catch {
    return DEFAULT_RATE_PER_MINUTE;
  }
}

async function readCap(): Promise<number> {
  try {
    const raw = await loadSetting<string>(CAP_SETTING_KEY, String(DEFAULT_MAX_CHARGE));
    const parsed = parseFloat(raw);
    return isNaN(parsed) || parsed <= 0 ? DEFAULT_MAX_CHARGE : parsed;
  } catch {
    return DEFAULT_MAX_CHARGE;
  }
}

/**
 * Computes the authoritative waiting charge for a given arrival time.
 * Uses actual wall-clock elapsed time, rounded down to whole minutes.
 * Result is capped at maxCharge.
 * Always consistent with billing at completion / cancellation.
 */
function computeCharge(
  arrivedAt:     Date,
  ratePerMinute: number,
  maxCharge:     number,
): { chargedMinutes: number; waitingCharge: number } {
  const elapsedMs      = Date.now() - arrivedAt.getTime();
  const elapsedMinutes = Math.floor(elapsedMs / 60_000);
  const chargedMinutes = Math.max(0, elapsedMinutes - FREE_WINDOW_MINUTES);
  const raw            = parseFloat((chargedMinutes * ratePerMinute).toFixed(2));
  return {
    chargedMinutes,
    waitingCharge: parseFloat(Math.min(raw, maxCharge).toFixed(2)),
  };
}

function emitCapReached(rideId: number, entry: WaitingEntry): void {
  const io = getIO();
  if (io) {
    io.to(SOCKET_ROOMS.PASSENGER(entry.passengerId)).emit(SOCKET_EVENTS.WAITING_CHARGE_CAPPED, {
      rideId,
      finalCharge:    entry.maxCharge,
      cappedAt:       Date.now(),
      maxCharge:      entry.maxCharge,
      chargedMinutes: entry.chargedMinutes,
    });
  }
  logger.info(
    { rideId, maxCharge: entry.maxCharge, chargedMinutes: entry.chargedMinutes },
    "Waiting charge cap reached — billing stopped",
  );
}

// ─── Core functions ───────────────────────────────────────────────────────────

/**
 * Starts the server-side waiting timer for a ride.
 *
 * Called immediately after PATCH /driver/rides/:id/arrived sets `driverArrivedAt`.
 * Idempotent: if a timer already exists for this ride it is replaced.
 *
 * @param rideId      - The ride ID.
 * @param passengerId - Used to target the WebSocket room.
 * @param arrivedAt   - The exact timestamp stored in the DB (`driverArrivedAt`).
 */
export async function startWaitingTimer(
  rideId:      number,
  passengerId: number,
  arrivedAt:   Date,
): Promise<void> {
  // Clear any stale entry (idempotent restart / dispatch recovery).
  const existing = timers.get(rideId);
  if (existing) {
    if (existing.freeWindowHandle) clearTimeout(existing.freeWindowHandle);
    if (existing.chargeHandle)     clearInterval(existing.chargeHandle);
    timers.delete(rideId);
  }

  const [ratePerMinute, maxCharge] = await Promise.all([readRate(), readCap()]);

  // Seed chargedMinutes from elapsed time so recovery after restart doesn't
  // re-send notifications for minutes already broadcast before the restart.
  const { chargedMinutes: seedMinutes } = computeCharge(arrivedAt, ratePerMinute, maxCharge);

  const entry: WaitingEntry = {
    passengerId,
    arrivedAt,
    ratePerMinute,
    maxCharge,
    chargedMinutes:   seedMinutes,
    freeWindowHandle: null,
    chargeHandle:     null,
  };
  timers.set(rideId, entry);

  const remaining = arrivedAt.getTime() + FREE_WINDOW_MS - Date.now();

  const beginCharging = () => {
    const e = timers.get(rideId);
    if (!e) return;

    const io = getIO();

    // Only emit the "started" event on the first call (not recovery path where
    // the passenger already received it before the restart).
    if (e.chargedMinutes === 0) {
      if (io) {
        io.to(SOCKET_ROOMS.PASSENGER(passengerId)).emit(SOCKET_EVENTS.WAITING_CHARGE_STARTED, {
          rideId,
          startedAt:         new Date().toISOString(),
          ratePerMinute:     e.ratePerMinute,
          freeWindowMinutes: FREE_WINDOW_MINUTES,
          maxCharge:         e.maxCharge,
        });
      }
      logger.info(
        { rideId, passengerId, ratePerMinute, maxCharge },
        "Waiting free window expired — charging started",
      );
    }

    // If the cap is already reached on recovery (server restarted after cap was
    // hit), skip starting the interval and emit the cap event once more.
    const seedCharge = parseFloat((e.chargedMinutes * e.ratePerMinute).toFixed(2));
    if (seedCharge >= e.maxCharge) {
      emitCapReached(rideId, e);
      return;
    }

    // Per-minute billing interval.
    e.chargeHandle = setInterval(() => {
      const inner = timers.get(rideId);
      if (!inner) return;

      inner.chargedMinutes += 1;
      const rawTotal     = parseFloat((inner.chargedMinutes * inner.ratePerMinute).toFixed(2));
      const runningTotal = parseFloat(Math.min(rawTotal, inner.maxCharge).toFixed(2));

      const ioInner = getIO();
      if (ioInner) {
        ioInner.to(SOCKET_ROOMS.PASSENGER(passengerId)).emit(SOCKET_EVENTS.WAITING_CHARGE_UPDATED, {
          rideId,
          elapsedMinutes: inner.chargedMinutes,
          currentCharge:  runningTotal,
          chargedMinutes: inner.chargedMinutes,
          runningTotal,
          ratePerMinute:  inner.ratePerMinute,
          maxCharge:      inner.maxCharge,
        });
      }

      logger.debug(
        { rideId, chargedMinutes: inner.chargedMinutes, runningTotal },
        "Waiting charge tick",
      );

      // Cap reached — stop billing and notify the passenger.
      if (rawTotal >= inner.maxCharge) {
        clearInterval(inner.chargeHandle!);
        inner.chargeHandle = null;
        // Keep entry in map so stopWaitingTimer can still return the capped charge.
        emitCapReached(rideId, inner);
      }
    }, CHARGE_TICK_MS);
  };

  if (remaining > 0) {
    // Normal path: schedule the free-window expiry.
    entry.freeWindowHandle = setTimeout(() => {
      const e = timers.get(rideId);
      if (!e) return;
      e.freeWindowHandle = null;
      beginCharging();
    }, remaining);

    logger.info(
      { rideId, passengerId, freeWindowRemainingMs: Math.round(remaining), ratePerMinute, maxCharge },
      "Waiting timer started",
    );
  } else {
    // Recovery path: free window already expired before this call.
    // Begin charging immediately without re-emitting WAITING_CHARGE_STARTED.
    beginCharging();

    logger.info(
      { rideId, passengerId, seedMinutes, ratePerMinute, maxCharge },
      "Waiting timer recovered (free window already passed)",
    );
  }
}

/**
 * Stops the waiting timer for a ride and returns the billable charge.
 *
 * Called from:
 *   - PATCH /driver/rides/:id/start  (waiting ends, charge is locked in DB)
 *   - PATCH /passenger/rides/:id/cancel (charge deducted from refund)
 *   - no-show-monitor (auto-cancellation)
 *
 * Computes charge from actual wall-clock elapsed time — not from tick count —
 * so billing is always accurate even if a tick fired late or was missed.
 * Result is capped at the entry's maxCharge.
 *
 * Safe to call when no timer exists (returns zero charge).
 */
export function stopWaitingTimer(rideId: number): { waitingCharge: number; chargedMinutes: number } {
  const entry = timers.get(rideId);

  if (!entry) {
    return { waitingCharge: 0, chargedMinutes: 0 };
  }

  if (entry.freeWindowHandle) clearTimeout(entry.freeWindowHandle);
  if (entry.chargeHandle)     clearInterval(entry.chargeHandle);
  timers.delete(rideId);

  // Authoritative calculation from the actual arrival timestamp, capped.
  const result = computeCharge(entry.arrivedAt, entry.ratePerMinute, entry.maxCharge);

  logger.info(
    { rideId, ...result, ratePerMinute: entry.ratePerMinute, maxCharge: entry.maxCharge },
    "Waiting timer stopped",
  );

  return result;
}

/**
 * Returns the current in-memory rate for a ride, or null if no timer is active.
 * Used by the cancellation endpoint to compute the refund deduction without
 * needing to read the settings table again.
 */
export function getWaitingRate(rideId: number): number | null {
  return timers.get(rideId)?.ratePerMinute ?? null;
}

// ─── Startup recovery ─────────────────────────────────────────────────────────

/**
 * Re-hydrates in-memory timers from the database on server startup.
 *
 * Queries all rides currently in `driver_arrived` status with a recorded
 * `driverArrivedAt`. For each, `startWaitingTimer` is called with the
 * original arrival timestamp — the elapsed-time logic handles the rest:
 * if the free window already passed, charging resumes immediately.
 */
export async function initWaitingTimers(): Promise<void> {
  try {
    const activeRides = await db
      .select({
        id:             ridesTable.id,
        passengerId:    ridesTable.passengerId,
        driverArrivedAt: ridesTable.driverArrivedAt,
      })
      .from(ridesTable)
      .where(
        and(
          eq(ridesTable.status, "driver_arrived"),
          sql`${ridesTable.driverArrivedAt} IS NOT NULL`,
        ),
      );

    if (activeRides.length === 0) {
      logger.info("No in-progress driver_arrived rides to recover");
      return;
    }

    for (const ride of activeRides) {
      if (!ride.driverArrivedAt) continue;
      await startWaitingTimer(ride.id, ride.passengerId, new Date(ride.driverArrivedAt));
    }

    logger.info({ count: activeRides.length }, "Waiting timers recovered on startup");
  } catch (err) {
    logger.error({ err }, "Failed to recover waiting timers on startup");
  }
}
