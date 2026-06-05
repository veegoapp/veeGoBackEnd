import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { CalendarClock, Plus, Trash2, RefreshCw, ToggleLeft, ChevronDown, ChevronRight, CalendarDays, Clock, Bus, Map } from "lucide-react";
import { format, parseISO } from "date-fns";

const DAYS = [
  { label: "Sunday", short: "Sun", value: 0 },
  { label: "Monday", short: "Mon", value: 1 },
  { label: "Tuesday", short: "Tue", value: 2 },
  { label: "Wednesday", short: "Wed", value: 3 },
  { label: "Thursday", short: "Thu", value: 4 },
  { label: "Friday", short: "Fri", value: 5 },
  { label: "Saturday", short: "Sat", value: 6 },
];

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
  const [expanded, setExpanded] = useState(false);
  const byDay = groupSlotsByDay(schedule.slots);
  const activeDays = DAYS.filter(d => byDay[d.value]);

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
                {schedule.isActive ? "Active" : "Inactive"}
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
                  <RefreshCw className="h-3 w-3" /> Re-generate
                </Button>
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/5" onClick={() => onDeactivate(schedule.id)}>
                  <ToggleLeft className="h-3 w-3" /> Deactivate
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
            <Bus className="h-4 w-4 text-primary/70" />
            <span>Default capacity: <span className="font-medium text-foreground">{schedule.defaultCapacity}</span></span>
          </div>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {[
            { label: "Total", value: schedule.tripStats.total, cls: "bg-muted/50" },
            { label: "Waiting", value: schedule.tripStats.waiting, cls: "bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300" },
            { label: "Assigned", value: schedule.tripStats.assigned, cls: "bg-blue-50 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300" },
            { label: "Completed", value: schedule.tripStats.completed, cls: "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300" },
            { label: "Cancelled", value: schedule.tripStats.cancelled, cls: "bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300" },
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
          {expanded ? "Hide" : "Show"} slot details ({activeDays.length} days, {schedule.slots.length} slots)
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
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: routesData } = useListRoutes({ limit: 200 });

  const [routeId, setRouteId] = useState<string>("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveTo, setEffectiveTo] = useState("");
  const [defaultCapacity, setDefaultCapacity] = useState(40);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [times, setTimes] = useState<string[]>(["09:00"]);
  const [newTime, setNewTime] = useState("10:00");

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
      toast({
        title: "Schedule created",
        description: `${result.tripsCreated} trips generated successfully across the date range.`,
      });
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      setRouteId("");
      setEffectiveFrom("");
      setEffectiveTo("");
      setDefaultCapacity(40);
      setSelectedDays([]);
      setTimes(["09:00"]);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: (id: number) =>
      adminFetch<{ ok: boolean; tripsCreated: number }>(`/schedules/${id}/generate`, { method: "POST" }),
    onSuccess: (result) => {
      toast({ title: "Re-generated", description: `${result.tripsCreated} new trips added.` });
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: number) =>
      adminFetch<{ ok: boolean }>(`/schedules/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Schedule deactivated", description: "Future unassigned trips have been cancelled." });
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
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

    if (!routeId) { toast({ title: "Select a route", variant: "destructive" }); return; }
    if (!effectiveFrom || !effectiveTo) { toast({ title: "Set the date range", variant: "destructive" }); return; }
    if (new Date(effectiveTo) <= new Date(effectiveFrom)) {
      toast({ title: "End date must be after start date", variant: "destructive" }); return;
    }
    if (selectedDays.length === 0) { toast({ title: "Select at least one day", variant: "destructive" }); return; }
    if (times.length === 0) { toast({ title: "Add at least one departure time", variant: "destructive" }); return; }

    const slots = selectedDays.flatMap(day =>
      times.map(t => ({ dayOfWeek: day, departureTime: t })),
    );

    createMutation.mutate({
      routeId: parseInt(routeId),
      effectiveFrom,
      effectiveTo,
      defaultCapacity,
      slots,
    });
  }

  const schedules = schedulesData?.data ?? [];

  return (
    <div className="p-8 space-y-8 max-w-5xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <CalendarClock className="h-7 w-7 text-primary" />
          Schedule Manager
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Define recurring departure slots for a route. Trips are bulk-generated automatically.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create New Schedule</CardTitle>
          <CardDescription>
            Configure a route, date range, days, and departure times. One trip row will be created per matching day + time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Route <span className="text-destructive">*</span></Label>
                <Select value={routeId} onValueChange={setRouteId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a route…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(routesData?.data ?? []).map(r => (
                      <SelectItem key={r.id} value={String(r.id)}>
                        {r.name} — {r.fromLocation} → {r.toLocation}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Default Seat Capacity <span className="text-destructive">*</span></Label>
                <Input
                  type="number"
                  min={1}
                  max={500}
                  value={defaultCapacity}
                  onChange={e => setDefaultCapacity(Number(e.target.value))}
                  placeholder="40"
                />
                <p className="text-xs text-muted-foreground">Used for generated trips until a bus is assigned.</p>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Effective From <span className="text-destructive">*</span></Label>
                <Input type="date" value={effectiveFrom} onChange={e => setEffectiveFrom(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Effective To <span className="text-destructive">*</span></Label>
                <Input type="date" value={effectiveTo} onChange={e => setEffectiveTo(e.target.value)} />
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <Label className="text-sm font-semibold">Operating Days <span className="text-destructive">*</span></Label>
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
                  { label: "All week", days: [0,1,2,3,4,5,6] },
                  { label: "Sun – Thu", days: [0,1,2,3,4] },
                  { label: "Weekdays (Mon–Fri)", days: [1,2,3,4,5] },
                  { label: "Weekend", days: [5,6] },
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
              <Label className="text-sm font-semibold">Departure Times <span className="text-destructive">*</span></Label>
              <div className="flex flex-wrap gap-2 min-h-[36px]">
                {times.length === 0 && (
                  <span className="text-sm text-muted-foreground italic">No times added yet.</span>
                )}
                {times.map(t => (
                  <div key={t} className="flex items-center gap-1.5 bg-primary/10 text-primary rounded-full px-3 py-1 text-sm font-mono">
                    <Clock className="h-3.5 w-3.5" />
                    {t}
                    <button type="button" onClick={() => removeTime(t)} className="ml-1 hover:text-destructive transition-colors">
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
                  <Plus className="h-3.5 w-3.5" /> Add Time
                </Button>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between bg-muted/30 -mx-6 px-6 py-4 rounded-b-lg border-t border-border">
              <div className="text-sm text-muted-foreground">
                {selectedDays.length > 0 && times.length > 0 && effectiveFrom && effectiveTo ? (
                  <span>
                    Will generate approx.{" "}
                    <span className="font-semibold text-foreground">
                      {selectedDays.length} days/week × {times.length} times
                    </span>{" "}
                    across the date range.
                  </span>
                ) : (
                  "Fill all fields to see the estimate."
                )}
              </div>
              <Button type="submit" disabled={createMutation.isPending} className="gap-2">
                <CalendarClock className="h-4 w-4" />
                {createMutation.isPending ? "Generating…" : "Save & Generate Trips"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Existing Schedules</h2>
          <Badge variant="outline">{schedules.length} total</Badge>
        </div>

        {schedulesLoading ? (
          <div className="space-y-3">
            {[1, 2].map(i => <Skeleton key={i} className="h-36 w-full rounded-xl" />)}
          </div>
        ) : schedules.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <CalendarClock className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No schedules yet</p>
              <p className="text-sm mt-1">Create your first schedule above to start generating trips.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {schedules.map(s => (
              <ScheduleCard
                key={s.id}
                schedule={s}
                onRegenerate={id => regenerateMutation.mutate(id)}
                onDeactivate={id => deactivateMutation.mutate(id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
