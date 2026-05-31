import React, { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminFetch } from "@/lib/api";
import { useLocation } from "wouter";
import {
  AreaChart, Area, ResponsiveContainer, Tooltip, XAxis,
} from "recharts";
import {
  Navigation, DollarSign, Users, Wifi, RefreshCw,
  TrendingUp, TrendingDown, Minus, MapPin, Clock,
  Circle, MessageSquare, ArrowRight, Bus, ListTodo,
  AlertTriangle, BarChart3, CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO, isToday, isYesterday } from "date-fns";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";

/* ─────────────────────────── Types ─────────────────────────── */

interface Summary {
  trips: { total: number; active: number; scheduled: number; boarding: number; upcoming: number; cancelled: number };
  fleet: { totalDrivers: number; onlineDrivers: number; totalBuses: number; activeBuses: number };
  users: { total: number; passengers: number; drivers: number };
  generatedAt: string;
}

interface Analytics {
  revenueByDay: Array<{ date: string; revenue: number; bookings: number }>;
  totalRevenue: number;
  totalUsers: number;
  activeDrivers: number;
  bookingsByStatus: { pending: number; confirmed: number; cancelled: number; completed: number };
  recentBookings: Array<{ id: number; userId: number; tripId: number; totalPrice: number; status: string; createdAt: string }>;
}

interface DashboardAnalytics {
  tripsPerDay: Array<{ date: string; trips: number; completed: number; cancelled: number }>;
  bookingsPerDay: Array<{ date: string; bookings: number; revenue: number }>;
}

interface LiveDriver {
  id: number;
  name: string;
  phone: string;
  status: string;
  isOnline: boolean;
  rating: number;
  currentLatitude: number | null;
  currentLongitude: number | null;
  currentSpeed: number | null;
  activeTrip: { id: number; status: string; departureTime: string; arrivalTime: string } | null;
}

interface Activity {
  recentTickets: Array<{ id: number; subject: string; status: string; priority: string; createdAt: string }>;
  activeTrips: Array<{ id: number; routeName: string | null; fromLocation: string | null; toLocation: string | null; driverName: string | null; status: string; departureTime: string; availableSeats: number; totalSeats: number }>;
  recentBookings: Array<{ id: number; status: string; totalPrice: string; seatCount: number; createdAt: string; userName: string | null; userEmail: string | null }>;
  upcomingDepartures: Array<{ id: number; routeName: string | null; fromLocation: string | null; toLocation: string | null; departureTime: string; status: string }>;
}

interface QueueStatus {
  pendingCount: number;
  deadLetterCount: number;
  failuresByType: Record<string, number>;
  recentDeadLetters: Array<{
    jobId: string;
    type: string;
    attempt: number;
    maxAttempts: number;
    lastError: string;
    failedAt: string;
    createdAt: string;
  }>;
  asOf: string;
}

/* ─────────────────────────── Helpers ─────────────────────────── */

