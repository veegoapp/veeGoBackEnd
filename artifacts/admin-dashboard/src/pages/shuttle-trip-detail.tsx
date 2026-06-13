import React from "react";
import { useTranslation } from "react-i18next";
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

const STATUS_META: Record<string, { key: string; cls: string }> = {
  scheduled:       { key: "common.pending",    cls: "border-blue-200 bg-blue-50 text-blue-700" },
  waiting_driver:  { key: "common.active",     cls: "border-green-200 bg-green-50 text-green-700" },
  driver_assigned: { key: "trips.driverAssigned", cls: "border-indigo-200 bg-indigo-50 text-indigo-700" },
  boarding:        { key: "common.boarded",    cls: "border-purple-200 bg-purple-50 text-purple-700" },
  active:          { key: "common.active",     cls: "border-green-200 bg-green-50 text-green-700" },
  completed:       { key: "common.completed",  cls: "border-slate-200 bg-slate-50 text-slate-600" },
  cancelled:       { key: "common.cancelled",  cls: "border-red-200 bg-red-50 text-red-700" },
};

const BOOKING_STATUS_META: Record<string, { key: string; cls: string }> = {
  pending:    { key: "common.pending",   cls: "border-amber-200 bg-amber-50 text-amber-700" },
  confirmed:  { key: "common.confirmed", cls: "border-blue-200 bg-blue-50 text-blue-700" },
  boarded:    { key: "common.boarded",   cls: "border-green-200 bg-green-50 text-green-700" },
  absent:     { key: "common.absent",    cls: "border-orange-200 bg-orange-50 text-orange-700" },
  completed:  { key: "common.completed", cls: "border-slate-200 bg-slate-50 text-slate-600" },
  cancelled:  { key: "common.cancelled", cls: "border-red-200 bg-red-50 text-red-700" },
};

const PAYMENT_META: Record<string, { key: string; cls: string }> = {
  pending:    { key: "common.pending", cls: "text-amber-600" },
  paid:       { key: "common.paid",    cls: "text-green-600" },
  refunded:   { key: "common.refunded", cls: "text-blue-600" },
  failed:     { key: "common.failed",  cls: "text-red-600" },
};

