import React, { useState } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { adminFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, Legend,
} from "recharts";
import {
  DollarSign, Navigation, UserCircle, Users, MapPin,
  Layers, Tags, MessageSquare, Star, TrendingUp, Wrench,
  Download, Printer, CheckCircle2, XCircle, AlertCircle, Clock,
} from "lucide-react";

// ─── Shared types ─────────────────────────────────────────────────────────────

type Analytics = {
  totalUsers: number;
  activeTrips: number;
  totalBookings: number;
  totalRevenue: number;
  activeBuses: number;
  activeDrivers: number;
  bookingsByStatus: { pending: number; confirmed: number; cancelled: number; completed: number };
  revenueByDay: { date: string; revenue: number; bookings: number }[];
  recentBookings: { id: number; userId: number; tripId: number; seatCount: number; totalPrice: number; status: string; paymentStatus: string; createdAt: string }[];
};

type RevenueAnalytics = {
  timeSeries: { period: string; revenue: number; bookings: number }[];
  totalRevenue: number;
  totalBookings: number;
  totalDriverPaid: number;
  estimatedCommission: number;
  commissionRate: number;
  driverShareRate: number;
  period: string;
};

type TripsAnalytics = {
  peakHours: { hour: number; bookings: number }[];
  tripTotals: { total: number; completed: number; cancelled: number; active: number; scheduled: number };
  dailyBookings: { date: string; bookings: number; completed: number; cancelled: number }[];
};

type DriverDetailed = {
  byRevenue: { id: number; name: string; rating: number; status: string; total_earnings: number; trip_count: number }[];
  byTrips:   { id: number; name: string; rating: number; status: string; total_earnings: number; trip_count: number }[];
  byRating:  { id: number; name: string; rating: number; status: string; total_earnings: number; trip_count: number }[];
  byCancellations: { id: number; name: string; rating: number; cancellations: number; total_bookings: number }[];
};

type DriverAnalytics = {
  totalDrivers: number;
  onlineDrivers: number;
  busyDrivers: number;
  suspendedDrivers: number;
  totalEarningsPaid: number;
  totalTripsCompleted: number;
  topEarners: { id: number; name: string; rating: number; total_earnings: number; trip_count: number }[];
  recentEarnings: { id: number; driverId: number; tripId: number; amount: number; status: string; date: string }[];
};

type ComplaintsAnalytics = {
  typeBreakdown: { type: string; status: string; count: number }[];
  avgResolutionHours: number | null;
  priorityBreakdown: { priority: string; count: number }[];
  trend: { date: string; opened: number; resolved: number }[];
};

type Ticket = {
  id: number;
  subject: string;
  status: string;
  priority: string;
  type: string;
  createdAt: string;
  user: { name: string; email: string } | null;
  driver: { name: string } | null;
};

type PassengerRow = { id: number; name: string; email: string; phone?: string; wallet_balance?: number; total_bookings: number; total_spent: number; cancellations: number };

type PassengerAnalytics = {
  totalPassengers: number;
  topByTrips: PassengerRow[];
  topBySpending: PassengerRow[];
  topByCancellations: PassengerRow[];
  activityByDay: { date: string; active_passengers: number; bookings: number }[];
};

type ServiceUsageRow = { service_type: string; total_bookings: number; completed: number; cancelled: number; unique_passengers: number };
type ServiceRevenueRow = { service_type: string; total_revenue: number; avg_fare: number; bookings: number };
type ServiceMonthlyRow = { month: string; service_type: string; bookings: number; revenue: number };

type ServiceAnalytics = {
  serviceUsage: ServiceUsageRow[];
  serviceRevenue: ServiceRevenueRow[];
  serviceMonthly: ServiceMonthlyRow[];
};

type PromoRow = { id: number; code: string; discount_type: string; discount_value: number; used_count: number; max_usage: number | null; is_active: boolean; gross_revenue_on_promo_bookings: number; bookings_with_promo: number };

type PromoAnalytics = {
  topPromos: PromoRow[];
  totalPromoBookings: number;
  revenueOnPromoBookings: number;
  monthlyImpact: { month: string; promo_bookings: number; revenue: number }[];
};

type Zone = {
  id: number;
  name: string;
  description: string | null;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  services: string[];
  isActive: boolean;
  createdAt: string;
};

type ZonePricing = {
  id: number;
  zoneId: number;
  zoneName: string;
  vehicleType: string;
  baseFare: number;
  perKmRate: number;
  minimumFare: number;
  isActive: boolean;
};

