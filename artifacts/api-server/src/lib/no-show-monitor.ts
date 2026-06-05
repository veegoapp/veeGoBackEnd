import {
  db,
  ridesTable,
  usersTable,
  driversTable,
  driverEarningsTable,
  walletTransactionsTable,
  rideEventsTable,
} from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { getIO, clearDeviationState } from "../socket";
import { SOCKET_EVENTS, SOCKET_ROOMS } from "./socket-events";
import { loadSetting } from "./settings";
import { stopWaitingTimer } from "./waiting-timer";
import { logger } from "./logger";
import * as dispatchManager from "./dispatch-manager";

// ─── Config ───────────────────────────────────────────────────────────────────

const DEFAULT_NO_SHOW_TIMEOUT_MINUTES = 10;
const TIMEOUT_SETTING_KEY             = "no_show_timeout_minutes";

// ─── In-memory state ──────────────────────────────────────────────────────────

/** rideId → active no-show timeout handle */
const timers = new Map<number, ReturnType<typeof setTimeout>>();

// ─── Core logic ───────────────────────────────────────────────────────────────

async function triggerNoShow(rideId: number): Promise<void> {
  timers.delete(rideId);

  // Re-fetch to guard against race: ride may have already moved to active/cancelled.
  const [ride] = await db
    .select()
    .from(ridesTable)
    .where(eq(ridesTable.id, rideId));

  if (!ride || ride.status !== "driver_arrived") {
    logger.info({ rideId, status: ride?.status }, "No-show trigger skipped — ride no longer in driver_arrived state");
    return;
  }

  // Stop the waiting charge timer and capture accrued amount.
  const { waitingCharge: waitingChargeAmount } = stopWaitingTimer(rideId);

  // Load the arrived flat fee (same setting as manual cancel-after-arrival).
  const rawArrivedFee  = await loadSetting<number>("cancellation_fee_arrived", 5.00);
  const arrivedFlatFee = (typeof rawArrivedFee === "number" && !isNaN(rawArrivedFee) && rawArrivedFee >= 0)
    ? rawArrivedFee
    : 5.00;

  const escrowedAmount = ride.estimatedPrice ? parseFloat(ride.estimatedPrice as string) : 0;
  const totalFee       = parseFloat((arrivedFlatFee + waitingChargeAmount).toFixed(2));
  const refundAmount   = parseFloat(Math.max(0, escrowedAmount - totalFee).toFixed(2));

  // Resolve driver's user ID for WebSocket notification.
  let driverUserId: number | null = null;
  if (ride.driverId) {
    const [drv] = await db
      .select({ userId: driversTable.userId })
      .from(driversTable)
      .where(eq(driversTable.id, ride.driverId));
    if (drv) driverUserId = drv.userId;
  }

  // Atomic: cancel ride, refund passenger, credit driver, release driver.
  await db.transaction(async (tx) => {
    await tx
      .update(ridesTable)
      .set({
        status:       "cancelled",
        cancelReason: "passenger_no_show",
        cancelledAt:  new Date(),
        ...(waitingChargeAmount > 0 ? { waitingCharge: waitingChargeAmount.toFixed(2) } : {}),
      })
      .where(eq(ridesTable.id, rideId));

    await tx.insert(rideEventsTable).values({
      rideId,
      type:     "RIDE_CANCELLED",
      metadata: {
        cancelledBy:    "system",
        reason:         "passenger_no_show",
        escrowedAmount,
        arrivedFlatFee,
        waitingCharge:  waitingChargeAmount,
        totalFee,
        refundAmount,
      },
    });

    // Refund passenger (escrow minus total fee).
    if (refundAmount > 0) {
      await tx
        .update(usersTable)
        .set({ walletBalance: sql`wallet_balance + ${refundAmount}` })
        .where(eq(usersTable.id, ride.passengerId));

      const desc = waitingChargeAmount > 0
        ? `Ride #${rideId} cancelled (no-show) — refund ${refundAmount.toFixed(2)} (arrived fee ${arrivedFlatFee.toFixed(2)} + waiting ${waitingChargeAmount.toFixed(2)} retained)`
        : `Ride #${rideId} cancelled (no-show) — refund ${refundAmount.toFixed(2)} (arrived fee ${arrivedFlatFee.toFixed(2)} retained)`;

      await tx.insert(walletTransactionsTable).values({
        userId:      ride.passengerId,
        amount:      refundAmount.toFixed(2),
        type:        "refund",
        description: desc,
      });
    }

    // Credit driver: arrived flat fee.
    if (arrivedFlatFee > 0 && ride.driverId) {
      await tx.insert(driverEarningsTable).values({
        driverId: ride.driverId,
        amount:   arrivedFlatFee.toFixed(2),
        status:   "confirmed",
      });
    }

    // Credit driver: accrued waiting charge.
    if (waitingChargeAmount > 0 && ride.driverId) {
      await tx.insert(driverEarningsTable).values({
        driverId: ride.driverId,
        amount:   waitingChargeAmount.toFixed(2),
        status:   "confirmed",
      });
    }

    // Release driver back to available pool.
    if (ride.driverId) {
      await tx
        .update(driversTable)
        .set({ status: "online" })
        .where(eq(driversTable.id, ride.driverId));
    }
  });

  // Clean up dispatch and deviation state.
  dispatchManager.onCancelled(rideId).catch((err) =>
    logger.error({ err, rideId }, "Dispatch onCancelled error during no-show"),
  );
  clearDeviationState(rideId);

  // WebSocket notifications.
  const io = getIO();
  if (io) {
    // Notify passenger — same event shape as a manual cancellation.
    io.to(SOCKET_ROOMS.PASSENGER(ride.passengerId)).emit(SOCKET_EVENTS.RIDE_CANCELLED, {
      rideId,
      reason:          "passenger_no_show",
      refundAmount,
      cancellationFee: totalFee,
    });

    // Notify driver with compensation breakdown.
    if (driverUserId !== null) {
      io.to(SOCKET_ROOMS.DRIVER(driverUserId)).emit(SOCKET_EVENTS.RIDE_NO_SHOW_CANCELLED, {
        rideId,
        compensation:   totalFee,
        arrivedFlatFee,
        waitingCharge:  waitingChargeAmount,
      });
    }
  }

  logger.info(
    { rideId, passengerId: ride.passengerId, driverUserId, totalFee, refundAmount },
    "No-show cancellation processed",
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Starts a no-show timeout for a ride that has just reached `driver_arrived`.
 *
 * If the configured window has already elapsed (e.g. on server restart
 * recovery), the trigger fires immediately (remaining = 0).
 *
 * Idempotent: clears any existing timer before starting a new one.
 */
export async function startNoShowTimer(rideId: number, arrivedAt: Date): Promise<void> {
  stopNoShowTimer(rideId);

  const rawTimeout     = await loadSetting<number>(TIMEOUT_SETTING_KEY, DEFAULT_NO_SHOW_TIMEOUT_MINUTES);
  const timeoutMinutes = (typeof rawTimeout === "number" && rawTimeout > 0)
    ? rawTimeout
    : DEFAULT_NO_SHOW_TIMEOUT_MINUTES;

  const timeoutMs  = timeoutMinutes * 60 * 1_000;
  const elapsed    = Date.now() - arrivedAt.getTime();
  const remaining  = Math.max(0, timeoutMs - elapsed);

  const handle = setTimeout(
    () => triggerNoShow(rideId).catch((err) =>
      logger.error({ err, rideId }, "No-show cancellation failed"),
    ),
    remaining,
  );
  timers.set(rideId, handle);

  logger.info({ rideId, remainingMs: remaining, timeoutMinutes }, "No-show timer started");
}

/**
 * Cancels the pending no-show timeout for a ride.
 *
 * Must be called when the ride moves out of `driver_arrived` by any means:
 *   - Driver starts the ride (→ active)
 *   - Passenger cancels manually
 *   - Driver cancels and ride is re-dispatched
 *
 * Safe to call when no timer is active (no-op).
 */
export function stopNoShowTimer(rideId: number): void {
  const handle = timers.get(rideId);
  if (handle !== undefined) {
    clearTimeout(handle);
    timers.delete(rideId);
    logger.debug({ rideId }, "No-show timer stopped");
  }
}

// ─── Startup recovery ─────────────────────────────────────────────────────────

/**
 * Re-hydrates no-show timers from the database on server startup.
 *
 * For rides already past the configured window, the timer fires on the next
 * event-loop tick (remaining = 0), producing an immediate cancellation.
 */
export async function initNoShowTimers(): Promise<void> {
  try {
    const arrivedRides = await db
      .select({
        id:              ridesTable.id,
        driverArrivedAt: ridesTable.driverArrivedAt,
      })
      .from(ridesTable)
      .where(
        and(
          eq(ridesTable.status, "driver_arrived"),
          sql`${ridesTable.driverArrivedAt} IS NOT NULL`,
        ),
      );

    if (arrivedRides.length === 0) {
      logger.info("No driver_arrived rides for no-show recovery");
      return;
    }

    for (const ride of arrivedRides) {
      if (!ride.driverArrivedAt) continue;
      await startNoShowTimer(ride.id, new Date(ride.driverArrivedAt));
    }

    logger.info({ count: arrivedRides.length }, "No-show timers recovered on startup");
  } catch (err) {
    logger.error({ err }, "Failed to recover no-show timers on startup");
  }
}
