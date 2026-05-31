import { randomUUID } from "crypto";
import type { Request, Response, NextFunction } from "express";

declare global {
  namespace Express {
    interface Request {
      traceId: string;
    }
  }
}

export function generateTraceId(): string {
  return randomUUID();
}

export function traceMiddleware(req: Request, _res: Response, next: NextFunction): void {
  req.traceId = (req.headers["x-trace-id"] as string | undefined) ?? generateTraceId();
  next();
}
