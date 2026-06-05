import { Router } from "express";
import { db, rideShareTokensTable, ridesTable, driversTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";

const router = Router();

/** Haversine distance in km between two lat/lng points. */
function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R    = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const LOCATION_STALE_MS = 10 * 60 * 1000; // 10 minutes

/**
 * GET /track/:token
 * Public endpoint — no auth required.
 *
 * Looks up the ride associated with the share token and returns:
 *  - Ride status, pickup and dropoff details
 *  - Driver's current location (if assigned and location is fresh)
 *  - Estimated minutes to dropoff (straight-line at 30 km/h)
 *
 * Returns 404 if the token is missing or expired.
 * Designed for polling (every few seconds) from a lightweight tracking page.
 */
router.get("/track/:token", async (req, res): Promise<void> => {
  try {
    const { token } = req.params;
    if (!token || typeof token !== "string") {
      res.status(400).json({ error: "Invalid token" });
      return;
    }

    const now = new Date();

    // Look up the token — reject if expired.
    const [shareRow] = await db
      .select({ rideId: rideShareTokensTable.rideId, expiresAt: rideShareTokensTable.expiresAt })
      .from(rideShareTokensTable)
      .where(
        and(
          eq(rideShareTokensTable.token, token),
          gt(rideShareTokensTable.expiresAt, now),
        ),
      )
      .limit(1);

    if (!shareRow) {
      res.status(404).json({ error: "Invalid or expired tracking link" });
      return;
    }

    // Fetch ride details.
    const [ride] = await db
      .select({
        id:               ridesTable.id,
        status:           ridesTable.status,
        pickupAddress:    ridesTable.pickupAddress,
        pickupLatitude:   ridesTable.pickupLatitude,
        pickupLongitude:  ridesTable.pickupLongitude,
        dropoffAddress:   ridesTable.dropoffAddress,
        dropoffLatitude:  ridesTable.dropoffLatitude,
        dropoffLongitude: ridesTable.dropoffLongitude,
        driverId:         ridesTable.driverId,
      })
      .from(ridesTable)
      .where(eq(ridesTable.id, shareRow.rideId));

    if (!ride) {
      res.status(404).json({ error: "Ride not found" });
      return;
    }

    // Fetch driver location if assigned.
    let driver: {
      name: string;
      vehicleType: string | null;
      latitude: number | null;
      longitude: number | null;
      locationFresh: boolean;
    } | null = null;

    if (ride.driverId !== null) {
      const [d] = await db
        .select({
          name:              driversTable.name,
          vehicleType:       driversTable.vehicleType,
          currentLatitude:   driversTable.currentLatitude,
          currentLongitude:  driversTable.currentLongitude,
          locationUpdatedAt: driversTable.locationUpdatedAt,
        })
        .from(driversTable)
        .where(eq(driversTable.id, ride.driverId));

      if (d) {
        const fresh =
          d.locationUpdatedAt !== null &&
          now.getTime() - new Date(d.locationUpdatedAt).getTime() < LOCATION_STALE_MS;

        driver = {
          name:          d.name,
          vehicleType:   d.vehicleType ?? null,
          latitude:      fresh ? (d.currentLatitude ?? null)  : null,
          longitude:     fresh ? (d.currentLongitude ?? null) : null,
          locationFresh: fresh,
        };
      }
    }

    // ETA: haversine driver→dropoff at average 30 km/h.
    let etaMinutes: number | null = null;
    if (
      driver?.latitude !== null &&
      driver?.longitude !== null &&
      driver.latitude !== undefined &&
      driver.longitude !== undefined &&
      ["driver_arrived", "in_progress"].includes(ride.status)
    ) {
      const distKm = haversineKm(
        driver.latitude,  driver.longitude,
        ride.dropoffLatitude, ride.dropoffLongitude,
      );
      etaMinutes = Math.round((distKm / 30) * 60);
    }

    res.json({
      rideId:    ride.id,
      status:    ride.status,
      pickup:    { address: ride.pickupAddress,  latitude: ride.pickupLatitude,  longitude: ride.pickupLongitude  },
      dropoff:   { address: ride.dropoffAddress, latitude: ride.dropoffLatitude, longitude: ride.dropoffLongitude },
      driver,
      etaMinutes,
      expiresAt: shareRow.expiresAt,
    });
  } catch {
    res.status(500).json({ error: "Failed to fetch ride tracking data" });
  }
});

export default router;
