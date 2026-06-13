import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useListRoutes } from "@workspace/api-client-react";
import { adminFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  CalendarClock, Plus, Trash2, RefreshCw, ToggleLeft,
  ChevronDown, ChevronRight, CalendarDays, Clock, Bus, Map,
  Users,
} from "lucide-react";

const DAYS = []; // Removed global constants to move inside components

const VEHICLE_TYPES = []; // Removed global constants to move inside components

type VehicleType = "hiace" | "minibus";

interface ScheduleSlot {
  id: number;
  scheduleId: number;
  dayOfWeek: number;
  departureTime: string;
}

interface TripStats {
  total: number;
  waiting: number;
  assigned: number;
  completed: number;
  cancelled: number;
}

interface Schedule {
  id: number;
  routeId: number;
  routeName: string;
  fromLocation: string;
  toLocation: string;
  effectiveFrom: string;
  effectiveTo: string;
  vehicleType: VehicleType;
  defaultCapacity: number;
  isActive: boolean;
  createdAt: string;
  slots: ScheduleSlot[];
  tripStats: TripStats;
}

function groupSlotsByDay(slots: ScheduleSlot[]): Record<number, string[]> {
  const map: Record<number, string[]> = {};
  for (const s of slots) {
    (map[s.dayOfWeek] ??= []).push(s.departureTime);
  }
  return map;
}

