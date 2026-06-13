import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { adminFetch } from "@/lib/api";
import { fmtUtcFull, fmtUtcTime } from "@/lib/utils";
import { formatEGP } from "@/lib/currency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import {
  Bus, Users, MapPin, UserCircle, ExternalLink, Search, Filter, X, Navigation,
} from "lucide-react";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShuttleTrip {
  id: number;
  scheduleId: number | null;
  status: string;
  departureTime: string;
  arrivalTime: string;
  price: number;
  totalSeats: number;
  availableSeats: number;
  bookedSeats: number;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  route: { id: number; name: string; fromLocation: string; toLocation: string } | null;
  driver: { id: number; name: string; phone: string; rating: number } | null;
  bus: { id: number; plateNumber: string; model: string; capacity: number } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { key: string; cls: string }> = {
  scheduled:       { key: "common.pending",    cls: "border-blue-200 bg-blue-50 text-blue-700" },
  waiting_driver:  { key: "common.active",     cls: "border-green-200 bg-green-50 text-green-700" },
  driver_assigned: { key: "trips.driverAssigned", cls: "border-indigo-200 bg-indigo-50 text-indigo-700" },
  boarding:        { key: "common.boarded",    cls: "border-purple-200 bg-purple-50 text-purple-700" },
  active:          { key: "common.active",     cls: "border-green-200 bg-green-50 text-green-700" },
  completed:       { key: "common.completed",  cls: "border-slate-200 bg-slate-50 text-slate-600" },
  cancelled:       { key: "common.cancelled",  cls: "border-red-200 bg-red-50 text-red-700" },
};

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const m = STATUS_META[status] ?? { key: status, cls: "" };
  return (
    <Badge variant="outline" className={`text-xs font-medium capitalize ${m.cls}`}>
      {t(m.key)}
    </Badge>
  );
}

