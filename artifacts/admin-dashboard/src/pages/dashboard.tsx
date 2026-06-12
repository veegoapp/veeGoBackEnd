import React from "react";
import { useQuery } from "@tanstack/react-query";
import { adminFetch } from "@/lib/api";
import { useLocation, Link } from "wouter";
import {
  AreaChart, Area, ResponsiveContainer, Tooltip, XAxis,
} from "recharts";
import {
  Navigation, DollarSign, Users, Wifi, RefreshCw,
  TrendingUp, TrendingDown, Minus, MapPin, Clock,
  Circle, MessageSquare, ArrowRight, Bus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO, isToday, isYesterday } from "date-fns";
import { useTranslation } from "react-i18next";

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

/* ─────────────────────────── Activity Feed ─────────────────────────── */

function ActivitySection({ activity, loading }: { activity?: Activity; loading: boolean }) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  return (
    <div className="grid gap-6 lg:grid-cols-4">
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
                <div className="text-end shrink-0">
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
                <div className="text-end shrink-0">
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

      {/* Upcoming Departures */}
      <Card className="flex flex-col">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-violet-500" /> {t("dashboard.upcomingDepartures")}
            </CardTitle>
            <Button variant="ghost" size="sm" className="text-xs h-7 gap-1" onClick={() => setLocation("/trips")}>
              {t("common.viewAll")} <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex-1 space-y-0 px-4 pb-4">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full mb-2" />)
          ) : (activity?.upcomingDepartures ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">{t("dashboard.noUpcomingDepartures")}</p>
          ) : (
            (activity?.upcomingDepartures ?? []).slice(0, 6).map((dep) => (
              <div key={dep.id} className="flex items-center justify-between py-2 border-b last:border-0 gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{dep.routeName ?? `Trip #${dep.id}`}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {dep.fromLocation} → {dep.toLocation}
                  </p>
                </div>
                <div className="text-end shrink-0">
                  <p className="text-sm font-medium">{format(parseISO(dep.departureTime), "HH:mm")}</p>
                  <Badge
                    variant="outline"
                    className={`text-[10px] capitalize px-1.5 py-0 ${STATUS_COLOR[dep.status] ? `border-transparent text-white ${STATUS_COLOR[dep.status]}` : ""}`}
                  >
                    {dep.status}
                  </Badge>
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
                <div className="text-end shrink-0 space-y-1">
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

      {/* Live Network Shortcut */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4 text-blue-500" />
            {t("dashboard.liveNetworkMap")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-8">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{t("dashboard.driversOnline")}</span>
              {liveLoading ? (
                <Skeleton className="h-9 w-16" />
              ) : (
                <span className="text-3xl font-bold">{onlineDrivers}</span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{t("dashboard.activeTrips")}</span>
              {activityLoading ? (
                <Skeleton className="h-9 w-16" />
              ) : (
                <span className="text-3xl font-bold">{(activity?.activeTrips ?? []).length}</span>
              )}
            </div>
            <div className="ms-auto">
              <Link href="/live-tracking">
                <Button variant="outline" className="gap-2">
                  <Navigation className="h-4 w-4" />
                  {t("nav.live")}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Activity */}
      <ActivitySection activity={activity} loading={activityLoading} />
    </div>
  );
}
