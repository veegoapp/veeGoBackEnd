import React, { useState } from "react";
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

const STATUS_META: Record<string, { label: string; cls: string }> = {
  scheduled:       { label: "Open",            cls: "border-blue-200 bg-blue-50 text-blue-700" },
  waiting_driver:  { label: "Active",          cls: "border-green-200 bg-green-50 text-green-700" },
  driver_assigned: { label: "Driver Assigned", cls: "border-indigo-200 bg-indigo-50 text-indigo-700" },
  boarding:        { label: "Boarding",        cls: "border-purple-200 bg-purple-50 text-purple-700" },
  active:          { label: "Active",          cls: "border-green-200 bg-green-50 text-green-700" },
  completed:       { label: "Completed",       cls: "border-slate-200 bg-slate-50 text-slate-600" },
  cancelled:       { label: "Cancelled",       cls: "border-red-200 bg-red-50 text-red-700" },
};

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status, cls: "" };
  return (
    <Badge variant="outline" className={`text-xs font-medium capitalize ${m.cls}`}>
      {m.label}
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
            Shuttle Trips
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            All shuttle trips — route, driver, bus, passengers, and timing at a glance.
          </p>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Open",      value: open,      cls: "text-blue-600",   bg: "bg-blue-50" },
          { label: "Active",    value: active,    cls: "text-green-600",  bg: "bg-green-50" },
          { label: "Completed", value: completed, cls: "text-slate-600",  bg: "bg-slate-50" },
          { label: "Cancelled", value: cancelled, cls: "text-red-600",    bg: "bg-red-50" },
        ].map((k) => (
          <Card key={k.label} className={`${k.bg} border-0 shadow-sm`}>
            <CardContent className="pt-4 pb-3 text-center">
              <p className={`text-2xl font-bold ${k.cls}`}>{k.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{k.label} (this page)</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search route, driver, plate…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 w-52 text-sm"
          />
        </div>

        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="h-8 w-40 text-sm">
            <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="scheduled">Open</SelectItem>
            <SelectItem value="waiting_driver">Active</SelectItem>
            <SelectItem value="driver_assigned">Driver Assigned</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">From</span>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="h-8 w-36 text-sm"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">To</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="h-8 w-36 text-sm"
          />
        </div>

        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={resetFilters}>
            <X className="h-3.5 w-3.5" /> Clear
          </Button>
        )}

        <span className="ml-auto text-xs text-muted-foreground">
          {total.toLocaleString()} trip{total !== 1 ? "s" : ""} total
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-14 text-xs">ID</TableHead>
              <TableHead className="text-xs">Route</TableHead>
              <TableHead className="text-xs">Departure</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs">Driver</TableHead>
              <TableHead className="text-xs">Bus</TableHead>
              <TableHead className="text-xs">Seats</TableHead>
              <TableHead className="text-xs text-right">Price</TableHead>
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
                  <p className="text-sm font-medium">No trips found</p>
                  {hasFilters && <p className="text-xs mt-1">Try adjusting the filters</p>}
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
                        {trip.route?.name ?? `Route #${trip.route?.id ?? "—"}`}
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
                      <span className="text-xs text-muted-foreground italic">Unassigned</span>
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
                        {trip.availableSeats} available
                      </span>
                    </div>
                  </TableCell>

                  <TableCell className="text-right text-sm font-medium tabular-nums">
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
                Page {page} of {pages}
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
