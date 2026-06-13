import React, { useEffect, useMemo, useState } from "react";
import MapLibreMap, { type DriverMarker } from "@/components/MapLibreMap";
import { useGetAdminDriversLive } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Radio, Gauge, Navigation, Bus, UserCircle, RefreshCw,
  Star, MapPin, Wifi, WifiOff, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminSocket } from "@/hooks/useAdminSocket";
import type { DriverLocationEvent } from "@/hooks/useAdminSocket";

type LiveDriver = {
  id: number;
  name: string;
  phone: string;
  status: string;
  isOnline: boolean;
  rating: number;
  currentLatitude?: number | null;
  currentLongitude?: number | null;
  currentSpeed?: number | null;
  currentHeading?: number | null;
  assignedBusId?: number | null;
  vehicleType?: string | null;
  updatedAt: string;
  activeTrip?: {
    id: number;
    status: string;
    departureTime: string;
    arrivalTime: string;
  } | null;
};

const SERVICE_OPTIONS = (t: any) => [
  { value: "all", label: t("common.allServices", "All Services") },
  { value: "shuttle", label: t("nav.shuttle", "Shuttle") },
  { value: "car", label: t("nav.cars", "Car") },
  { value: "motorcycle", label: t("nav.motorcycles", "Motorcycle") },
  { value: "delivery", label: t("nav.delivery", "Delivery") },
];

function applyLocationOverlay(
  driver: LiveDriver,
  update: DriverLocationEvent | undefined
): LiveDriver {
  if (!update) return driver;
  return {
    ...driver,
    currentLatitude: update.latitude,
    currentLongitude: update.longitude,
    currentSpeed: update.speed ?? driver.currentSpeed,
    currentHeading: update.heading ?? driver.currentHeading,
    updatedAt: new Date(update.timestamp).toISOString(),
  };
}

const STATUS_COLOR: Record<string, string> = {
  online: "#10b981",
  busy: "#f59e0b",
  offline: "#94a3b8",
  suspended: "#ef4444",
};

const STATUS_BADGE: Record<string, string> = {
  online:    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100",
  busy:      "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100",
  offline:   "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  suspended: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100",
};

