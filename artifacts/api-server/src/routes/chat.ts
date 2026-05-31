import { Router } from "express";
import { db, chatMessagesTable, tripsTable, usersTable, driversTable } from "@workspace/db";
import { eq, desc, and, sql, isNotNull } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { z } from "zod";
import { getIO } from "../socket";
import { SOCKET_EVENTS, SOCKET_ROOMS } from "../lib/socket-events";

const router = Router();

// ─── Schema helpers ───────────────────────────────────────────────────────────

const SendMessageBody = z.object({
  message: z.string().min(1).max(2000),
});

// ─── TRIP CHAT ────────────────────────────────────────────────────────────────

// POST /trips/:id/chat — passenger or driver sends a chat message in a trip
router.post("/trips/:id/chat", authenticate, async (req, res): Promise<void> => {
  const tripId = parseInt(req.params.id as string);
  if (isNaN(tripId)) { res.status(400).json({ error: "Invalid trip ID" }); return; }

  const parsed = SendMessageBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0]?.message }); return; }

  const role = req.user!.role;
  const userId = req.user!.id;

  // Determine sender type
  let senderType: "passenger" | "driver" | "admin" = "passenger";
  if (role === "driver") senderType = "driver";
  else if (role === "admin") senderType = "admin";

  // Verify trip exists
  const [trip] = await db.select({ id: tripsTable.id }).from(tripsTable).where(eq(tripsTable.id, tripId));
  if (!trip) { res.status(404).json({ error: "Trip not found" }); return; }

  const [message] = await db.insert(chatMessagesTable).values({
    tripId,
    senderId: userId,
    senderType,
    message: parsed.data.message,
    isRead: false,
  }).returning();

  // Emit to trip room and admin room
  const io = getIO();
  if (io) {
    const payload = { ...message, tripId };
    io.to(SOCKET_ROOMS.TRIP(tripId)).emit(SOCKET_EVENTS.TRIP_CHAT_MESSAGE, payload);
    io.to(SOCKET_ROOMS.ADMIN).emit(SOCKET_EVENTS.ADMIN_NEW_CHAT_MESSAGE, payload);
  }

  res.status(201).json(message);
});

// GET /trips/:id/chat — get trip chat history
router.get("/trips/:id/chat", authenticate, async (req, res): Promise<void> => {
  const tripId = parseInt(req.params.id as string);
  if (isNaN(tripId)) { res.status(400).json({ error: "Invalid trip ID" }); return; }

  const rows = await db
    .select()
    .from(chatMessagesTable)
    .where(and(eq(chatMessagesTable.tripId, tripId), isNotNull(chatMessagesTable.tripId)))
    .orderBy(chatMessagesTable.createdAt);

  res.json({ data: rows, total: rows.length });
});

// ─── ADMIN: CHAT INBOX ────────────────────────────────────────────────────────

// GET /admin/chat/stats — unread counts summary
router.get("/admin/chat/stats", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const [total, unread, tripConvs] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(chatMessagesTable),
    db.select({ count: sql<number>`count(*)::int` })
      .from(chatMessagesTable)
      .where(eq(chatMessagesTable.isRead, false)),
    db.select({ count: sql<number>`count(distinct trip_id)::int` })
      .from(chatMessagesTable)
      .where(isNotNull(chatMessagesTable.tripId)),
  ]);

  res.json({
    totalMessages: total[0].count,
    unreadMessages: unread[0].count,
    tripConversations: tripConvs[0].count,
  });
});

