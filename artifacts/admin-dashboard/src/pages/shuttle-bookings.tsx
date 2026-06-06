import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { useToast } from "@/hooks/use-toast";
import { Bus, RefreshCw, Search, X, UserCog, Ban, Clock, CheckCircle } from "lucide-react";
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

interface BookingsResponse {
  data: ShuttleBooking[];
  total: number;
  page: number;
  limit: number;
}

interface Driver {
  id: number;
  name: string;
  phone: string;
}

function getUpcomingWeekStart(): string {
  const now = new Date();
  const day = now.getUTCDay();
  const daysToAdd = day === 0 ? 7 : 7 - day;
  const sunday = new Date(now);
  sunday.setUTCDate(sunday.getUTCDate() + daysToAdd);
  sunday.setUTCHours(0, 0, 0, 0);
  return sunday.toISOString().split("T")[0]!;
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

function statusBadge(status: ShuttleBooking["status"]) {
  const map: Record<ShuttleBooking["status"], { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    active: { label: "Active", variant: "default" },
    pending_renewal: { label: "Pending Renewal", variant: "secondary" },
    cancelled: { label: "Cancelled", variant: "destructive" },
    expired: { label: "Expired", variant: "outline" },
  };
  const { label, variant } = map[status] ?? { label: status, variant: "outline" };
  return <Badge variant={variant}>{label}</Badge>;
}

export default function ShuttleBookings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [week, setWeek] = useState(getUpcomingWeekStart());
  const [routeId, setRouteId] = useState("");
  const [driverIdFilter, setDriverIdFilter] = useState("");
  const [status, setStatus] = useState("all");

  const [reassignOpen, setReassignOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [extendOpen, setExtendOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<ShuttleBooking | null>(null);
  const [newDriverId, setNewDriverId] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [extendHours, setExtendHours] = useState("2");
  const [driverSearch, setDriverSearch] = useState("");

  const params = new URLSearchParams({ page: String(page), limit: "20" });
  if (week) params.set("week", week);
  if (routeId) params.set("routeId", routeId);
  if (driverIdFilter) params.set("driverId", driverIdFilter);
  if (status && status !== "all") params.set("status", status);

  const { data, isLoading, refetch } = useQuery<BookingsResponse>({
    queryKey: ["admin-shuttle-bookings", page, week, routeId, driverIdFilter, status],
    queryFn: () => adminFetch(`/admin/shuttle/bookings?${params.toString()}`),
  });

  const { data: driversData } = useQuery<{ data: Driver[]; total: number }>({
    queryKey: ["drivers-list-basic"],
    queryFn: () => adminFetch("/drivers?limit=500&isActive=true"),
    enabled: reassignOpen,
  });

  const reassignMutation = useMutation({
    mutationFn: ({ bookingId, driverId }: { bookingId: number; driverId: number }) =>
      adminFetch(`/admin/shuttle/bookings/${bookingId}/reassign`, {
        method: "PATCH",
        body: JSON.stringify({ driverId }),
      }),
    onSuccess: () => {
      toast({ title: "Booking reassigned", description: "The booking has been reassigned to the new driver." });
      setReassignOpen(false);
      setSelectedBooking(null);
      setNewDriverId("");
      queryClient.invalidateQueries({ queryKey: ["admin-shuttle-bookings"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: ({ bookingId, reason }: { bookingId: number; reason: string }) =>
      adminFetch(`/admin/shuttle/bookings/${bookingId}/cancel`, {
        method: "PATCH",
        body: JSON.stringify({ reason: reason || undefined }),
      }),
    onSuccess: () => {
      toast({ title: "Booking cancelled" });
      setCancelOpen(false);
      setSelectedBooking(null);
      setCancelReason("");
      queryClient.invalidateQueries({ queryKey: ["admin-shuttle-bookings"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const extendMutation = useMutation({
    mutationFn: ({ bookingId, hours }: { bookingId: number; hours: number }) =>
      adminFetch(`/admin/shuttle/bookings/${bookingId}/extend-window`, {
        method: "PATCH",
        body: JSON.stringify({ hours }),
      }),
    onSuccess: () => {
      toast({ title: "Renewal window extended" });
      setExtendOpen(false);
      setSelectedBooking(null);
      queryClient.invalidateQueries({ queryKey: ["admin-shuttle-bookings"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const filteredDrivers = (driversData?.data ?? []).filter(
    (d) =>
      !driverSearch ||
      d.name.toLowerCase().includes(driverSearch.toLowerCase()) ||
      d.phone.includes(driverSearch),
  );

  const totalPages = data ? Math.ceil(data.total / 20) : 1;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bus className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Shuttle Route Bookings</h1>
            <p className="text-sm text-muted-foreground">Manage driver route bookings per week</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Week (Sunday)</Label>
              <Input
                type="date"
                value={week}
                onChange={(e) => { setWeek(e.target.value); setPage(1); }}
                className="w-40 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Route ID</Label>
              <Input
                placeholder="Route ID"
                value={routeId}
                onChange={(e) => { setRouteId(e.target.value); setPage(1); }}
                className="w-28 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Driver ID</Label>
              <Input
                placeholder="Driver ID"
                value={driverIdFilter}
                onChange={(e) => { setDriverIdFilter(e.target.value); setPage(1); }}
                className="w-28 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
                <SelectTrigger className="w-40 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="pending_renewal">Pending Renewal</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(routeId || driverIdFilter || status !== "all") && (
              <Button variant="ghost" size="sm" onClick={() => { setRouteId(""); setDriverIdFilter(""); setStatus("all"); setPage(1); }}>
                <X className="h-4 w-4 mr-1" /> Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {data ? `${data.total} booking${data.total !== 1 ? "s" : ""}` : "Loading…"}
            {week && ` — week of ${formatWeekRange(week)}`}
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
                <TableHead>Status</TableHead>
                <TableHead>Renewal Deadline</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                : data?.data.length === 0
                ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                      No bookings found for this week / filter.
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
                        <div className="text-xs text-muted-foreground">{b.route.fromLocation} → {b.route.toLocation}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-sm">{b.timeSlot?.departureTime ?? `Slot #${b.timeSlotId}`}</span>
                    </TableCell>
                    <TableCell className="text-xs">{formatWeekRange(b.weekStart)}</TableCell>
                    <TableCell>{statusBadge(b.status)}</TableCell>
                    <TableCell className="text-xs">
                      {b.renewalDeadline
                        ? <span className={new Date(b.renewalDeadline) < new Date() ? "text-destructive" : "text-amber-600"}>
                            {format(new Date(b.renewalDeadline), "MMM d, HH:mm")}
                          </span>
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          title="Reassign"
                          disabled={b.status === "cancelled" || b.status === "expired"}
                          onClick={() => { setSelectedBooking(b); setReassignOpen(true); }}
                        >
                          <UserCog className="h-3.5 w-3.5" />
                        </Button>
                        {b.status === "pending_renewal" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-amber-600"
                            title="Extend renewal window"
                            onClick={() => { setSelectedBooking(b); setExtendOpen(true); }}
                          >
                            <Clock className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          title="Cancel"
                          disabled={b.status === "cancelled" || b.status === "expired"}
                          onClick={() => { setSelectedBooking(b); setCancelOpen(true); }}
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
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

      {/* Reassign Dialog */}
      <Dialog open={reassignOpen} onOpenChange={setReassignOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reassign Booking #{selectedBooking?.id}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Current driver: <span className="font-medium text-foreground">{selectedBooking?.driver?.name}</span>
            </p>
            <div className="space-y-1">
              <Label>Search Driver</Label>
              <Input
                placeholder="Name or phone…"
                value={driverSearch}
                onChange={(e) => setDriverSearch(e.target.value)}
              />
            </div>
            <div className="border rounded-md max-h-48 overflow-y-auto divide-y">
              {filteredDrivers.slice(0, 30).map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors ${newDriverId === String(d.id) ? "bg-primary/10 font-medium" : ""}`}
                  onClick={() => setNewDriverId(String(d.id))}
                >
                  {d.name} — {d.phone}
                  {newDriverId === String(d.id) && <CheckCircle className="inline h-3.5 w-3.5 ml-2 text-primary" />}
                </button>
              ))}
              {filteredDrivers.length === 0 && (
                <div className="px-3 py-4 text-sm text-muted-foreground text-center">No drivers found</div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReassignOpen(false)}>Cancel</Button>
            <Button
              disabled={!newDriverId || reassignMutation.isPending}
              onClick={() => selectedBooking && reassignMutation.mutate({
                bookingId: selectedBooking.id,
                driverId: parseInt(newDriverId),
              })}
            >
              Reassign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel Booking #{selectedBooking?.id}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Driver <span className="font-medium text-foreground">{selectedBooking?.driver?.name}</span> on route{" "}
              <span className="font-medium text-foreground">{selectedBooking?.route?.name}</span> at{" "}
              <span className="font-mono font-medium text-foreground">{selectedBooking?.timeSlot?.departureTime}</span>
            </p>
            <div className="space-y-1">
              <Label>Reason (optional)</Label>
              <Input
                placeholder="e.g. Driver request, route change…"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Back</Button>
            <Button
              variant="destructive"
              disabled={cancelMutation.isPending}
              onClick={() => selectedBooking && cancelMutation.mutate({
                bookingId: selectedBooking.id,
                reason: cancelReason,
              })}
            >
              Cancel Booking
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Extend Window Dialog */}
      <Dialog open={extendOpen} onOpenChange={setExtendOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Extend Renewal Window</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Driver: <span className="font-medium text-foreground">{selectedBooking?.driver?.name}</span>
              <br />
              Current deadline:{" "}
              <span className="font-medium text-foreground">
                {selectedBooking?.renewalDeadline
                  ? format(new Date(selectedBooking.renewalDeadline), "MMM d, HH:mm")
                  : "—"}
              </span>
            </p>
            <div className="space-y-1">
              <Label>Extend by (hours)</Label>
              <Input
                type="number"
                min={1}
                max={72}
                value={extendHours}
                onChange={(e) => setExtendHours(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtendOpen(false)}>Cancel</Button>
            <Button
              disabled={!extendHours || extendMutation.isPending}
              onClick={() => selectedBooking && extendMutation.mutate({
                bookingId: selectedBooking.id,
                hours: parseInt(extendHours),
              })}
            >
              Extend Window
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