export default function LiveTracking() {
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [selectedDriver, setSelectedDriver] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const { t } = useTranslation();
  const { token } = useAuth();

  const { connected, locationUpdates } = useAdminSocket(token);

  const { data, isLoading, refetch } = useGetAdminDriversLive({
    query: {
      queryKey: ["admin-drivers-live"],
      refetchInterval: connected ? 60_000 : 10_000,
    },
  });

  useEffect(() => {
    setLastRefresh(new Date());
  }, [data, locationUpdates]);

  const baseDrivers: LiveDriver[] = (data?.data ?? []) as LiveDriver[];
  const drivers: LiveDriver[] = useMemo(
    () => baseDrivers.map((d) => applyLocationOverlay(d, locationUpdates.get(d.id))),
    [baseDrivers, locationUpdates]
  );

  const filteredDrivers: LiveDriver[] = useMemo(() => {
    return drivers.filter((d) => {
      if (statusFilter !== "all") {
        if (statusFilter === "online"    && d.status !== "online")    return false;
        if (statusFilter === "busy"      && d.status !== "busy")      return false;
        if (statusFilter === "offline"   && d.status !== "offline")   return false;
        if (statusFilter === "suspended" && d.status !== "suspended") return false;
      }
      if (serviceFilter !== "all") {
        const svc = (d.vehicleType ?? "").toLowerCase();
        if (svc !== serviceFilter) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!d.name.toLowerCase().includes(q) && !d.phone.includes(q)) return false;
      }
      return true;
    });
  }, [drivers, searchQuery, statusFilter, serviceFilter]);

  const online    = filteredDrivers.filter((d) => d.status === "online" || d.status === "busy");
  const offline   = filteredDrivers.filter((d) => d.status === "offline" || d.status === "suspended");
  const withGps   = online.filter((d) => d.currentLatitude != null && d.currentLongitude != null);

  const driverMarkers: DriverMarker[] = useMemo(
    () =>
      filteredDrivers
        .filter((d) => d.currentLatitude != null && d.currentLongitude != null)
        .map((d) => ({
          id: d.id,
          name: d.name,
          phone: d.phone,
          status: d.status,
          rating: d.rating,
          latitude: d.currentLatitude!,
          longitude: d.currentLongitude!,
          speed: d.currentSpeed,
          isLive: locationUpdates.has(d.id),
          activeTripId: d.activeTrip?.id ?? null,
          onSelect: setSelectedDriver,
        })),
    [drivers, locationUpdates]
  );

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Radio className="h-7 w-7 text-emerald-500 animate-pulse" />
            {t("liveTracking.title", "Live Tracking")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {connected
              ? t("liveTracking.socketStatus", "Real-time driver positions via Socket.IO")
              : t("liveTracking.pollingStatus", "Polling for driver positions every 10 seconds")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${
              connected
                ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800"
                : "border-slate-200 bg-slate-50 text-slate-500 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-700"
            }`}
          >
            {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {connected ? t("liveTracking.liveStatus", "Live") : t("liveTracking.pollingShort", "Polling")}
          </span>
          <span className="text-xs text-muted-foreground">
            {t("dashboard.lastSynced")}: {lastRefresh.toLocaleTimeString()}
          </span>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 me-1" /> {t("common.refresh")}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: t("liveTracking.statTotalDrivers", "Total Drivers"), value: drivers.length,                                        icon: UserCircle, color: "text-primary"      },
          { label: t("common.online"),        value: drivers.filter((d) => d.status === "online").length,    icon: Radio,      color: "text-emerald-500" },
          { label: t("liveTracking.statOnTrip", "On Trip"),       value: drivers.filter((d) => d.status === "busy").length,      icon: Bus,        color: "text-amber-500"  },
          { label: t("liveTracking.statWithGps", "With GPS"),      value: withGps.length,                                         icon: MapPin,     color: "text-blue-500"   },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-5 flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-muted ${s.color}`}>
                <s.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{isLoading ? "—" : s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Service filter bar */}
      <div className="flex flex-wrap gap-2 items-center bg-card border border-border rounded-xl px-4 py-3">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide me-1">{t("common.type")}</span>
        {SERVICE_OPTIONS(t).map((opt) => (
          <button
            key={opt.value}
            onClick={() => setServiceFilter(opt.value)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors border ${
              serviceFilter === opt.value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Driver search + status filter */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="ps-9"
            placeholder={t("liveTracking.searchPlaceholder", "Search by name or phone…")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder={t("common.allStatuses")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.allStatuses")}</SelectItem>
            <SelectItem value="online">{t("common.online")}</SelectItem>
            <SelectItem value="busy">{t("liveTracking.statOnTrip", "On Trip")}</SelectItem>
            <SelectItem value="offline">{t("common.offline")}</SelectItem>
            <SelectItem value="suspended">{t("common.suspended")}</SelectItem>
          </SelectContent>
        </Select>
        {(searchQuery || statusFilter !== "all" || serviceFilter !== "all") && (
          <Button variant="ghost" size="sm" onClick={() => { setSearchQuery(""); setStatusFilter("all"); setServiceFilter("all"); }}>
            {t("common.clear")}
          </Button>
        )}
        {(searchQuery || statusFilter !== "all" || serviceFilter !== "all") && (
          <span className="text-xs text-muted-foreground ms-auto">
            {t("liveTracking.filteredCount", { count: filteredDrivers.length, total: drivers.length, defaultValue: "{{count}} of {{total}} drivers" })}
          </span>
        )}
      </div>

      {/* MapLibre Fleet Map */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4" /> {t("liveTracking.fleetMap", "Fleet Map")}
            {withGps.length > 0 && (
              <span className="text-xs font-normal text-muted-foreground ms-2">
                {t("liveTracking.gpsCount", { count: withGps.length, defaultValue: "{{count}} driver(s) with GPS signal" })}
              </span>
            )}
            {connected && locationUpdates.size > 0 && (
              <span className="text-xs font-normal text-emerald-600 dark:text-emerald-400 ms-1">
                · {t("liveTracking.liveCount", { count: locationUpdates.size, defaultValue: "{{count}} live" })}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="h-[480px] w-full rounded-b-xl overflow-hidden">
            {isLoading ? (
              <div className="h-full flex items-center justify-center bg-muted">
                <p className="text-muted-foreground text-sm">{t("liveTracking.loadingMap")}</p>
              </div>
            ) : (
              <MapLibreMap
                center={[31.2357, 30.0444]}
                zoom={10}
                drivers={driverMarkers}
                selectedDriverId={selectedDriver}
                className="h-full w-full"
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Online driver cards */}
      {online.length > 0 && (
        <div>
          <h2 className="font-semibold text-lg mb-3">
            {t("liveTracking.activeDrivers", { count: online.length, defaultValue: "Active Drivers ({{count}})" })}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {online.map((d) => {
              const hasLive = locationUpdates.has(d.id);
              return (
                <Card
                  key={d.id}
                  className={`border-s-4 cursor-pointer transition-all hover:shadow-md ${selectedDriver === d.id ? "ring-2 ring-primary" : ""}`}
                  style={{ borderLeftColor: STATUS_COLOR[d.status] ?? "#94a3b8" }}
                  onClick={() => setSelectedDriver(selectedDriver === d.id ? null : d.id)}
                >
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                          <UserCircle className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <Link
                            href={`/drivers/${d.id}`}
                            className="font-semibold text-sm hover:underline text-primary"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {d.name}
                          </Link>
                          <p className="text-xs text-muted-foreground">{d.phone}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {hasLive && <Wifi className="h-3 w-3 text-emerald-500" aria-label="Live via Socket.IO" />}
                        <Badge className={STATUS_BADGE[d.status] ?? ""}>{d.status}</Badge>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        <span className="font-semibold text-foreground">{Number(d.rating).toFixed(1)}</span>
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Gauge className="h-3 w-3" />
                        <span>{d.currentSpeed != null ? t("liveTracking.speedKmH", { speed: d.currentSpeed.toFixed(0), defaultValue: "{{speed}} km/h" }) : "—"}</span>
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground col-span-2">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">
                          {d.currentLatitude != null
                            ? `${d.currentLatitude.toFixed(4)}, ${d.currentLongitude?.toFixed(4)}`
                            : t("liveTracking.noGpsSignal", "No GPS signal")}
                        </span>
                      </div>
                      {d.currentHeading != null && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Navigation className="h-3 w-3" />
                          <span>{d.currentHeading.toFixed(0)}°</span>
                        </div>
                      )}
                      {d.assignedBusId && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Bus className="h-3 w-3" />
                          <span>{t("nav.buses")} #{d.assignedBusId}</span>
                        </div>
                      )}
                    </div>

                    {d.activeTrip && (
                      <div className="rounded-md bg-muted/50 px-3 py-2 text-xs">
                        <Link
                          href={`/trips/${d.activeTrip.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {t("dashboard.activeTrips")} #{d.activeTrip.id}
                        </Link>
                        <p className="text-muted-foreground capitalize">{d.activeTrip.status}</p>
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground">
                      {t("common.updatedAt")} {formatDistanceToNow(new Date(d.updatedAt), { addSuffix: true })}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Offline table */}
      {offline.length > 0 && (
        <div>
          <h2 className="font-semibold text-lg mb-3">
            {t("liveTracking.offlineDrivers", { count: offline.length, defaultValue: "Offline / Suspended ({{count}})" })}
          </h2>
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-start px-4 py-3 font-medium">{t("liveTracking.colDriver")}</th>
                  <th className="text-start px-4 py-3 font-medium">{t("liveTracking.colPhone")}</th>
                  <th className="text-start px-4 py-3 font-medium">{t("liveTracking.colStatus")}</th>
                  <th className="text-start px-4 py-3 font-medium">{t("liveTracking.colLastSeen")}</th>
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? [...Array(3)].map((_, i) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        {[...Array(4)].map((__, j) => (
                          <td key={j} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td>
                        ))}
                      </tr>
                    ))
                  : offline.map((d) => (
                      <tr key={d.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <Link href={`/drivers/${d.id}`} className="flex items-center gap-2 text-primary hover:underline font-medium">
                            <UserCircle className="h-4 w-4 text-muted-foreground" />
                            {d.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{d.phone}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={STATUS_BADGE[d.status] ?? ""}>{d.status}</Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {formatDistanceToNow(new Date(d.updatedAt), { addSuffix: true })}
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!isLoading && drivers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Radio className="h-16 w-16 mb-4 opacity-20" />
          <p className="text-lg font-medium">{t("liveTracking.noDriversFound")}</p>
          <p className="text-sm mt-1">{t("liveTracking.noDriversDesc", "Register drivers first to see them here.")}</p>
        </div>
      )}
    </div>
  );
}
