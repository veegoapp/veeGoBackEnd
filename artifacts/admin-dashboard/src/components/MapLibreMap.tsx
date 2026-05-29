import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const OSM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

async function fetchOSRMRoute(coords: [number, number][]): Promise<[number, number][] | null> {
  if (coords.length < 2) return null;
  try {
    const c = coords.map(([lng, lat]) => `${lng},${lat}`).join(";");
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${c}?overview=full&geometries=geojson`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.length) return null;
    return data.routes[0].geometry.coordinates as [number, number][];
  } catch {
    return null;
  }
}

export interface DriverMarker {
  id: number;
  name: string;
  phone: string;
  status: string;
  rating: number;
  latitude: number;
  longitude: number;
  speed?: number | null;
  isLive?: boolean;
  activeTripId?: number | null;
  onSelect?: (id: number) => void;
}

export interface TripPoint {
  latitude: number;
  longitude: number;
  label: "pickup" | "dropoff";
}

interface MapLibreMapProps {
  center?: [number, number];
  zoom?: number;
  className?: string;
  drivers?: DriverMarker[];
  tripPoints?: TripPoint[];
  selectedDriverId?: number | null;
}

const STATUS_COLOR: Record<string, string> = {
  online: "#10b981",
  busy: "#f59e0b",
  offline: "#94a3b8",
  suspended: "#ef4444",
};

function makeDriverSvg(color: string, pulse: boolean): string {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
      ${pulse ? `<circle cx="18" cy="18" r="16" fill="${color}" opacity="0.22"/>` : ""}
      <circle cx="18" cy="18" r="12" fill="${color}" stroke="white" stroke-width="2.5"/>
      <path d="M11 16 h14 M14 12.5 l4 3.5 l4-3.5 M12 19.5 c0 2.5 2.5 4.5 6 4.5s6-2 6-4.5"
        stroke="white" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <line x1="18" y1="30" x2="18" y2="42" stroke="${color}" stroke-width="2.2" stroke-linecap="round"/>
    </svg>`;
}

function makePointSvg(color: string, label: string): string {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
      <circle cx="16" cy="16" r="13" fill="${color}" stroke="white" stroke-width="2.5"/>
      <text x="16" y="20.5" text-anchor="middle" fill="white" font-size="11"
        font-family="sans-serif" font-weight="bold">${label}</text>
      <line x1="16" y1="29" x2="16" y2="38" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
    </svg>`;
}

interface MarkerEntry {
  marker: maplibregl.Marker;
  popup: maplibregl.Popup;
}

export default function MapLibreMap({
  center = [31.2357, 30.0444],
  zoom = 10,
  className = "",
  drivers = [],
  tripPoints = [],
  selectedDriverId = null,
}: MapLibreMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const driverMarkersRef = useRef<Map<number, MarkerEntry>>(new Map());
  const tripMarkersRef = useRef<maplibregl.Marker[]>([]);
  const mapLoadedRef = useRef(false);
  const prevTripPointsRef = useRef<TripPoint[]>([]);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center,
      zoom,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(new maplibregl.ScaleControl(), "bottom-left");
    mapRef.current = map;

    map.on("load", () => {
      mapLoadedRef.current = true;
    });

    return () => {
      driverMarkersRef.current.forEach(({ marker }) => marker.remove());
      driverMarkersRef.current.clear();
      tripMarkersRef.current.forEach((m) => m.remove());
      tripMarkersRef.current = [];
      mapLoadedRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Incremental driver marker updates — update position for existing, add new, remove stale
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const applyDriverUpdates = () => {
      const currentIds = new Set(drivers.map((d) => d.id));
      const bounds = new maplibregl.LngLatBounds();
      let hasBounds = false;

      // Remove stale markers
      driverMarkersRef.current.forEach((entry, id) => {
        if (!currentIds.has(id)) {
          entry.marker.remove();
          driverMarkersRef.current.delete(id);
        }
      });

      for (const driver of drivers) {
        const color = STATUS_COLOR[driver.status] ?? STATUS_COLOR.offline;
        const pulse = driver.status === "online" || driver.status === "busy";
        const lngLat: [number, number] = [driver.longitude, driver.latitude];

        const existing = driverMarkersRef.current.get(driver.id);
        if (existing) {
          // Smooth position update — no DOM thrash
          existing.marker.setLngLat(lngLat);
          // Update popup HTML (status may have changed)
          existing.popup.setHTML(makePopupHtml(driver, color));
        } else {
          // Create new marker
          const svg = makeDriverSvg(color, pulse);
          const el = document.createElement("div");
          el.innerHTML = svg;
          el.style.cursor = "pointer";
          el.title = driver.name;

          const popup = new maplibregl.Popup({ offset: 25, closeButton: false, maxWidth: "220px" })
            .setHTML(makePopupHtml(driver, color));

          const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
            .setLngLat(lngLat)
            .setPopup(popup)
            .addTo(map);

          if (driver.onSelect) {
            el.addEventListener("click", () => driver.onSelect!(driver.id));
          }

          driverMarkersRef.current.set(driver.id, { marker, popup });
        }

        bounds.extend(lngLat);
        hasBounds = true;
      }

      // Open popup for selected driver
      if (selectedDriverId !== null) {
        const entry = driverMarkersRef.current.get(selectedDriverId);
        if (entry && !entry.marker.getPopup()?.isOpen()) {
          entry.marker.togglePopup();
        }
      }

      if (hasBounds && drivers.length > 1) {
        map.fitBounds(bounds, { padding: 70, maxZoom: 14, duration: 600 });
      } else if (hasBounds && drivers.length === 1) {
        map.flyTo({ center: [drivers[0].longitude, drivers[0].latitude], zoom: 13 });
      }
    };

    if (mapLoadedRef.current) {
      applyDriverUpdates();
    } else {
      map.once("load", applyDriverUpdates);
    }
  }, [drivers, selectedDriverId]);

  // Trip point markers + OSRM route
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const prev = prevTripPointsRef.current;
    const same =
      prev.length === tripPoints.length &&
      prev.every((p, i) => p.latitude === tripPoints[i]?.latitude && p.longitude === tripPoints[i]?.longitude);
    if (same) return;
    prevTripPointsRef.current = tripPoints;

    const applyTripPoints = async () => {
      // Remove old trip markers
      tripMarkersRef.current.forEach((m) => m.remove());
      tripMarkersRef.current = [];

      // Remove old route
      if (map.getLayer("route-line")) map.removeLayer("route-line");
      if (map.getLayer("route-casing")) map.removeLayer("route-casing");
      if (map.getSource("route")) map.removeSource("route");

      for (const pt of tripPoints) {
        const isPick = pt.label === "pickup";
        const color = isPick ? "#22c55e" : "#ef4444";
        const label = isPick ? "P" : "D";
        const svg = makePointSvg(color, label);

        const el = document.createElement("div");
        el.innerHTML = svg;
        el.title = isPick ? "Pickup" : "Dropoff";

        const popup = new maplibregl.Popup({ offset: 20, closeButton: false })
          .setHTML(`<div style="font-family:sans-serif;font-size:12px;font-weight:600">
            ${isPick ? "📍 Pickup" : "🏁 Dropoff"}
          </div>`);

        const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([pt.longitude, pt.latitude])
          .setPopup(popup)
          .addTo(map);

        tripMarkersRef.current.push(marker);
      }

      if (tripPoints.length >= 2) {
        const straightCoords = tripPoints.map((p) => [p.longitude, p.latitude] as [number, number]);
        const routeCoords = (await fetchOSRMRoute(straightCoords)) ?? straightCoords;

        map.addSource("route", {
          type: "geojson",
          data: {
            type: "Feature",
            geometry: { type: "LineString", coordinates: routeCoords },
            properties: {},
          },
        });
        map.addLayer({
          id: "route-casing",
          type: "line",
          source: "route",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#fff", "line-width": 6, "line-opacity": 0.35 },
        });
        map.addLayer({
          id: "route-line",
          type: "line",
          source: "route",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#6366f1", "line-width": 3.5, "line-opacity": 0.85 },
        });

        const bounds = new maplibregl.LngLatBounds();
        tripPoints.forEach((p) => bounds.extend([p.longitude, p.latitude]));
        map.fitBounds(bounds, { padding: 80, maxZoom: 14, duration: 800 });
      }
    };

    if (mapLoadedRef.current) {
      applyTripPoints();
    } else {
      map.once("load", applyTripPoints);
    }
  }, [tripPoints]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: "100%", height: "100%" }}
    />
  );
}

function makePopupHtml(driver: DriverMarker, color: string): string {
  return `
    <div style="font-family:sans-serif;font-size:13px;line-height:1.5">
      <strong>${driver.name}</strong>
      <span style="margin-left:6px;padding:1px 6px;border-radius:9px;font-size:10px;
        background:${color}22;color:${color};font-weight:600;text-transform:capitalize">
        ${driver.status}
      </span>
      <div style="color:#888;font-size:11px">${driver.phone}</div>
      <div style="font-size:11px;margin-top:2px">⭐ ${Number(driver.rating).toFixed(1)}
        ${driver.speed != null ? ` · 🚗 ${driver.speed.toFixed(0)} km/h` : ""}
        ${driver.isLive ? ` · <span style="color:#10b981">● Live</span>` : ""}
      </div>
      ${driver.activeTripId ? `<div style="font-size:11px;margin-top:3px;color:#6366f1">Trip #${driver.activeTripId}</div>` : ""}
      <div style="font-size:10px;color:#aaa;margin-top:2px">${driver.latitude.toFixed(5)}, ${driver.longitude.toFixed(5)}</div>
    </div>
  `;
}
