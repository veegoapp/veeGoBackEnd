/**
 * Checkin Monitor — background job that enforces the Driver Selfie Check-in policy.
 *
 * Phase 1 (prompt):
 *   Drivers who have been online for ≥ PROMPT_AFTER_HOURS (default 10 h) without a
 *   recent face-detected check-in are flagged: checkInRequired = true,
 *   checkInDeadline = now + DEADLINE_MINUTES (default 30 min).
 *   A DRIVER_CHECKIN_REQUIRED socket event is emitted to each affected driver.
 *
 * Phase 2 (enforce):
 *   Drivers with checkInRequired = true whose checkInDeadline has passed are
 *   automatically set offline (isOnline = false, status = "offline").
 *   Their onlineSince / checkInRequired / checkInDeadline are cleared.
 *   A DRIVER_CHECKIN_REJECTED socket event notifies them of the forced sign-off.
 */

import { db, driversTable, driverCheckInsTable } from "@workspace/db";
import { eq, and, lte, lt, isNotNull, sql } from "drizzle-orm";
import { getIO } from "../socket";
import { SOCKET_EVENTS, SOCKET_ROOMS } from "./socket-events";
import { logger } from "./logger";

// ─── Configuration ────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS   = 60_000;
const PROMPT_AFTER_HOURS = parseInt(process.env.CHECKIN_PROMPT_HOURS   ?? "10", 10);
const DEADLINE_MINUTES   = parseInt(process.env.CHECKIN_DEADLINE_MINUTES ?? "30", 10);

// ─── Phase 1: Prompt drivers who have been online ≥ PROMPT_AFTER_HOURS ────────

async function promptLongOnlineDrivers(): Promise<void> {
  const shiftCutoff = new Date(Date.now() - PROMPT_AFTER_HOURS * 60 * 60 * 1000);

  // Find online drivers whose shift started before the cutoff and who don't
  // already have a check-in prompt active.
  const candidates = await db
    .select({
      id:         driversTable.id,
      userId:     driversTable.userId,
      onlineSince: driversTable.onlineSince,
    })
    .from(driversTable)
    .where(
      and(
        eq(driversTable.isOnline, true),
        eq(driversTable.status, "online"),
        eq(driversTable.checkInRequired, false),
        isNotNull(driversTable.onlineSince),
        lte(driversTable.onlineSince, shiftCutoff),
      ),
    );

  if (candidates.length === 0) return;

  const deadline = new Date(Date.now() + DEADLINE_MINUTES * 60 * 1000);
  const io = getIO();

  for (const driver of candidates) {
    // Verify the driver doesn't already have a valid check-in within the prompt window.
    // (Covers the case where lastCheckInAt was updated but checkInRequired wasn't cleared.)
    const [recent] = await db
      .select({ id: driverCheckInsTable.id })
      .from(driverCheckInsTable)
      .where(
        and(
          eq(driverCheckInsTable.driverId, driver.id),
          eq(driverCheckInsTable.faceDetected, true),
          lte(driversTable.onlineSince, driverCheckInsTable.submittedAt),
        ),
      )
      .limit(1);

    if (recent) continue; // Already checked in this shift — skip

    await db
      .update(driversTable)
      .set({ checkInRequired: true, checkInDeadline: deadline })
      .where(eq(driversTable.id, driver.id));

    io?.to(SOCKET_ROOMS.DRIVER(driver.userId)).emit(SOCKET_EVENTS.DRIVER_CHECKIN_REQUIRED, {
      reason:   "long_shift",
      deadline: deadline.toISOString(),
      message:  `You have been online for over ${PROMPT_AFTER_HOURS} hours. Please submit a selfie check-in within ${DEADLINE_MINUTES} minutes to continue.`,
    });

    logger.info(
      { driverId: driver.id, onlineSince: driver.onlineSince, deadline },
      "checkin-monitor: check-in required issued (long shift)",
    );
  }
}

// ─── Phase 2: Force offline drivers who missed their deadline ─────────────────

async function enforceDeadlines(): Promise<void> {
  const now = new Date();

  const overdue = await db
    .select({ id: driversTable.id, userId: driversTable.userId })
    .from(driversTable)
    .where(
      and(
        eq(driversTable.isOnline, true),
        eq(driversTable.checkInRequired, true),
        isNotNull(driversTable.checkInDeadline),
        lt(driversTable.checkInDeadline, now),
      ),
    );

  if (overdue.length === 0) return;

  const io = getIO();

  for (const driver of overdue) {
    await db
      .update(driversTable)
      .set({
        isOnline:        false,
        status:          "offline",
        onlineSince:     null,
        checkInRequired: false,
        checkInDeadline: null,
      })
      .where(eq(driversTable.id, driver.id));

    io?.to(SOCKET_ROOMS.DRIVER(driver.userId)).emit(SOCKET_EVENTS.DRIVER_CHECKIN_REJECTED, {
      reason:  "deadline_missed",
      message: "You have been signed off automatically because the selfie check-in deadline passed.",
    });

    logger.info(
      { driverId: driver.id },
      "checkin-monitor: driver auto-offlined (check-in deadline missed)",
    );
  }

  if (overdue.length > 0) {
    logger.info({ count: overdue.length }, "checkin-monitor: enforcement sweep complete");
  }
}

// ─── Poll loop ────────────────────────────────────────────────────────────────

async function runSweep(): Promise<void> {
  try {
    await enforceDeadlines();
    await promptLongOnlineDrivers();
  } catch (err) {
    logger.error({ err }, "checkin-monitor: sweep error");
  }
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startCheckinMonitor(): void {
  if (intervalHandle) return;

  intervalHandle = setInterval(() => {
    runSweep().catch((err) => logger.error({ err }, "checkin-monitor: unhandled error"));
  }, POLL_INTERVAL_MS);

  logger.info(
    { promptAfterHours: PROMPT_AFTER_HOURS, deadlineMinutes: DEADLINE_MINUTES, pollIntervalMs: POLL_INTERVAL_MS },
    "checkin-monitor: started",
  );
}

export function stopCheckinMonitor(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
