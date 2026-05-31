import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

/**
 * 🇪🇬 Default center = Cairo, Egypt
 */
const DEFAULT_CENTER: [number, number] = [31.2357, 30.0444];
const DEFAULT_ZOOM = 11;

/**
 * Stable OSM tiles (fallback-safe)
 */
const OSM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://a.tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [
    {
      id: "osm",
      type: "raster",
      source: "osm",
    },
  ],
};

export interface DriverMarker {
  id: number;
  name: string;
  status: string;
  rating: number;
  latitude: number;
  longitude: number;
  speed?: number | null;
  isLive?: boolean;
  activeTripId?: number | null;
  onSelect?: (id: number) => void;
}

interface Props {
  center?: [number, number];
  zoom?: number;
  className?: string;
  drivers?: DriverMarker[];
  selectedDriverId?: number | null;
}

export default function MapLibreMap({
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  className = "",
  drivers = [],
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<number, maplibregl.Marker>>(new Map());

  /**
   * INIT MAP
   */
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center,
      zoom,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("load", () => {
      map.resize(); // fix black screen issue
    });

    mapRef.current = map;

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  /**
   * FORCE RESIZE (fix hidden container issue)
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const t = setTimeout(() => {
      map.resize();
    }, 200);

    return () => clearTimeout(t);
  }, []);

  /**
   * UPDATE DRIVERS
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentIds = new Set(drivers.map((d) => d.id));

    // remove stale markers
    markersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    });

    drivers.forEach((d) => {
      const lngLat: [number, number] = [d.longitude, d.latitude];

      const popup = new maplibregl.Popup({ offset: 20 }).setHTML(`
        <div style="font-family:sans-serif;font-size:13px;line-height:1.4">
          <b>${d.name}</b>
          <div style="color:#666;font-size:11px">${d.status}</div>
          <div style="margin-top:4px">⭐ ${Number(d.rating).toFixed(1)}</div>
          <div style="font-size:10px;color:#aaa;margin-top:3px">
            ${d.latitude.toFixed(4)}, ${d.longitude.toFixed(4)}
          </div>
        </div>
      `);

      const existing = markersRef.current.get(d.id);

      if (existing) {
        existing.setLngLat(lngLat);
        existing.setPopup(popup);
      } else {
        const el = document.createElement("div");
        el.style.width = "12px";
        el.style.height = "12px";
        el.style.borderRadius = "50%";
        el.style.background = d.status === "online" ? "#10b981" : "#94a3b8";
        el.style.border = "2px solid white";
        el.style.cursor = "pointer";

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat(lngLat)
          .setPopup(popup)
          .addTo(map);

        if (d.onSelect) {
          el.addEventListener("click", () => d.onSelect!(d.id));
        }

        markersRef.current.set(d.id, marker);
      }
    });
  }, [drivers]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: "100%", height: "100%" }}
    />
  );
}