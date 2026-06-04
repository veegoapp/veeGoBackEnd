import { db, ridesTable, rideEventsTable, usersTable, walletTransactionsTable } from "@workspace/db";
import { eq, and, lt, sql } from "drizzle-orm";
import { getIO } from "../socket";
import { logger } from "./logger";

const TIMEOUT_MINUTES = parseInt(process.env.RIDE_TIMEOUT_MINUTES ?? "5", 10);
const POLL_INTERVAL_MS = 60_000;

async function cancelTimedOutRides(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - TIMEOUT_MINUTES * 60 * 1000);

    const timedOut = await db
      .select({ id: ridesTable.id, passengerId: ridesTable.passengerId, estimatedPrice: ridesTable.estimatedPrice })
      .from(ridesTable)
      .where(
        and(
          eq(ridesTable.status, "searching"),
          lt(ridesTable.requestedAt, cutoff),
        ),
      );

    if (timedOut.length === 0) return;

    for (const ride of timedOut) {
      const escrowed = ride.estimatedPrice ? parseFloat(ride.estimatedPrice as string) : 0;

      await db.transaction(async (tx) => {
        await tx
          .update(ridesTable)
          .set({
            status: "cancelled",
            cancelReason: "timeout",
            cancelNote: `No driver accepted within ${TIMEOUT_MINUTES} minutes`,
            cancelledAt: new Date(),
          })
          .where(eq(ridesTable.id, ride.id));

        await tx.insert(rideEventsTable).values({
          rideId: ride.id,
          type: "RIDE_CANCELLED",
          metadata: { reason: "timeout", timeoutMinutes: TIMEOUT_MINUTES },
        });

        if (escrowed > 0) {
          await tx
            .update(usersTable)
            .set({ walletBalance: sql`wallet_balance + ${escrowed}` })
            .where(eq(usersTable.id, ride.passengerId));

          await tx.insert(walletTransactionsTable).values({
            userId:      ride.passengerId,
            amount:      escrowed.toFixed(2),
            type:        "refund",
            description: `Ride #${ride.id} timed out — payment refunded`,
          });
        }
      });

      const io = getIO();
      if (io) {
        io.to(`passenger:${ride.passengerId}`).emit("ride:status_update", {
          rideId: ride.id,
          status: "cancelled",
          reason: "timeout",
          message: `No driver was found within ${TIMEOUT_MINUTES} minutes. Please try again.`,
        });
      }

      logger.info({ rideId: ride.id, passengerId: ride.passengerId }, "Ride auto-cancelled due to timeout");
    }

    logger.info({ count: timedOut.length }, "Ride timeout sweep completed");
  } catch (err) {
    logger.error({ err }, "Error in ride timeout sweep");
  }
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startRideTimeoutJob(): void {
  if (intervalHandle) return;
  intervalHandle = setInterval(() => {
    cancelTimedOutRides().catch((err) => logger.error({ err }, "Ride timeout job error"));
  }, POLL_INTERVAL_MS);

  logger.info(
    { timeoutMinutes: TIMEOUT_MINUTES, pollIntervalMs: POLL_INTERVAL_MS },
    "Ride timeout background job started",
  );
}

export function stopRideTimeoutJob(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
