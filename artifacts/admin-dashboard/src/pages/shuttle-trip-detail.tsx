import React from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminFetch } from "@/lib/api";
import { fmtUtcFull, fmtUtcShort, fmtUtcTime } from "@/lib/utils";
import { formatEGP } from "@/lib/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, MapPin, Clock, Users, Bus, UserCircle, Ban,
  Star, CalendarClock, CheckCircle2, XCircle, AlertCircle,
  Navigation, Phone, CreditCard, Ticket, Wallet, Route,
  Building2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Station {
  id: number;
  name: string;
  order: number;
  direction: string;
  segmentPrice: number | null;
  progress: {
    status: string;
    arrivedAt: string | null;
    completedAt: string | null;
  } | null;
}

interface Passenger {
  bookingId: number;
  userId: number;
  userName: string;
  userPhone: string;
  userEmail: string;
  seatCount: number;
  totalPrice: number;
  status: string;
  paymentStatus: string;
  createdAt: string;
}

interface TripDetail {
  id: number;
  scheduleId: number | null;
  status: string;
  departureTime: string;
  arrivalTime: string;
  price: number;
  totalSeats: number;
  availableSeats: number;
  bookedSeats: number;
  recurringType: string;
  acceptedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
  route: {
    id: number;
    name: string;
    fromLocation: string;
    toLocation: string;
    estimatedDuration: number;
    stations: Station[];
  } | null;
  driver: {
    id: number;
    name: string;
    phone: string;
    rating: number;
    status: string;
  } | null;
  bus: {
    id: number;
    plateNumber: string;
    model: string;
    capacity: number;
  } | null;
  passengers: Passenger[];
  totalPassengers: number;
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

const BOOKING_STATUS_META: Record<string, { label: string; cls: string }> = {
  pending:    { label: "Pending",   cls: "border-amber-200 bg-amber-50 text-amber-700" },
  confirmed:  { label: "Confirmed", cls: "border-blue-200 bg-blue-50 text-blue-700" },
  boarded:    { label: "Boarded",   cls: "border-green-200 bg-green-50 text-green-700" },
  absent:     { label: "Absent",    cls: "border-orange-200 bg-orange-50 text-orange-700" },
  completed:  { label: "Completed", cls: "border-slate-200 bg-slate-50 text-slate-600" },
  cancelled:  { label: "Cancelled", cls: "border-red-200 bg-red-50 text-red-700" },
};

const PAYMENT_META: Record<string, { label: string; cls: string }> = {
  pending:    { label: "Pending", cls: "text-amber-600" },
  paid:       { label: "Paid",    cls: "text-green-600" },
  refunded:   { label: "Refunded", cls: "text-blue-600" },
  failed:     { label: "Failed",  cls: "text-red-600" },
};

const STATION_STATUS_META: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  pending:   { label: "Pending",   icon: Clock,          cls: "text-muted-foreground" },
  arrived:   { label: "Arrived",   icon: CheckCircle2,   cls: "text-amber-600" },
  completed: { label: "Completed", icon: CheckCircle2,   cls: "text-green-600" },
};

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status, cls: "" };
  return <Badge variant="outline" className={`text-xs font-medium ${m.cls}`}>{m.label}</Badge>;
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border last:border-0">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted mt-0.5">
        <Icon className="h-3 w-3 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <div className="text-sm font-medium mt-0.5 break-words">
          {value ?? <span className="text-muted-foreground italic text-xs">—</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ShuttleTripDetail() {
  const { id } = useParams();
  const tripId = parseInt(id || "0", 10);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: resp, isLoading } = useQuery<{ data: TripDetail }>({
    queryKey: ["shuttle-trip-detail", tripId],
    queryFn:  () => adminFetch(`/admin/shuttle-trips/${tripId}`),
    enabled:  !!tripId,
    refetchInterval: 20000,
  });

  const cancelMutation = useMutation({
    mutationFn: () =>
      adminFetch(`/trips/${tripId}/cancel`, {
        method: "PATCH",
        body: JSON.stringify({ reason: "Cancelled by admin" }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shuttle-trip-detail", tripId] });
      toast({ title: "Trip cancelled" });
    },
    onError: (err: Error) =>
      toast({ title: "Cancel failed", description: err.message, variant: "destructive" }),
  });

  // ─── Loading ──────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-10 w-80" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1,2,3,4].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1,2,3].map((i) => <Skeleton key={i} className="h-48" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const trip = resp?.data;
  if (!trip) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <Bus className="h-12 w-12 mx-auto mb-3 opacity-20" />
        <p className="font-medium">Trip not found</p>
        <Link href="/shuttle-trips">
          <Button variant="outline" size="sm" className="mt-4 gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Trips
          </Button>
        </Link>
      </div>
    );
  }

  const canCancel = ["scheduled", "waiting_driver", "driver_assigned"].includes(trip.status);
  const fillPct   = trip.totalSeats > 0 ? Math.round((trip.bookedSeats / trip.totalSeats) * 100) : 0;
  const duration  = Math.round(
    (new Date(trip.arrivalTime).getTime() - new Date(trip.departureTime).getTime()) / 60000,
  );
  const revenue   = trip.passengers
    .filter((p) => ["confirmed", "boarded", "completed"].includes(p.status))
    .reduce((sum, p) => sum + p.totalPrice, 0);

  const stations = trip.route?.stations ?? [];

  return (
    <div className="p-6 space-y-6 max-w-screen-xl mx-auto">

      {/* Header */}
      <div className="flex items-start gap-4 flex-wrap">
        <Link href="/shuttle-trips">
          <Button variant="outline" size="icon" className="h-8 w-8 shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold">Shuttle Trip #{trip.id}</h1>
            <StatusBadge status={trip.status} />
            {trip.scheduleId && (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                Schedule #{trip.scheduleId}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {trip.route?.name ?? "—"} · {fmtUtcFull(trip.departureTime)}
          </p>
        </div>
        {canCancel && (
          <Button
            variant="destructive"
            size="sm"
            className="gap-2"
            disabled={cancelMutation.isPending}
            onClick={() => {
              if (confirm("Cancel this trip? Passengers will be notified.")) {
                cancelMutation.mutate();
              }
            }}
          >
            <Ban className="h-4 w-4" />
            {cancelMutation.isPending ? "Cancelling…" : "Cancel Trip"}
          </Button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "Seats Filled",
            value: `${trip.bookedSeats}/${trip.totalSeats} (${fillPct}%)`,
            icon: Users,
            color: "bg-blue-500/10 text-blue-600",
          },
          {
            label: "Ticket Price",
            value: formatEGP(trip.price),
            icon: Ticket,
            color: "bg-green-500/10 text-green-600",
          },
          {
            label: "Revenue",
            value: formatEGP(revenue),
            icon: Wallet,
            color: "bg-amber-500/10 text-amber-600",
          },
          {
            label: "Duration",
            value: `${duration} min`,
            icon: Clock,
            color: "bg-purple-500/10 text-purple-600",
          },
        ].map((k) => (
          <Card key={k.label} className="shadow-sm">
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <div className={`p-2 rounded-lg shrink-0 ${k.color}`}>
                <k.icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-lg font-bold leading-tight">{k.value}</p>
                <p className="text-xs text-muted-foreground">{k.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Schedule card */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              Schedule
            </CardTitle>
          </CardHeader>
          <CardContent>
            <InfoRow icon={Navigation}   label="Departure"      value={fmtUtcFull(trip.departureTime)} />
            <InfoRow icon={MapPin}       label="Arrival"        value={fmtUtcFull(trip.arrivalTime)} />
            <InfoRow icon={Clock}        label="Duration"       value={`${duration} minutes`} />
            {trip.acceptedAt  && <InfoRow icon={CheckCircle2} label="Accepted"   value={fmtUtcShort(trip.acceptedAt)} />}
            {trip.startedAt   && <InfoRow icon={CheckCircle2} label="Started"    value={fmtUtcShort(trip.startedAt)} />}
            {trip.completedAt && <InfoRow icon={CheckCircle2} label="Completed"  value={fmtUtcShort(trip.completedAt)} />}
            {trip.cancelledAt && <InfoRow icon={XCircle}      label="Cancelled"  value={fmtUtcShort(trip.cancelledAt)} />}
            {trip.cancelReason && <InfoRow icon={AlertCircle} label="Cancel Reason" value={trip.cancelReason} />}
          </CardContent>
        </Card>

        {/* Driver card */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <UserCircle className="h-4 w-4 text-muted-foreground" />
              Driver
            </CardTitle>
          </CardHeader>
          <CardContent>
            {trip.driver ? (
              <>
                <InfoRow
                  icon={UserCircle}
                  label="Name"
                  value={
                    <Link href={`/drivers/${trip.driver.id}`} className="text-primary hover:underline">
                      {trip.driver.name}
                    </Link>
                  }
                />
                <InfoRow icon={Phone} label="Phone" value={trip.driver.phone} />
                <InfoRow
                  icon={Star}
                  label="Rating"
                  value={
                    <div className="flex items-center gap-1">
                      {[1,2,3,4,5].map((i) => (
                        <Star
                          key={i}
                          className={`h-3 w-3 ${i <= Math.round(trip.driver!.rating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
                        />
                      ))}
                      <span className="ml-1 text-sm font-bold">{Number(trip.driver.rating).toFixed(1)}</span>
                    </div>
                  }
                />
                <InfoRow icon={CheckCircle2} label="Status" value={
                  <Badge variant="outline" className="text-xs capitalize">{trip.driver.status}</Badge>
                } />
              </>
            ) : (
              <div className="py-6 text-center text-muted-foreground text-sm">
                <UserCircle className="h-8 w-8 mx-auto mb-2 opacity-20" />
                No driver assigned yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bus card */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Bus className="h-4 w-4 text-muted-foreground" />
              Bus / Vehicle
            </CardTitle>
          </CardHeader>
          <CardContent>
            {trip.bus ? (
              <>
                <InfoRow icon={Building2}    label="Plate Number" value={<span className="font-mono font-semibold">{trip.bus.plateNumber}</span>} />
                <InfoRow icon={Bus}          label="Model"        value={trip.bus.model} />
                <InfoRow icon={Users}        label="Capacity"     value={`${trip.bus.capacity} seats`} />
              </>
            ) : (
              <div className="py-6 text-center text-muted-foreground text-sm">
                <Bus className="h-8 w-8 mx-auto mb-2 opacity-20" />
                No bus assigned yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Route + Stations */}
      {stations.length > 0 && (
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Route className="h-4 w-4 text-muted-foreground" />
              Route: {trip.route?.name ?? "—"} · {trip.route?.fromLocation} → {trip.route?.toLocation}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="text-xs w-12">Stop</TableHead>
                  <TableHead className="text-xs">Station Name</TableHead>
                  <TableHead className="text-xs">Direction</TableHead>
                  <TableHead className="text-xs">Segment Price</TableHead>
                  <TableHead className="text-xs">Progress</TableHead>
                  <TableHead className="text-xs">Arrived At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stations.map((station) => {
                  const sm = STATION_STATUS_META[station.progress?.status ?? "pending"];
                  const Icon = sm.icon;
                  return (
                    <TableRow key={station.id}>
                      <TableCell className="text-xs text-muted-foreground font-mono">#{station.order}</TableCell>
                      <TableCell className="font-medium text-sm">{station.name}</TableCell>
                      <TableCell className="text-xs capitalize text-muted-foreground">{station.direction}</TableCell>
                      <TableCell className="text-sm">
                        {station.segmentPrice != null ? formatEGP(station.segmentPrice) : <span className="text-muted-foreground text-xs">—</span>}
                      </TableCell>
                      <TableCell>
                        <div className={`flex items-center gap-1.5 text-xs font-medium ${sm.cls}`}>
                          <Icon className="h-3.5 w-3.5" />
                          {sm.label}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground tabular-nums">
                        {station.progress?.arrivedAt
                          ? fmtUtcShort(station.progress.arrivedAt)
                          : <span className="italic">Not yet</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Passengers */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            Passengers
            <Badge variant="outline" className="ml-1 text-xs">{trip.totalPassengers}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {trip.passengers.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-20" />
              <p className="text-sm">No bookings yet</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="text-xs">Passenger</TableHead>
                  <TableHead className="text-xs">Phone</TableHead>
                  <TableHead className="text-xs">Email</TableHead>
                  <TableHead className="text-xs text-center">Seats</TableHead>
                  <TableHead className="text-xs">Booking Status</TableHead>
                  <TableHead className="text-xs">Payment</TableHead>
                  <TableHead className="text-xs text-right">Amount</TableHead>
                  <TableHead className="text-xs">Booked At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trip.passengers.map((p) => {
                  const bm = BOOKING_STATUS_META[p.status] ?? { label: p.status, cls: "" };
                  const pm = PAYMENT_META[p.paymentStatus] ?? { label: p.paymentStatus, cls: "text-muted-foreground" };
                  return (
                    <TableRow key={p.bookingId}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <span className="text-xs font-bold text-primary">
                              {p.userName.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="text-sm font-medium leading-tight">
                              <Link href={`/users/${p.userId}`} className="hover:text-primary hover:underline">
                                {p.userName}
                              </Link>
                            </p>
                            <p className="text-[10px] text-muted-foreground">#{p.bookingId}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-mono text-muted-foreground">{p.userPhone}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{p.userEmail}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-xs">{p.seatCount}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${bm.cls}`}>{bm.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className={`flex items-center gap-1 text-xs font-medium ${pm.cls}`}>
                          <CreditCard className="h-3 w-3" />
                          {pm.label}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-medium text-right tabular-nums">
                        {formatEGP(p.totalPrice)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground tabular-nums">
                        {fmtUtcShort(p.createdAt)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