// GET /admin/chat — list all trip conversations (grouped by trip), newest message first
router.get("/admin/chat", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const page = Math.max(1, parseInt((req.query.page as string) ?? "1") || 1);
  const limit = Math.min(50, Math.max(1, parseInt((req.query.limit as string) ?? "20") || 20));
  const offset = (page - 1) * limit;

  // Each row = one trip conversation with last message info + unread count
  const conversations = await db.execute(sql`
    SELECT
      t.id                         AS trip_id,
      t.status                     AS trip_status,
      t.origin                     AS trip_origin,
      t.destination                AS trip_destination,
      t.departure_time             AS trip_departure_time,
      u.name                       AS user_name,
      u.email                      AS user_email,
      d.name                       AS driver_name,
      d.phone                      AS driver_phone,
      last_msg.message             AS last_message,
      last_msg.sender_type         AS last_sender_type,
      last_msg.created_at          AS last_message_at,
      COUNT(cm.id) FILTER (WHERE cm.is_read = false)::int  AS unread_count,
      COUNT(cm.id)::int            AS total_messages
    FROM chat_messages cm
    JOIN trips t ON t.id = cm.trip_id
    LEFT JOIN users u ON u.id = t.passenger_id
    LEFT JOIN drivers d ON d.id = t.driver_id
    JOIN LATERAL (
      SELECT message, sender_type, created_at
      FROM chat_messages
      WHERE trip_id = cm.trip_id
      ORDER BY created_at DESC
      LIMIT 1
    ) last_msg ON true
    WHERE cm.trip_id IS NOT NULL
    GROUP BY t.id, t.status, t.origin, t.destination, t.departure_time,
             u.name, u.email, d.name, d.phone,
             last_msg.message, last_msg.sender_type, last_msg.created_at
    ORDER BY last_msg.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `);

  const countResult = await db.execute(sql`
    SELECT COUNT(DISTINCT trip_id)::int AS count
    FROM chat_messages
    WHERE trip_id IS NOT NULL
  `);

  res.json({
    data: conversations.rows,
    total: (countResult.rows[0] as any).count as number,
    page,
    limit,
  });
});

// GET /admin/chat/trip/:id — get all messages for a specific trip
router.get("/admin/chat/trip/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const tripId = parseInt(req.params.id as string);
  if (isNaN(tripId)) { res.status(400).json({ error: "Invalid trip ID" }); return; }

  const [trip] = await db.select({ id: tripsTable.id, status: tripsTable.status })
    .from(tripsTable).where(eq(tripsTable.id, tripId));
  if (!trip) { res.status(404).json({ error: "Trip not found" }); return; }

  const messages = await db
    .select()
    .from(chatMessagesTable)
    .where(eq(chatMessagesTable.tripId, tripId))
    .orderBy(chatMessagesTable.createdAt);

  // Mark all as read
  void db.update(chatMessagesTable)
    .set({ isRead: true })
    .where(and(eq(chatMessagesTable.tripId, tripId), eq(chatMessagesTable.isRead, false)));

  res.json({ tripId, tripStatus: trip.status, messages, total: messages.length });
});

// POST /admin/chat/trip/:id — admin sends a message into a trip chat
router.post("/admin/chat/trip/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const tripId = parseInt(req.params.id as string);
  if (isNaN(tripId)) { res.status(400).json({ error: "Invalid trip ID" }); return; }

  const parsed = SendMessageBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0]?.message }); return; }

  const [trip] = await db.select({ id: tripsTable.id }).from(tripsTable).where(eq(tripsTable.id, tripId));
  if (!trip) { res.status(404).json({ error: "Trip not found" }); return; }

  const [message] = await db.insert(chatMessagesTable).values({
    tripId,
    senderId: req.user!.id,
    senderType: "admin",
    message: parsed.data.message,
    isRead: true,
  }).returning();

  const io = getIO();
  if (io) {
    const payload = { ...message, tripId };
    io.to(SOCKET_ROOMS.TRIP(tripId)).emit(SOCKET_EVENTS.TRIP_CHAT_MESSAGE, payload);
  }

  res.status(201).json(message);
});

// PATCH /admin/chat/messages/:id/read — mark a single message as read
router.patch("/admin/chat/messages/:id/read", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid message ID" }); return; }

  const [updated] = await db.update(chatMessagesTable)
    .set({ isRead: true })
    .where(eq(chatMessagesTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Message not found" }); return; }
  res.json(updated);
});

export default router;
