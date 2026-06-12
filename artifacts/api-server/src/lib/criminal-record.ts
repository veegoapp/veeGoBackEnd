import { db, driversTable, tripsTable, ridesTable, driverDocumentsTable, settingsTable, notificationsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { getIO } from "../socket";
import { SOCKET_EVENTS, SOCKET_ROOMS } from "./socket-events";

export async function checkCriminalRecordThreshold(driverId: number, driverUserId: number): Promise<void> {
  const [thresholdSetting] = await db.select({ value: settingsTable.value })
    .from(settingsTable)
    .where(eq(settingsTable.key, "criminal_record_trip_threshold"));
  const threshold = thresholdSetting ? (parseInt(thresholdSetting.value) || 30) : 30;

  const [tripCount] = await db.select({ count: sql<number>`count(*)::int` })
    .from(tripsTable)
    .where(and(eq(tripsTable.driverId, driverId), eq(tripsTable.status, "completed")));

  const [rideCount] = await db.select({ count: sql<number>`count(*)::int` })
    .from(ridesTable)
    .where(and(eq(ridesTable.driverId, driverId), eq(ridesTable.status, "completed")));

  const totalCompleted = (tripCount?.count ?? 0) + (rideCount?.count ?? 0);

  if (totalCompleted >= threshold) {
    const [approvedCriminalRecord] = await db
      .select({ id: driverDocumentsTable.id })
      .from(driverDocumentsTable)
      .where(and(
        eq(driverDocumentsTable.driverId, driverId),
        eq(driverDocumentsTable.type, "criminal_record"),
        eq(driverDocumentsTable.verificationStatus, "approved"),
      ));

    if (!approvedCriminalRecord) {
      const [currentDriver] = await db.select({ status: driversTable.status })
        .from(driversTable)
        .where(eq(driversTable.id, driverId));

      if (currentDriver?.status !== "suspended") {
        await db.update(driversTable).set({ status: "suspended" }).where(eq(driversTable.id, driverId));

        const [notif] = await db.insert(notificationsTable).values({
          userId: driverUserId,
          title: "Account Suspended – Criminal Record Required",
          body: `You have completed ${totalCompleted} trips/rides. A valid criminal record certificate is now required. Please upload it in the Documents section.`,
        }).returning();

        const io = getIO();
        if (io && notif) {
          io.to(SOCKET_ROOMS.DRIVER(driverUserId)).emit(SOCKET_EVENTS.NOTIFICATION_NEW, {
            id: String(notif.id),
            category: "suspension",
            title: notif.title,
            body: notif.body,
            time: notif.createdAt instanceof Date ? notif.createdAt.toISOString() : String(notif.createdAt),
          });
        }
      }
    }
  }
}
