import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { RefreshCw, History, CheckCircle2, XCircle, Clock } from "lucide-react";
import { format, addDays } from "date-fns";

interface ShuttleBooking {
  id: number;
  driverId: number;
  routeId: number;
  timeSlotId: number;
  weekStart: string;
  weekEnd: string;
  status: "active" | "cancelled" | "pending_renewal" | "expired";
  renewalNotifiedAt: string | null;
  renewalDeadline: string | null;
  renewalConfirmedAt: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
  route?: { id: number; name: string; fromLocation: string; toLocation: string };
  timeSlot?: { id: number; departureTime: string };
  driver?: { id: number; name: string; phone: string };
}

interface RenewalHistoryResponse {
  data: ShuttleBooking[];
  total: number;
  page: number;
  limit: number;
}

function formatWeekRange(weekStart: string): string {
  try {
    const start = new Date(weekStart + "T00:00:00Z");
    const end = addDays(start, 4);
    return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
  } catch {
    return weekStart;
  }
}

function renewalOutcomeBadge(booking: ShuttleBooking) {
  if (booking.renewalConfirmedAt) {
    return (
      <Badge className="gap-1 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200">
        <CheckCircle2 className="h-3 w-3" /> Confirmed
      </Badge>
    );
  }
  if (booking.status === "expired") {
    return (
      <Badge variant="outline" className="gap-1 text-muted-foreground">
        <XCircle className="h-3 w-3" /> Expired
      </Badge>
    );
  }
  if (booking.status === "cancelled") {
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="h-3 w-3" /> Cancelled
      </Badge>
    );
  }
  if (booking.status === "pending_renewal") {
    return (
      <Badge variant="secondary" className="gap-1">
        <Clock className="h-3 w-3" /> Pending
      </Badge>
    );
  }
  return <Badge variant="outline">{booking.status}</Badge>;
}

export default function ShuttleRenewalHistory() {
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = useQuery<RenewalHistoryResponse>({
    queryKey: ["admin-shuttle-renewal-history", page],
    queryFn: () => adminFetch(`/admin/shuttle/renewal-history?page=${page}&limit=20`),
  });

  const totalPages = data ? Math.ceil(data.total / 20) : 1;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <History className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Renewal History</h1>
            <p className="text-sm text-muted-foreground">
              Priority renewal events — all bookings that received a renewal notification
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Stats strip */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label: "Total Renewals",
              value: data.total,
              color: "text-foreground",
            },
            {
              label: "Confirmed",
              value: data.data.filter((b) => b.renewalConfirmedAt).length,
              color: "text-green-600",
            },
            {
              label: "Expired",
              value: data.data.filter((b) => b.status === "expired").length,
              color: "text-muted-foreground",
            },
            {
              label: "Pending",
              value: data.data.filter((b) => b.status === "pending_renewal").length,
              color: "text-amber-600",
            },
          ].map((s) => (
            <Card key={s.label} className="py-3">
              <CardContent className="p-0 px-4 flex flex-col">
                <span className={`text-2xl font-bold ${s.color}`}>{s.value}</span>
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {data ? `${data.total} renewal event${data.total !== 1 ? "s" : ""}` : "Loading…"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Slot</TableHead>
                <TableHead>Week</TableHead>
                <TableHead>Notified At</TableHead>
                <TableHead>Deadline</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Confirmed At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? Array.from({ length: 10 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 9 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                : data?.data.length === 0
                ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-16 text-muted-foreground">
                      No renewal events yet. The Wednesday renewal job sends notifications every week.
                    </TableCell>
                  </TableRow>
                )
                : data?.data.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{b.id}</TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{b.driver?.name ?? `#${b.driverId}`}</div>
                      <div className="text-xs text-muted-foreground">{b.driver?.phone}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{b.route?.name ?? `Route #${b.routeId}`}</div>
                      {b.route && (
                        <div className="text-xs text-muted-foreground">
                          {b.route.fromLocation} → {b.route.toLocation}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-sm">{b.timeSlot?.departureTime ?? `Slot #${b.timeSlotId}`}</span>
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{formatWeekRange(b.weekStart)}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {b.renewalNotifiedAt
                        ? format(new Date(b.renewalNotifiedAt), "MMM d, HH:mm")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {b.renewalDeadline ? (
                        <span className={new Date(b.renewalDeadline) < new Date() && !b.renewalConfirmedAt ? "text-destructive" : ""}>
                          {format(new Date(b.renewalDeadline), "MMM d, HH:mm")}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell>{renewalOutcomeBadge(b)}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {b.renewalConfirmedAt
                        ? <span className="text-green-600">{format(new Date(b.renewalConfirmedAt), "MMM d, HH:mm")}</span>
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious onClick={() => setPage((p) => Math.max(1, p - 1))} />
            </PaginationItem>
            <PaginationItem>
              <span className="text-sm px-4 py-2">Page {page} of {totalPages}</span>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext onClick={() => setPage((p) => Math.min(totalPages, p + 1))} />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
