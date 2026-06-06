import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { RefreshCw, ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { format, addDays, subDays } from "date-fns";

interface SlotBooking {
  id: number;
  driverId: number;
  driverName: string;
  driverPhone: string;
  status: "active" | "pending_renewal";
  renewalNotifiedAt: string | null;
  renewalDeadline: string | null;
}

interface RouteSlot {
  slotId: number;
  departureTime: string;
  isActive: boolean;
  isBooked: boolean;
  booking: SlotBooking | null;
}

interface RouteAvailability {
  routeId: number;
  routeName: string;
  fromLocation: string;
  toLocation: string;
  weekStart: string;
  totalSlots: number;
  bookedSlots: number;
  availableSlots: number;
  slots: RouteSlot[];
}

interface AvailabilityResponse {
  weekStart: string;
  data: RouteAvailability[];
  total: number;
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

function addWeeks(dateStr: string, weeks: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().split("T")[0]!;
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

function SlotCell({ slot }: { slot: RouteSlot }) {
  if (!slot.isActive) {
    return (
      <div className="h-10 rounded flex items-center justify-center bg-muted/40 border border-dashed border-muted-foreground/20">
        <span className="text-[10px] text-muted-foreground/50">off</span>
      </div>
    );
  }

  if (!slot.isBooked) {
    return (
      <div className="h-10 rounded flex items-center justify-center bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900">
        <span className="text-xs text-green-700 dark:text-green-400 font-medium">Free</span>
      </div>
    );
  }

  const b = slot.booking!;
  const isPendingRenewal = b.status === "pending_renewal";

  return (
    <TooltipProvider>
      <Tooltip delayDuration={100}>
        <TooltipTrigger asChild>
          <div className={`h-10 rounded flex flex-col items-center justify-center cursor-default border px-1 ${
            isPendingRenewal
              ? "bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700"
              : "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900"
          }`}>
            <span className="text-[10px] font-semibold truncate max-w-full leading-tight text-center">
              {b.driverName.split(" ")[0]}
            </span>
            {isPendingRenewal && (
              <span className="text-[9px] text-amber-600 dark:text-amber-400 leading-tight">renewal</span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1 text-xs">
            <p className="font-semibold">{b.driverName}</p>
            <p className="text-muted-foreground">{b.driverPhone}</p>
            <p>Booking #{b.id}</p>
            <Badge variant={isPendingRenewal ? "secondary" : "default"} className="text-[10px]">
              {isPendingRenewal ? "Pending Renewal" : "Active"}
            </Badge>
            {b.renewalDeadline && (
              <p className="text-muted-foreground">
                Renewal deadline: {format(new Date(b.renewalDeadline), "MMM d, HH:mm")}
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function ShuttleAvailability() {
  const [week, setWeek] = useState(getUpcomingWeekStart());

  const { data, isLoading, refetch } = useQuery<AvailabilityResponse>({
    queryKey: ["admin-shuttle-availability", week],
    queryFn: () => adminFetch(`/admin/shuttle/availability?week=${week}`),
  });

  const allTimes = Array.from(
    new Set(
      (data?.data ?? []).flatMap((r) => r.slots.map((s) => s.departureTime)),
    ),
  ).sort();

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <CalendarDays className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Slot Availability</h1>
            <p className="text-sm text-muted-foreground">
              Available vs booked time slots per route per week
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setWeek((w) => addWeeks(w, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[180px] text-center">
            {data ? formatWeekRange(data.weekStart) : formatWeekRange(week)}
          </span>
          <Button variant="outline" size="icon" onClick={() => setWeek((w) => addWeeks(w, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 flex-wrap text-xs items-center">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded bg-green-50 border border-green-200 dark:bg-green-950/30 dark:border-green-900" />
          <span>Available</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded bg-blue-50 border border-blue-200 dark:bg-blue-950/30 dark:border-blue-900" />
          <span>Booked (active)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded bg-amber-50 border border-amber-300 dark:bg-amber-950/30 dark:border-amber-700" />
          <span>Pending renewal</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded bg-muted/40 border border-dashed border-muted-foreground/20" />
          <span>Inactive slot</span>
        </div>
      </div>

      {/* Summary badges */}
      {data && (
        <div className="flex flex-wrap gap-2">
          {data.data.map((r) => (
            <div key={r.routeId} className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs bg-white dark:bg-slate-900">
              <span className="font-medium">{r.routeName}</span>
              <span className="text-green-600 font-semibold">{r.availableSlots} free</span>
              <span className="text-muted-foreground">/ {r.totalSlots}</span>
            </div>
          ))}
        </div>
      )}

      {/* Grid */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : !data || data.data.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            No active routes with time slots found.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-1">
            <thead>
              <tr>
                <th className="text-left text-xs font-semibold text-muted-foreground pb-1 pr-3 min-w-[160px]">
                  Route
                </th>
                {allTimes.map((t) => (
                  <th key={t} className="text-center text-xs font-semibold text-muted-foreground pb-1 min-w-[80px]">
                    {t}
                  </th>
                ))}
                <th className="text-center text-xs font-semibold text-muted-foreground pb-1 min-w-[80px]">
                  Summary
                </th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((route) => {
                const slotByTime = new Map(route.slots.map((s) => [s.departureTime, s]));
                return (
                  <tr key={route.routeId}>
                    <td className="pr-3 py-0.5 align-middle">
                      <div className="text-sm font-medium leading-tight">{route.routeName}</div>
                      <div className="text-[10px] text-muted-foreground leading-tight">
                        {route.fromLocation} → {route.toLocation}
                      </div>
                    </td>
                    {allTimes.map((t) => {
                      const slot = slotByTime.get(t);
                      return (
                        <td key={t} className="py-0.5 align-middle">
                          {slot ? (
                            <SlotCell slot={slot} />
                          ) : (
                            <div className="h-10 rounded flex items-center justify-center">
                              <span className="text-muted-foreground/30">—</span>
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td className="py-0.5 align-middle text-center">
                      <div className="text-xs">
                        <span className="text-green-600 font-semibold">{route.availableSlots}</span>
                        <span className="text-muted-foreground"> / {route.totalSlots}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">free</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
