import React, { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { formatEGP } from "@/lib/currency";
import {
  ArrowLeft, MapPin, Clock, Users, Bus, UserCircle, Ban, RefreshCw,
  MessageSquare, Star, CalendarClock, Route, CheckCircle2, XCircle,
  Ticket, Wallet, AlertCircle, Navigation,
} from "lucide-react";
import { useTranslation } from "react-i18next";

// ─── Types ───────────────────────────────────────────────────────────────────

type Trip = {
  id: number;
  routeId: number;
  busId: number;
  driverId: number;
  departureTime: string;
  arrivalTime: string;
  availableSeats: number;
  totalSeats: number;
  price: number;
  status: string;
  isActive: boolean;
  recurringType: string;
  cancelReason: string | null;
  acceptedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type RouteInfo = {
  id: number;
  name: string;
  originName?: string;
  destinationName?: string;
  distanceKm?: number;
  estimatedDurationMin?: number;
};

type DriverInfo = { id: number; name: string; phone: string; rating: number };
type BusInfo = { id: number; plateNumber: string; model: string; capacity: number };

type Booking = {
  id: number;
  userId: number;
  seatCount: number;
  totalPrice: number;
  status: string;
  paymentStatus: string;
  promoCodeId: number | null;
  createdAt: string;
  user?: { id: number; name: string; email: string };
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  scheduled:       "border-blue-200 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200",
  waiting_driver:  "border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-200",
  driver_assigned: "border-indigo-200 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200",
  boarding:        "border-purple-200 bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-200",
  active:          "border-green-200 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-200",
  completed:       "border-slate-200 bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  cancelled:       "border-red-200 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200",
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled", waiting_driver: "Waiting Driver", driver_assigned: "Driver Assigned",
  boarding: "Boarding", active: "Active", completed: "Completed", cancelled: "Cancelled",
};

function TripStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={`capitalize text-xs ${STATUS_STYLES[status] ?? ""}`}>
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border last:border-0">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted mt-0.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="text-sm font-medium mt-0.5">{value ?? <span className="text-muted-foreground italic text-xs">—</span>}</div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TripDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const tripId = parseInt(id || "0", 10);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [refundBookingId, setRefundBookingId] = useState<number | null>(null);

  // ─── Queries ──────────────────────────────────────────────────────────────

  const { data: trip, isLoading: tripLoading } = useQuery<Trip>({
    queryKey: ["trip-detail", tripId],
    queryFn: () => adminFetch<Trip>(`/trips/${tripId}`),
    enabled: !!tripId,
    refetchInterval: 15000,
  });

  const { data: routeInfo } = useQuery<RouteInfo>({
    queryKey: ["route-for-trip", trip?.routeId],
    queryFn: () => adminFetch<RouteInfo>(`/routes/${trip!.routeId}`),
    enabled: !!trip?.routeId,
  });

  const { data: driverInfo } = useQuery<DriverInfo>({
    queryKey: ["driver-for-trip", trip?.driverId],
    queryFn: () => adminFetch<DriverInfo>(`/drivers/${trip!.driverId}`),
    enabled: !!trip?.driverId,
  });

  const { data: busInfo } = useQuery<BusInfo>({
    queryKey: ["bus-for-trip", trip?.busId],
    queryFn: () => adminFetch<BusInfo>(`/buses/${trip!.busId}`),
    enabled: !!trip?.busId,
  });

  const { data: bookingsData, isLoading: bookingsLoading } = useQuery<{ data: Booking[]; total: number }>({
    queryKey: ["trip-bookings", tripId],
    queryFn: () => adminFetch(`/bookings?tripId=${tripId}&limit=50`),
    enabled: !!tripId,
  });

  // ─── Mutations ──────────────────────────────────────────────────────────────

  const cancelMutation = useMutation({
    mutationFn: () =>
      adminFetch(`/admin/trips/${tripId}/cancel`, {
        method: "PATCH",
        body: JSON.stringify({ reason: cancelReason || "Cancelled by admin" }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trip-detail", tripId] });
      toast({ title: "Trip cancelled" });
      setCancelOpen(false);
      setCancelReason("");
    },
    onError: (err: Error) => toast({ title: "Cancel failed", description: err.message, variant: "destructive" }),
  });

  const refundMutation = useMutation({
    mutationFn: (bookingId: number) =>
      adminFetch(`/admin/bookings/${bookingId}/refund`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trip-bookings", tripId] });
      toast({ title: "Refund issued successfully" });
      setRefundBookingId(null);
    },
    onError: (err: Error) => toast({ title: "Refund failed", description: err.message, variant: "destructive" }),
  });

  // ─── Loading / not found ──────────────────────────────────────────────────

  if (tripLoading) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-10 w-80" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-48" /><Skeleton className="h-48" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!trip) {
    return <div className="p-8 text-center text-muted-foreground">{t("tripDetail.notFound")}</div>;
  }

  const bookings = bookingsData?.data ?? [];
  const confirmedBookings = bookings.filter((b) => b.status === "confirmed" || b.status === "completed");
  const filledSeats = trip.totalSeats - trip.availableSeats;
  const fillPct = Math.round((filledSeats / trip.totalSeats) * 100);
  const revenue = confirmedBookings.reduce((s, b) => s + parseFloat(String(b.totalPrice)), 0);
  const canCancel = trip.status === "scheduled" || trip.status === "waiting_driver";
  const duration = Math.round(
    (new Date(trip.arrivalTime).getTime() - new Date(trip.departureTime).getTime()) / 60000
  );

  return (
    <div className="p-8 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link href="/trips"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">Trip #{trip.id}</h1>
            <TripStatusBadge status={trip.status} />
            {!trip.isActive && <Badge variant="secondary" className="text-[10px]">{t("tripDetail.inactive")}</Badge>}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {routeInfo?.name ?? `Route #${trip.routeId}`} · Created {format(parseISO(trip.createdAt), "MMM d, yyyy")}
          </p>
        </div>
        {canCancel && (
          <Button variant="destructive" size="sm" onClick={() => setCancelOpen(true)}>
            <Ban className="h-4 w-4 mr-2" /> {t("tripDetail.cancelTrip")}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => setNoteOpen(true)}>
          <MessageSquare className="h-4 w-4 mr-2" /> {t("tripDetail.addNote")}
        </Button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: t("tripDetail.seatsFilledLabel"), value: `${filledSeats}/${trip.totalSeats} (${fillPct}%)`, icon: Users, color: "bg-blue-500/10 text-blue-600" },
          { label: t("tripDetail.ticketPrice"), value: formatEGP(trip.price), icon: Ticket, color: "bg-green-500/10 text-green-600" },
          { label: t("tripDetail.revenue"), value: formatEGP(revenue), icon: Wallet, color: "bg-amber-500/10 text-amber-600" },
          { label: t("tripDetail.duration"), value: `${duration} min`, icon: Clock, color: "bg-purple-500/10 text-purple-600" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <div className={`p-2 rounded-lg shrink-0 ${s.color}`}><s.icon className="h-4 w-4" /></div>
              <div>
                <p className="text-lg font-bold leading-tight">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Schedule */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><CalendarClock className="h-4 w-4" />{t("tripDetail.cardSchedule")}</CardTitle></CardHeader>
          <CardContent>
            <InfoRow icon={Navigation} label={t("common.departure")} value={format(parseISO(trip.departureTime), "EEE, MMM d yyyy · HH:mm")} />
            <InfoRow icon={MapPin} label={t("common.arrival")} value={format(parseISO(trip.arrivalTime), "EEE, MMM d yyyy · HH:mm")} />
            <InfoRow icon={Clock} label={t("tripDetail.duration")} value={`${duration} minutes`} />
            <InfoRow icon={RefreshCw} label={t("tripDetail.recurring")} value={
              trip.recurringType === "one_time" ? "One-time" :
              trip.recurringType.charAt(0).toUpperCase() + trip.recurringType.slice(1).replace("_", " ")
            } />
            {trip.acceptedAt && <InfoRow icon={CheckCircle2} label="Accepted" value={format(parseISO(trip.acceptedAt), "MMM d · HH:mm")} />}
            {trip.startedAt && <InfoRow icon={CheckCircle2} label="Started" value={format(parseISO(trip.startedAt), "MMM d · HH:mm")} />}
            {trip.completedAt && <InfoRow icon={CheckCircle2} label="Completed" value={format(parseISO(trip.completedAt), "MMM d · HH:mm")} />}
            {trip.cancelledAt && <InfoRow icon={XCircle} label="Cancelled" value={format(parseISO(trip.cancelledAt), "MMM d · HH:mm")} />}
            {trip.cancelReason && <InfoRow icon={AlertCircle} label="Cancel Reason" value={trip.cancelReason} />}
          </CardContent>
        </Card>

        {/* Route */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Route className="h-4 w-4" />{t("tripDetail.cardRoute")}</CardTitle></CardHeader>
          <CardContent>
            <InfoRow icon={MapPin} label={t("tripDetail.route")} value={
              <Link href={`/routes/${trip.routeId}`} className="text-primary hover:underline">
                {routeInfo?.name ?? `Route #${trip.routeId}`}
              </Link>
            } />
            {routeInfo?.originName && <InfoRow icon={Navigation} label={t("tripDetail.origin")} value={routeInfo.originName} />}
            {routeInfo?.destinationName && <InfoRow icon={MapPin} label={t("tripDetail.destination")} value={routeInfo.destinationName} />}
            {routeInfo?.distanceKm && <InfoRow icon={Route} label={t("tripDetail.distance")} value={`${routeInfo.distanceKm} km`} />}
            <InfoRow icon={Bus} label={t("tripDetail.bus")} value={
              busInfo ? `${busInfo.model} · ${busInfo.plateNumber}` : `Bus #${trip.busId}`
            } />
            <InfoRow icon={Users} label={t("tripDetail.capacity")} value={busInfo ? `${busInfo.capacity} seats` : `${trip.totalSeats} seats`} />
          </CardContent>
        </Card>

        {/* Driver */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><UserCircle className="h-4 w-4" />{t("tripDetail.cardDriver")}</CardTitle></CardHeader>
          <CardContent>
            {driverInfo ? (
              <>
                <InfoRow icon={UserCircle} label={t("tripDetail.name")} value={
                  <Link href={`/drivers/${trip.driverId}`} className="text-primary hover:underline">
                    {driverInfo.name}
                  </Link>
                } />
                <InfoRow icon={MessageSquare} label={t("tripDetail.phone")} value={driverInfo.phone} />
                <InfoRow icon={Star} label={t("tripDetail.rating")} value={
                  <div className="flex items-center gap-1">
                    {[1,2,3,4,5].map((i) => (
                      <Star key={i} className={`h-3.5 w-3.5 ${i <= Math.round(driverInfo.rating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
                    ))}
                    <span className="ml-1 text-sm font-bold">{Number(driverInfo.rating).toFixed(1)}</span>
                  </div>
                } />
              </>
            ) : (
              <InfoRow icon={UserCircle} label={t("tripDetail.driverId")} value={`#${trip.driverId}`} />
            )}
            <InfoRow icon={Users} label={t("tripDetail.seatFill")} value={
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{filledSeats} {t("tripDetail.booked")}</span>
                  <span>{trip.availableSeats} {t("tripDetail.seatsAvailable")}</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${fillPct}%` }} />
                </div>
              </div>
            } />
          </CardContent>
        </Card>
      </div>

      {/* Bookings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2"><Ticket className="h-4 w-4" />{t("nav.bookings")} ({bookingsData?.total ?? 0})</span>
            <span className="text-sm font-normal text-muted-foreground">{t("tripDetail.totalRevenue")}: <strong className="text-foreground">{formatEGP(revenue)}</strong></span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("tripDetail.colBookingId")}</TableHead>
                <TableHead>{t("tripDetail.colPassenger")}</TableHead>
                <TableHead>{t("tripDetail.colSeats")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead>{t("tripDetail.colPayment")}</TableHead>
                <TableHead className="text-right">{t("tripDetail.colTotal")}</TableHead>
                <TableHead>{t("tripDetail.colBookedAt")}</TableHead>
                <TableHead className="text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bookingsLoading ? (
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>{[...Array(8)].map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                ))
              ) : !bookings.length ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                    {t("tripDetail.noBookings")}
                  </TableCell>
                </TableRow>
              ) : (
                bookings.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono text-sm">#{b.id}</TableCell>
                    <TableCell>
                      {b.user ? (
                        <Link href={`/users/${b.user.id}`} className="hover:underline text-primary text-sm font-medium">
                          {b.user.name}
                        </Link>
                      ) : (
                        <span className="text-sm text-muted-foreground">User #{b.userId}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{b.seatCount}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`capitalize text-[10px] ${
                        b.status === "confirmed" || b.status === "completed" ? "text-green-600 border-green-200 bg-green-50 dark:bg-green-950" :
                        b.status === "cancelled" ? "text-red-500 border-red-200 bg-red-50 dark:bg-red-950" : ""
                      }`}>{b.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize text-[10px]">{b.paymentStatus}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">{formatEGP(parseFloat(String(b.totalPrice)))}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{format(parseISO(b.createdAt), "MMM d, HH:mm")}</TableCell>
                    <TableCell className="text-right">
                      {(b.status === "confirmed" || b.status === "completed") && b.paymentStatus !== "refunded" && (
                        <Button
                          variant="ghost" size="sm"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive h-7 text-xs px-2"
                          onClick={() => setRefundBookingId(b.id)}
                        >
                          <Wallet className="h-3 w-3 mr-1" /> {t("tripDetail.refund")}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Cancel Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-destructive"><Ban className="h-5 w-5" />{t("tripDetail.cancelTrip")} #{trip.id}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This will cancel the trip for <strong>{filledSeats}</strong> booked passengers.
            </p>
            <div>
              <label className="text-sm font-medium mb-1.5 block">{t("tripDetail.cancelReason")}</label>
              <Input
                placeholder={t("tripDetail.cancelReasonPlaceholder")}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>{t("tripDetail.keepTrip")}</Button>
            <Button
              variant="destructive"
              disabled={cancelMutation.isPending}
              onClick={() => cancelMutation.mutate()}
            >
              <Ban className="h-4 w-4 mr-2" /> {t("tripDetail.confirmCancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Refund Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={refundBookingId !== null} onOpenChange={(o) => !o && setRefundBookingId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("tripDetail.refundBooking")} #{refundBookingId}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will issue a wallet refund to the passenger for booking #{refundBookingId}.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundBookingId(null)}>{t("common.cancel")}</Button>
            <Button
              disabled={refundMutation.isPending}
              onClick={() => refundBookingId && refundMutation.mutate(refundBookingId)}
            >
              <Wallet className="h-4 w-4 mr-2" /> {t("tripDetail.issueRefund")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Note Dialog ────────────────────────────────────────────────── */}
      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("tripDetail.addNoteTitle")} #{trip.id}</DialogTitle></DialogHeader>
          <Textarea
            placeholder={t("tripDetail.notePlaceholder")}
            className="min-h-[120px]"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={() => { toast({ title: t("tripDetail.noteSaved") }); setNoteOpen(false); setNoteText(""); }}>
              {t("tripDetail.saveNote")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
