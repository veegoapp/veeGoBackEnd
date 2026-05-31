import { jobQueue } from "./jobQueue";
import { logger } from "./logger";

export interface AuditLogEntry {
  userId?: number | null;
  action: string;
  entityType: string;
  entityId?: number | null;
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  traceId?: string | null;
}

export function writeAuditLog(entry: AuditLogEntry): void {
  try {
    jobQueue.enqueue("audit_log", entry);
  } catch (err) {
    logger.error({ err, entry }, "Failed to enqueue audit log");
  }
}

export function getClientIp(req: { ip?: string; headers: Record<string, string | string[] | undefined> }): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0];
    return first?.trim() ?? null;
  }
  return req.ip ?? null;
}
