import React, { useState, useEffect } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import { useParams, Link } from "wouter";
import {
  useGetRoute,
  useGetRouteStations,
  useAddStation,
  useUpdateStation,
  useDeleteStation,
  useUpdateRoute,
  useListTrips,
  useListDrivers,
  useListBuses,
  useCancelTrip,
  useCreateTrip,
  useUpdateTrip,
  getGetRouteQueryKey,
  getGetRouteStationsQueryKey,
  getListTripsQueryKey,
  getListDriversQueryKey,
  getListBusesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { adminFetch } from "@/lib/api";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { addMinutes } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft, Plus, MapPin, Trash2, ArrowUp, ArrowDown, Edit,
  Clock, Banknote, Navigation, CalendarClock, UserCircle, Bus,
  TrendingUp, BarChart3, CheckCircle2, XCircle, AlertCircle,
  Repeat, Minus, ArrowRight, Users, Copy, Ban, RefreshCw, Download,
  MoveRight, MoveLeft,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { exportCSV, exportExcel, todayStr } from "@/lib/export";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { formatEGP } from "@/lib/currency";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartTooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from "recharts";
import { useTranslation } from "react-i18next";

const stationSchema = z.object({
  name: z.string().min(1, "Name is required"),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  order: z.coerce.number().int().min(0),
  segmentPrice: z.coerce.number().min(0).optional().nullable(),
});
type StationFormValues = z.infer<typeof stationSchema>;

const tripSchema = z.object({
  busId: z.coerce.number().min(1, "Bus is required"),
  driverId: z.coerce.number().min(1, "Driver is required"),
  departureTime: z.string().min(1, "Departure time is required"),
  arrivalTime: z.string().min(1, "Arrival time is required"),
  price: z.coerce.number().min(0, "Price must be non-negative"),
  recurringType: z.enum(["one_time", "daily", "weekdays", "weekends", "custom"]).default("one_time"),
  weekdays: z.string().optional(),
  isActive: z.boolean().default(true),
});
type TripFormValues = z.infer<typeof tripSchema>;

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-800",
  waiting_driver: "bg-yellow-100 text-yellow-800",
  driver_assigned: "bg-orange-100 text-orange-800",
  boarding: "bg-purple-100 text-purple-800",
  active: "bg-green-100 text-green-800",
  completed: "bg-gray-100 text-gray-700",
  cancelled: "bg-red-100 text-red-800",
};

const CHART_COLORS = ["#3b82f6", "#22c55e", "#6b7280", "#ef4444", "#f59e0b", "#a855f7", "#f97316"];

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={`${STATUS_COLORS[status] ?? "bg-gray-100 text-gray-700"} border-transparent text-xs capitalize`}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