// ─── Shared helpers ───────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color, loading }: { label: string; value: string | number; icon: React.ElementType; color: string; loading?: boolean }) {
  return (
    <Card>
      <CardContent className="pt-5 flex items-center gap-3">
        <div className={`p-2.5 rounded-lg ${color}`}><Icon className="h-5 w-5" /></div>
        <div>
          {loading ? <Skeleton className="h-7 w-16 mb-1" /> : <p className="text-2xl font-bold">{value}</p>}
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

const STATUS_COLORS: Record<string, string> = {
  completed:  "#22c55e",
  confirmed:  "#3b82f6",
  pending:    "#f59e0b",
  cancelled:  "#ef4444",
  open:       "#f59e0b",
  resolved:   "#22c55e",
  closed:     "#6b7280",
  active:     "#a855f7",
  scheduled:  "#06b6d4",
};

function downloadCSV(rows: Record<string, unknown>[], filename: string) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => JSON.stringify(r[h] ?? "")).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── 1. Revenue Report ────────────────────────────────────────────────────────
function RevenueReport() {
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("daily");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-analytics-revenue", period],
    queryFn: () => adminFetch<RevenueAnalytics>(`/admin/analytics/revenue?period=${period}`),
  });

  const series = data?.timeSeries ?? [];

  const splitData = series.map((d) => ({
    period: d.period,
    revenue: d.revenue,
    commission: +(d.revenue * (data?.commissionRate ?? 15) / 100).toFixed(2),
    driverShare: +(d.revenue * (data?.driverShareRate ?? 85) / 100).toFixed(2),
    bookings: d.bookings,
  }));

  const formatPeriod = (p: string) => {
    if (period === "monthly") return p;
    try { return format(new Date(p), period === "weekly" ? "MMM d" : "MMM d"); } catch { return p; }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-green-500/10"><DollarSign className="h-6 w-6 text-green-600" /></div>
          <div>
            <h1 className="text-2xl font-bold">Revenue Report</h1>
            <p className="text-sm text-muted-foreground">Revenue trends, commission split, and booking volume</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(["daily", "weekly", "monthly"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                period === p ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
          <Button
            variant="outline" size="sm"
            onClick={() => downloadCSV(splitData, `revenue-${period}.csv`)}
            disabled={isLoading || series.length === 0}
          >
            <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5 mr-1.5" /> Print
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Revenue"       value={`$${(data?.totalRevenue ?? 0).toFixed(2)}`}          icon={DollarSign}  color="bg-green-500/10 text-green-600"  loading={isLoading} />
        <StatCard label="Total Bookings"      value={data?.totalBookings ?? 0}                             icon={Navigation}  color="bg-blue-500/10 text-blue-600"    loading={isLoading} />
        <StatCard label="Est. Commission"     value={`$${(data?.estimatedCommission ?? 0).toFixed(2)}`}   icon={TrendingUp}  color="bg-amber-500/10 text-amber-600"   loading={isLoading} />
        <StatCard label="Driver Payouts Paid" value={`$${(data?.totalDriverPaid ?? 0).toFixed(2)}`}       icon={DollarSign}  color="bg-violet-500/10 text-violet-600"  loading={isLoading} />
      </div>

      {/* Commission split summary */}
      {!isLoading && data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { label: `App Commission (${data.commissionRate}%)`, value: data.estimatedCommission, color: "bg-amber-500/10", bar: "bg-amber-500" },
            { label: `Driver Share (${data.driverShareRate}%)`,  value: data.totalRevenue - data.estimatedCommission, color: "bg-green-500/10", bar: "bg-green-500" },
          ].map((s) => (
            <div key={s.label} className={`rounded-xl p-4 ${s.color}`}>
              <p className="text-xl font-bold">${s.value.toFixed(2)}</p>
              <p className="text-sm font-semibold mt-0.5">{s.label}</p>
              <div className="mt-2 h-1.5 rounded-full bg-background/60 overflow-hidden">
                <div
                  className={`h-full rounded-full ${s.bar}`}
                  style={{ width: data.totalRevenue ? `${(s.value / data.totalRevenue) * 100}%` : "0%" }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Revenue vs Commission Split — {period.charAt(0).toUpperCase() + period.slice(1)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-64 w-full" /> : series.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">No revenue data for this period</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={splitData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <defs>
                  <linearGradient id="revG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="comG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="drG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} tickFormatter={formatPeriod} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  formatter={(v: number, n: string) => [`$${v.toFixed(2)}`, n === "revenue" ? "Total Revenue" : n === "commission" ? "Commission" : "Driver Share"]}
                  labelFormatter={formatPeriod}
                />
                <Legend formatter={(v) => v === "revenue" ? "Total Revenue" : v === "commission" ? "Commission" : "Driver Share"} />
                <Area type="monotone" dataKey="revenue"     stroke="#22c55e" fill="url(#revG)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="commission"  stroke="#f59e0b" fill="url(#comG)" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                <Area type="monotone" dataKey="driverShare" stroke="#6366f1" fill="url(#drG)"  strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Booking Volume by {period.charAt(0).toUpperCase() + period.slice(1)}</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-48 w-full" /> : series.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={splitData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} tickFormatter={formatPeriod} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip labelFormatter={formatPeriod} />
                <Bar dataKey="bookings" fill="#3b82f6" radius={[3, 3, 0, 0]} name="Bookings" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── 2. Trips Report ──────────────────────────────────────────────────────────
function TripsReport() {
  const { data: tripsData, isLoading: tripsLoading } = useQuery({
    queryKey: ["admin-analytics-trips"],
    queryFn: () => adminFetch<TripsAnalytics>("/admin/analytics/trips"),
  });

  const { data: bookingData, isLoading: bookingLoading } = useQuery({
    queryKey: ["admin-analytics"],
    queryFn: () => adminFetch<Analytics>("/admin/analytics"),
  });

  const peakHours = tripsData?.peakHours ?? [];
  const totals = tripsData?.tripTotals ?? { total: 0, completed: 0, cancelled: 0, active: 0, scheduled: 0 };
  const daily = tripsData?.dailyBookings ?? [];

  const peakHoursAll = Array.from({ length: 24 }, (_, h) => {
    const found = peakHours.find((p) => p.hour === h);
    return { hour: `${String(h).padStart(2, "0")}:00`, bookings: found?.bookings ?? 0 };
  });

  const bookingsByStatus = bookingData?.bookingsByStatus ?? { pending: 0, confirmed: 0, cancelled: 0, completed: 0 };
  const totalBookings = Object.values(bookingsByStatus).reduce((a, b) => a + b, 0);

  const statusRows = [
    { name: "Completed", value: bookingsByStatus.completed, color: STATUS_COLORS.completed },
    { name: "Confirmed", value: bookingsByStatus.confirmed, color: STATUS_COLORS.confirmed },
    { name: "Pending",   value: bookingsByStatus.pending,   color: STATUS_COLORS.pending },
    { name: "Cancelled", value: bookingsByStatus.cancelled, color: STATUS_COLORS.cancelled },
  ];

  const isLoading = tripsLoading || bookingLoading;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-blue-500/10"><Navigation className="h-6 w-6 text-blue-600" /></div>
          <div>
            <h1 className="text-2xl font-bold">Trips Report</h1>
            <p className="text-sm text-muted-foreground">Trip volume, booking status breakdown, and peak booking hours</p>
          </div>
        </div>
        <Button
          variant="outline" size="sm"
          onClick={() => downloadCSV(peakHoursAll, "trips-peak-hours.csv")}
          disabled={isLoading}
        >
          <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Trips"     value={totals.total}     icon={Navigation}     color="bg-blue-500/10 text-blue-600"    loading={isLoading} />
        <StatCard label="Completed"       value={totals.completed} icon={CheckCircle2}   color="bg-green-500/10 text-green-600"  loading={isLoading} />
        <StatCard label="Active"          value={totals.active}    icon={TrendingUp}     color="bg-violet-500/10 text-violet-600" loading={isLoading} />
        <StatCard label="Cancelled"       value={totals.cancelled} icon={XCircle}        color="bg-red-500/10 text-red-500"      loading={isLoading} />
      </div>

      {/* Peak hours */}
      <Card>
        <CardHeader><CardTitle className="text-base">Peak Booking Hours (last 30 days)</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-48 w-full" /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={peakHoursAll} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="hour" tick={{ fontSize: 9 }} interval={2} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip formatter={(v: number) => [v, "Bookings"]} />
                <Bar dataKey="bookings" radius={[3, 3, 0, 0]}>
                  {peakHoursAll.map((entry) => {
                    const maxB = Math.max(...peakHoursAll.map((e) => e.bookings), 1);
                    const intensity = entry.bookings / maxB;
                    const r = Math.round(59 + (239 - 59) * intensity);
                    const g = Math.round(130 + (68  - 130) * intensity);
                    const b = Math.round(246 + (68  - 246) * intensity);
                    return <Cell key={entry.hour} fill={`rgb(${r},${g},${b})`} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Booking status breakdown */}
      <Card>
        <CardHeader><CardTitle className="text-base">Booking Status Breakdown</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-48 w-full" /> : (
            <div className="space-y-3">
              {statusRows.map((s) => {
                const pct = totalBookings ? Math.round((s.value / totalBookings) * 100) : 0;
                return (
                  <div key={s.name} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{s.name}</span>
                      <span className="text-muted-foreground">{s.value} ({pct}%)</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: s.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Daily volume with completed/cancelled */}
      <Card>
        <CardHeader><CardTitle className="text-base">Daily Bookings — Completed vs Cancelled (last 30 days)</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-48 w-full" /> : daily.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={daily} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => { try { return format(new Date(v), "MMM d"); } catch { return v; } }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip labelFormatter={(l) => { try { return format(new Date(l), "MMM d, yyyy"); } catch { return l; } }} />
                <Legend />
                <Line type="monotone" dataKey="bookings"  stroke="#3b82f6" strokeWidth={2} dot={false} name="Total" />
                <Line type="monotone" dataKey="completed" stroke="#22c55e" strokeWidth={1.5} dot={false} name="Completed" strokeDasharray="4 2" />
                <Line type="monotone" dataKey="cancelled" stroke="#ef4444" strokeWidth={1.5} dot={false} name="Cancelled" strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── 3. Drivers Report ────────────────────────────────────────────────────────
function DriversReport() {
  const [tab, setTab] = useState<"revenue" | "trips" | "rating" | "cancellations">("revenue");

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["admin-driver-analytics"],
    queryFn: () => adminFetch<DriverAnalytics>("/admin/driver-analytics"),
  });

  const { data: detailed, isLoading: detailedLoading } = useQuery({
    queryKey: ["admin-analytics-drivers-detailed"],
    queryFn: () => adminFetch<DriverDetailed>("/admin/analytics/drivers/detailed"),
  });

  const isLoading = summaryLoading || detailedLoading;

  const TABS = [
    { key: "revenue",       label: "By Revenue" },
    { key: "trips",         label: "By Trips" },
    { key: "rating",        label: "By Rating" },
    { key: "cancellations", label: "Most Cancellations" },
  ] as const;

  type Driver = { id: number; name: string; rating: number; total_earnings?: number; trip_count?: number; status?: string; cancellations?: number; total_bookings?: number };

  const tabData: Driver[] = tab === "revenue"
    ? (detailed?.byRevenue ?? [])
    : tab === "trips"
    ? (detailed?.byTrips ?? [])
    : tab === "rating"
    ? (detailed?.byRating ?? [])
    : (detailed?.byCancellations ?? []);

  const chartData = tabData.slice(0, 8).map((d) => ({
    name: d.name.split(" ")[0],
    value: tab === "revenue"
      ? +(d.total_earnings ?? 0).toFixed(2)
      : tab === "trips"
      ? (d.trip_count ?? 0)
      : tab === "rating"
      ? +(d.rating ?? 0).toFixed(2)
      : (d.cancellations ?? 0),
  }));

  const metricLabel = tab === "revenue" ? "Revenue ($)" : tab === "trips" ? "Trips" : tab === "rating" ? "Rating" : "Cancellations";
  const barColor   = tab === "revenue" ? "#22c55e" : tab === "trips" ? "#3b82f6" : tab === "rating" ? "#f59e0b" : "#ef4444";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-amber-500/10"><UserCircle className="h-6 w-6 text-amber-600" /></div>
          <div>
            <h1 className="text-2xl font-bold">Drivers Report</h1>
            <p className="text-sm text-muted-foreground">Driver rankings by revenue, trips completed, rating, and cancellations</p>
          </div>
        </div>
        <Button
          variant="outline" size="sm"
          onClick={() => downloadCSV(tabData as Record<string, unknown>[], `drivers-${tab}.csv`)}
          disabled={isLoading}
        >
          <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Drivers"   value={summary?.totalDrivers ?? 0}                              icon={UserCircle}  color="bg-primary/10 text-primary"       loading={isLoading} />
        <StatCard label="Online Now"      value={summary?.onlineDrivers ?? 0}                             icon={UserCircle}  color="bg-green-500/10 text-green-600"   loading={isLoading} />
        <StatCard label="Trips Completed" value={summary?.totalTripsCompleted ?? 0}                        icon={Navigation}  color="bg-blue-500/10 text-blue-600"     loading={isLoading} />
        <StatCard label="Total Paid Out"  value={`$${(summary?.totalEarningsPaid ?? 0).toFixed(2)}`}      icon={DollarSign}  color="bg-amber-500/10 text-amber-600"   loading={isLoading} />
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1.5 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`text-xs px-3.5 py-1.5 rounded-full border transition-colors ${
              tab === t.key
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <Card>
        <CardHeader><CardTitle className="text-base">Top Drivers — {metricLabel}</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-48 w-full" /> : chartData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No data available</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => tab === "revenue" ? `$${v}` : `${v}`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={60} />
                <Tooltip formatter={(v: number) => [tab === "revenue" ? `$${v.toFixed(2)}` : v, metricLabel]} />
                <Bar dataKey="value" fill={barColor} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader><CardTitle className="text-base">Ranked List</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : tabData.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">No data available</div>
          ) : (
            <div className="divide-y divide-border">
              {tabData.map((d, i) => (
                <div key={d.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-6 text-sm font-bold text-muted-foreground">#{i + 1}</span>
                  <div className="h-8 w-8 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-amber-600">{d.name.charAt(0)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{d.name}</p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                      {(d.rating ?? 0).toFixed(1)}
                      {d.status && <span className="ml-1 capitalize">· {d.status}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0 space-y-0.5">
                    {tab === "cancellations" ? (
                      <>
                        <p className="text-sm font-bold text-red-500">{d.cancellations ?? 0} cancelled</p>
                        <p className="text-xs text-muted-foreground">{d.total_bookings ?? 0} total bookings</p>
                      </>
                    ) : tab === "rating" ? (
                      <>
                        <p className="text-sm font-bold text-amber-500">{(d.rating ?? 0).toFixed(2)} ⭐</p>
                        <p className="text-xs text-muted-foreground">{d.trip_count ?? 0} trips · ${(d.total_earnings ?? 0).toFixed(2)}</p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-bold text-green-600">${(d.total_earnings ?? 0).toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">{d.trip_count ?? 0} trips</p>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── 4. Passengers Report ─────────────────────────────────────────────────────
const PASSENGER_TABS = ["By Trips", "By Spending", "Most Cancellations"] as const;
type PassengerTab = typeof PASSENGER_TABS[number];

function PassengersReport() {
  const [tab, setTab] = useState<PassengerTab>("By Trips");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-analytics-passengers"],
    queryFn: () => adminFetch<PassengerAnalytics>("/admin/analytics/passengers"),
  });

  const rows: PassengerRow[] =
    tab === "By Trips" ? (data?.topByTrips ?? []) :
    tab === "By Spending" ? (data?.topBySpending ?? []) :
    (data?.topByCancellations ?? []);

  const chartData = rows.slice(0, 8).map((r) => ({
    name: r.name.split(" ")[0],
    value: tab === "By Trips" ? r.total_bookings : tab === "By Spending" ? r.total_spent : r.cancellations,
  }));

  const avgBookings = data?.totalPassengers && (data.topByTrips[0]?.total_bookings ?? 0) > 0
    ? (data.topByTrips.reduce((s, r) => s + r.total_bookings, 0) / data.totalPassengers).toFixed(1)
    : "0.0";

  const valueLabel = tab === "By Trips" ? "Bookings" : tab === "By Spending" ? "Spent (EGP)" : "Cancellations";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-violet-500/10"><Users className="h-6 w-6 text-violet-600" /></div>
          <div>
            <h1 className="text-2xl font-bold">Passengers Report</h1>
            <p className="text-sm text-muted-foreground">Top passengers by usage, spending, and cancellations</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => downloadCSV(rows as unknown as Record<string, unknown>[], "passengers.csv")}>
          <Download className="h-3.5 w-3.5 mr-1.5" /> CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Passengers" value={data?.totalPassengers ?? 0} icon={Users}      color="bg-violet-500/10 text-violet-600" loading={isLoading} />
        <StatCard label="Avg Bookings/User" value={avgBookings}              icon={TrendingUp}  color="bg-blue-500/10 text-blue-600"     loading={isLoading} />
        <StatCard label="Top Spender (EGP)" value={data?.topBySpending[0]?.total_spent.toFixed(0) ?? "0"} icon={DollarSign} color="bg-green-500/10 text-green-600" loading={isLoading} />
        <StatCard label="Most Cancellations" value={data?.topByCancellations[0]?.cancellations ?? 0} icon={XCircle} color="bg-red-500/10 text-red-600" loading={isLoading} />
      </div>

      {/* Activity chart */}
      {(data?.activityByDay ?? []).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Daily Active Passengers (Last 30 days)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={data!.activityByDay} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="active_passengers" stroke="#8b5cf6" fill="#8b5cf620" strokeWidth={2} name="Active Passengers" />
                <Area type="monotone" dataKey="bookings" stroke="#3b82f6" fill="#3b82f620" strokeWidth={2} name="Bookings" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Tab switcher */}
      <div className="flex gap-1 border-b border-border">
        {PASSENGER_TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Chart + table */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Top 8 — {valueLabel}</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-48 w-full" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={60} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#8b5cf6" radius={[0, 3, 3, 0]} name={valueLabel} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Ranked List</CardTitle></CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : rows.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">No data yet</div>
            ) : (
              <div className="divide-y divide-border">
                {rows.map((r, i) => (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="text-xs font-bold text-muted-foreground w-5 shrink-0">#{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{r.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{r.email}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold">
                        {tab === "By Spending" ? `${r.total_spent.toFixed(0)} EGP` :
                         tab === "By Trips" ? `${r.total_bookings} trips` :
                         `${r.cancellations} cancelled`}
                      </p>
                      <p className="text-xs text-muted-foreground">{r.total_bookings} total · {r.total_spent.toFixed(0)} EGP</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── 5. Zones Report ──────────────────────────────────────────────────────────
const SERVICE_COLORS: Record<string, string> = {
  car:     "#3b82f6",
  shuttle: "#f59e0b",
  bike:    "#22c55e",
};

function ZonesReport() {
  const { data: zonesData, isLoading: zonesLoading } = useQuery({
    queryKey: ["zones-report"],
    queryFn: () => adminFetch<{ data: Zone[]; total: number }>("/zones?limit=200"),
  });

  const { data: pricingData, isLoading: pricingLoading } = useQuery({
    queryKey: ["zone-pricing-report"],
    queryFn: () => adminFetch<{ data: ZonePricing[] }>("/admin/zone-pricing"),
  });

  const zones = zonesData?.data ?? [];
  const pricing = pricingData?.data ?? [];

  const totalZones = zones.length;
  const activeZones = zones.filter((z) => z.isActive).length;
  const totalPriceEntries = pricing.length;

  const serviceBreakdown = ["car", "shuttle", "bike"].map((svc) => ({
    name: svc.charAt(0).toUpperCase() + svc.slice(1),
    value: zones.filter((z) => z.services.includes(svc)).length,
    color: SERVICE_COLORS[svc],
  }));

  const radiusData = zones
    .slice()
    .sort((a, b) => b.radiusKm - a.radiusKm)
    .slice(0, 10)
    .map((z) => ({ name: z.name, radius: parseFloat(z.radiusKm.toFixed(1)) }));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-xl bg-rose-500/10"><MapPin className="h-6 w-6 text-rose-500" /></div>
        <div><h1 className="text-2xl font-bold">Zones Report</h1><p className="text-sm text-muted-foreground">Service zones, coverage, and zone-level pricing overview</p></div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Zones"        value={totalZones}       icon={MapPin}      color="bg-rose-500/10 text-rose-500"      loading={zonesLoading} />
        <StatCard label="Active Zones"       value={activeZones}      icon={MapPin}      color="bg-green-500/10 text-green-600"    loading={zonesLoading} />
        <StatCard label="Inactive Zones"     value={totalZones - activeZones} icon={MapPin} color="bg-muted text-muted-foreground" loading={zonesLoading} />
        <StatCard label="Price Entries"      value={totalPriceEntries} icon={Layers}     color="bg-blue-500/10 text-blue-600"      loading={pricingLoading} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {serviceBreakdown.map((svc) => (
          <Card key={svc.name}>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{svc.name} Zones</p>
                <span className="text-2xl font-bold">{svc.value}</span>
              </div>
              <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: totalZones ? `${Math.round((svc.value / totalZones) * 100)}%` : "0%", backgroundColor: svc.color }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {totalZones ? Math.round((svc.value / totalZones) * 100) : 0}% of zones
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {radiusData.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Top Zones by Coverage Radius (km)</CardTitle></CardHeader>
          <CardContent>
            {zonesLoading ? <Skeleton className="h-48 w-full" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={radiusData} margin={{ top: 5, right: 10, bottom: 30, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v} km`} />
                  <Tooltip formatter={(v: number) => [`${v} km`, "Radius"]} />
                  <Bar dataKey="radius" fill="#f43f5e" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">All Zones</CardTitle></CardHeader>
        <CardContent className="p-0">
          {zonesLoading ? (
            <div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : zones.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">No zones configured yet</div>
          ) : (
            <div className="divide-y divide-border">
              {zones.map((zone) => {
                const zonePrices = pricing.filter((p) => p.zoneId === zone.id);
                return (
                  <div key={zone.id} className="flex items-start gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{zone.name}</p>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${zone.isActive ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400" : "bg-muted text-muted-foreground"}`}>
                          {zone.isActive ? "Active" : "Inactive"}
                        </span>
                        {zone.services.map((svc) => (
                          <span key={svc} className="text-xs px-1.5 py-0.5 rounded-full bg-muted font-mono">{svc}</span>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {zone.radiusKm} km radius · {zone.centerLat.toFixed(4)}, {zone.centerLng.toFixed(4)}
                        {zone.description ? ` · ${zone.description}` : ""}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-medium text-muted-foreground">{zonePrices.length} price {zonePrices.length === 1 ? "entry" : "entries"}</p>
                      {zonePrices.map((p) => (
                        <p key={p.id} className="text-xs text-muted-foreground">{p.vehicleType}: ${p.baseFare.toFixed(2)} base</p>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── 6. Services Report ───────────────────────────────────────────────────────
const SVC_COLOR: Record<string, string> = { car: "#3b82f6", shuttle: "#f59e0b", bike: "#22c55e", default: "#8b5cf6" };
const SVC_LABEL: Record<string, string> = { car: "Car", shuttle: "Shuttle", bike: "Bike" };

function ServicesReport() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-analytics-services"],
    queryFn: () => adminFetch<ServiceAnalytics>("/admin/analytics/services"),
  });

  const usage = data?.serviceUsage ?? [];
  const revenue = data?.serviceRevenue ?? [];
  const monthly = data?.serviceMonthly ?? [];

  const totalBookings = usage.reduce((s, r) => s + r.total_bookings, 0);
  const totalRevenue  = revenue.reduce((s, r) => s + r.total_revenue, 0);

  const monthlyPivoted: Record<string, Record<string, number>> = {};
  for (const row of monthly) {
    if (!monthlyPivoted[row.month]) monthlyPivoted[row.month] = {};
    monthlyPivoted[row.month][row.service_type] = row.bookings;
  }
  const monthlyChartData = Object.entries(monthlyPivoted).map(([month, svcs]) => ({ month, ...svcs }));
  const serviceTypes = [...new Set(monthly.map((r) => r.service_type))];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-cyan-500/10"><Layers className="h-6 w-6 text-cyan-600" /></div>
          <div>
            <h1 className="text-2xl font-bold">Services Report</h1>
            <p className="text-sm text-muted-foreground">Usage comparison and revenue by service type</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => downloadCSV(revenue as unknown as Record<string, unknown>[], "services-revenue.csv")}>
          <Download className="h-3.5 w-3.5 mr-1.5" /> CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Bookings"  value={totalBookings}           icon={Navigation}  color="bg-blue-500/10 text-blue-600"   loading={isLoading} />
        <StatCard label="Total Revenue"   value={`${totalRevenue.toFixed(0)} EGP`} icon={DollarSign} color="bg-green-500/10 text-green-600" loading={isLoading} />
        <StatCard label="Service Types"   value={usage.length}            icon={Layers}      color="bg-cyan-500/10 text-cyan-600"   loading={isLoading} />
        <StatCard label="Unique Passengers" value={usage.reduce((s, r) => s + r.unique_passengers, 0)} icon={Users} color="bg-violet-500/10 text-violet-600" loading={isLoading} />
      </div>

      {/* Per-service cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {usage.map((svc) => {
          const rev = revenue.find((r) => r.service_type === svc.service_type);
          const pct = totalBookings ? Math.round((svc.total_bookings / totalBookings) * 100) : 0;
          const color = SVC_COLOR[svc.service_type] ?? SVC_COLOR.default;
          return (
            <Card key={svc.service_type}>
              <CardContent className="pt-5 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold capitalize">{SVC_LABEL[svc.service_type] ?? svc.service_type}</p>
                  <span className="text-xl font-bold">{svc.total_bookings.toLocaleString()}</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div><p className="font-medium text-foreground">{svc.completed.toLocaleString()}</p><p>Completed</p></div>
                  <div><p className="font-medium text-foreground">{svc.cancelled.toLocaleString()}</p><p>Cancelled</p></div>
                  <div><p className="font-medium text-foreground">{(rev?.total_revenue ?? 0).toFixed(0)} EGP</p><p>Revenue</p></div>
                  <div><p className="font-medium text-foreground">{(rev?.avg_fare ?? 0).toFixed(0)} EGP</p><p>Avg Fare</p></div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Revenue bar chart */}
      {revenue.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Revenue per Service</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-48 w-full" /> : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={revenue.map((r) => ({ name: SVC_LABEL[r.service_type] ?? r.service_type, revenue: r.total_revenue, bookings: r.bookings }))} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v.toFixed(0)}`} />
                  <Tooltip formatter={(v: number) => [`${v.toFixed(0)} EGP`, "Revenue"]} />
                  <Bar dataKey="revenue" radius={[3, 3, 0, 0]}>
                    {revenue.map((r) => <Cell key={r.service_type} fill={SVC_COLOR[r.service_type] ?? SVC_COLOR.default} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      )}

      {/* Monthly trend */}
      {monthlyChartData.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Monthly Bookings by Service (Last 6 Months)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyChartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                {serviceTypes.map((svc) => (
                  <Bar key={svc} dataKey={svc} stackId="a" fill={SVC_COLOR[svc] ?? SVC_COLOR.default} name={SVC_LABEL[svc] ?? svc} radius={[2, 2, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── 7. Promo Report ──────────────────────────────────────────────────────────
function PromoReport() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-analytics-promo"],
    queryFn: () => adminFetch<PromoAnalytics>("/admin/analytics/promo"),
  });

  const codes = data?.topPromos ?? [];
  const totalUsage = codes.reduce((s, c) => s + c.used_count, 0);
  const activeCodes = codes.filter((c) => c.is_active).length;
  const maxUsage = Math.max(...codes.map((c) => c.used_count), 1);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-pink-500/10"><Tags className="h-6 w-6 text-pink-600" /></div>
          <div>
            <h1 className="text-2xl font-bold">Promo Report</h1>
            <p className="text-sm text-muted-foreground">Most used promo codes, discounts given, and revenue impact</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => downloadCSV(codes as unknown as Record<string, unknown>[], "promo-codes.csv")}>
          <Download className="h-3.5 w-3.5 mr-1.5" /> CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Codes"       value={codes.length}                                icon={Tags}       color="bg-pink-500/10 text-pink-600"    loading={isLoading} />
        <StatCard label="Active Codes"      value={activeCodes}                                 icon={CheckCircle2} color="bg-green-500/10 text-green-600"  loading={isLoading} />
        <StatCard label="Total Redemptions" value={totalUsage}                                  icon={TrendingUp} color="bg-primary/10 text-primary"       loading={isLoading} />
        <StatCard label="Promo Bookings"    value={data?.totalPromoBookings ?? 0}               icon={Star}       color="bg-amber-500/10 text-amber-600"   loading={isLoading} />
      </div>

      {/* Monthly impact chart */}
      {(data?.monthlyImpact ?? []).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Monthly Promo Bookings (Last 6 Months)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data!.monthlyImpact} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="promo_bookings" fill="#ec4899" radius={[3, 3, 0, 0]} name="Promo Bookings" />
                <Bar dataKey="revenue" fill="#f59e0b" radius={[3, 3, 0, 0]} name="Revenue (EGP)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Most used codes */}
      <Card>
        <CardHeader><CardTitle className="text-base">Most Used Promo Codes</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : codes.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">No promo codes found</div>
          ) : (
            <div className="divide-y divide-border">
              {codes.map((code, i) => {
                const pct = maxUsage ? Math.min(100, Math.round((code.used_count / maxUsage) * 100)) : 0;
                return (
                  <div key={code.id} className="px-4 py-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-muted-foreground w-5">#{i + 1}</span>
                        <code className="text-sm font-mono font-bold bg-muted px-1.5 py-0.5 rounded">{code.code}</code>
                        <Badge variant="outline" className={code.is_active ? "text-green-600 border-green-200 text-xs" : "text-muted-foreground text-xs"}>
                          {code.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <span className="text-muted-foreground">{code.used_count}{code.max_usage ? `/${code.max_usage}` : ""} uses</span>
                        <span className="font-semibold">
                          {code.discount_type === "percentage" ? `${code.discount_value}%` : `${code.discount_value} EGP`} off
                        </span>
                        <span className="text-xs text-muted-foreground">{code.bookings_with_promo} bookings</span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-pink-500 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── 8. Complaints Report ─────────────────────────────────────────────────────
function ComplaintsReport() {
  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ["complaints-analytics"],
    queryFn: () => adminFetch<ComplaintsAnalytics>("/admin/analytics/complaints"),
  });

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ["support-stats"],
    queryFn: () => adminFetch<Record<string, number>>("/support/stats"),
  });

  const { data: ticketsData, isLoading: ticketsLoading } = useQuery({
    queryKey: ["support-tickets-report"],
    queryFn: () => adminFetch<{ data: Ticket[]; total: number }>("/support/tickets?limit=20&page=1"),
  });

  const tickets = ticketsData?.data ?? [];
  const stats   = statsData ?? {};
  const totalTickets = Object.values(stats).reduce((s, v) => s + v, 0);

  const avgHours = analytics?.avgResolutionHours;
  const avgResLabel = avgHours == null
    ? "N/A"
    : avgHours < 1
    ? `${Math.round(avgHours * 60)}m`
    : avgHours < 24
    ? `${avgHours.toFixed(1)}h`
    : `${(avgHours / 24).toFixed(1)}d`;

  const typeAgg: Record<string, number> = {};
  for (const row of analytics?.typeBreakdown ?? []) {
    typeAgg[row.type] = (typeAgg[row.type] ?? 0) + (row.count ?? 0);
  }

  const resolutionRate = totalTickets
    ? Math.round(((stats.resolved ?? 0) + (stats.closed ?? 0)) / totalTickets * 100)
    : 0;

  const isLoading = analyticsLoading || statsLoading || ticketsLoading;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-orange-500/10"><MessageSquare className="h-6 w-6 text-orange-600" /></div>
          <div>
            <h1 className="text-2xl font-bold">Complaints Report</h1>
            <p className="text-sm text-muted-foreground">Support ticket volume, types, resolution rate, and average resolution time</p>
          </div>
        </div>
        <Button
          variant="outline" size="sm"
          onClick={() => downloadCSV(tickets as unknown as Record<string, unknown>[], "complaints.csv")}
          disabled={isLoading}
        >
          <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
        </Button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Tickets"     value={totalTickets}      icon={MessageSquare}  color="bg-orange-500/10 text-orange-600"  loading={isLoading} />
        <StatCard label="Resolution Rate"   value={`${resolutionRate}%`} icon={CheckCircle2} color="bg-green-500/10 text-green-600"    loading={isLoading} />
        <StatCard label="Avg Resolution"    value={avgResLabel}       icon={Clock}          color="bg-blue-500/10 text-blue-600"       loading={isLoading} />
        <StatCard label="Open Tickets"      value={stats.open ?? 0}   icon={AlertCircle}    color="bg-amber-500/10 text-amber-600"     loading={isLoading} />
      </div>

      {/* Status & type breakdown side by side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">By Status</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? <Skeleton className="h-32 w-full" /> : (
              [
                { key: "open",     label: "Open",     color: "#f59e0b" },
                { key: "pending",  label: "Pending",  color: "#3b82f6" },
                { key: "resolved", label: "Resolved", color: "#22c55e" },
                { key: "closed",   label: "Closed",   color: "#6b7280" },
              ].map((s) => {
                const count = stats[s.key] ?? 0;
                const pct = totalTickets ? Math.round((count / totalTickets) * 100) : 0;
                return (
                  <div key={s.key} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{s.label}</span>
                      <span className="text-muted-foreground">{count} ({pct}%)</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: s.color }} />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">By Type & Priority</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? <Skeleton className="h-32 w-full" /> : (
              <>
                <div className="flex gap-3">
                  {Object.entries(typeAgg).map(([type, count]) => (
                    <div key={type} className={`flex-1 rounded-lg p-3 text-center ${type === "passenger" ? "bg-blue-500/10" : "bg-amber-500/10"}`}>
                      <p className="text-xl font-bold">{count}</p>
                      <p className="text-xs font-medium capitalize mt-0.5">{type}</p>
                    </div>
                  ))}
                  {Object.keys(typeAgg).length === 0 && (
                    <p className="text-sm text-muted-foreground">No tickets yet</p>
                  )}
                </div>
                <div className="space-y-2">
                  {(analytics?.priorityBreakdown ?? []).map((p) => {
                    const total = (analytics?.priorityBreakdown ?? []).reduce((s, x) => s + x.count, 0);
                    const pct = total ? Math.round((p.count / total) * 100) : 0;
                    const col = p.priority === "high" ? "#ef4444" : p.priority === "medium" ? "#f59e0b" : "#6b7280";
                    return (
                      <div key={p.priority} className="space-y-0.5">
                        <div className="flex justify-between text-xs">
                          <span className="capitalize font-medium">{p.priority} priority</span>
                          <span className="text-muted-foreground">{p.count} ({pct}%)</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: col }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Trend */}
      {(analytics?.trend ?? []).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Daily Ticket Trend (last 30 days)</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-48 w-full" /> : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={analytics?.trend ?? []} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => { try { return format(new Date(v), "MMM d"); } catch { return v; } }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip labelFormatter={(l) => { try { return format(new Date(l), "MMM d, yyyy"); } catch { return l; } }} />
                  <Legend />
                  <Line type="monotone" dataKey="opened"   stroke="#f59e0b" strokeWidth={2} dot={false} name="Opened" />
                  <Line type="monotone" dataKey="resolved" stroke="#22c55e" strokeWidth={2} dot={false} name="Resolved" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recent tickets list */}
      <Card>
        <CardHeader><CardTitle className="text-base">Recent Complaints</CardTitle></CardHeader>
        <CardContent className="p-0">
          {ticketsLoading ? (
            <div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : tickets.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">No complaints found</div>
          ) : (
            <div className="divide-y divide-border">
              {tickets.map((t) => (
                <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t.subject}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.user?.name ?? t.driver?.name ?? "Unknown"} · {t.type} · {format(new Date(t.createdAt), "MMM d, yyyy")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className={`text-xs ${
                      t.priority === "high"   ? "text-red-500 border-red-200" :
                      t.priority === "medium" ? "text-amber-600 border-amber-200" : "text-muted-foreground"
                    }`}>{t.priority}</Badge>
                    <Badge variant="outline" className={`text-xs ${
                      t.status === "resolved" ? "text-green-600 border-green-200" :
                      t.status === "open"     ? "text-amber-600 border-amber-200" : "text-muted-foreground"
                    }`}>{t.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Router ───────────────────────────────────────────────────────────────────
export default function Reports() {
  const [, params] = useRoute("/reports/:type");
  const type = params?.type ?? "revenue";

  if (type === "revenue")    return <RevenueReport />;
  if (type === "trips")      return <TripsReport />;
  if (type === "drivers")    return <DriversReport />;
  if (type === "passengers") return <PassengersReport />;
  if (type === "zones")      return <ZonesReport />;
  if (type === "services")   return <ServicesReport />;
  if (type === "promo")      return <PromoReport />;
  if (type === "complaints") return <ComplaintsReport />;
  return <RevenueReport />;
}
