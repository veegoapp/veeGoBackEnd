import { loadSetting } from "./settings";

// ─── Types ────────────────────────────────────────────────────────────────────

/** A single configurable time window (24-h local server time, endHour exclusive). */
export interface PeakWindow { startHour: number; endHour: number; }

const DEFAULT_WINDOWS: PeakWindow[] = [
  { startHour: 7,  endHour: 9  },
  { startHour: 17, endHour: 19 },
];

const PEAK_WINDOWS_KEY = "dispatch_peak_windows";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Pure check — no DB call. Returns true if `now` falls inside any window.
 * `endHour` is exclusive (window 7–9 covers 07:00–08:59).
 */
export function checkPeakHour(windows: PeakWindow[], now = new Date()): boolean {
  const h = now.getHours();
  return windows.some((w) => h >= w.startHour && h < w.endHour);
}

/**
 * Reads `dispatch_peak_windows` from settings and returns whether the current
 * server-local time falls inside a peak window.
 *
 * Falls back to the default windows (07–09, 17–19) if the setting is absent.
 */
export async function isCurrentlyPeakHour(): Promise<boolean> {
  const windows = await loadSetting<PeakWindow[]>(PEAK_WINDOWS_KEY, DEFAULT_WINDOWS);
  return checkPeakHour(windows);
}
