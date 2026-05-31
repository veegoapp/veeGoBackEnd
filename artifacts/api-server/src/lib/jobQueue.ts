import { logger } from "./logger";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type JobType = "audit_log" | "driver_location" | "rating" | "payment";

export interface Job<T = unknown> {
  id: string;
  type: JobType;
  payload: T;
  attempt: number;
  maxAttempts: number;
  scheduledAt: number;
  createdAt: number;
}

export interface DeadLetter<T = unknown> {
  job: Job<T>;
  lastError: string;
  failedAt: number;
}

type JobHandler<T = unknown> = (payload: T) => Promise<void>;

// ─── Backoff schedule (ms) ─────────────────────────────────────────────────────
const BACKOFF_MS = [1_000, 5_000, 15_000];

function backoffFor(attempt: number): number {
  return BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)] ?? 15_000;
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Queue implementation ──────────────────────────────────────────────────────

class JobQueue {
  private queue: Job[] = [];
  private deadLetters: DeadLetter[] = [];
  private handlers = new Map<JobType, JobHandler>();
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  register<T>(type: JobType, handler: JobHandler<T>): void {
    this.handlers.set(type, handler as JobHandler);
  }

  enqueue<T>(type: JobType, payload: T, maxAttempts = 3): void {
    const job: Job<T> = {
      id: makeId(),
      type,
      payload,
      attempt: 0,
      maxAttempts,
      scheduledAt: Date.now(),
      createdAt: Date.now(),
    };
    this.queue.push(job as Job);
    this.scheduleRun();
  }

  get deadLetterQueue(): DeadLetter[] {
    return [...this.deadLetters];
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  private scheduleRun(): void {
    if (this.running) return;
    if (this.timer) return;
    this.timer = setImmediate(() => {
      this.timer = null;
      void this.process();
    }) as unknown as ReturnType<typeof setTimeout>;
  }

  private async process(): Promise<void> {
    if (this.running) return;
    this.running = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      const idx = this.queue.findIndex((j) => j.scheduledAt <= now);
      if (idx === -1) {
        const next = this.queue.reduce((min, j) => Math.min(min, j.scheduledAt), Infinity);
        const wait = next - now;
        await new Promise<void>((r) => setTimeout(r, Math.max(wait, 10)));
        continue;
      }

      const [job] = this.queue.splice(idx, 1);
      const handler = this.handlers.get(job!.type);

      if (!handler) {
        logger.warn({ jobId: job!.id, type: job!.type }, "No handler registered for job type");
        continue;
      }

      try {
        await handler(job!.payload);
        logger.debug({ jobId: job!.id, type: job!.type, attempt: job!.attempt + 1 }, "Job completed");
      } catch (err) {
        const attempt = job!.attempt + 1;
        if (attempt < job!.maxAttempts) {
          const delay = backoffFor(attempt);
          logger.warn(
            { jobId: job!.id, type: job!.type, attempt, nextRetryMs: delay, err },
            "Job failed — retrying"
          );
          this.queue.push({ ...job!, attempt, scheduledAt: Date.now() + delay });
        } else {
          logger.error(
            { jobId: job!.id, type: job!.type, attempt, err },
            "Job permanently failed — moved to dead letter queue"
          );
          this.deadLetters.push({
            job: { ...job!, attempt },
            lastError: err instanceof Error ? err.message : String(err),
            failedAt: Date.now(),
          });
          if (this.deadLetters.length > 500) {
            this.deadLetters.shift();
          }
        }
      }
    }

    this.running = false;
  }
}

export const jobQueue = new JobQueue();

// ─── Auto-start: register built-in handlers when imported ──────────────────────
// Handlers are registered lazily in the modules that own the DB writes to avoid
// circular imports. Call registerDefaultHandlers() from index.ts on startup.

let handlersRegistered = false;

export async function registerDefaultHandlers(): Promise<void> {
  if (handlersRegistered) return;
  handlersRegistered = true;

  const [
    { db, auditLogsTable, driverLocationsTable, ratingsTable, paymentsTable },
  ] = await Promise.all([import("@workspace/db")]);

  jobQueue.register("audit_log", async (payload: unknown) => {
    const entry = payload as {
      userId?: number | null;
      action: string;
      entityType: string;
      entityId?: number | null;
      oldData?: Record<string, unknown> | null;
      newData?: Record<string, unknown> | null;
      ipAddress?: string | null;
      userAgent?: string | null;
      traceId?: string | null;
    };
    await db.insert(auditLogsTable).values({
      userId: entry.userId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      oldData: entry.oldData ?? null,
      newData: entry.newData ?? null,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
    });
  });

  jobQueue.register("driver_location", async (payload: unknown) => {
    const p = payload as {
      driverId: number;
      latitude: number;
      longitude: number;
      speed?: number | null;
      heading?: number | null;
    };
    await db.insert(driverLocationsTable).values({
      driverId: p.driverId,
      latitude: p.latitude,
      longitude: p.longitude,
      speed: p.speed ?? null,
      heading: p.heading ?? null,
    });
  });

  jobQueue.register("rating", async (payload: unknown) => {
    const p = payload as {
      raterId: number;
      driverId: number;
      rideId?: number | null;
      tripId?: number | null;
      context: "ride" | "trip";
      score: string;
      comment?: string | null;
    };
    await db.insert(ratingsTable).values({
      raterId: p.raterId,
      driverId: p.driverId,
      rideId: p.rideId ?? null,
      tripId: p.tripId ?? null,
      context: p.context,
      score: p.score,
      comment: p.comment ?? null,
    });
  });

  jobQueue.register("payment", async (payload: unknown) => {
    const p = payload as {
      userId: number;
      bookingId?: number | null;
      rideId?: number | null;
      amount: string;
      method: string;
      status: string;
      transactionRef?: string | null;
      notes?: string | null;
    };
    await db.insert(paymentsTable).values({
      userId: p.userId,
      bookingId: p.bookingId ?? null,
      rideId: p.rideId ?? null,
      amount: p.amount,
      method: p.method as "wallet" | "cash" | "card",
      status: p.status as "pending" | "completed" | "failed" | "refunded",
      transactionRef: p.transactionRef ?? null,
      notes: p.notes ?? null,
    });
  });

  logger.info("Job queue handlers registered");
}
