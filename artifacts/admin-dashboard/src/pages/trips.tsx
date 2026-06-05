import React, { useState, useEffect } from "react";
import { 
  useListTrips, 
  useCreateTrip, 
  useCancelTrip,
  useUpdateTrip,
  useListRoutes,
  useListBuses,
  useListDrivers,
  getListTripsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, Plus, Ban, Filter, Map, Copy, Edit, Repeat, ExternalLink, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { addMinutes } from "date-fns";
import { fmtUtcShort, fmtUtcTime } from "@/lib/utils";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { formatEGP } from "@/lib/currency";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useTranslation } from "react-i18next";
import { adminFetch } from "@/lib/api";

const tripSchema = z.object({
  routeId: z.coerce.number().min(1, "Route is required"),
  busId: z.coerce.number().min(1, "Bus is required"),
  driverId: z.coerce.number().min(1, "Driver is required"),
  departureTime: z.string().min(1, "Departure time is required"),
  arrivalTime: z.string().min(1, "Arrival time is required"),
  price: z.coerce.number().min(0, "Price must be positive"),
  recurringType: z.enum(["one_time", "daily", "weekdays", "weekends", "custom"]).default("one_time"),
  weekdays: z.string().optional(),
  isActive: z.boolean().default(true),
});

type TripFormValues = z.infer<typeof tripSchema>;

function shuttleUiStatus(dbStatus: string): "open" | "active" | "cancelled" | string {
  if (dbStatus === "active" || dbStatus === "waiting_driver") return "active";
  if (dbStatus === "cancelled") return "cancelled";
  if (dbStatus === "scheduled") return "open";
  return dbStatus;
}

function statusBadgeVariant(status: string) {
  const ui = shuttleUiStatus(status);
  switch (ui) {
    case 'open': return 'default';
    case 'active': return 'secondary';
    case 'cancelled': return 'destructive';
    case 'completed': return 'outline';
    default: return 'outline';
  }
}

