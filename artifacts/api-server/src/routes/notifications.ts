import { Router } from "express";
import { db, notificationsTable, usersTable, driversTable, bookingsTable } from "@workspace/db";
import { eq, desc, sql, and } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { getIO } from "../socket";
import { SOCKET_EVENTS } from "../lib/socket-events";
import { z } from "zod";
import {
  MarkNotificationReadParams,
  SendNotificationBody,
} from "@workspace/api-zod";

const router = Router();

const SendNotificationBodyExt = SendNotificationBody.extend({
  titleAr: z.string().optional(),
  bodyAr: z.string().optional(),
});

const BroadcastBody = z.object({
  title: z.string().min(1),
  titleAr: z.string().optional(),
  body: z.string().min(1),
  bodyAr: z.string().optional(),
  target: z.enum(["all", "users", "drivers", "specific"]).default("all"),
  userId: z.coerce.number().int().positive().optional(),
  includeBlocked: z.boolean().default(false),
  minRating: z.coerce.number().min(0).max(5).optional(),
  minTripCount: z.coerce.number().int().min(0).optional(),
});

router.get("/notifications", authenticate, async (req, res): Promise<void> => {
  const page = Math.max(1, parseInt((req.query.page as string) ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) ?? "20") || 20));
  const offset = (page - 1) * limit;

  const [data, countResult] = await Promise.all([
    db.select().from(notificationsTable)
      .where(eq(notificationsTable.userId, req.user!.id))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(notificationsTable)
      .where(eq(notificationsTable.userId, req.user!.id)),
  ]);

  res.json({ data, total: countResult[0].count, page, limit });
});

router.get("/admin/notifications/history", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const page = Math.max(1, parseInt((req.query.page as string) ?? "1") || 1);
  const limit = Math.min(50, Math.max(1, parseInt((req.query.limit as string) ?? "20") || 20));
  const offset = (page - 1) * limit;

  const [data, countResult] = await Promise.all([
    db.select({
      id: notificationsTable.id,
      userId: notificationsTable.userId,
      title: notificationsTable.title,
      titleAr: notificationsTable.titleAr,
      body: notificationsTable.body,
      bodyAr: notificationsTable.bodyAr,
      isRead: notificationsTable.isRead,
      createdAt: notificationsTable.createdAt,
      user: {
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        role: usersTable.role,
      },
    }).from(notificationsTable)
      .leftJoin(usersTable, eq(notificationsTable.userId, usersTable.id))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(notificationsTable),
  ]);

  res.json({ data, total: countResult[0].count, page, limit });
});

router.post("/notifications", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = SendNotificationBodyExt.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [notification] = await db.insert(notificationsTable).values(parsed.data).returning();
  res.status(201).json(notification);
});

router.post("/admin/notifications/broadcast", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = BroadcastBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { title, titleAr, body, bodyAr, target, userId, includeBlocked, minRating, minTripCount } = parsed.data;

  let userIds: number[] = [];

  if (target === "specific" && userId) {
    userIds = [userId];
  } else {
    const conditions: ReturnType<typeof eq>[] = [];
    if (!includeBlocked) conditions.push(eq(usersTable.isBlocked, false));
    if (target === "users") conditions.push(eq(usersTable.role, "user"));
    if (target === "drivers") conditions.push(eq(usersTable.role, "driver"));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const users = await db.select({ id: usersTable.id }).from(usersTable).where(where);
    userIds = users.map((u) => u.id);

    if (minRating != null && (target === "drivers" || target === "all")) {
      const driverRows = await db.select({ userId: driversTable.userId })
        .from(driversTable)
        .where(sql`${driversTable.rating} >= ${minRating}`);
      const driverUserIdSet = new Set(driverRows.map((d) => d.userId));
      if (target === "drivers") {
        userIds = userIds.filter((id) => driverUserIdSet.has(id));
      }
    }

    if (minTripCount != null && (target === "users" || target === "all")) {
      const bookingCounts = await db.select({
        userId: bookingsTable.userId,
        count: sql<number>`count(*)::int`,
      }).from(bookingsTable).groupBy(bookingsTable.userId);
      const countMap = new Map(bookingCounts.map((b) => [b.userId, b.count]));
      if (target === "users") {
        userIds = userIds.filter((id) => (countMap.get(id) ?? 0) >= (minTripCount ?? 0));
      }
    }
  }

  if (userIds.length === 0) {
    res.json({ sent: 0, message: "No users matched the filters" });
    return;
  }

  const notifications = userIds.map((uid) => ({ userId: uid, title, titleAr, body, bodyAr }));
  const inserted = await db.insert(notificationsTable).values(notifications).returning();

  const io = getIO();
  if (io) {
    for (const notif of inserted) {
      io.to(`passenger:${notif.userId}`).emit(SOCKET_EVENTS.NOTIFICATION_NEW, {
        id: String(notif.id),
        category: "general",
        title: notif.title,
        body: notif.body,
        time: notif.createdAt instanceof Date ? notif.createdAt.toISOString() : String(notif.createdAt),
      });
    }
  }

  res.json({ sent: userIds.length });
});

router.patch("/notifications/read-all", authenticate, async (req, res): Promise<void> => {
  await db.update(notificationsTable)
    .set({ isRead: true })
    .where(eq(notificationsTable.userId, req.user!.id));
  res.json({ ok: true });
});

router.patch("/notifications/:id/read", authenticate, async (req, res): Promise<void> => {
  const params = MarkNotificationReadParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [updated] = await db.update(notificationsTable).set({ isRead: true })
    .where(eq(notificationsTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Notification not found" }); return; }
  res.json(updated);
});

export default router;
