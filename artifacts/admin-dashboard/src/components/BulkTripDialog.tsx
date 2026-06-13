import React, { useState, useEffect, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { adminFetch } from "@/lib/api";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CalendarRange, Loader2 } from "lucide-react";

const DAYS = [
  { label: "Sun", value: 0 },
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 },
];

function countPreview(startDate: string, endDate: string, daysOfWeek: number[]): number {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate + "T00:00:00Z");
  const end   = new Date(endDate   + "T00:00:00Z");
  if (start > end) return 0;
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    if (daysOfWeek.length === 0 || daysOfWeek.includes(cur.getUTCDay())) count++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

function todayStr() { return new Date().toISOString().slice(0, 10); }
function weeksFromNow(n: number) {
  const d = new Date(); d.setDate(d.getDate() + n * 7); return d.toISOString().slice(0, 10);
}
function addMinutesToHHMM(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = (h! * 60 + m! + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

interface BulkTripDialogProps {
  routeId: number;
  estimatedDurationMinutes: number;
  allBuses: { id: number; plateNumber: string; capacity: number }[];
  allDrivers: { id: number; name: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function BulkTripDialog({
  routeId, estimatedDurationMinutes, allBuses, allDrivers, open, onOpenChange, onSuccess,
}: BulkTripDialogProps) {
  const { toast } = useToast();

  const [startDate, setStartDate]     = useState(todayStr);
  const [endDate, setEndDate]         = useState(() => weeksFromNow(4));
  const [departureTime, setDep]       = useState("08:00");
  const [arrivalTime, setArr]         = useState("09:00");
  const [busId, setBusId]             = useState<number>(allBuses[0]?.id ?? 0);
  const [driverId, setDriverId]       = useState<number | null>(null);
  const [price, setPrice]             = useState<number>(0);
  const [vehicleType, setVehicleType] = useState<"hiace" | "minibus">("hiace");
  const [daysOfWeek, setDaysOfWeek]   = useState<number[]>([0, 1, 2, 3, 4]); // Sun–Thu default

  // Keep bus in sync if allBuses changes
  useEffect(() => {
    if (allBuses.length > 0 && !allBuses.find(b => b.id === busId)) {
      setBusId(allBuses[0]!.id);
    }
  }, [allBuses]);

  // Auto-compute arrival when departure or route duration changes
  useEffect(() => {
    if (departureTime && estimatedDurationMinutes > 0) {
      setArr(addMinutesToHHMM(departureTime, estimatedDurationMinutes));
    }
  }, [departureTime, estimatedDurationMinutes]);

  const previewCount = useMemo(
    () => countPreview(startDate, endDate, daysOfWeek),
    [startDate, endDate, daysOfWeek],
  );

  const toggleDay = (day: number) =>
    setDaysOfWeek(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort((a, b) => a - b),
    );

  const mutation = useMutation({
    mutationFn: () =>
      adminFetch<{ created: number; skipped: number }>("/admin/trips/bulk", {
        method: "POST",
        body: JSON.stringify({
          routeId,
          busId,
          ...(driverId ? { driverId } : {}),
          departureHHMM: departureTime,
          arrivalHHMM: arrivalTime,
          price,
          vehicleType,
          startDate,
          endDate,
          daysOfWeek,
          skipExisting: true,
        }),
      }),
    onSuccess: (result) => {
      const msg = result.skipped > 0
        ? `Created ${result.created} trips, skipped ${result.skipped} duplicates`
        : `Created ${result.created} trips`;
      toast({ title: msg });
      onOpenChange(false);
      onSuccess();
    },
    onError: (err: any) =>
      toast({ title: err?.message ?? "Failed to bulk create trips", variant: "destructive" }),
  });

  const canSubmit = previewCount > 0 && busId > 0 && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarRange className="h-5 w-5" />
            Bulk Schedule Trips
          </DialogTitle>
          <DialogDescription>
            Create multiple trips at once across a date range on selected weekdays.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start date</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>End date</Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>

          {/* Days of week */}
          <div className="space-y-2">
            <Label>Repeat on</Label>
            <div className="flex gap-1.5 flex-wrap">
              {DAYS.map(d => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => toggleDay(d.value)}
                  className={`w-12 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    daysOfWeek.includes(d.value)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-primary/60"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {daysOfWeek.length === 0
                ? "Every day in the range will be included"
                : `${daysOfWeek.length} day(s)/week`}
            </p>
          </div>

          {/* Times */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Departure (Cairo time)</Label>
              <Input type="time" value={departureTime} onChange={e => setDep(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Arrival (Cairo time)</Label>
              <Input type="time" value={arrivalTime} onChange={e => setArr(e.target.value)} />
            </div>
          </div>

          {/* Bus */}
          <div className="space-y-1.5">
            <Label>Bus</Label>
            <Select value={String(busId)} onValueChange={v => setBusId(Number(v))}>
              <SelectTrigger>
                <SelectValue placeholder="Select bus" />
              </SelectTrigger>
              <SelectContent>
                {allBuses.map(b => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.plateNumber} ({b.capacity} seats)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Driver (optional) */}
          <div className="space-y-1.5">
            <Label>
              Driver{" "}
              <span className="text-muted-foreground font-normal text-xs">(optional — assign later)</span>
            </Label>
            <Select
              value={driverId ? String(driverId) : "none"}
              onValueChange={v => setDriverId(v === "none" ? null : Number(v))}
            >
              <SelectTrigger>
                <SelectValue placeholder="No driver assigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No driver (assign later)</SelectItem>
                {allDrivers.map(d => (
                  <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Price + vehicle type */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Price (EGP)</Label>
              <Input
                type="number" min={0} step={0.5}
                value={price}
                onChange={e => setPrice(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Vehicle type</Label>
              <Select value={vehicleType} onValueChange={v => setVehicleType(v as "hiace" | "minibus")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hiace">Hiace</SelectItem>
                  <SelectItem value="minibus">Minibus</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Preview banner */}
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              previewCount > 0
                ? "bg-green-50 border-green-200 text-green-800 dark:bg-green-950/30 dark:border-green-800 dark:text-green-300"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {previewCount > 0 ? (
              <>
                <span className="font-semibold">{previewCount} trip{previewCount !== 1 ? "s" : ""}</span>
                {" "}will be created between{" "}
                <span className="font-medium">{startDate}</span> and{" "}
                <span className="font-medium">{endDate}</span>
                {" "}at <span className="font-medium">{departureTime}</span> (Cairo).
                {" "}Existing trips at the same time are skipped automatically.
              </>
            ) : (
              "Select a valid date range and at least one day to preview."
            )}
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!canSubmit}>
            {mutation.isPending ? (
              <><Loader2 className="me-2 h-4 w-4 animate-spin" />Creating…</>
            ) : (
              `Create ${previewCount} trip${previewCount !== 1 ? "s" : ""}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
