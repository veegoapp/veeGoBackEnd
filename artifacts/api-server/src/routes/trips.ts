import { Router } from "express";
import { db, tripsTable, busesTable, routesTable, driversTable, bookingsTable, usersTable, walletTransactionsTable, notificationsTable } from "@workspace/db";
import { eq, sql, and, inArray } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import {
  ListTripsQueryParams,
  GetTripParams,
  CreateTripBody,
  UpdateTripParams,
  UpdateTripBody,
  CancelTripParams,
} from "@workspace/api-zod";

const router = Router();

function formatTrip(t: Record<string, unknown>) {
  return {
    ...t,
    price: typeof t.price === "string" ? parseFloat(t.price) : t.price,
    availableSeats: t.availableSeats,
    totalSeats: t.totalSeats,
  };
}

router.get("/trips", async (req, res): Promise<void> => {
  const parsed = ListTripsQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { routeId, status, date, page = 1, limit = 20 } = parsed.data;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (routeId) conditions.push(eq(tripsTable.routeId, routeId));
  if (status) conditions.push(eq(tripsTable.status, status as "scheduled" | "active" | "completed" | "cancelled"));
  if (date) conditions.push(sql`DATE(${tripsTable.departureTime}) = ${date}`);

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [data, countResult] = await Promise.all([
    db.select().from(tripsTable).where(where).limit(limit).offset(offset).orderBy(tripsTable.departureTime),
    db.select({ count: sql<number>`count(*)::int` }).from(tripsTable).where(where),
  ]);

  res.json({ data: data.map(t => formatTrip(t as Record<string, unknown>)), total: countResult[0].count, page, limit });
});

router.post("/trips", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = CreateTripBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const bus = await db.select({ capacity: busesTable.capacity }).from(busesTable).where(eq(busesTable.id, parsed.data.busId));
  if (!bus[0]) { res.status(404).json({ error: "Bus not found" }); return; }

  const [trip] = await db.insert(tripsTable).values({
    ...parsed.data,
    departureTime: new Date(parsed.data.departureTime),
    arrivalTime: new Date(parsed.data.arrivalTime),
    price: String(parsed.data.price),
    totalSeats: bus[0].capacity,
    availableSeats: bus[0].capacity,
  }).returning();

  res.status(201).json(formatTrip(trip as Record<string, unknown>));
});

router.get("/trips/:id", async (req, res): Promise<void> => {
  const params = GetTripParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, params.data.id));
  if (!trip) { res.status(404).json({ error: "Trip not found" }); return; }
  res.json(formatTrip(trip as Record<string, unknown>));
});

router.patch("/trips/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = UpdateTripParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateTripBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.departureTime) updateData.departureTime = new Date(parsed.data.departureTime);
  if (parsed.data.arrivalTime) updateData.arrivalTime = new Date(parsed.data.arrivalTime);
  if (parsed.data.price !== undefined) updateData.price = String(parsed.data.price);

  const [updated] = await db.update(tripsTable).set(updateData).where(eq(tripsTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Trip not found" }); return; }
  res.json(formatTrip(updated as Record<string, unknown>));
});

// ─── Helper: refund all confirmed/pending bookings for a trip ─────────────────
async function refundTripBookings(tx: typeof db, tripId: number): Promise<void> {
  const affectedBookings = await tx
    .select({
      id: bookingsTable.id,
      userId: bookingsTable.userId,
      totalPrice: bookingsTable.totalPrice,
    })
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.tripId, tripId),
        inArray(bookingsTable.status, ["confirmed", "pending"]),
      ),
    );

  if (affectedBookings.length === 0) return;

  for (const booking of affectedBookings) {
    const refundAmount = String(booking.totalPrice);

    // Refund wallet balance
    await tx
      .update(usersTable)
      .set({ walletBalance: sql`wallet_balance + ${refundAmount}` })
      .where(eq(usersTable.id, booking.userId));

    // Create wallet transaction record
    await tx.insert(walletTransactionsTable).values({
      userId: booking.userId,
      amount: refundAmount,
      type: "refund",
      description: "Trip cancelled by admin - refund / تم إلغاء الرحلة من قبل الإدارة - استرداد المبلغ",
    });

    // Update booking status to cancelled
    await tx
      .update(bookingsTable)
      .set({ status: "cancelled" })
      .where(eq(bookingsTable.id, booking.id));

    // Create notification for passenger
    await tx.insert(notificationsTable).values({
      userId: booking.userId,
      title: "Trip Cancelled / تم إلغاء الرحلة",
      body: "Your trip has been cancelled and your money has been refunded. / تم إلغاء رحلتك وتم استرداد المبلغ.",
    });
  }
}

router.patch("/trips/:id/cancel", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const params = CancelTripParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  let updatedTrip: ReturnType<typeof formatTrip> | null = null;

  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(tripsTable)
      .set({ status: "cancelled" })
      .where(eq(tripsTable.id, params.data.id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Trip not found" });
      return;
    }

    await refundTripBookings(tx as unknown as typeof db, params.data.id);

    updatedTrip = formatTrip(updated as Record<string, unknown>);
  });

  if (updatedTrip) {
    res.json(updatedTrip);
  }
});

router.delete("/trips/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid trip ID" }); return; }

  await db.transaction(async (tx) => {
    const [trip] = await tx
      .select({ id: tripsTable.id, status: tripsTable.status })
      .from(tripsTable)
      .where(eq(tripsTable.id, id));

    if (!trip) { res.status(404).json({ error: "Trip not found" }); return; }
    if (trip.status === "active") { res.status(400).json({ error: "Cannot delete an active trip. Cancel it first." }); return; }

    // Refund all confirmed/pending bookings before deletion
    await refundTripBookings(tx as unknown as typeof db, id);

    await tx.delete(bookingsTable).where(eq(bookingsTable.tripId, id));
    await tx.delete(tripsTable).where(eq(tripsTable.id, id));

    res.sendStatus(204);
  });
});

export default router;