const STATION_STATUS_META: Record<string, { key: string; icon: React.ElementType; cls: string }> = {
  pending:   { key: "common.pending",   icon: Clock,          cls: "text-muted-foreground" },
  arrived:   { key: "dashboard.boarding", icon: CheckCircle2,   cls: "text-amber-600" },
  completed: { key: "common.completed", icon: CheckCircle2,   cls: "text-green-600" },
};

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const m = STATUS_META[status] ?? { key: status, cls: "" };
  return <Badge variant="outline" className={`text-xs font-medium ${m.cls}`}>{t(m.key)}</Badge>;
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
  const { t } = useTranslation();
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
      toast({ title: t("shuttleTripDetail.tripCancelled") });
    },
    onError: (err: Error) =>
      toast({ title: t("shuttleTripDetail.cancelFailed"), description: err.message, variant: "destructive" }),
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
        <p className="font-medium">{t("shuttleTripDetail.notFound")}</p>
        <Link href="/shuttle-trips">
          <Button variant="outline" size="sm" className="mt-4 gap-2">
            <ArrowLeft className="h-4 w-4" /> {t("common.previous")}
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
            <h1 className="text-2xl font-bold">{t("shuttleTripDetail.title")} #{trip.id}</h1>
            <StatusBadge status={trip.status} />
            {trip.scheduleId && (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                {t("trips.schedule")} #{trip.scheduleId}
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
              if (confirm(t("shuttleTripDetail.cancelConfirm"))) {
                cancelMutation.mutate();
              }
            }}
          >
            <Ban className="h-4 w-4" />
            {cancelMutation.isPending ? t("common.processing") : t("shuttleTripDetail.cancelTrip")}
          </Button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: t("shuttleTripDetail.seatFill"),
            value: `${trip.bookedSeats}/${trip.totalSeats} (${fillPct}%)`,
            icon: Users,
            color: "bg-blue-500/10 text-blue-600",
          },
          {
            label: t("common.price"),
            value: formatEGP(trip.price),
            icon: Ticket,
            color: "bg-green-500/10 text-green-600",
          },
          {
            label: t("shuttleTripDetail.revenue"),
            value: formatEGP(revenue),
            icon: Wallet,
            color: "bg-amber-500/10 text-amber-600",
          },
          {
            label: t("routes.duration"),
            value: `${duration} ${t("routes.min")}`,
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
              {t("trips.schedule")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <InfoRow icon={Navigation}   label={t("common.departure")}      value={fmtUtcFull(trip.departureTime)} />
            <InfoRow icon={MapPin}       label={t("common.arrival")}        value={fmtUtcFull(trip.arrivalTime)} />
            <InfoRow icon={Clock}        label={t("routes.duration")}       value={`${duration} ${t("routes.minutes")}`} />
            {trip.acceptedAt  && <InfoRow icon={CheckCircle2} label={t("common.confirmed")}   value={fmtUtcShort(trip.acceptedAt)} />}
            {trip.startedAt   && <InfoRow icon={CheckCircle2} label={t("common.active")}    value={fmtUtcShort(trip.startedAt)} />}
            {trip.completedAt && <InfoRow icon={CheckCircle2} label={t("common.completed")}  value={fmtUtcShort(trip.completedAt)} />}
            {trip.cancelledAt && <InfoRow icon={XCircle}      label={t("common.cancelled")}  value={fmtUtcShort(trip.cancelledAt)} />}
            {trip.cancelReason && <InfoRow icon={AlertCircle} label={t("common.description")} value={trip.cancelReason} />}
          </CardContent>
        </Card>

        {/* Driver card */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <UserCircle className="h-4 w-4 text-muted-foreground" />
              {t("common.driver")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {trip.driver ? (
              <>
                <InfoRow
                  icon={UserCircle}
                  label={t("common.name")}
                  value={
                    <Link href={`/drivers/${trip.driver.id}`} className="text-primary hover:underline">
                      {trip.driver.name}
                    </Link>
                  }
                />
                <InfoRow icon={Phone} label={t("common.phone")} value={trip.driver.phone} />
                <InfoRow
                  icon={Star}
                  label={t("common.rating")}
                  value={
                    <div className="flex items-center gap-1">
                      {[1,2,3,4,5].map((i) => (
                        <Star
                          key={i}
                          className={`h-3 w-3 ${i <= Math.round(trip.driver!.rating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
                        />
                      ))}
                      <span className="ms-1 text-sm font-bold">{Number(trip.driver.rating).toFixed(1)}</span>
                    </div>
                  }
                />
                <InfoRow icon={CheckCircle2} label={t("common.status")} value={
                  <Badge variant="outline" className="text-xs capitalize">{trip.driver.status}</Badge>
                } />
              </>
            ) : (
              <div className="py-6 text-center text-muted-foreground text-sm">
                <UserCircle className="h-8 w-8 mx-auto mb-2 opacity-20" />
                {t("shuttleTripDetail.noBookings")}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bus card */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Bus className="h-4 w-4 text-muted-foreground" />
              {t("buses.title")} / {t("nav.vehicles")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {trip.bus ? (
              <>
                <InfoRow icon={Building2}    label={t("buses.plate")} value={<span className="font-mono font-semibold">{trip.bus.plateNumber}</span>} />
                <InfoRow icon={Bus}          label={t("buses.model")}        value={trip.bus.model} />
                <InfoRow icon={Users}        label={t("common.capacity")}     value={`${trip.bus.capacity} ${t("buses.seats")}`} />
              </>
            ) : (
              <div className="py-6 text-center text-muted-foreground text-sm">
                <Bus className="h-8 w-8 mx-auto mb-2 opacity-20" />
                {t("shuttleTripDetail.noBookings")}
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
              {t("common.route")}: {trip.route?.name ?? "—"} · {trip.route?.fromLocation} → {trip.route?.toLocation}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="text-xs w-12">{t("routes.path")}</TableHead>
                  <TableHead className="text-xs">{t("dashboard.stations")}</TableHead>
                  <TableHead className="text-xs">{t("common.type")}</TableHead>
                  <TableHead className="text-xs">{t("routes.basePrice")}</TableHead>
                  <TableHead className="text-xs">{t("common.status")}</TableHead>
                  <TableHead className="text-xs">{t("common.arrival")}</TableHead>
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
                          {t(sm.key)}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground tabular-nums">
                        {station.progress?.arrivedAt
                          ? fmtUtcShort(station.progress.arrivedAt)
                          : <span className="italic">{t("common.noData")}</span>}
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
            {t("nav.passengers")}
            <Badge variant="outline" className="ms-1 text-xs">{trip.totalPassengers}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {trip.passengers.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-20" />
              <p className="text-sm">{t("shuttleTripDetail.noBookings")}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="text-xs">{t("shuttleTripDetail.colPassenger")}</TableHead>
                  <TableHead className="text-xs">{t("common.phone")}</TableHead>
                  <TableHead className="text-xs">{t("common.email")}</TableHead>
                  <TableHead className="text-xs text-center">{t("shuttleTripDetail.colSeats")}</TableHead>
                  <TableHead className="text-xs">{t("shuttleTripDetail.colStatus")}</TableHead>
                  <TableHead className="text-xs">{t("shuttleTripDetail.colPayment")}</TableHead>
                  <TableHead className="text-xs text-end">{t("common.amount")}</TableHead>
                  <TableHead className="text-xs">{t("common.createdAt")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trip.passengers.map((p) => {
                  const bm = BOOKING_STATUS_META[p.status] ?? { key: p.status, cls: "" };
                  const pm = PAYMENT_META[p.paymentStatus] ?? { key: p.paymentStatus, cls: "text-muted-foreground" };
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
                        <Badge variant="outline" className={`text-xs ${bm.cls}`}>{t(bm.key)}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className={`flex items-center gap-1 text-xs font-medium ${pm.cls}`}>
                          <CreditCard className="h-3 w-3" />
                          {t(pm.key)}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-medium text-end tabular-nums">
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