function TripForm({
  form,
  onSubmit,
  isPending,
  submitLabel,
  routesData,
  busesData,
  driversData,
}: {
  form: any;
  onSubmit: (v: TripFormValues) => void;
  isPending: boolean;
  submitLabel: string;
  routesData: any;
  busesData: any;
  driversData: any;
}) {
  const { t } = useTranslation();
  const watchedRouteId = form.watch("routeId");
  const watchedDeparture = form.watch("departureTime");
  const watchedRecurring = form.watch("recurringType");
  const watchedWeekdays = form.watch("weekdays") ?? "";

  const WEEKDAYS = [
    { value: "1", label: t("trips.mon", "Mon") },
    { value: "2", label: t("trips.tue", "Tue") },
    { value: "3", label: t("trips.wed", "Wed") },
    { value: "4", label: t("trips.thu", "Thu") },
    { value: "5", label: t("trips.fri", "Fri") },
    { value: "6", label: t("trips.sat", "Sat") },
    { value: "0", label: t("trips.sun", "Sun") },
  ];

  useEffect(() => {
    if (!watchedRouteId || !watchedDeparture) return;
    const route = routesData?.data?.find((r: any) => r.id === Number(watchedRouteId));
    if (!route || !route.estimatedDuration) return;
    try {
      const dep = new Date(watchedDeparture);
      if (isNaN(dep.getTime())) return;
      const arrival = addMinutes(dep, route.estimatedDuration);
      const fmt = arrival.toISOString().slice(0, 16);
      form.setValue("arrivalTime", fmt, { shouldValidate: true });
      form.setValue("price", route.basePrice ?? 0, { shouldValidate: true });
    } catch {}
  }, [watchedRouteId, watchedDeparture]);

  const toggleWeekday = (day: string) => {
    const current = watchedWeekdays ? watchedWeekdays.split(",").filter(Boolean) : [];
    const next = current.includes(day) ? current.filter((d: string) => d !== day) : [...current, day];
    form.setValue("weekdays", next.join(","), { shouldValidate: true });
  };

  const selectedDays = watchedWeekdays ? watchedWeekdays.split(",").filter(Boolean) : [];

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="routeId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("nav.routes")}</FormLabel>
              <Select onValueChange={(val) => field.onChange(parseInt(val))} value={field.value ? field.value.toString() : ""}>
                <FormControl>
                  <SelectTrigger><SelectValue placeholder={t("trips.selectRoute", "Select a route")} /></SelectTrigger>
                </FormControl>
                <SelectContent className="max-h-60">
                  {routesData?.data.map((r: any) => (
                    <SelectItem key={r.id} value={r.id.toString()}>
                      {r.name} · {r.estimatedDuration} {t("routes.min", "min")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="busId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("buses.title")}</FormLabel>
                <Select onValueChange={(val) => field.onChange(parseInt(val))} value={field.value ? field.value.toString() : ""}>
                  <FormControl>
                    <SelectTrigger><SelectValue placeholder={t("trips.selectBus", "Select bus")} /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {busesData?.data.map((b: any) => (
                      <SelectItem key={b.id} value={b.id.toString()}>{b.plateNumber} ({b.capacity} {t("buses.seats", "seats")})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="driverId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("drivers.title")}</FormLabel>
                <Select onValueChange={(val) => field.onChange(parseInt(val))} value={field.value ? field.value.toString() : ""}>
                  <FormControl>
                    <SelectTrigger><SelectValue placeholder={t("trips.selectDriver", "Select driver")} /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {driversData?.data.map((d: any) => (
                      <SelectItem key={d.id} value={d.id.toString()}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="departureTime"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("trips.departure")}</FormLabel>
                <FormControl><Input type="datetime-local" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="arrivalTime"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("trips.arrivalAutoCalc", "Arrival (auto-calculated)")}</FormLabel>
                <FormControl><Input type="datetime-local" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="price"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("trips.ticketPriceEGP", "Ticket Price (EGP)")}</FormLabel>
              <FormControl><Input type="number" step="0.01" min={0} placeholder="0.00" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/30">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Repeat className="h-4 w-4 text-muted-foreground" />
            {t("trips.recurringSchedule", "Recurring Schedule")}
          </div>
          <FormField
            control={form.control}
            name="recurringType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("trips.scheduleType", "Schedule Type")}</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="one_time">{t("trips.oneTime", "One-time Trip")}</SelectItem>
                    <SelectItem value="daily">{t("trips.daily", "Daily")}</SelectItem>
                    <SelectItem value="weekdays">{t("trips.weekdays", "Weekdays (Mon–Fri)")}</SelectItem>
                    <SelectItem value="weekends">{t("trips.weekends", "Weekends (Sat–Sun)")}</SelectItem>
                    <SelectItem value="custom">{t("trips.custom", "Custom Days")}</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {watchedRecurring === "custom" && (
            <div className="space-y-2">
              <Label className="text-sm">{t("trips.selectDays", "Select Days")}</Label>
              <div className="flex gap-2 flex-wrap">
                {WEEKDAYS.map((day) => (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => toggleWeekday(day.value)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${
                      selectedDays.includes(day.value)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <FormField
            control={form.control}
            name="isActive"
            render={({ field }) => (
              <FormItem className="flex items-center gap-2 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <FormLabel className="!mt-0 font-normal cursor-pointer">
                  {t("trips.scheduleIsActive", "Schedule is active")}
                </FormLabel>
              </FormItem>
            )}
          />
        </div>

        <DialogFooter>
          <Button type="submit" disabled={isPending}>{submitLabel}</Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

export default function Trips() {
  const [page, setPage] = useState(1);
  const [routeIdFilter, setRouteIdFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editTrip, setEditTrip] = useState<any | null>(null);
  const [deleteTrip, setDeleteTrip] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();

  const statusLabel = (status: string) => {
    const ui = shuttleUiStatus(status);
    if (ui === "open") return t("trips.scheduled", "Open");
    if (ui === "active") return t("trips.enRoute", "Active");
    if (ui === "cancelled") return t("trips.cancelled", "Cancelled");
    const labels: Record<string, string> = {
      completed: t("trips.completed", "Completed"),
      boarding: t("trips.boarding", "Boarding"),
      driver_assigned: t("trips.driverAssigned", "Driver Assigned"),
    };
    return labels[status] ?? status;
  };

  const recurringLabel = (type: string) => {
    const labels: Record<string, string> = {
      one_time: t("trips.oneTime", "One-time"),
      daily: t("trips.daily", "Daily"),
      weekdays: t("trips.weekdaysShort", "Weekdays"),
      weekends: t("trips.weekendsShort", "Weekends"),
      custom: t("trips.custom", "Custom"),
    };
    return labels[type] ?? type;
  };

  const { data: tripsData, isLoading } = useListTrips({
    page,
    limit: 10,
    routeId: routeIdFilter !== "all" ? parseInt(routeIdFilter) : undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    date: dateFilter || undefined,
  });

  const { data: routesData } = useListRoutes({ limit: 200 });
  const { data: busesData } = useListBuses({ limit: 100 });
  const { data: driversData } = useListDrivers({ limit: 100 });

  const createMutation = useCreateTrip();
  const updateMutation = useUpdateTrip();
  const cancelMutation = useCancelTrip();

  const defaultValues: TripFormValues = {
    routeId: 0, busId: 0, driverId: 0,
    departureTime: "", arrivalTime: "", price: 0,
    recurringType: "one_time", weekdays: "", isActive: true,
  };

  const createForm = useForm<TripFormValues>({
    resolver: zodResolver(tripSchema),
    defaultValues,
  });

  const editForm = useForm<TripFormValues>({
    resolver: zodResolver(tripSchema),
    defaultValues,
  });

  const onSubmitCreate = (data: TripFormValues) => {
    createMutation.mutate({ data: data as any }, {
      onSuccess: () => {
        toast({ title: t("trips.tripScheduled", "Trip scheduled") });
        setIsCreateOpen(false);
        createForm.reset(defaultValues);
        queryClient.invalidateQueries({ queryKey: getListTripsQueryKey() });
      },
      onError: () => toast({ title: t("trips.scheduleFailed", "Failed to schedule trip"), variant: "destructive" })
    });
  };

  const onSubmitEdit = (data: TripFormValues) => {
    if (!editTrip) return;
    updateMutation.mutate({ id: editTrip.id, data: data as any }, {
      onSuccess: () => {
        toast({ title: t("trips.tripUpdated", "Trip updated") });
        setEditTrip(null);
        queryClient.invalidateQueries({ queryKey: getListTripsQueryKey() });
      },
      onError: () => toast({ title: t("trips.updateFailed", "Failed to update trip"), variant: "destructive" })
    });
  };

  const handleCancelTrip = (id: number) => {
    if (confirm(t("trips.cancelConfirm", "Cancel this trip? All related bookings will be cancelled and refunded."))) {
      cancelMutation.mutate({ id }, {
        onSuccess: () => {
          toast({ title: t("trips.tripCancelled", "Trip cancelled") });
          queryClient.invalidateQueries({ queryKey: getListTripsQueryKey() });
        }
      });
    }
  };

  const handleDeleteTrip = async () => {
    if (!deleteTrip) return;
    setIsDeleting(true);
    try {
      const res = await adminFetch(`/trips/${deleteTrip.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to delete trip");
      }
      toast({ title: "Trip deleted" });
      setDeleteTrip(null);
      queryClient.invalidateQueries({ queryKey: getListTripsQueryKey() });
    } catch (err: any) {
      toast({ title: err.message || "Failed to delete trip", variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDuplicate = (trip: any) => {
    createForm.reset({
      routeId: trip.routeId,
      busId: trip.busId,
      driverId: trip.driverId,
      departureTime: "",
      arrivalTime: "",
      price: trip.price,
      recurringType: trip.recurringType ?? "one_time",
      weekdays: trip.weekdays ?? "",
      isActive: true,
    });
    setIsCreateOpen(true);
  };

  const handleOpenEdit = (trip: any) => {
    editForm.reset({
      routeId: trip.routeId,
      busId: trip.busId,
      driverId: trip.driverId,
      departureTime: trip.departureTime?.slice(0, 16) ?? "",
      arrivalTime: trip.arrivalTime?.slice(0, 16) ?? "",
      price: trip.price,
      recurringType: trip.recurringType ?? "one_time",
      weekdays: trip.weekdays ?? "",
      isActive: trip.isActive ?? true,
    });
    setEditTrip(trip);
  };

  const clearFilters = () => {
    setRouteIdFilter("all");
    setStatusFilter("all");
    setDateFilter("");
    setPage(1);
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <CalendarClock className="h-7 w-7" />
            {t("trips.title")}
          </h1>
          <p className="text-muted-foreground text-sm">{t("trips.subtitle", "Schedule, manage, and configure recurring shuttle trips.")}</p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> {t("trips.scheduleTrip", "Schedule Trip")}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("trips.scheduleNewTrip", "Schedule New Trip")}</DialogTitle>
              <DialogDescription>{t("trips.scheduleDesc", "Select a route — arrival time and price are auto-filled from route settings.")}</DialogDescription>
            </DialogHeader>
            <TripForm
              form={createForm}
              onSubmit={onSubmitCreate}
              isPending={createMutation.isPending}
              submitLabel={t("trips.scheduleTrip", "Schedule Trip")}
              routesData={routesData}
              busesData={busesData}
              driversData={driversData}
            />
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={!!editTrip} onOpenChange={(open) => !open && setEditTrip(null)}>
        <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("trips.editTrip", "Edit Trip")} #{editTrip?.id}</DialogTitle>
            <DialogDescription>{t("trips.editDesc", "Update trip details, assignment, timing, or recurring settings.")}</DialogDescription>
          </DialogHeader>
          <TripForm
            form={editForm}
            onSubmit={onSubmitEdit}
            isPending={updateMutation.isPending}
            submitLabel={t("common.saveChanges")}
            routesData={routesData}
            busesData={busesData}
            driversData={driversData}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTrip} onOpenChange={(open) => !open && setDeleteTrip(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Delete Trip #{deleteTrip?.id}?</DialogTitle>
            <DialogDescription>
              This will permanently delete the trip and all its bookings. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTrip(null)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteTrip} disabled={isDeleting}>
              {isDeleting ? "Deleting…" : "Delete Trip"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-wrap gap-3 items-center bg-card p-4 rounded-xl border border-border">
        <div className="flex items-center gap-2 mr-1">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{t("trips.filters", "Filters")}:</span>
        </div>
        
        <Select value={routeIdFilter} onValueChange={(val) => { setRouteIdFilter(val); setPage(1); }}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder={t("trips.allRoutes", "All Routes")} />
          </SelectTrigger>
          <SelectContent className="max-h-60">
            <SelectItem value="all">{t("trips.allRoutes", "All Routes")}</SelectItem>
            {routesData?.data.map((r: any) => (
              <SelectItem key={r.id} value={r.id.toString()}>{r.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setPage(1); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder={t("trips.allStatuses", "All Statuses")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("trips.allStatuses", "All Statuses")}</SelectItem>
            <SelectItem value="scheduled">{t("trips.scheduled", "Scheduled")}</SelectItem>
            <SelectItem value="boarding">{t("trips.boarding", "Boarding")}</SelectItem>
            <SelectItem value="active">{t("trips.enRoute", "En Route")}</SelectItem>
            <SelectItem value="completed">{t("trips.completed", "Completed")}</SelectItem>
            <SelectItem value="cancelled">{t("trips.cancelled", "Cancelled")}</SelectItem>
          </SelectContent>
        </Select>

        <Input 
          type="date" 
          value={dateFilter} 
          onChange={(e) => { setDateFilter(e.target.value); setPage(1); }}
          className="w-[150px]"
        />

        {(routeIdFilter !== "all" || statusFilter !== "all" || dateFilter !== "") && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="ml-auto">
            {t("common.clear", "Clear")}
          </Button>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("trips.tripRoute", "Trip / Route")}</TableHead>
              <TableHead>{t("trips.schedule", "Schedule")}</TableHead>
              <TableHead>{t("trips.recurring", "Recurring")}</TableHead>
              <TableHead>{t("trips.seats", "Seats")}</TableHead>
              <TableHead>{t("trips.price", "Price")}</TableHead>
              <TableHead>{t("trips.crewBus", "Crew & Bus")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead className="text-right">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(8)].map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-8 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : tripsData?.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                  {t("trips.noTrips", "No trips found. Schedule one to get started.")}
                </TableCell>
              </TableRow>
            ) : (
              tripsData?.data.map((trip) => (
                <TableRow key={trip.id} className={(trip as any).isActive === false ? "opacity-60" : ""}>
                  <TableCell>
                    <div className="font-medium text-sm">#{trip.id}</div>
                    <div className="flex items-center text-xs text-muted-foreground mt-0.5 gap-1">
                      <Map className="h-3 w-3" />
                      <span className="truncate max-w-[130px]">{(trip as any).route?.name || `${t("routes.title")} #${trip.routeId}`}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">{fmtUtcShort(trip.departureTime)}</div>
                    <div className="text-xs text-muted-foreground">→ {fmtUtcTime(trip.arrivalTime)}</div>
                  </TableCell>
                  <TableCell>
                    {(trip as any).recurringType && (trip as any).recurringType !== "one_time" ? (
                      <Badge variant="secondary" className="text-xs gap-1">
                        <Repeat className="h-3 w-3" />
                        {recurringLabel((trip as any).recurringType)}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t("trips.oneTime", "One-time")}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">{trip.availableSeats}/{trip.totalSeats}</div>
                    <div className="w-16 bg-secondary h-1.5 mt-1 rounded-full overflow-hidden">
                      <div 
                        className="bg-primary h-full rounded-full" 
                        style={{ width: `${((trip.totalSeats - trip.availableSeats) / trip.totalSeats) * 100}%` }}
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-medium">{formatEGP(trip.price)}</span>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <div className="font-medium">{(trip as any).driver?.name || `${t("drivers.title")} #${trip.driverId}`}</div>
                      <div className="text-xs text-muted-foreground">{(trip as any).bus?.plateNumber || `${t("buses.title")} #${trip.busId}`}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(trip.status)}>
                      {statusLabel(trip.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link href={`/trips/${trip.id}`} onClick={(e) => e.stopPropagation()} title="View trip detail">
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                      {shuttleUiStatus(trip.status) === 'open' && (
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => handleOpenEdit(trip)}
                          title={t("trips.editTrip", "Edit trip")}
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => handleDuplicate(trip)}
                        title={t("trips.duplicateTrip", "Duplicate trip")}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      {shuttleUiStatus(trip.status) === 'open' && (
                        <Button 
                          variant="ghost" size="icon"
                          className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => handleCancelTrip(trip.id)}
                          title={t("trips.cancelTrip", "Cancel trip")}
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {shuttleUiStatus(trip.status) !== 'active' && (
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setDeleteTrip(trip)}
                          title="Delete trip"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      
      {tripsData && tripsData.total > tripsData.limit && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious 
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
            <PaginationItem className="text-sm text-muted-foreground px-4">
              {t("common.page", "Page")} {page} {t("common.of", "of")} {Math.ceil(tripsData.total / tripsData.limit)}
            </PaginationItem>
            <PaginationItem>
              <PaginationNext 
                onClick={() => setPage(p => p + 1)}
                className={page >= Math.ceil(tripsData.total / tripsData.limit) ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