function SeatBar({ booked, total }: { booked: number; total: number }) {
  const pct = total > 0 ? Math.round((booked / total) * 100) : 0;
  const color = pct >= 90 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-400" : "bg-blue-400";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">{booked}/{total}</span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ShuttleTrips() {
  const { t } = useTranslation();
  const [page, setPage]         = useState(1);
  const [status, setStatus]     = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo]     = useState("");
  const [search, setSearch]     = useState("");
  const limit = 20;

  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (status && status !== "all")  params.set("status", status);
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo)   params.set("dateTo", dateTo);

  const { data, isLoading } = useQuery<{ data: ShuttleTrip[]; total: number }>({
    queryKey: ["shuttle-trips-admin", page, status, dateFrom, dateTo],
    queryFn: () => adminFetch(`/admin/shuttle-trips?${params}`),
    refetchInterval: 30000,
  });

  const trips  = data?.data ?? [];
  const total  = data?.total ?? 0;
  const pages  = Math.max(1, Math.ceil(total / limit));

  const filtered = search.trim()
    ? trips.filter((t) =>
        t.route?.name?.toLowerCase().includes(search.toLowerCase()) ||
        t.route?.fromLocation?.toLowerCase().includes(search.toLowerCase()) ||
        t.route?.toLocation?.toLowerCase().includes(search.toLowerCase()) ||
        t.driver?.name?.toLowerCase().includes(search.toLowerCase()) ||
        t.bus?.plateNumber?.toLowerCase().includes(search.toLowerCase()) ||
        String(t.id).includes(search),
      )
    : trips;

  function resetFilters() {
    setStatus("all");
    setDateFrom("");
    setDateTo("");
    setSearch("");
    setPage(1);
  }

  const hasFilters = status !== "all" || dateFrom || dateTo || search;

  // ─── KPI cards ──────────────────────────────────────────────────────────────
  const open      = trips.filter((t) => t.status === "scheduled").length;
  const active    = trips.filter((t) => ["waiting_driver", "driver_assigned", "boarding", "active"].includes(t.status)).length;
  const completed = trips.filter((t) => t.status === "completed").length;
  const cancelled = trips.filter((t) => t.status === "cancelled").length;

  return (
    <div className="p-6 space-y-6 max-w-screen-xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Bus className="h-6 w-6 text-primary" />
            {t("shuttleTrips.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t("shuttleTrips.subtitle")}
          </p>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: t("common.pending"),      value: open,      cls: "text-blue-600",   bg: "bg-blue-50" },
          { label: t("common.active"),    value: active,    cls: "text-green-600",  bg: "bg-green-50" },
          { label: t("common.completed"), value: completed, cls: "text-slate-600",  bg: "bg-slate-50" },
          { label: t("common.cancelled"), value: cancelled, cls: "text-red-600",    bg: "bg-red-50" },
        ].map((k) => (
          <Card key={k.label} className={`${k.bg} border-0 shadow-sm`}>
            <CardContent className="pt-4 pb-3 text-center">
              <p className={`text-2xl font-bold ${k.cls}`}>{k.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{k.label} ({t("common.page")})</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder={t("common.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ps-8 h-8 w-52 text-sm"
          />
        </div>

        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="h-8 w-40 text-sm">
            <Filter className="h-3.5 w-3.5 me-1.5 text-muted-foreground" />
            <SelectValue placeholder={t("common.status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("shuttleTrips.allStatuses")}</SelectItem>
            <SelectItem value="scheduled">{t("common.pending")}</SelectItem>
            <SelectItem value="waiting_driver">{t("common.active")}</SelectItem>
            <SelectItem value="driver_assigned">{t("trips.driverAssigned")}</SelectItem>
            <SelectItem value="completed">{t("common.completed")}</SelectItem>
            <SelectItem value="cancelled">{t("common.cancelled")}</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{t("common.from")}</span>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="h-8 w-36 text-sm"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{t("common.to")}</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="h-8 w-36 text-sm"
          />
        </div>

        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={resetFilters}>
            <X className="h-3.5 w-3.5" /> {t("common.clear")}
          </Button>
        )}

        <span className="ms-auto text-xs text-muted-foreground">
          {t("common.total")}: {total.toLocaleString()}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-14 text-xs">{t("common.id")}</TableHead>
              <TableHead className="text-xs">{t("shuttleTrips.colRoute")}</TableHead>
              <TableHead className="text-xs">{t("shuttleTrips.colDeparture")}</TableHead>
              <TableHead className="text-xs">{t("shuttleTrips.colStatus")}</TableHead>
              <TableHead className="text-xs">{t("shuttleTrips.colDriver")}</TableHead>
              <TableHead className="text-xs">{t("shuttleTrips.colBus")}</TableHead>
              <TableHead className="text-xs">{t("shuttleTrips.colSeats")}</TableHead>
              <TableHead className="text-xs text-end">{t("common.price")}</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-16 text-muted-foreground">
                  <Bus className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  <p className="text-sm font-medium">{t("shuttleTrips.noTrips")}</p>
                  {hasFilters && <p className="text-xs mt-1">{t("bookings.clearFiltersHint")}</p>}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((trip) => (
                <TableRow
                  key={trip.id}
                  className="cursor-pointer hover:bg-muted/30 transition-colors"
                >
                  <TableCell className="text-xs font-mono text-muted-foreground">#{trip.id}</TableCell>

                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium leading-tight">
                        {trip.route?.name ?? `${t("common.route")} #${trip.route?.id ?? "—"}`}
                      </span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-2.5 w-2.5 shrink-0" />
                        {trip.route?.fromLocation ?? "—"}
                        <Navigation className="h-2.5 w-2.5 mx-0.5" />
                        {trip.route?.toLocation ?? "—"}
                      </span>
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium tabular-nums">
                        {fmtUtcTime(trip.departureTime)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(trip.departureTime).toLocaleDateString("en-US", {
                          timeZone: "Africa/Cairo",
                          weekday: "short", month: "short", day: "numeric",
                        })}
                      </span>
                    </div>
                  </TableCell>

                  <TableCell>
                    <StatusBadge status={trip.status} />
                  </TableCell>

                  <TableCell>
                    {trip.driver ? (
                      <div className="flex items-center gap-1.5">
                        <UserCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <Link
                          href={`/drivers/${trip.driver.id}`}
                          className="text-sm text-primary hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {trip.driver.name}
                        </Link>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">{t("common.unknown")}</span>
                    )}
                  </TableCell>

                  <TableCell>
                    {trip.bus ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-mono font-medium">{trip.bus.plateNumber}</span>
                        <span className="text-xs text-muted-foreground">{trip.bus.model}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">—</span>
                    )}
                  </TableCell>

                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <SeatBar booked={trip.bookedSeats} total={trip.totalSeats} />
                      <span className="text-[10px] text-muted-foreground">
                        {trip.availableSeats} {t("common.available")}
                      </span>
                    </div>
                  </TableCell>

                  <TableCell className="text-end text-sm font-medium tabular-nums">
                    {formatEGP(trip.price)}
                  </TableCell>

                  <TableCell>
                    <Link href={`/shuttle-trips/${trip.id}`}>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className={page <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
            <PaginationItem>
              <span className="px-4 text-sm text-muted-foreground">
                {t("common.page")} {page} {t("common.of")} {pages}
              </span>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                className={page >= pages ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