function ScheduleCard({ schedule, onRegenerate, onDeactivate }: {
  schedule: Schedule;
  onRegenerate: (id: number) => void;
  onDeactivate: (id: number) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const byDay = groupSlotsByDay(schedule.slots);

  const DAYS = useMemo(() => [
    { label: t("schedules.sunday"),    short: "Sun", value: 0 },
    { label: t("schedules.monday"),    short: "Mon", value: 1 },
    { label: t("schedules.tuesday"),   short: "Tue", value: 2 },
    { label: t("schedules.wednesday"), short: "Wed", value: 3 },
    { label: t("schedules.thursday"),  short: "Thu", value: 4 },
    { label: t("schedules.friday"),    short: "Fri", value: 5 },
    { label: t("schedules.saturday"),  short: "Sat", value: 6 },
  ], [t]);

  const VEHICLE_TYPES = useMemo(() => [
    {
      value: "hiace",
      label: t("schedules.hiace"),
      seats: 14,
      minThreshold: 7,
      description: t("schedules.hiaceDesc"),
    },
    {
      value: "minibus",
      label: t("schedules.minibus"),
      seats: 28,
      minThreshold: 14,
      description: t("schedules.minibusDesc"),
    },
  ], [t]);

  const activeDays = DAYS.filter(d => byDay[d.value]);
  const meta = VEHICLE_TYPES.find((v) => v.value === schedule.vehicleType) ?? VEHICLE_TYPES[0]!;

  return (
    <Card className={`border ${schedule.isActive ? "border-border" : "border-muted opacity-60"}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-base font-semibold truncate">
                {schedule.routeName ?? `Route #${schedule.routeId}`}
              </CardTitle>
              <Badge variant={schedule.isActive ? "default" : "secondary"} className="text-xs shrink-0">
                {schedule.isActive ? t("schedules.active") : t("schedules.inactive")}
              </Badge>
              <Badge variant="outline" className="text-xs shrink-0 gap-1">
                <Bus className="h-3 w-3" />
                {meta.label}
              </Badge>
            </div>
            <CardDescription className="mt-0.5 flex items-center gap-1 text-xs">
              <Map className="h-3 w-3" />
              {schedule.fromLocation} → {schedule.toLocation}
            </CardDescription>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {schedule.isActive && (
              <>
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={() => onRegenerate(schedule.id)}>
                  <RefreshCw className="h-3 w-3" /> {t("schedules.reGenerate")}
                </Button>
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/5" onClick={() => onDeactivate(schedule.id)}>
                  <ToggleLeft className="h-3 w-3" /> {t("schedules.deactivate")}
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-3">
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4 text-primary/70" />
            <span className="font-medium text-foreground">{schedule.effectiveFrom}</span>
            <span>→</span>
            <span className="font-medium text-foreground">{schedule.effectiveTo}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Users className="h-4 w-4 text-primary/70" />
            <span>
              <span className="font-medium text-foreground">{t("schedules.seatsPerTrip", { seats: meta.seats })}</span> ·{" "}
              {t("schedules.minPassengers")} <span className="font-medium text-foreground">{meta.minThreshold}</span> {t("schedules.toRun")}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {[
            { label: t("schedules.statTotal"),     value: schedule.tripStats.total,     cls: "bg-muted/50" },
            { label: t("schedules.statWaiting"),   value: schedule.tripStats.waiting,   cls: "bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300" },
            { label: t("schedules.statAssigned"),  value: schedule.tripStats.assigned,  cls: "bg-blue-50 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300" },
            { label: t("schedules.statCompleted"), value: schedule.tripStats.completed, cls: "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300" },
            { label: t("schedules.statCancelled"), value: schedule.tripStats.cancelled, cls: "bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300" },
          ].map(s => (
            <div key={s.label} className={`rounded-lg p-2 text-center ${s.cls}`}>
              <p className="text-lg font-bold leading-tight">{s.value}</p>
              <p className="text-xs opacity-75">{s.label}</p>
            </div>
          ))}
        </div>

        <button
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setExpanded(e => !e)}
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {expanded ? t("schedules.hideSlotDetails") : t("schedules.showSlotDetails")} {t("schedules.slotDetails")} ({activeDays.length} days, {schedule.slots.length} slots)
        </button>

        {expanded && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 pt-1">
            {DAYS.map(day => {
              const times = byDay[day.value];
              if (!times?.length) return null;
              return (
                <div key={day.value} className="bg-muted/40 rounded-lg p-2.5">
                  <p className="text-xs font-semibold text-foreground mb-1.5">{day.label}</p>
                  <div className="flex flex-wrap gap-1">
                    {times.sort().map(t => (
                      <Badge key={t} variant="outline" className="text-xs px-1.5 py-0 font-mono">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Schedules() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const DAYS = useMemo(() => [
    { label: t("schedules.sunday"),    short: "Sun", value: 0 },
    { label: t("schedules.monday"),    short: "Mon", value: 1 },
    { label: t("schedules.tuesday"),   short: "Tue", value: 2 },
    { label: t("schedules.wednesday"), short: "Wed", value: 3 },
    { label: t("schedules.thursday"),  short: "Thu", value: 4 },
    { label: t("schedules.friday"),    short: "Fri", value: 5 },
    { label: t("schedules.saturday"),  short: "Sat", value: 6 },
  ], [t]);

  const VEHICLE_TYPES = useMemo(() => [
    {
      value: "hiace",
      label: t("schedules.hiace"),
      seats: 14,
      minThreshold: 7,
      description: t("schedules.hiaceDesc"),
    },
    {
      value: "minibus",
      label: t("schedules.minibus"),
      seats: 28,
      minThreshold: 14,
      description: t("schedules.minibusDesc"),
    },
  ], [t]);

  const vehicleMeta = (vt: VehicleType) => {
    return VEHICLE_TYPES.find((v) => v.value === vt) ?? VEHICLE_TYPES[0]!;
  };

  const { data: routesData } = useListRoutes({ limit: 200 });

  const [routeId, setRouteId]           = useState<string>("");
  const [vehicleType, setVehicleType]   = useState<VehicleType>("hiace");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveTo, setEffectiveTo]   = useState("");
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [times, setTimes]               = useState<string[]>(["09:00"]);
  const [newTime, setNewTime]           = useState("10:00");

  const { data: schedulesData, isLoading: schedulesLoading } = useQuery({
    queryKey: ["schedules"],
    queryFn: () => adminFetch<{ data: Schedule[]; total: number }>("/schedules"),
  });

  const createMutation = useMutation({
    mutationFn: (body: object) =>
      adminFetch<{ schedule: Schedule; slots: ScheduleSlot[]; tripsCreated: number }>(
        "/schedules",
        { method: "POST", body: JSON.stringify(body) },
      ),
    onSuccess: (result) => {
      const meta = vehicleMeta(vehicleType);
      toast({
        title: t("schedules.scheduleCreated"),
        description: t("schedules.tripsGenerated", { count: result.tripsCreated, label: meta.label, seats: meta.seats }),
      });
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      setRouteId("");
      setVehicleType("hiace");
      setEffectiveFrom("");
      setEffectiveTo("");
      setSelectedDays([]);
      setTimes(["09:00"]);
    },
    onError: (err: Error) => {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: (id: number) =>
      adminFetch<{ ok: boolean; tripsCreated: number }>(`/schedules/${id}/generate`, { method: "POST" }),
    onSuccess: (result) => {
      toast({ title: t("schedules.reGenerated"), description: t("schedules.newTripsAdded", { count: result.tripsCreated }) });
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
    },
    onError: (err: Error) => {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: number) =>
      adminFetch<{ ok: boolean }>(`/schedules/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: t("schedules.deactivated"), description: t("schedules.deactivatedDesc") });
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
    },
    onError: (err: Error) => {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    },
  });

  function toggleDay(day: number) {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day],
    );
  }

  function addTime() {
    if (!newTime) return;
    if (times.includes(newTime)) return;
    setTimes(prev => [...prev, newTime].sort());
  }

  function removeTime(t: string) {
    setTimes(prev => prev.filter(x => x !== t));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!routeId)  { toast({ title: t("schedules.selectRoute"),            variant: "destructive" }); return; }
    if (!effectiveFrom || !effectiveTo) { toast({ title: t("schedules.setDateRange"), variant: "destructive" }); return; }
    if (new Date(effectiveTo) <= new Date(effectiveFrom)) {
      toast({ title: t("schedules.endDateAfterStart"), variant: "destructive" }); return;
    }
    if (selectedDays.length === 0) { toast({ title: t("schedules.selectOneDay"),            variant: "destructive" }); return; }
    if (times.length === 0)        { toast({ title: t("schedules.addOneTime"),     variant: "destructive" }); return; }

    const slots = selectedDays.flatMap(day =>
      times.map(t => ({ dayOfWeek: day, departureTime: t })),
    );

    createMutation.mutate({
      routeId: parseInt(routeId),
      vehicleType,
      effectiveFrom,
      effectiveTo,
      slots,
    });
  }

  const schedules = schedulesData?.data ?? [];
  const selectedVehicleMeta = vehicleMeta(vehicleType);

  return (
    <div className="p-8 space-y-8 max-w-5xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <CalendarClock className="h-7 w-7 text-primary" />
          {t("schedules.title")}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {t("schedules.subtitle")}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("schedules.createTitle")}</CardTitle>
          <CardDescription>
            {t("schedules.createDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{t("schedules.route")} <span className="text-destructive">*</span></Label>
                <Select value={routeId} onValueChange={setRouteId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("schedules.selectRoutePlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {(routesData?.data ?? []).map((r: any) => (
                      <SelectItem key={r.id} value={String(r.id)}>
                        {r.name} — {r.fromLocation} → {r.toLocation}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>{t("schedules.vehicleType")} <span className="text-destructive">*</span></Label>
                <Select value={vehicleType} onValueChange={(v) => setVehicleType(v as VehicleType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VEHICLE_TYPES.map(vt => (
                      <SelectItem key={vt.value} value={vt.value}>
                        <div className="flex flex-col">
                          <span>{vt.label}</span>
                          <span className="text-xs text-muted-foreground">{vt.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {vehicleType && (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{t("schedules.seatsPerTrip", { seats: selectedVehicleMeta.seats })}</span> ·
                    {t("schedules.autoCancelHint", { min: selectedVehicleMeta.minThreshold })}
                  </p>
                )}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{t("schedules.effectiveFrom")} <span className="text-destructive">*</span></Label>
                <Input type="date" value={effectiveFrom} onChange={e => setEffectiveFrom(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("schedules.effectiveTo")} <span className="text-destructive">*</span></Label>
                <Input type="date" value={effectiveTo} onChange={e => setEffectiveTo(e.target.value)} />
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <Label className="text-sm font-semibold">{t("schedules.operatingDays")} <span className="text-destructive">*</span></Label>
              <div className="flex flex-wrap gap-3">
                {DAYS.map(day => (
                  <div key={day.value} className="flex items-center gap-2">
                    <Checkbox
                      id={`day-${day.value}`}
                      checked={selectedDays.includes(day.value)}
                      onCheckedChange={() => toggleDay(day.value)}
                    />
                    <Label htmlFor={`day-${day.value}`} className="text-sm font-normal cursor-pointer select-none">
                      {day.label}
                    </Label>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 flex-wrap pt-1">
                {[
                  { label: t("schedules.allWeek"),           days: [0,1,2,3,4,5,6] },
                  { label: t("schedules.sunThu"),           days: [0,1,2,3,4] },
                  { label: t("schedules.weekdaysMF"),  days: [1,2,3,4,5] },
                  { label: t("schedules.weekend"),             days: [5,6] },
                ].map(preset => (
                  <Button
                    key={preset.label}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => setSelectedDays(preset.days)}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <Label className="text-sm font-semibold">{t("schedules.departureTimes")} <span className="text-destructive">*</span></Label>
              <div className="flex flex-wrap gap-2 min-h-[36px]">
                {times.length === 0 && (
                  <span className="text-sm text-muted-foreground italic">{t("schedules.noTimes")}</span>
                )}
                {times.map(t => (
                  <div key={t} className="flex items-center gap-1.5 bg-primary/10 text-primary rounded-full px-3 py-1 text-sm font-mono">
                    <Clock className="h-3.5 w-3.5" />
                    {t}
                    <button type="button" onClick={() => removeTime(t)} className="ms-1 hover:text-destructive transition-colors">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  value={newTime}
                  onChange={e => setNewTime(e.target.value)}
                  className="w-36"
                />
                <Button type="button" variant="outline" size="sm" onClick={addTime} className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> {t("schedules.addTime")}
                </Button>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between bg-muted/30 -mx-6 px-6 py-4 rounded-b-lg border-t border-border">
              <div className="text-sm text-muted-foreground">
                {selectedDays.length > 0 && times.length > 0 && effectiveFrom && effectiveTo ? (
                  <span>
                    Will generate approx.{" "}
                    <span className="font-semibold text-foreground">
                      {selectedDays.length} days/week × {times.length} time{times.length > 1 ? "s" : ""}
                    </span>{" "}
                    — each trip: <span className="font-semibold text-foreground">{t("schedules.seatsPerTrip", { seats: selectedVehicleMeta.seats })}</span>
                  </span>
                ) : (
                  t("schedules.fillAllFields")
                )}
              </div>
              <Button type="submit" disabled={createMutation.isPending} className="gap-2">
                <CalendarClock className="h-4 w-4" />
                {createMutation.isPending ? t("schedules.generating") : t("schedules.saveGenerate")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {schedulesLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))
        ) : schedules.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed rounded-xl">
            <CalendarClock className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">{t("common.noData")}</p>
          </div>
        ) : (
          schedules.map((s) => (
            <ScheduleCard
              key={s.id}
              schedule={s}
              onRegenerate={(id) => regenerateMutation.mutate(id)}
              onDeactivate={(id) => deactivateMutation.mutate(id)}
            />
          ))
        )}
      </div>

    </div>
  );
}
