import jwt from "jsonwebtoken";

if (!process.env.SESSION_SECRET) {
  console.warn(
    "[jwt] WARNING: SESSION_SECRET is not set — using insecure default secrets. " +
    "Set SESSION_SECRET in your Replit Secrets for production deployments."
  );
}

const ACCESS_SECRET = process.env.SESSION_SECRET ?? "shuttle-access-secret";
const REFRESH_SECRET = (process.env.SESSION_SECRET ?? "shuttle-refresh-secret") + "-refresh";

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