function pct(now: number, prev: number): number | null {
  if (prev === 0) return now > 0 ? 100 : null;
  return Math.round(((now - prev) / prev) * 100);
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtRevenue(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function getDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

function relativeTime(iso: string) {
  try {
    const d = parseISO(iso);
    if (isToday(d)) return `Today ${format(d, "HH:mm")}`;
    if (isYesterday(d)) return `Yesterday ${format(d, "HH:mm")}`;
    return format(d, "MMM d, HH:mm");
  } catch {
    return "—";
  }
}

const STATUS_COLOR: Record<string, string> = {
  active: "bg-green-500",
  boarding: "bg-amber-500",
  online: "bg-emerald-500",
  busy: "bg-amber-500",
  offline: "bg-slate-400",
  open: "bg-red-500",
  pending: "bg-amber-500",
  confirmed: "bg-green-500",
  cancelled: "bg-red-400",
  completed: "bg-slate-400",
};

/* ─────────────────────────── Sparkline ─────────────────────────── */

function Sparkline({
  data,
  dataKey,
  color,
}: {
  data: Array<Record<string, number | string>>;
  dataKey: string;
  color: string;
}) {
  if (!data || data.length === 0) {
    return <div className="h-10 w-full" />;
  }
  return (
    <div className="h-10 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" hide />
          <Tooltip
            contentStyle={{ display: "none" }}
            cursor={false}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#grad-${color.replace("#", "")})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ─────────────────────────── Stat Card ─────────────────────────── */

function StatCard({
  title,
  value,
  prevValue,
  formatted,
  icon: Icon,
  accent,
  sparkData,
  sparkKey,
  sparkColor,
  loading,
  suffix,
}: {
  title: string;
  value: number;
  prevValue?: number;
  formatted?: string;
  icon: React.ElementType;
  accent: string;
  sparkData?: Array<Record<string, number | string>>;
  sparkKey: string;
  sparkColor: string;
  loading?: boolean;
  suffix?: string;
}) {
  const { t } = useTranslation();
  const change = prevValue !== undefined ? pct(value, prevValue) : null;
  const isUp = change !== null && change > 0;
  const isDown = change !== null && change < 0;

  return (
    <Card className="flex flex-col gap-0 overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-5 px-5">
        <span className="text-sm font-medium text-muted-foreground">{title}</span>
        <div className={`p-2 rounded-lg ${accent}`}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-0">
        {loading ? (
          <Skeleton className="h-9 w-28 mb-1" />
        ) : (
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold tracking-tight">
              {formatted ?? fmt(value)}
            </span>
            {suffix && <span className="text-sm text-muted-foreground mb-1">{suffix}</span>}
          </div>
        )}
        {!loading && change !== null && (
          <div className={`flex items-center gap-1 text-xs mt-1 mb-2 ${isUp ? "text-green-600 dark:text-green-400" : isDown ? "text-red-500" : "text-muted-foreground"}`}>
            {isUp ? <TrendingUp className="h-3 w-3" /> : isDown ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
            <span>{isUp ? "+" : ""}{change}% {t("dashboard.vsYesterday")}</span>
          </div>
        )}
        {!loading && change === null && (
          <div className="h-5 mb-2" />
        )}
      </CardContent>
      <div className="px-5 pb-3">
        {loading ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <Sparkline data={sparkData ?? []} dataKey={sparkKey} color={sparkColor} />
        )}
      </div>
    </Card>
  );
}

/* ─────────────────────────── Live Map ─────────────────────────── */

const MAP_BOUNDS = { latMin: 20, latMax: 40, lngMin: 35, lngMax: 60 };

function driverToPos(lat: number | null, lng: number | null): { top: number; left: number } | null {
  if (lat == null || lng == null) return null;
  const top = 100 - ((lat - MAP_BOUNDS.latMin) / (MAP_BOUNDS.latMax - MAP_BOUNDS.latMin)) * 100;
  const left = ((lng - MAP_BOUNDS.lngMin) / (MAP_BOUNDS.lngMax - MAP_BOUNDS.lngMin)) * 100;
  if (top < 0 || top > 100 || left < 0 || left > 100) return null;
  return { top: Math.max(3, Math.min(97, top)), left: Math.max(3, Math.min(97, left)) };
}

function LiveMap({ drivers, loading }: { drivers: LiveDriver[]; loading: boolean }) {
  const { t } = useTranslation();
  const online = drivers.filter((d) => d.isOnline);
  const withGps = online.filter((d) => d.currentLatitude != null && d.currentLongitude != null);
  const withoutGps = online.filter((d) => d.currentLatitude == null || d.currentLongitude == null);

  const placed = useMemo(() => {
    const result: Array<{ driver: LiveDriver; top: number; left: number }> = [];
    const occupied = new Set<string>();

    for (const d of withGps) {
      const pos = driverToPos(d.currentLatitude, d.currentLongitude);
      if (pos) {
        result.push({ driver: d, ...pos });
        occupied.add(`${Math.round(pos.top)}-${Math.round(pos.left)}`);
      }
    }

    let angle = 0;
    for (const d of withoutGps) {
      const top = 50 + 30 * Math.sin((angle * Math.PI) / 180);
      const left = 50 + 30 * Math.cos((angle * Math.PI) / 180);
      result.push({ driver: d, top, left });
      angle += 360 / Math.max(withoutGps.length, 1);
    }

    return result;
  }, [drivers]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4 text-blue-500" />
            {t("dashboard.liveNetworkMap")}
          </CardTitle>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> {t("common.online")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-500" /> {t("trips.enRoute")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-slate-400" /> {t("common.offline")}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="relative w-full bg-slate-950 dark:bg-slate-900" style={{ height: 360 }}>
          {/* Grid lines */}
          <svg className="absolute inset-0 w-full h-full opacity-10" xmlns="http://www.w3.org/2000/svg">
            {Array.from({ length: 11 }).map((_, i) => (
              <React.Fragment key={i}>
                <line x1={`${i * 10}%`} y1="0" x2={`${i * 10}%`} y2="100%" stroke="#64748b" strokeWidth="0.5" />
                <line x1="0" y1={`${i * 10}%`} x2="100%" y2={`${i * 10}%`} stroke="#64748b" strokeWidth="0.5" />
              </React.Fragment>
            ))}
          </svg>

          {/* Road-like lines */}
          <svg className="absolute inset-0 w-full h-full opacity-20" xmlns="http://www.w3.org/2000/svg">
            <path d="M 0,180 Q 200,120 400,180 T 800,160" stroke="#334155" strokeWidth="6" fill="none" />
            <path d="M 0,250 Q 300,200 600,250 T 1200,220" stroke="#334155" strokeWidth="4" fill="none" />
            <path d="M 200,0 Q 250,180 220,360" stroke="#334155" strokeWidth="5" fill="none" />
            <path d="M 550,0 Q 520,180 560,360" stroke="#334155" strokeWidth="4" fill="none" />
          </svg>

          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <RefreshCw className="h-4 w-4 animate-spin" />
                {t("common.loading2")}
              </div>
            </div>
          ) : online.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
              <Bus className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">{t("dashboard.noDriversOnline")}</p>
            </div>
          ) : (
            placed.map(({ driver: d, top, left }) => {
              const dotColor = d.status === "busy" ? "#f59e0b" : d.isOnline ? "#10b981" : "#94a3b8";
              return (
                <div
                  key={d.id}
                  className="absolute group"
                  style={{ top: `${top}%`, left: `${left}%`, transform: "translate(-50%,-50%)" }}
                >
                  <div className="relative cursor-pointer">
                    <span
                      className="flex h-3.5 w-3.5 rounded-full ring-2 ring-slate-900 shadow-lg"
                      style={{ backgroundColor: dotColor }}
                    >
                      {d.isOnline && (
                        <span
                          className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-50"
                          style={{ backgroundColor: dotColor }}
                        />
                      )}
                    </span>
                    <div className="absolute hidden group-hover:block bottom-6 left-1/2 -translate-x-1/2 bg-popover border border-border rounded-md shadow-xl p-2.5 text-xs w-40 z-20 pointer-events-none">
                      <p className="font-semibold text-foreground">{d.name}</p>
                      <p className="text-muted-foreground capitalize mt-0.5">{d.status}</p>
                      {d.currentLatitude != null && (
                        <p className="text-muted-foreground font-mono text-[10px] mt-1">
                          {d.currentLatitude.toFixed(4)}, {d.currentLongitude?.toFixed(4)}
                        </p>
                      )}
                      {d.currentSpeed != null && (
                        <p className="text-muted-foreground mt-0.5">{d.currentSpeed.toFixed(0)} km/h</p>
                      )}
                      {d.activeTrip && (
                        <p className="text-blue-400 mt-0.5">Trip #{d.activeTrip.id}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}

          <div className="absolute bottom-3 left-4 text-xs text-slate-500">
            {online.length} {t("dashboard.driversOnline")}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─────────────────────────── Activity Feed ─────────────────────────── */

function ActivitySection({ activity, loading }: { activity?: Activity; loading: boolean }) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Recent Bookings */}
      <Card className="flex flex-col">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-500" /> {t("bookings.title")}
            </CardTitle>
            <Button variant="ghost" size="sm" className="text-xs h-7 gap-1" onClick={() => setLocation("/bookings")}>
              {t("common.viewAll")} <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex-1 space-y-0 px-4 pb-4">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full mb-2" />)
          ) : (activity?.recentBookings ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">{t("dashboard.noRecentBookings")}</p>
          ) : (
            (activity?.recentBookings ?? []).slice(0, 6).map((b) => (
              <div key={b.id} className="flex items-center justify-between py-2 border-b last:border-0 gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{b.userName ?? b.userEmail ?? `User #${b.id}`}</p>
                  <p className="text-xs text-muted-foreground">{relativeTime(b.createdAt)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold">${parseFloat(b.totalPrice).toFixed(2)}</p>
                  <Badge
                    variant="outline"
                    className={`text-[10px] capitalize px-1.5 py-0 ${STATUS_COLOR[b.status] ? `border-transparent text-white ${STATUS_COLOR[b.status]}` : ""}`}
                  >
                    {b.status}
                  </Badge>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Active Trips */}
      <Card className="flex flex-col">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Circle className="h-4 w-4 fill-green-500 text-green-500" /> {t("dashboard.activeTrips")}
            </CardTitle>
            <Button variant="ghost" size="sm" className="text-xs h-7 gap-1" onClick={() => setLocation("/trips")}>
              {t("common.viewAll")} <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex-1 space-y-0 px-4 pb-4">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full mb-2" />)
          ) : (activity?.activeTrips ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">{t("dashboard.noActiveTripsNow")}</p>
          ) : (
            (activity?.activeTrips ?? []).slice(0, 6).map((trip) => (
              <div key={trip.id} className="flex items-center justify-between py-2 border-b last:border-0 gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{trip.routeName ?? `Trip #${trip.id}`}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {trip.fromLocation} → {trip.toLocation}
                  </p>
                  {trip.driverName && (
                    <p className="text-xs text-muted-foreground">{trip.driverName}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-medium">{format(parseISO(trip.departureTime), "HH:mm")}</p>
                  <p className="text-xs text-muted-foreground">
                    {trip.totalSeats - trip.availableSeats}/{trip.totalSeats} {t("bookings.seats")}
                  </p>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Support Tickets */}
      <Card className="flex flex-col">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-blue-500" /> {t("dashboard.supportTickets")}
            </CardTitle>
            <Button variant="ghost" size="sm" className="text-xs h-7 gap-1" onClick={() => setLocation("/support")}>
              {t("common.viewAll")} <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex-1 space-y-0 px-4 pb-4">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full mb-2" />)
          ) : (activity?.recentTickets ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">{t("dashboard.noRecentTickets")}</p>
          ) : (
            (activity?.recentTickets ?? []).slice(0, 6).map((tk) => (
              <div key={tk.id} className="flex items-center justify-between py-2 border-b last:border-0 gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{tk.subject}</p>
                  <p className="text-xs text-muted-foreground">{relativeTime(tk.createdAt)}</p>
                </div>
                <div className="text-right shrink-0 space-y-1">
                  <Badge
                    variant="outline"
                    className={`text-[10px] capitalize px-1.5 py-0 block ${STATUS_COLOR[tk.status] ? `border-transparent text-white ${STATUS_COLOR[tk.status]}` : ""}`}
                  >
                    {tk.status}
                  </Badge>
                  <p className={`text-[10px] capitalize ${tk.priority === "high" ? "text-red-500" : tk.priority === "medium" ? "text-amber-500" : "text-muted-foreground"}`}>
                    {tk.priority}
                  </p>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ─────────────────────────── Queue Monitor ─────────────────────────── */

function QueueMonitor() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, isFetching, refetch, dataUpdatedAt } = useQuery<QueueStatus>({
    queryKey: ["admin-queue-status"],
    queryFn: () => adminFetch<QueueStatus>("/admin/queue/status"),
    refetchInterval: 30_000,
  });

  const retryMutation = useMutation({
    mutationFn: (jobId: string) =>
      adminFetch<{ success: boolean; jobId: string; pendingCount: number }>(
        `/admin/queue/retry/${encodeURIComponent(jobId)}`,
        { method: "POST" },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-queue-status"] });
    },
  });

  const retryAllMutation = useMutation({
    mutationFn: () =>
      adminFetch<{ success: boolean; retriedCount: number; pendingCount: number }>(
        "/admin/queue/retry-all",
        { method: "POST" },
      ),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-queue-status"] });
      toast({ title: `${res.retriedCount} job${res.retriedCount === 1 ? "" : "s"} re-queued` });
    },
    onError: (err: Error) => toast({ title: "Retry All failed", description: err.message, variant: "destructive" }),
  });

  const hasFailures = (data?.deadLetterCount ?? 0) > 0;
  const hasPending = (data?.pendingCount ?? 0) > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <ListTodo className="h-4 w-4 text-violet-500" />
            Queue Monitor
          </CardTitle>
          <div className="flex items-center gap-2">
            {dataUpdatedAt > 0 && (
              <span className="text-xs text-muted-foreground hidden sm:inline">
                Updated {format(new Date(dataUpdatedAt), "HH:mm:ss")}
              </span>
            )}
            {hasFailures && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 h-7 text-xs border-violet-500/40 text-violet-600 dark:text-violet-400 hover:bg-violet-500/10"
                onClick={() => retryAllMutation.mutate()}
                disabled={retryAllMutation.isPending || retryMutation.isPending}
              >
                <RefreshCw className={`h-3 w-3 ${retryAllMutation.isPending ? "animate-spin" : ""}`} />
                {retryAllMutation.isPending ? "Retrying…" : "Retry All"}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-7 text-xs"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary counters */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border bg-muted/30 p-3 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5 text-amber-500" />
              Pending Jobs
            </div>
            {isLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <span className={`text-2xl font-bold ${hasPending ? "text-amber-500" : "text-foreground"}`}>
                {data?.pendingCount ?? 0}
              </span>
            )}
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
              Dead-Letter Queue
            </div>
            {isLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <span className={`text-2xl font-bold ${hasFailures ? "text-red-500" : "text-foreground"}`}>
                {data?.deadLetterCount ?? 0}
              </span>
            )}
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 flex flex-col gap-1 col-span-2 sm:col-span-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <BarChart3 className="h-3.5 w-3.5 text-blue-500" />
              Job Types Affected
            </div>
            {isLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <span className="text-2xl font-bold">
                {Object.keys(data?.failuresByType ?? {}).length}
              </span>
            )}
          </div>
        </div>

        {/* Per-type failure stats */}
        {!isLoading && Object.keys(data?.failuresByType ?? {}).length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
              <BarChart3 className="h-3 w-3" /> Failures by Job Type
            </p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(data!.failuresByType).map(([type, count]) => (
                <Badge
                  key={type}
                  variant="outline"
                  className="gap-1.5 border-red-500/30 text-red-600 dark:text-red-400 bg-red-500/5"
                >
                  <span className="font-mono text-[10px]">{type}</span>
                  <span className="font-bold">{count}</span>
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Recent dead-letter entries */}
        {!isLoading && (data?.recentDeadLetters ?? []).length > 0 ? (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3 text-red-500" /> Recent Failed Jobs (last 20)
            </p>
            <div className="rounded-md border divide-y max-h-64 overflow-y-auto">
              {data!.recentDeadLetters.map((entry) => {
                const isRetrying = retryMutation.isPending && retryMutation.variables === entry.jobId;
                const didRetry = retryMutation.isSuccess && retryMutation.variables === entry.jobId;
                return (
                  <div key={entry.jobId} className="px-3 py-2.5 text-xs flex flex-col gap-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono shrink-0">
                          {entry.type}
                        </Badge>
                        <span className="text-muted-foreground font-mono text-[10px] truncate">
                          {entry.jobId}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-muted-foreground text-[10px]">
                          {relativeTime(entry.failedAt)}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[10px] gap-1 border-violet-500/40 text-violet-600 dark:text-violet-400 hover:bg-violet-500/10"
                          onClick={() => retryMutation.mutate(entry.jobId)}
                          disabled={isRetrying || retryMutation.isPending}
                        >
                          <RefreshCw className={`h-2.5 w-2.5 ${isRetrying ? "animate-spin" : ""}`} />
                          {isRetrying ? "Retrying…" : didRetry ? "Queued" : "Retry"}
                        </Button>
                      </div>
                    </div>
                    <p className="text-red-500 dark:text-red-400 truncate">
                      {entry.lastError}
                    </p>
                    <p className="text-muted-foreground">
                      Attempt {entry.attempt}/{entry.maxAttempts}
                    </p>
                  </div>
                );
              })}
            </div>
            {retryMutation.isError && (
              <p className="text-xs text-red-500 mt-2">
                Retry failed: {(retryMutation.error as Error).message}
              </p>
            )}
          </div>
        ) : !isLoading && (
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <CheckCircle2 className="h-4 w-4" />
            <span>No failed jobs — queue is healthy</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─────────────────────────── Dashboard ─────────────────────────── */

export default function Dashboard() {
  const today = getDateStr(new Date());
  const yesterday = getDateStr(new Date(Date.now() - 86_400_000));

  const { data: summary, isLoading: summaryLoading, refetch } = useQuery<Summary>({
    queryKey: ["dashboard-summary"],
    queryFn: () => adminFetch<Summary>("/dashboard/summary"),
    refetchInterval: 15_000,
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery<Analytics>({
    queryKey: ["admin-analytics"],
    queryFn: () => adminFetch<Analytics>("/admin/analytics"),
    refetchInterval: 30_000,
  });

  const { data: dashAnalytics, isLoading: dashAnalyticsLoading } = useQuery<DashboardAnalytics>({
    queryKey: ["dashboard-analytics"],
    queryFn: () => adminFetch<DashboardAnalytics>("/dashboard/analytics"),
    refetchInterval: 60_000,
  });

  const { data: liveData, isLoading: liveLoading } = useQuery<{ data: LiveDriver[]; total: number }>({
    queryKey: ["admin-drivers-live"],
    queryFn: () => adminFetch<{ data: LiveDriver[]; total: number }>("/admin/drivers/live"),
    refetchInterval: 10_000,
  });

  const { data: activity, isLoading: activityLoading } = useQuery<Activity>({
    queryKey: ["dashboard-activity"],
    queryFn: () => adminFetch<Activity>("/dashboard/activity"),
    refetchInterval: 15_000,
  });

  const drivers = liveData?.data ?? [];
  const onlineDrivers = drivers.filter((d) => d.isOnline).length;

  const revenueByDay = analytics?.revenueByDay ?? [];
  const last7Revenue = revenueByDay.slice(-7);
  const todayRevenue = revenueByDay.find((r) => r.date === today)?.revenue ?? 0;
  const yesterdayRevenue = revenueByDay.find((r) => r.date === yesterday)?.revenue ?? 0;

  const tripsPerDay = dashAnalytics?.tripsPerDay ?? [];
  const last7Trips = tripsPerDay.slice(-7);
  const todayTrips = tripsPerDay.find((r) => r.date === today)?.trips ?? summary?.trips.total ?? 0;
  const yesterdayTrips = tripsPerDay.find((r) => r.date === yesterday)?.trips ?? 0;

  const passengersOnline = summary?.users.passengers ?? 0;
  const passengersYesterday = 0;

  const driversOnlineYesterday = 0;

  const loading = summaryLoading || analyticsLoading;
  const { t } = useTranslation();

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("nav.dashboard")}</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {t("dashboard.subtitle")} · {format(new Date(), "EEEE, MMMM d yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 bg-green-500/10 border border-green-500/20 px-3 py-1.5 rounded-full">
            <Wifi className="h-3 w-3" />
            <span>{t("nav.live")}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            {t("common.refresh")}
          </Button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={t("dashboard.totalTripsToday")}
          value={todayTrips}
          prevValue={yesterdayTrips}
          icon={Navigation}
          accent="bg-blue-500/10 text-blue-500"
          sparkData={last7Trips}
          sparkKey="trips"
          sparkColor="#3b82f6"
          loading={loading || dashAnalyticsLoading}
        />
        <StatCard
          title={t("dashboard.revenueToday")}
          value={todayRevenue}
          prevValue={yesterdayRevenue}
          formatted={fmtRevenue(todayRevenue)}
          icon={DollarSign}
          accent="bg-green-500/10 text-green-500"
          sparkData={last7Revenue}
          sparkKey="revenue"
          sparkColor="#22c55e"
          loading={loading}
        />
        <StatCard
          title={t("dashboard.driversOnline")}
          value={onlineDrivers}
          prevValue={driversOnlineYesterday}
          icon={Bus}
          accent="bg-amber-500/10 text-amber-500"
          sparkData={last7Trips.map((d) => ({ date: d.date, drivers: onlineDrivers }))}
          sparkKey="drivers"
          sparkColor="#f59e0b"
          loading={liveLoading}
          suffix={`/ ${summary?.fleet.totalDrivers ?? "—"} ${t("common.total")}`}
        />
        <StatCard
          title={t("dashboard.passengersOnline")}
          value={passengersOnline}
          prevValue={passengersYesterday}
          icon={Users}
          accent="bg-violet-500/10 text-violet-500"
          sparkData={last7Revenue.map((d) => ({ date: d.date, passengers: passengersOnline }))}
          sparkKey="passengers"
          sparkColor="#8b5cf6"
          loading={loading}
          suffix={t("common.verified")}
        />
      </div>

      {/* Live Map */}
      <LiveMap drivers={drivers} loading={liveLoading} />

      {/* Queue Monitor */}
      <QueueMonitor />

      {/* Activity */}
      <ActivitySection activity={activity} loading={activityLoading} />
    </div>
  );
}
