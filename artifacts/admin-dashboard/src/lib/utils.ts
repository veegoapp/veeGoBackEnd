import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const UTC = { timeZone: "UTC" } as const;

export function fmtUtcDate(dt: string | Date): string {
  return new Date(dt).toLocaleDateString([], { ...UTC });
}

export function fmtUtcTime(dt: string | Date): string {
  return new Date(dt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", ...UTC });
}

export function fmtUtcDateTime(dt: string | Date, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(dt).toLocaleString([], { ...UTC, ...opts });
}

export function fmtUtcFull(dt: string | Date): string {
  return new Date(dt).toLocaleString([], { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", ...UTC });
}

export function fmtUtcShort(dt: string | Date): string {
  return new Date(dt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", ...UTC });
}
