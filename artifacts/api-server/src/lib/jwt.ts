import jwt from "jsonwebtoken";

if (!process.env.SESSION_SECRET) {
  console.error("[jwt] FATAL: SESSION_SECRET environment variable is not set. Set it in Replit Secrets.");
  process.exit(1);
}

const ACCESS_SECRET = process.env.SESSION_SECRET;
const REFRESH_SECRET = process.env.SESSION_SECRET + "-refresh";

export interface JwtPayload {
  userId: number;
  role: string;
}

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: "15m" });
}

export function signRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: "30d" });
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, ACCESS_SECRET) as JwtPayload;
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, REFRESH_SECRET) as JwtPayload;
}