function KPICard({ label, value, sub, icon: Icon, color = "text-primary" }: {
  label: string; value: string | number; sub?: string; icon: React.ElementType; color?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className={`h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center ${color}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function createNumberedIcon(num: number, color = "#3b82f6") {
  return L.divIcon({
    html: `<div style="background:${color};color:white;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid white;box-shadow:0 1px 5px rgba(0,0,0,0.35)">${num}</div>`,
    className: "",
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function MapFitter({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  const key = positions.map(p => p.join(",")).join("|");
  useEffect(() => {
    if (positions.length === 1) {
      map.setView(positions[0], 13);
    } else if (positions.length > 1) {
      map.fitBounds(positions as any, { padding: [40, 40] });
    }
  }, [key]);
  return null;
}

function StationMap({ stations, color = "#3b82f6" }: { stations: any[]; color?: string }) {
  const valid = stations.filter(s => s.latitude != null && s.longitude != null);
  const center: [number, number] = valid.length > 0
    ? [valid[0].latitude, valid[0].longitude]
    : [30.0444, 31.2357];
  const positions: [number, number][] = valid.map(s => [s.latitude, s.longitude]);

  return (
    <div className="h-72 rounded-lg overflow-hidden border border-border">
      <MapContainer center={center} zoom={11} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {valid.map((station, idx) => (
          <Marker key={station.id} position={[station.latitude, station.longitude]} icon={createNumberedIcon(idx + 1, color)}>
            <Popup>
              <div className="text-xs">
                <div className="font-semibold">{idx + 1}. {station.name}</div>
                <div className="text-muted-foreground">{station.latitude.toFixed(5)}, {station.longitude.toFixed(5)}</div>
                {station.segmentPrice != null && idx < valid.length - 1 && (
                  <div className="mt-1">Next segment: <span className="font-medium">{formatEGP(station.segmentPrice)}</span></div>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
        {positions.length > 1 && (
          <Polyline positions={positions} color={color} weight={3} dashArray={undefined} />
        )}
        {valid.length > 0 && <MapFitter positions={positions} />}
      </MapContainer>
    </div>
  );
}

function TripForm({
  form,
  onSubmit,
  isPending,
  submitLabel,
  route,
  allBuses,
  allDrivers,
}: {
  form: any;
  onSubmit: (v: TripFormValues) => void;
  isPending: boolean;
  submitLabel: string;
  route: any;
  allBuses: any[];
  allDrivers: any[];
}) {
  const { t } = useTranslation();
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
    if (!watchedDeparture || !route?.estimatedDuration) return;
    try {
      const dep = new Date(watchedDeparture);
      if (isNaN(dep.getTime())) return;
      const arrival = addMinutes(dep, route.estimatedDuration);
      form.setValue("arrivalTime", arrival.toISOString().slice(0, 16), { shouldValidate: true });
    } catch {}
  }, [watchedDeparture, route]);

  const toggleWeekday = (day: string) => {
    const current = watchedWeekdays ? watchedWeekdays.split(",").filter(Boolean) : [];
    const next = current.includes(day) ? current.filter((d: string) => d !== day) : [...current, day];
    form.setValue("weekdays", next.join(","), { shouldValidate: true });
  };
  const selectedDays = watchedWeekdays ? watchedWeekdays.split(",").filter(Boolean) : [];

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField control={form.control} name="busId" render={({ field }) => (
            <FormItem>
              <FormLabel>{t("buses.title")}</FormLabel>
              <Select onValueChange={(val) => field.onChange(parseInt(val))} value={field.value ? field.value.toString() : ""}>
                <FormControl><SelectTrigger><SelectValue placeholder={t("trips.selectBus", "Select bus")} /></SelectTrigger></FormControl>
                <SelectContent>
                  {allBuses.map((b: any) => (
                    <SelectItem key={b.id} value={b.id.toString()}>{b.plateNumber} ({b.capacity} {t("buses.seats", "seats")})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="driverId" render={({ field }) => (
            <FormItem>
              <FormLabel>{t("drivers.title")}</FormLabel>
              <Select onValueChange={(val) => field.onChange(parseInt(val))} value={field.value ? field.value.toString() : ""}>
                <FormControl><SelectTrigger><SelectValue placeholder={t("trips.selectDriver", "Select driver")} /></SelectTrigger></FormControl>
                <SelectContent>
                  {allDrivers.map((d: any) => (
                    <SelectItem key={d.id} value={d.id.toString()}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField control={form.control} name="departureTime" render={({ field }) => (
            <FormItem>
              <FormLabel>{t("trips.departure")}</FormLabel>
              <FormControl><Input type="datetime-local" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="arrivalTime" render={({ field }) => (
            <FormItem>
              <FormLabel>{t("trips.arrival")} <span className="text-muted-foreground font-normal">({t("routeDetail.auto", "auto")})</span></FormLabel>
              <FormControl><Input type="datetime-local" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        <FormField control={form.control} name="price" render={({ field }) => (
          <FormItem>
            <FormLabel>{t("trips.ticketPriceEGP", "Ticket Price (EGP)")}</FormLabel>
            <FormControl><Input type="number" step="0.01" min={0} placeholder="0.00" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/30">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Repeat className="h-4 w-4 text-muted-foreground" />
            {t("trips.recurringSchedule", "Recurring Schedule")}
          </div>
          <FormField control={form.control} name="recurringType" render={({ field }) => (
            <FormItem>
              <FormLabel>{t("trips.scheduleType", "Schedule Type")}</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
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
          )} />

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

          <FormField control={form.control} name="isActive" render={({ field }) => (
            <FormItem className="flex items-center gap-2 space-y-0">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <FormLabel className="!mt-0 font-normal cursor-pointer">{t("trips.scheduleIsActive", "Schedule is active")}</FormLabel>
            </FormItem>
          )} />
        </div>

        <DialogFooter>
          <Button type="submit" disabled={isPending}>{submitLabel}</Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function OverviewTab({ route, trips, stations }: { route: any; trips: any[]; stations: any[] }) {
  const { t } = useTranslation();
  const scheduled = trips.filter(t => t.status === "scheduled").length;
  const active = trips.filter(t => t.status === "active").length;
  const completed = trips.filter(t => t.status === "completed").length;
  const cancelled = trips.filter(t => t.status === "cancelled").length;
  const totalSeats = trips.reduce((sum, t) => sum + (t.totalSeats ?? 0), 0);
  const bookedSeats = trips.reduce((sum, t) => sum + ((t.totalSeats ?? 0) - (t.availableSeats ?? 0)), 0);
  const occupancy = totalSeats > 0 ? Math.round((bookedSeats / totalSeats) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <KPICard label={t("routeDetail.totalTrips", "Total Trips")} value={trips.length} sub={t("routeDetail.allTime", "all time")} icon={CalendarClock} />
        <KPICard label={t("trips.scheduled", "Scheduled")} value={scheduled} sub={t("routeDetail.upcoming", "upcoming")} icon={Clock} color="text-blue-600" />
        <KPICard label={t("trips.completed", "Completed")} value={completed} sub={t("routeDetail.finished", "finished")} icon={CheckCircle2} color="text-green-600" />
        <KPICard label={t("trips.cancelled", "Cancelled")} value={cancelled} sub={t("routeDetail.aborted", "aborted")} icon={XCircle} color="text-red-600" />
        <KPICard label={t("routeDetail.activeNow", "Active Now")} value={active} sub={t("routeDetail.inTransit", "in transit")} icon={Navigation} color="text-purple-600" />
        <KPICard label={t("routeDetail.totalStops", "Total Stops")} value={stations.length} sub={t("routeDetail.alongRoute", "along route")} icon={MapPin} />
        <KPICard label={t("routeDetail.bookedSeats", "Booked Seats")} value={bookedSeats} sub={`${t("routeDetail.of", "of")} ${totalSeats} ${t("routeDetail.total", "total")}`} icon={Users} color="text-orange-600" />
        <KPICard label={t("routeDetail.occupancyRate", "Occupancy Rate")} value={`${occupancy}%`} sub={t("routeDetail.acrossAllTrips", "across all trips")} icon={TrendingUp} color="text-indigo-600" />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("routeDetail.routeDetails", "Route Details")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: t("routeDetail.origin", "Origin"), value: route.fromLocation, icon: MapPin },
              { label: t("routeDetail.destination", "Destination"), value: route.toLocation, icon: MapPin },
              { label: t("routeDetail.estDuration", "Est. Duration"), value: `${route.estimatedDuration} ${t("routes.minutes", "minutes")}`, icon: Clock },
              { label: t("routes.basePrice"), value: formatEGP(route.basePrice), icon: Banknote },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Icon className="h-3.5 w-3.5" />{label}
                </div>
                <span className="text-sm font-medium">{value}</span>
              </div>
            ))}
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">{t("common.status")}</span>
              <Badge variant="outline" className={route.isActive ? "bg-green-100 text-green-800 border-transparent" : "text-muted-foreground"}>
                {route.isActive ? t("common.active") : t("common.inactive")}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("routeDetail.occupancyOverview", "Occupancy Overview")}</CardTitle>
            <CardDescription>{t("routeDetail.seatUtilization", "Seat utilization across all trips")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("routeDetail.booked", "Booked")}</span>
                <span className="font-medium">{occupancy}%</span>
              </div>
              <Progress value={occupancy} className="h-2" />
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              {[
                { label: t("trips.scheduled", "Scheduled"), count: scheduled, color: "bg-blue-500" },
                { label: t("common.active"), count: active, color: "bg-green-500" },
                { label: t("trips.completed", "Completed"), count: completed, color: "bg-gray-400" },
                { label: t("trips.cancelled", "Cancelled"), count: cancelled, color: "bg-red-500" },
              ].map(({ label, count, color }) => (
                <div key={label} className="flex items-center gap-2">
                  <div className={`h-2.5 w-2.5 rounded-full ${color}`} />
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <span className="text-sm font-semibold ml-auto">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StationFields({ form, showSegmentPrice = true }: { form: any; showSegmentPrice?: boolean }) {
  const { t } = useTranslation();
  return (
    <>
      <FormField control={form.control} name="name" render={({ field }) => (
        <FormItem><FormLabel>{t("routeDetail.stationName", "Station Name")}</FormLabel><FormControl><Input placeholder={t("routeDetail.stationPlaceholder", "e.g. Ramses Square")} {...field} /></FormControl><FormMessage /></FormItem>
      )} />
      <div className="grid grid-cols-2 gap-4">
        <FormField control={form.control} name="latitude" render={({ field }) => (
          <FormItem><FormLabel>{t("routeDetail.latitude", "Latitude")}</FormLabel><FormControl><Input type="number" step="any" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="longitude" render={({ field }) => (
          <FormItem><FormLabel>{t("routeDetail.longitude", "Longitude")}</FormLabel><FormControl><Input type="number" step="any" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
      </div>
      <FormField control={form.control} name="order" render={({ field }) => (
        <FormItem><FormLabel>{t("routeDetail.stopOrder", "Stop Order")}</FormLabel><FormControl><Input type="number" min={0} {...field} /></FormControl><FormMessage /></FormItem>
      )} />
      {showSegmentPrice && (
        <FormField control={form.control} name="segmentPrice" render={({ field }) => (
          <FormItem>
            <FormLabel>{t("routeDetail.segmentPrice", "Segment Price to Next Stop (EGP)")}</FormLabel>
            <FormControl>
              <Input
                type="number"
                step="0.01"
                min={0}
                placeholder={t("routeDetail.segmentPricePlaceholder", "Leave blank to use route base price")}
                value={field.value ?? ""}
                onChange={e => field.onChange(e.target.value === "" ? null : parseFloat(e.target.value))}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
      )}
    </>
  );
}

function DirectionTab({
  direction,
  routeId,
  allStations,
  isLoading,
  queryClient,
  toast,
  trips,
  route,
  allDrivers,
  allBuses,
}: {
  direction: "outbound" | "return";
  routeId: number;
  allStations: any[];
  isLoading: boolean;
  queryClient: any;
  toast: any;
  trips: any[];
  route: any;
  allDrivers: any[];
  allBuses: any[];
}) {
  const { t } = useTranslation();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editStation, setEditStation] = useState<any | null>(null);
  const [isCreateTripOpen, setIsCreateTripOpen] = useState(false);

  const addStationMutation = useAddStation();
  const updateStationMutation = useUpdateStation();
  const deleteStationMutation = useDeleteStation();
  const createMutation = useCreateTrip();
  const cancelMutation = useCancelTrip();

  const mapColor = direction === "outbound" ? "#3b82f6" : "#8b5cf6";

  const stations = [...allStations]
    .filter(s => (s.direction ?? "outbound") === direction)
    .sort((a, b) => a.order - b.order);

  const nextOrder = stations.length > 0 ? Math.max(...stations.map(s => s.order)) + 1 : 1;

  const addForm = useForm<StationFormValues>({
    resolver: zodResolver(stationSchema),
    defaultValues: { name: "", latitude: 30.0444, longitude: 31.2357, order: nextOrder, segmentPrice: null },
  });
  const editForm = useForm<StationFormValues>({
    resolver: zodResolver(stationSchema),
    defaultValues: { name: "", latitude: 0, longitude: 0, order: 0, segmentPrice: null },
  });

  const tripDefaultValues: TripFormValues = {
    busId: 0, driverId: 0, departureTime: "", arrivalTime: "",
    price: route?.basePrice ?? 0, recurringType: "one_time", weekdays: "", isActive: true,
  };
  const tripForm = useForm<TripFormValues>({ resolver: zodResolver(tripSchema), defaultValues: tripDefaultValues });

  const invalidateStations = () => queryClient.invalidateQueries({ queryKey: getGetRouteStationsQueryKey(routeId) });
  const invalidateTrips = () => queryClient.invalidateQueries({ queryKey: getListTripsQueryKey() });

  const onAdd = (data: StationFormValues) => {
    addStationMutation.mutate({ id: routeId, data: { ...data, direction } as any }, {
      onSuccess: () => {
        toast({ title: t("routeDetail.stationAdded", "Station added") });
        setIsAddOpen(false);
        addForm.reset({ name: "", latitude: 30.0444, longitude: 31.2357, order: stations.length + 1, segmentPrice: null });
        invalidateStations();
      },
      onError: () => toast({ title: t("routeDetail.failedAddStation", "Failed to add station"), variant: "destructive" }),
    });
  };

  const onEdit = (data: StationFormValues) => {
    if (!editStation) return;
    updateStationMutation.mutate({ id: routeId, stationId: editStation.id, data: { ...data, direction } as any }, {
      onSuccess: () => { toast({ title: t("routeDetail.stationUpdated", "Station updated") }); setEditStation(null); invalidateStations(); },
      onError: () => toast({ title: t("routeDetail.failedUpdateStation", "Failed to update station"), variant: "destructive" }),
    });
  };

  const handleDelete = (stationId: number) => {
    if (confirm(t("routeDetail.removeStationConfirm", "Remove this station from the route?"))) {
      deleteStationMutation.mutate({ id: routeId, stationId }, {
        onSuccess: () => { toast({ title: t("routeDetail.stationRemoved", "Station removed") }); invalidateStations(); },
      });
    }
  };

  const handleReorder = (station: any, dir: "up" | "down") => {
    updateStationMutation.mutate(
      { id: routeId, stationId: station.id, data: { order: dir === "up" ? station.order - 1 : station.order + 1 } as any },
      { onSuccess: invalidateStations }
    );
  };

  const onCreateTrip = (data: TripFormValues) => {
    createMutation.mutate({ data: { ...data, routeId } as any }, {
      onSuccess: () => {
        toast({ title: t("trips.tripScheduled", "Trip scheduled successfully") });
        setIsCreateTripOpen(false);
        tripForm.reset(tripDefaultValues);
        invalidateTrips();
      },
      onError: () => toast({ title: t("trips.scheduleFailed", "Failed to schedule trip"), variant: "destructive" }),
    });
  };

  const handleCancelTrip = (tripId: number) => {
    if (confirm(t("trips.cancelConfirm", "Cancel this trip? All related bookings will be cancelled and refunded."))) {
      cancelMutation.mutate({ id: tripId }, {
        onSuccess: () => { toast({ title: t("trips.tripCancelled", "Trip cancelled") }); invalidateTrips(); },
        onError: () => toast({ title: t("trips.cancelFailed", "Failed to cancel trip"), variant: "destructive" }),
      });
    }
  };

  const recurringTrips = trips.filter(t => t.recurringType !== "one_time");
  const timeSlots = React.useMemo(() => {
    const map = new Map<string, any[]>();
    for (const trip of recurringTrips) {
      const dt = new Date(trip.departureTime);
      const key = `${String(dt.getUTCHours()).padStart(2, "0")}:${String(dt.getUTCMinutes()).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(trip);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [recurringTrips]);

  const driverMap = Object.fromEntries(allDrivers.map(d => [d.id, d.name]));
  const busMap = Object.fromEntries(allBuses.map(b => [b.id, b.plateNumber]));

  const isOutbound = direction === "outbound";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        {isOutbound
          ? <MoveRight className="h-5 w-5 text-blue-600" />
          : <MoveLeft className="h-5 w-5 text-violet-600" />}
        <div>
          <h3 className="font-semibold">
            {isOutbound
              ? `${route?.fromLocation ?? "Origin"} → ${route?.toLocation ?? "Destination"}`
              : `${route?.toLocation ?? "Destination"} → ${route?.fromLocation ?? "Origin"}`}
          </h3>
          <p className="text-sm text-muted-foreground">
            {stations.length} {t("routeDetail.stops", "stop(s)")} · {isOutbound ? t("routeDetail.outboundDesc", "Going direction") : t("routeDetail.returnDesc", "Return direction")}
          </p>
        </div>
      </div>

      <StationMap stations={stations} color={mapColor} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">{t("routeDetail.stopsAndPricing", "Stops & Segment Pricing")}</CardTitle>
            <CardDescription>
              {t("routeDetail.stopsDesc", "Station order, coordinates, and price per segment to the next stop")}
            </CardDescription>
          </div>
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="mr-2 h-4 w-4" />{t("routeDetail.addStation", "Add Station")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("routeDetail.addNewStation", "Add New Station")}</DialogTitle>
                <DialogDescription>
                  {isOutbound
                    ? t("routeDetail.addOutboundStationDesc", "Add a stop to the outbound (going) direction.")
                    : t("routeDetail.addReturnStationDesc", "Add a stop to the return direction.")}
                </DialogDescription>
              </DialogHeader>
              <Form {...addForm}>
                <form onSubmit={addForm.handleSubmit(onAdd)} className="space-y-4">
                  <StationFields form={addForm} />
                  <DialogFooter>
                    <Button variant="outline" type="button" onClick={() => setIsAddOpen(false)}>{t("common.cancel")}</Button>
                    <Button type="submit" disabled={addStationMutation.isPending}>{t("routeDetail.addStation", "Add Station")}</Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : stations.length === 0 ? (
            <div className="text-center py-14 text-muted-foreground text-sm">
              <MapPin className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>{t("routeDetail.noStationsYet", "No stations added yet.")}</p>
              <p className="text-xs mt-1">{t("routeDetail.clickAddStation", "Click \"Add Station\" to create the first stop.")}</p>
            </div>
          ) : (
            <div>
              {stations.map((station, idx) => (
                <React.Fragment key={station.id}>
                  <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors group">
                    <div
                      className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                      style={{ background: mapColor }}
                    >
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{station.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {station.latitude.toFixed(5)}, {station.longitude.toFixed(5)}
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        disabled={idx === 0} onClick={() => handleReorder(station, "up")}
                      ><ArrowUp className="h-3.5 w-3.5" /></Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        disabled={idx === stations.length - 1} onClick={() => handleReorder(station, "down")}
                      ><ArrowDown className="h-3.5 w-3.5" /></Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => {
                          editForm.reset({
                            name: station.name,
                            latitude: station.latitude,
                            longitude: station.longitude,
                            order: station.order,
                            segmentPrice: station.segmentPrice ?? null,
                          });
                          setEditStation(station);
                        }}
                      ><Edit className="h-3.5 w-3.5" /></Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => handleDelete(station.id)}
                      ><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                  {idx < stations.length - 1 && (
                    <div className="flex items-center gap-3 px-4 py-2 bg-muted/20 border-y border-border/40">
                      <div className="w-7 flex justify-center shrink-0">
                        <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 text-xs text-muted-foreground">
                        {station.name} → {stations[idx + 1].name}
                      </div>
                      <div className="shrink-0 text-xs font-medium">
                        {station.segmentPrice != null
                          ? <span className="text-foreground">{formatEGP(station.segmentPrice)}</span>
                          : <span className="text-muted-foreground italic">{t("routeDetail.basePrice", "base")} {formatEGP(route?.basePrice)}</span>}
                      </div>
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editStation} onOpenChange={open => !open && setEditStation(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("routeDetail.editStation", "Edit Station")}</DialogTitle>
            <DialogDescription>{t("routeDetail.updateStationDetails", "Update station details.")}</DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEdit)} className="space-y-4">
              <StationFields form={editForm} />
              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setEditStation(null)}>{t("common.cancel")}</Button>
                <Button type="submit" disabled={updateStationMutation.isPending}>{t("common.saveChanges")}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              {t("routeDetail.operatingSchedule", "Operating Schedule")}
            </CardTitle>
            <CardDescription>
              {timeSlots.length > 0
                ? `${timeSlots.length} ${t("routeDetail.recurringTimeSlots", "recurring departure time slot(s)")}`
                : t("routeDetail.noScheduleYet", "No recurring schedules set up yet")}
            </CardDescription>
          </div>
          <Dialog open={isCreateTripOpen} onOpenChange={setIsCreateTripOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="mr-2 h-4 w-4" />{t("trips.scheduleTrip", "Schedule Trip")}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t("trips.scheduleNewTrip", "Schedule New Trip")}</DialogTitle>
                <DialogDescription>{t("routeDetail.scheduleNewTripDesc", "Add a new trip or recurring schedule to this route.")}</DialogDescription>
              </DialogHeader>
              <TripForm form={tripForm} onSubmit={onCreateTrip} isPending={createMutation.isPending} submitLabel={t("trips.scheduleTrip", "Schedule Trip")} route={route} allBuses={allBuses} allDrivers={allDrivers} />
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="p-0">
          {timeSlots.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p>{t("routeDetail.noRecurring", "No recurring schedules. Click \"Schedule Trip\" to add one.")}</p>
            </div>
          ) : (
            <div className="divide-y">
              {timeSlots.map(([time, slotTrips]) => {
                const sample = slotTrips[0];
                const activeCount = slotTrips.filter((t: any) => t.isActive !== false).length;
                return (
                  <div key={time} className="flex items-center gap-4 px-5 py-3">
                    <div className="w-14 shrink-0">
                      <span className="text-base font-bold font-mono">{time}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-1 flex-wrap">
                      <Badge variant="outline" className="text-xs capitalize bg-blue-50 text-blue-700 border-transparent">
                        {sample?.recurringType?.replace(/_/g, " ")}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{sample?.totalSeats ?? "—"} {t("trips.seats", "seats")}</span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs font-medium">{formatEGP(sample?.price)}</span>
                      {sample?.driverId && <span className="text-xs text-muted-foreground">· {driverMap[sample.driverId] ?? `#${sample.driverId}`}</span>}
                    </div>
                    <Badge variant="outline" className={activeCount > 0 ? "bg-green-50 text-green-700 border-transparent text-xs shrink-0" : "text-muted-foreground text-xs shrink-0"}>
                      {activeCount > 0 ? t("common.active") : t("common.inactive")}
                    </Badge>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => handleCancelTrip(sample.id)} disabled={sample?.status === "cancelled"}>
                      <Ban className="h-3.5 w-3.5" />
                    </Button>
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

function SchedulesTab({
  trips, routeId, route, queryClient, toast, allDrivers, allBuses,
}: {
  trips: any[]; routeId: number; route: any; queryClient: any; toast: any; allDrivers: any[]; allBuses: any[];
}) {
  const { t } = useTranslation();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editTrip, setEditTrip] = useState<any | null>(null);

  const createMutation = useCreateTrip();
  const updateMutation = useUpdateTrip();
  const cancelMutation = useCancelTrip();

  const tripDefaultValues: TripFormValues = {
    busId: 0, driverId: 0,
    departureTime: "", arrivalTime: "",
    price: route?.basePrice ?? 0,
    recurringType: "one_time", weekdays: "", isActive: true,
  };

  const createForm = useForm<TripFormValues>({ resolver: zodResolver(tripSchema), defaultValues: tripDefaultValues });
  const editForm = useForm<TripFormValues>({ resolver: zodResolver(tripSchema), defaultValues: tripDefaultValues });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListTripsQueryKey() });

  const onSubmitCreate = (data: TripFormValues) => {
    createMutation.mutate({ data: { ...data, routeId } as any }, {
      onSuccess: () => { toast({ title: t("trips.tripScheduled", "Trip scheduled successfully") }); setIsCreateOpen(false); createForm.reset(tripDefaultValues); invalidate(); },
      onError: () => toast({ title: t("trips.scheduleFailed", "Failed to schedule trip"), variant: "destructive" }),
    });
  };

  const onSubmitEdit = (data: TripFormValues) => {
    if (!editTrip) return;
    updateMutation.mutate({ id: editTrip.id, data: data as any }, {
      onSuccess: () => { toast({ title: t("trips.tripUpdated", "Trip updated") }); setEditTrip(null); invalidate(); },
      onError: () => toast({ title: t("trips.updateFailed", "Failed to update trip"), variant: "destructive" }),
    });
  };

  const handleDuplicate = (trip: any) => {
    createForm.reset({ busId: trip.busId ?? 0, driverId: trip.driverId ?? 0, departureTime: "", arrivalTime: "", price: trip.price ?? route?.basePrice ?? 0, recurringType: trip.recurringType ?? "one_time", weekdays: trip.weekdays ?? "", isActive: true });
    setIsCreateOpen(true);
  };

  const handleOpenEdit = (trip: any) => {
    editForm.reset({ busId: trip.busId ?? 0, driverId: trip.driverId ?? 0, departureTime: trip.departureTime?.slice(0, 16) ?? "", arrivalTime: trip.arrivalTime?.slice(0, 16) ?? "", price: trip.price ?? 0, recurringType: trip.recurringType ?? "one_time", weekdays: trip.weekdays ?? "", isActive: trip.isActive ?? true });
    setEditTrip(trip);
  };

  const handleCancel = (tripId: number) => {
    if (confirm(t("trips.cancelConfirm", "Cancel this trip? All related bookings will be cancelled and refunded."))) {
      cancelMutation.mutate({ id: tripId }, {
        onSuccess: () => { toast({ title: t("trips.tripCancelled", "Trip cancelled") }); invalidate(); },
        onError: () => toast({ title: t("trips.cancelFailed", "Failed to cancel trip"), variant: "destructive" }),
      });
    }
  };

  const recurring = trips.filter(t => t.recurringType !== "one_time");
  const oneTime = trips.filter(t => t.recurringType === "one_time");

  const timeSlots = React.useMemo(() => {
    const map = new Map<string, any[]>();
    for (const trip of recurring) {
      const dt = new Date(trip.departureTime);
      const key = `${String(dt.getUTCHours()).padStart(2, "0")}:${String(dt.getUTCMinutes()).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(trip);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [recurring]);

  const driverMap = Object.fromEntries(allDrivers.map(d => [d.id, d.name]));
  const busMap = Object.fromEntries(allBuses.map(b => [b.id, b.plateNumber]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">{t("routeDetail.scheduleManagement", "Schedule Management")}</h3>
          <p className="text-sm text-muted-foreground">{t("routeDetail.scheduleManagementDesc", "Create, edit, and manage trips and recurring schedules for this route.")}</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-2 h-4 w-4" />{t("trips.scheduleTrip", "Schedule Trip")}</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("trips.scheduleNewTrip", "Schedule New Trip")}</DialogTitle>
              <DialogDescription>{t("routeDetail.scheduleNewTripDesc", "Add a new trip or recurring schedule to this route.")}</DialogDescription>
            </DialogHeader>
            <TripForm form={createForm} onSubmit={onSubmitCreate} isPending={createMutation.isPending} submitLabel={t("trips.scheduleTrip", "Schedule Trip")} route={route} allBuses={allBuses} allDrivers={allDrivers} />
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={!!editTrip} onOpenChange={open => !open && setEditTrip(null)}>
        <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("trips.editTrip", "Edit Trip")} #{editTrip?.id}</DialogTitle>
            <DialogDescription>{t("routeDetail.editTripDesc", "Update departure time, pricing, driver/bus assignment, or recurring settings.")}</DialogDescription>
          </DialogHeader>
          <TripForm form={editForm} onSubmit={onSubmitEdit} isPending={updateMutation.isPending} submitLabel={t("common.saveChanges")} route={route} allBuses={allBuses} allDrivers={allDrivers} />
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Repeat className="h-4 w-4" /> {t("routeDetail.recurringSchedules", "Recurring Schedules")}
          </CardTitle>
          <CardDescription>{recurring.length} {t("routeDetail.recurringSlots", "recurring departure slots for this route")}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {timeSlots.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              {t("routeDetail.noRecurring", "No recurring schedules found. Click \"Schedule Trip\" to add one.")}
            </div>
          ) : (
            <div className="divide-y">
              {timeSlots.map(([time, slotTrips]) => {
                const sample = slotTrips[0];
                const activeCount = slotTrips.filter((t: any) => t.isActive !== false).length;
                return (
                  <div key={time} className="flex items-center gap-4 px-6 py-3 hover:bg-muted/30 transition-colors">
                    <div className="w-16 shrink-0">
                      <span className="text-lg font-bold font-mono">{time}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-1 flex-wrap">
                      <Badge variant="outline" className="text-xs capitalize bg-blue-50 text-blue-700 border-transparent">
                        {sample?.recurringType?.replace(/_/g, " ")}
                      </Badge>
                      <span className="text-sm text-muted-foreground">{sample?.totalSeats ?? "—"} {t("trips.seats", "seats")}</span>
                      <span className="text-sm text-muted-foreground">·</span>
                      <span className="text-sm font-medium">{formatEGP(sample?.price)}</span>
                      {sample?.driverId && <span className="text-xs text-muted-foreground">· {driverMap[sample.driverId] ?? `#${sample.driverId}`}</span>}
                      {sample?.busId && <span className="text-xs text-muted-foreground">· {busMap[sample.busId] ?? `#${sample.busId}`}</span>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge variant="outline" className={activeCount > 0 ? "bg-green-50 text-green-700 border-transparent text-xs" : "text-muted-foreground text-xs"}>
                        {activeCount > 0 ? t("common.active") : t("common.inactive")}
                      </Badge>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleOpenEdit(sample)}><Edit className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDuplicate(sample)}><Copy className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => handleCancel(sample.id)} disabled={sample?.status === "cancelled"}>
                        <Ban className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">{t("routeDetail.oneTimeTrips", "One-Time Trips")}</CardTitle>
            <CardDescription>{oneTime.length} {t("routeDetail.nonRecurring", "non-recurring departures")}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("trips.departure")}</TableHead>
                <TableHead>{t("routeDetail.driverBus", "Driver / Bus")}</TableHead>
                <TableHead>{t("trips.seats", "Seats")}</TableHead>
                <TableHead>{t("trips.price", "Price")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead className="text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {oneTime.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-muted-foreground text-sm">
                    {t("routeDetail.noOneTimeTrips", "No one-time trips found.")}
                  </TableCell>
                </TableRow>
              ) : oneTime.map(trip => (
                <TableRow key={trip.id}>
                  <TableCell className="font-mono text-sm">
                    <div>{new Date(trip.departureTime).toLocaleDateString([], { timeZone: 'UTC' })}</div>
                    <div className="text-muted-foreground text-xs">{new Date(trip.departureTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: 'UTC' })}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{driverMap[trip.driverId] ?? `#${trip.driverId}`}</div>
                    <div className="text-xs text-muted-foreground">{busMap[trip.busId] ?? `#${trip.busId}`}</div>
                  </TableCell>
                  <TableCell>{trip.availableSeats} / {trip.totalSeats}</TableCell>
                  <TableCell>{formatEGP(trip.price)}</TableCell>
                  <TableCell><StatusBadge status={trip.status} /></TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleOpenEdit(trip)}><Edit className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDuplicate(trip)}><Copy className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => handleCancel(trip.id)} disabled={trip.status === "cancelled"}>
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
    </div>
  );
}

function TripsTab({ trips, allDrivers, allBuses, route, queryClient, toast }: {
  trips: any[]; allDrivers: any[]; allBuses: any[]; route: any; queryClient: any; toast: any;
}) {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [editTrip, setEditTrip] = useState<any | null>(null);
  const [deleteTrip, setDeleteTrip] = useState<any | null>(null);

  const updateMutation = useUpdateTrip();
  const cancelMutation = useCancelTrip();
  const deleteMutation = useMutation({
    mutationFn: async (tripId: number) => {
      await adminFetch(`/trips/${tripId}`, { method: "DELETE" });
    },
    onSuccess: () => { toast({ title: t("trips.tripDeleted", "Trip deleted") }); setDeleteTrip(null); invalidate(); },
    onError: (err: any) => toast({ title: err.message || t("trips.deleteFailed", "Failed to delete trip"), variant: "destructive" }),
  });

  const tripDefaultValues: TripFormValues = {
    busId: 0, driverId: 0, departureTime: "", arrivalTime: "", price: route?.basePrice ?? 0, recurringType: "one_time", weekdays: "", isActive: true,
  };

  const editForm = useForm<TripFormValues>({ resolver: zodResolver(tripSchema), defaultValues: tripDefaultValues });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListTripsQueryKey() });

  const handleOpenEdit = (trip: any) => {
    editForm.reset({ busId: trip.busId ?? 0, driverId: trip.driverId ?? 0, departureTime: trip.departureTime?.slice(0, 16) ?? "", arrivalTime: trip.arrivalTime?.slice(0, 16) ?? "", price: trip.price ?? 0, recurringType: trip.recurringType ?? "one_time", weekdays: trip.weekdays ?? "", isActive: trip.isActive ?? true });
    setEditTrip(trip);
  };

  const onSubmitEdit = (data: TripFormValues) => {
    if (!editTrip) return;
    updateMutation.mutate({ id: editTrip.id, data: data as any }, {
      onSuccess: () => { toast({ title: t("trips.tripUpdated", "Trip updated") }); setEditTrip(null); invalidate(); },
      onError: () => toast({ title: t("trips.updateFailed", "Failed to update trip"), variant: "destructive" }),
    });
  };

  const handleCancel = (tripId: number) => {
    if (confirm(t("trips.cancelConfirm", "Cancel this trip? All related bookings will be cancelled and refunded."))) {
      cancelMutation.mutate({ id: tripId }, {
        onSuccess: () => { toast({ title: t("trips.tripCancelled", "Trip cancelled") }); invalidate(); },
        onError: () => toast({ title: t("trips.cancelFailed", "Failed to cancel trip"), variant: "destructive" }),
      });
    }
  };

  const handleDelete = (trip: any) => {
    setDeleteTrip(trip);
  };

  const driverMap = Object.fromEntries(allDrivers.map(d => [d.id, d]));
  const busMap = Object.fromEntries(allBuses.map(b => [b.id, b.plateNumber]));

  const filtered = trips.filter(t => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (t.departureTime) {
      const d = new Date(t.departureTime);
      if (fromDate && d < new Date(fromDate)) return false;
      if (toDate && d > new Date(toDate + "T23:59:59")) return false;
    }
    return true;
  });
  const sorted = [...filtered].sort((a, b) => new Date(a.departureTime).getTime() - new Date(b.departureTime).getTime());

  return (
    <div className="space-y-4">
      <Dialog open={!!editTrip} onOpenChange={open => !open && setEditTrip(null)}>
        <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("trips.editTrip", "Edit Trip")} #{editTrip?.id}</DialogTitle>
            <DialogDescription>{t("routeDetail.editTripFullDesc", "Update departure time, price, driver reassignment, bus, or recurring settings.")}</DialogDescription>
          </DialogHeader>
          <TripForm form={editForm} onSubmit={onSubmitEdit} isPending={updateMutation.isPending} submitLabel={t("common.saveChanges")} route={route} allBuses={allBuses} allDrivers={allDrivers} />
        </DialogContent>
      </Dialog>

      <div className="flex items-center gap-3 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder={t("trips.allStatuses", "Filter by status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("trips.allStatuses", "All Statuses")}</SelectItem>
            {["scheduled", "waiting_driver", "driver_assigned", "boarding", "active", "completed", "cancelled"].map(s => (
              <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{sorted.length} {t("routeDetail.tripCount", "trip(s)")}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{t("routeDetail.from", "From")}</span>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors w-[140px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{t("routeDetail.to", "To")}</span>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors w-[140px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
        </div>
        {(statusFilter !== "all" || fromDate || toDate) && (
          <Button variant="ghost" size="sm" onClick={() => { setStatusFilter("all"); setFromDate(""); setToDate(""); }}>{t("routeDetail.clearFilters", "Clear filters")}</Button>
        )}
        {sorted.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="ml-auto">
                <Download className="h-4 w-4 mr-2" />{t("routeDetail.export", "Export")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => {
                exportCSV(sorted.map(tr => ({
                  "Trip ID": tr.id, "Route": route?.name ?? "",
                  "Departure": tr.departureTime ? new Date(tr.departureTime).toLocaleString([], { timeZone: 'UTC' }) : "",
                  "Arrival": tr.arrivalTime ? new Date(tr.arrivalTime).toLocaleString([], { timeZone: 'UTC' }) : "",
                  "Driver": driverMap[tr.driverId]?.name ?? `#${tr.driverId}`,
                  "Bus Plate": busMap[tr.busId] ?? `#${tr.busId}`,
                  "Total Seats": tr.totalSeats ?? "",
                  "Available Seats": tr.availableSeats ?? "",
                  "Price (EGP)": tr.price, "Status": tr.status,
                })), `trips-${todayStr()}.csv`);
              }}>{t("routeDetail.exportCSV", "Export CSV")}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                exportExcel(sorted.map(tr => ({
                  "Trip ID": tr.id, "Route": route?.name ?? "",
                  "Departure": tr.departureTime ? new Date(tr.departureTime).toLocaleString([], { timeZone: 'UTC' }) : "",
                  "Arrival": tr.arrivalTime ? new Date(tr.arrivalTime).toLocaleString([], { timeZone: 'UTC' }) : "",
                  "Driver": driverMap[tr.driverId]?.name ?? `#${tr.driverId}`,
                  "Bus Plate": busMap[tr.busId] ?? `#${tr.busId}`,
                  "Total Seats": tr.totalSeats ?? "",
                  "Available Seats": tr.availableSeats ?? "",
                  "Price (EGP)": tr.price, "Status": tr.status,
                })), `trips-${todayStr()}.xlsx`, "Trips");
              }}>{t("routeDetail.exportExcel", "Export Excel (.xlsx)")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("trips.departure")}</TableHead>
                <TableHead>{t("trips.arrival")}</TableHead>
                <TableHead>{t("drivers.title")}</TableHead>
                <TableHead>{t("buses.title")}</TableHead>
                <TableHead>{t("trips.seats", "Seats")}</TableHead>
                <TableHead>{t("trips.price", "Price")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead className="text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-muted-foreground text-sm">
                    {t("routeDetail.noTrips", "No trips match the current filters.")}
                  </TableCell>
                </TableRow>
              ) : sorted.map(trip => (
                <TableRow key={trip.id}>
                  <TableCell className="font-mono text-xs">
                    <div>{new Date(trip.departureTime).toLocaleDateString([], { timeZone: 'UTC' })}</div>
                    <div className="text-muted-foreground">{new Date(trip.departureTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: 'UTC' })}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    <div>{new Date(trip.arrivalTime).toLocaleDateString([], { timeZone: 'UTC' })}</div>
                    <div className="text-muted-foreground">{new Date(trip.arrivalTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: 'UTC' })}</div>
                  </TableCell>
                  <TableCell className="text-sm">{driverMap[trip.driverId]?.name ?? `#${trip.driverId}`}</TableCell>
                  <TableCell className="text-sm">{busMap[trip.busId] ?? `#${trip.busId}`}</TableCell>
                  <TableCell className="text-sm">{trip.availableSeats} / {trip.totalSeats}</TableCell>
                  <TableCell className="text-sm">{formatEGP(trip.price)}</TableCell>
                  <TableCell><StatusBadge status={trip.status} /></TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleOpenEdit(trip)}><Edit className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => handleCancel(trip.id)} disabled={trip.status === "cancelled"}>
                        <Ban className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => handleDelete(trip)} disabled={deleteMutation.isPending}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!deleteTrip} onOpenChange={open => !open && setDeleteTrip(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                <Trash2 className="h-5 w-5 text-destructive" />
              </div>
              <DialogTitle>{t("trips.deleteTitle", "Delete Trip")}</DialogTitle>
            </div>
            <DialogDescription className="text-sm text-muted-foreground">
              {t("trips.deleteDesc", "This will permanently delete the trip departing on")}{" "}
              <span className="font-semibold text-foreground">
                {deleteTrip ? new Date(deleteTrip.departureTime).toLocaleString([], { dateStyle: "medium", timeStyle: "short", timeZone: 'UTC' }) : ""}
              </span>
              {". "}{t("trips.deleteWarning", "All bookings will also be removed. This cannot be undone.")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2 mt-2">
            <Button variant="outline" onClick={() => setDeleteTrip(null)} disabled={deleteMutation.isPending}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={() => deleteTrip && deleteMutation.mutate(deleteTrip.id)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? t("common.deleting", "Deleting…") : t("common.delete", "Delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DriversTab({ trips, allDrivers }: { trips: any[]; allDrivers: any[] }) {
  const { t } = useTranslation();

  const driverMap = Object.fromEntries(allDrivers.map(d => [d.id, d]));
  const driverStats = React.useMemo(() => {
    const map = new Map<number, { count: number; completed: number; cancelled: number; lastTrip: Date | null }>();
    for (const trip of trips) {
      const id = trip.driverId;
      if (!id) continue;
      if (!map.has(id)) map.set(id, { count: 0, completed: 0, cancelled: 0, lastTrip: null });
      const s = map.get(id)!;
      s.count++;
      if (trip.status === "completed") s.completed++;
      if (trip.status === "cancelled") s.cancelled++;
      const dep = new Date(trip.departureTime);
      if (!s.lastTrip || dep > s.lastTrip) s.lastTrip = dep;
    }
    return [...map.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [trips]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("routeDetail.driverPerformance", "Driver Performance")}</CardTitle>
        <CardDescription>{t("routeDetail.driverPerformanceDesc", "Trip statistics for drivers assigned to this route")}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("drivers.title")}</TableHead>
              <TableHead>{t("routeDetail.totalTrips", "Total")}</TableHead>
              <TableHead>{t("trips.completed", "Completed")}</TableHead>
              <TableHead>{t("trips.cancelled", "Cancelled")}</TableHead>
              <TableHead>{t("routeDetail.lastTrip", "Last Trip")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {driverStats.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground text-sm">
                  {t("routeDetail.noDriverData", "No driver data available for this route.")}
                </TableCell>
              </TableRow>
            ) : driverStats.map(([driverId, stats]) => {
              const driver = driverMap[driverId];
              return (
                <TableRow key={driverId}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                        {(driver?.name ?? "?")[0]}
                      </div>
                      <div>
                        <div className="font-medium text-sm">{driver?.name ?? `${t("drivers.title")} #${driverId}`}</div>
                        {driver?.phone && <div className="text-xs text-muted-foreground">{driver.phone}</div>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><span className="font-semibold">{stats.count}</span></TableCell>
                  <TableCell><span className="text-green-600 font-medium">{stats.completed}</span></TableCell>
                  <TableCell><span className="text-red-600 font-medium">{stats.cancelled}</span></TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {stats.lastTrip ? stats.lastTrip.toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={driver?.status === "online" ? "bg-green-100 text-green-800 border-transparent" : driver?.status === "busy" ? "bg-orange-100 text-orange-800 border-transparent" : "text-muted-foreground"}>
                      {driver?.status ?? t("routeDetail.unknown", "unknown")}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function AnalyticsTab({ trips, route }: { trips: any[]; route: any }) {
  const { t } = useTranslation();

  const statusData = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const tr of trips) counts[tr.status] = (counts[tr.status] ?? 0) + 1;
    return Object.entries(counts).map(([name, value]) => ({ name: name.replace(/_/g, " "), value }));
  }, [trips]);

  const slotData = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const tr of trips) {
      const d = new Date(tr.departureTime);
      const key = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([time, count]) => ({ time, count }));
  }, [trips]);

  const occupancyData = React.useMemo(() => {
    const total = trips.reduce((s, tr) => s + (tr.totalSeats ?? 0), 0);
    const booked = trips.reduce((s, tr) => s + ((tr.totalSeats ?? 0) - (tr.availableSeats ?? 0)), 0);
    return [
      { name: t("routeDetail.booked", "Booked"), value: booked },
      { name: t("routeDetail.available", "Available"), value: total - booked },
    ];
  }, [trips, t]);

  const revenue = trips
    .filter(tr => tr.status === "completed")
    .reduce((sum, tr) => {
      const booked = (tr.totalSeats ?? 0) - (tr.availableSeats ?? 0);
      return sum + booked * parseFloat(tr.price ?? "0");
    }, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard label={t("routeDetail.estRevenue", "Est. Revenue")} value={formatEGP(revenue)} sub={t("routeDetail.fromCompletedTrips", "from completed trips")} icon={Banknote} color="text-green-600" />
        <KPICard label={t("routeDetail.avgOccupancy", "Avg Occupancy")} value={`${occupancyData[0]?.value && occupancyData[1]?.value ? Math.round((occupancyData[0].value / (occupancyData[0].value + occupancyData[1].value)) * 100) : 0}%`} sub={t("routeDetail.seatsFilled", "seats filled")} icon={TrendingUp} />
        <KPICard label={t("routeDetail.departureSlots", "Departure Slots")} value={slotData.length} sub={t("routeDetail.uniqueTimeSlots", "unique time slots")} icon={CalendarClock} />
        <KPICard label={t("routeDetail.baseFare", "Base Fare")} value={formatEGP(route.basePrice)} sub={t("routeDetail.perPassenger", "per passenger")} icon={Banknote} color="text-blue-600" />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" />{t("dashboard.statusBreakdown")}</CardTitle>
          </CardHeader>
          <CardContent>
            {statusData.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">{t("routeDetail.noTripData", "No trip data yet.")}</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={statusData} layout="vertical" margin={{ left: 20, right: 10 }}>
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                  <RechartTooltip />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {statusData.map((_, idx) => <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4" />{t("routeDetail.departuresBySlot", "Departures by Time Slot")}</CardTitle>
          </CardHeader>
          <CardContent>
            {slotData.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">{t("routeDetail.noDepartureData", "No departure data yet.")}</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={slotData.slice(0, 12)} margin={{ left: -10, right: 10 }}>
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} interval={0} angle={-45} textAnchor="end" height={45} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <RechartTooltip />
                  <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" />{t("routeDetail.seatOccupancyDist", "Seat Occupancy Distribution")}</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            {occupancyData[0]?.value === 0 && occupancyData[1]?.value === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">{t("routeDetail.noSeatData", "No seat data yet.")}</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={occupancyData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {occupancyData.map((_, idx) => <Cell key={idx} fill={idx === 0 ? "#3b82f6" : "#e5e7eb"} />)}
                  </Pie>
                  <Legend />
                  <RechartTooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function RouteDetail() {
  const { id } = useParams();
  const routeId = parseInt(id || "0", 10);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const { data: route, isLoading: isRouteLoading } = useGetRoute(routeId, {
    query: { enabled: !!routeId, queryKey: getGetRouteQueryKey(routeId) },
  });

  const { data: stationsData, isLoading: isStationsLoading } = useGetRouteStations(routeId, {
    query: { enabled: !!routeId, queryKey: getGetRouteStationsQueryKey(routeId) },
  });

  const { data: tripsData } = useListTrips(
    { routeId, limit: 200 },
    { query: { enabled: !!routeId, queryKey: getListTripsQueryKey({ routeId, limit: 200 }) } }
  );

  const { data: driversData } = useListDrivers({ limit: 200 }, { query: { queryKey: getListDriversQueryKey({ limit: 200 }) } });
  const { data: busesData } = useListBuses({ limit: 200 }, { query: { queryKey: getListBusesQueryKey({ limit: 200 }) } });

  const updateRouteMutation = useUpdateRoute();

  const stations = (stationsData ?? []) as any[];
  const trips = tripsData?.data ?? [];
  const allDrivers = driversData?.data ?? [];
  const allBuses = busesData?.data ?? [];

  const outboundStations = stations.filter(s => (s.direction ?? "outbound") === "outbound");
  const returnStations = stations.filter(s => s.direction === "return");

  const handleToggleActive = () => {
    if (!route) return;
    updateRouteMutation.mutate({ id: routeId, data: { isActive: !route.isActive } }, {
      onSuccess: () => {
        toast({ title: route.isActive ? t("routeDetail.routeDeactivated", "Route deactivated") : t("routeDetail.routeActivated", "Route activated") });
        queryClient.invalidateQueries({ queryKey: getGetRouteQueryKey(routeId) });
      },
    });
  };

  if (isRouteLoading) return <div className="p-8"><Skeleton className="h-[400px] rounded-xl" /></div>;
  if (!route) return <div className="p-8 text-center text-muted-foreground">{t("routeDetail.routeNotFound", "Route not found")}</div>;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start gap-4">
        <Button variant="outline" size="icon" asChild className="shrink-0 mt-1">
          <Link href="/routes"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight truncate">{route.name}</h1>
            <Badge variant="outline" className={route.isActive ? "bg-green-100 text-green-800 border-transparent" : ""}>
              {route.isActive ? t("common.active") : t("common.inactive")}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-sm">
            <Navigation className="h-3.5 w-3.5" />
            {route.fromLocation}
            <ArrowRight className="h-3 w-3" />
            {route.toLocation}
            <Minus className="h-3 w-3 ml-2" />
            <Clock className="h-3 w-3" />
            {route.estimatedDuration} {t("routes.min", "min")}
            <Minus className="h-3 w-3" />
            {formatEGP(route.basePrice)}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm text-muted-foreground">{t("common.active")}</span>
          <Switch checked={route.isActive} onCheckedChange={handleToggleActive} disabled={updateRouteMutation.isPending} />
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">{t("routeDetail.overview", "Overview")}</TabsTrigger>
          <TabsTrigger value="outbound">
            <MoveRight className="h-3.5 w-3.5 mr-1.5 text-blue-500" />
            {t("routeDetail.outbound", "Outbound")}
            <span className="ml-1.5 text-xs opacity-70">({outboundStations.length})</span>
          </TabsTrigger>
          <TabsTrigger value="return">
            <MoveLeft className="h-3.5 w-3.5 mr-1.5 text-violet-500" />
            {t("routeDetail.return", "Return")}
            <span className="ml-1.5 text-xs opacity-70">({returnStations.length})</span>
          </TabsTrigger>
          <TabsTrigger value="schedules">{t("routeDetail.schedules", "Schedules")}</TabsTrigger>
          <TabsTrigger value="trips">{t("trips.title")} <span className="ml-1.5 text-xs opacity-70">({trips.length})</span></TabsTrigger>
          <TabsTrigger value="drivers">{t("drivers.title")}</TabsTrigger>
          <TabsTrigger value="analytics">{t("nav.analytics")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab route={route} trips={trips} stations={stations} />
        </TabsContent>
        <TabsContent value="outbound">
          <DirectionTab
            direction="outbound"
            routeId={routeId}
            allStations={stations}
            isLoading={isStationsLoading}
            queryClient={queryClient}
            toast={toast}
            trips={trips}
            route={route}
            allDrivers={allDrivers}
            allBuses={allBuses}
          />
        </TabsContent>
        <TabsContent value="return">
          <DirectionTab
            direction="return"
            routeId={routeId}
            allStations={stations}
            isLoading={isStationsLoading}
            queryClient={queryClient}
            toast={toast}
            trips={trips}
            route={route}
            allDrivers={allDrivers}
            allBuses={allBuses}
          />
        </TabsContent>
        <TabsContent value="schedules">
          <SchedulesTab trips={trips} routeId={routeId} route={route} queryClient={queryClient} toast={toast} allDrivers={allDrivers} allBuses={allBuses} />
        </TabsContent>
        <TabsContent value="trips">
          <TripsTab trips={trips} allDrivers={allDrivers} allBuses={allBuses} route={route} queryClient={queryClient} toast={toast} />
        </TabsContent>
        <TabsContent value="drivers">
          <DriversTab trips={trips} allDrivers={allDrivers} />
        </TabsContent>
        <TabsContent value="analytics">
          <AnalyticsTab trips={trips} route={route} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
