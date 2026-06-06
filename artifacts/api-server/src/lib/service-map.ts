/**
 * Service type mapping: internal DB values → public API values.
 *
 * Rule: NEVER rename DB-stored values. Only transform outgoing
 * API responses and socket payloads using these helpers.
 *
 * Internal → Public
 *   motorcycle → scooter
 *   car        → car
 *   shuttle    → shuttle
 *   delivery   → delivery
 */

export const INTERNAL_TO_PUBLIC: Record<string, string> = {
  car:        "car",
  shuttle:    "shuttle",
  delivery:   "delivery",
  motorcycle: "scooter",
};

export const PUBLIC_TO_INTERNAL: Record<string, string> = {
  car:      "car",
  shuttle:  "shuttle",
  delivery: "delivery",
  scooter:  "motorcycle",
  motorcycle: "motorcycle",
};

export type InternalServiceType = "car" | "shuttle" | "delivery" | "motorcycle";
export type PublicServiceType   = "car" | "shuttle" | "delivery" | "scooter";

/** Map an internal DB serviceType to the public-facing name. */
export function toPublic(internal: string): string {
  return INTERNAL_TO_PUBLIC[internal] ?? internal;
}

/** Map a public-facing serviceType to the internal DB name. Returns null if unknown. */
export function toInternal(pub: string): InternalServiceType | null {
  const mapped = PUBLIC_TO_INTERNAL[pub];
  return (mapped as InternalServiceType) ?? null;
}

/** All accepted internal service type values (for DB operations). */
export const INTERNAL_SERVICE_TYPES: InternalServiceType[] = [
  "car", "shuttle", "delivery", "motorcycle",
];

/** All accepted public service type values (for API params). */
export const PUBLIC_SERVICE_TYPES: PublicServiceType[] = [
  "car", "shuttle", "delivery", "scooter",
];
