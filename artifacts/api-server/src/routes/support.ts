import { Router } from "express";
import { db, supportTicketsTable, supportMessagesTable, usersTable, driversTable } from "@workspace/db";
import { eq, desc, and, ilike, or, sql } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { z } from "zod";

const router = Router();

const CreateTicketBody = z.object({
  subject: z.string().min(1),
  message: z.string().min(1),
  type: z.enum(["passenger", "driver"]).default("passenger"),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  userId: z.number().int().optional(),
  driverId: z.number().int().optional(),
});

const ListTicketsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["open", "pending", "resolved", "closed"]).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  type: z.enum(["passenger", "driver"]).optional(),
  search: z.string().optional(),
  userId: z.coerce.number().int().positive().optional(),
});

const UpdateTicketBody = z.object({
  status: z.enum(["open", "pending", "resolved", "closed"]).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
});

const ReplyBody = z.object({
  message: z.string().min(1),
  senderType: z.enum(["admin", "passenger", "driver"]).default("admin"),
});

router.get("/support/tickets", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = ListTicketsQuery.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { page, limit, status, priority, type, search, userId } = parsed.data;
  const offset = (page - 1) * limit;
  const conditions: any[] = [];
  if (status) conditions.push(eq(supportTicketsTable.status, status));
  if (priority) conditions.push(eq(supportTicketsTable.priority, priority));
  if (type) conditions.push(eq(supportTicketsTable.type, type));
  if (userId) conditions.push(eq(supportTicketsTable.userId, userId));
  if (search) {
    conditions.push(ilike(supportTicketsTable.subject, `%${search}%`));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [tickets, countResult] = await Promise.all([
    db.select({
      ticket: supportTicketsTable,
      userName: usersTable.name,
      userEmail: usersTable.email,
      driverName: driversTable.name,
    })
      .from(supportTicketsTable)
      .leftJoin(usersTable, eq(supportTicketsTable.userId, usersTable.id))
      .leftJoin(driversTable, eq(supportTicketsTable.driverId, driversTable.id))
      .where(where)
      .orderBy(desc(supportTicketsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(supportTicketsTable).where(where),
  ]);

  const data = tickets.map(({ ticket, userName, userEmail, driverName }) => ({
    ...ticket,
    user: ticket.userId ? { name: userName, email: userEmail } : null,
    driver: ticket.driverId ? { name: driverName } : null,
  }));

  res.json({ data, total: countResult[0].count, page, limit });
});

router.post("/support/tickets", async (req, res): Promise<void> => {
  const parsed = CreateTicketBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [ticket] = await db.insert(supportTicketsTable).values(parsed.data).returning();
  res.status(201).json(ticket);
});

router.get("/support/tickets/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [result] = await db.select({
    ticket: supportTicketsTable,
    userName: usersTable.name,
    userEmail: usersTable.email,
    driverName: driversTable.name,
    driverPhone: driversTable.phone,
  })
    .from(supportTicketsTable)
    .leftJoin(usersTable, eq(supportTicketsTable.userId, usersTable.id))
    .leftJoin(driversTable, eq(supportTicketsTable.driverId, driversTable.id))
    .where(eq(supportTicketsTable.id, id));

  if (!result) { res.status(404).json({ error: "Ticket not found" }); return; }

  const messages = await db.select().from(supportMessagesTable)
    .where(eq(supportMessagesTable.ticketId, id))
    .orderBy(supportMessagesTable.createdAt);

  res.json({
    ...result.ticket,
    user: result.ticket.userId ? { name: result.userName, email: result.userEmail } : null,
    driver: result.ticket.driverId ? { name: result.driverName, phone: result.driverPhone } : null,
    messages,
  });
});

router.patch("/support/tickets/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateTicketBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [updated] = await db.update(supportTicketsTable).set(parsed.data).where(eq(supportTicketsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Ticket not found" }); return; }
  res.json(updated);
});

router.post("/support/tickets/:id/messages", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const ticketId = parseInt(req.params.id as string);
  if (isNaN(ticketId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = ReplyBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [message] = await db.insert(supportMessagesTable).values({
    ticketId,
    senderType: parsed.data.senderType,
    senderId: req.user!.id,
    message: parsed.data.message,
  }).returning();

  await db.update(supportTicketsTable).set({ status: "pending" }).where(
    and(eq(supportTicketsTable.id, ticketId), eq(supportTicketsTable.status, "open"))
  );

  res.status(201).json(message);
});

router.get("/support/stats", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const rows = await db.select({
    status: supportTicketsTable.status,
    count: sql<number>`count(*)::int`,
  }).from(supportTicketsTable).groupBy(supportTicketsTable.status);

  const stats: Record<string, number> = { open: 0, pending: 0, resolved: 0, closed: 0 };
  for (const row of rows) stats[row.status] = row.count;
  res.json(stats);
});

export default router;
