import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

export interface DriverLocationEvent {
  driverId: number;
  userId: number;
  latitude: number;
  longitude: number;
  speed?: number;
  heading?: number;
  tripId?: number;
  timestamp: number;
}

export interface TripStatusEvent {
  event: "trip:started" | "trip:completed";
  tripId: number;
  timestamp: number;
}

export type AdminTrackPayload = DriverLocationEvent | TripStatusEvent;

function isLocationEvent(p: AdminTrackPayload): p is DriverLocationEvent {
  return "latitude" in p && "driverId" in p;
}

export function useAdminSocket(token: string | null) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [locationUpdates, setLocationUpdates] = useState<
    Map<number, DriverLocationEvent>
  >(new Map());

  useEffect(() => {
    if (!token) return;

    const socket = io(window.location.origin, {
      path: "/api/socket.io",
      auth: { token },
      transports: ["websocket", "polling"],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
    });

    socket.on("disconnect", () => {
      setConnected(false);
    });

    socket.on("connect_error", () => {
      setConnected(false);
    });

    socket.on("admin:track:trip", (payload: AdminTrackPayload) => {
      if (!isLocationEvent(payload)) return;
      setLocationUpdates((prev) => {
        const next = new Map(prev);
        next.set(payload.driverId, payload);
        return next;
      });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [token]);

  return { connected, locationUpdates, socketRef };
}
