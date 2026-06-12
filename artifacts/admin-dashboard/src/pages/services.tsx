import React, { useState, useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { useRoute, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useListDrivers, useListBuses, useListTrips } from "@workspace/api-client-react";
import { adminFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Car, Bus, Bike, PackageOpen, Navigation, DollarSign,
  CheckCircle2, XCircle, ArrowRight, Map, UserCircle,
  Settings2, ShieldCheck, Star, Pencil, Check, X,
  ToggleLeft, Radio, MessageSquare, MousePointer,
  Activity, Clock, RotateCcw, History, AlertTriangle,
  WrenchIcon, EyeOff, Zap, Globe,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type PricingConfig = {
  id: number;
  vehicleType: string;
  baseFare: number;
  perKmRate: number;
  perMinuteRate: number;
  minimumFare: number;
  isActive: boolean;
  updatedAt: string;
};

type Ride = {
  id: number;
  status: string;
  fareAmount?: number;
  totalDistance?: number;
  createdAt: string;
  rider?: { name: string };
  driver?: { name: string };
};

type ServiceSettings = {
  isEnabled: boolean;
  minDriverRating: number;
  maxActiveRidesPerDriver: number;
};

type Zone = {
  id: number;
  name: string;
  isActive: boolean;
};

type ServiceControlLog = {
  id: number;
  serviceType: string;
  changedBy: number | null;
  changedAt: string;
  changes: Record<string, { before: unknown; after: unknown }>;
};

type ServiceControlData = {
  id: number;
  serviceType: string;
  isEnabled: boolean;
  displayMode: "live" | "coming_soon" | "unavailable" | "maintenance";
  unavailableMessage: string | null;
  unavailableAction: "none" | "show_message" | "hide_service";
  activeZoneIds: number[];
  maintenanceEta: string | null;
  maxActiveRides: number | null;
  updatedBy: number | null;
  updatedAt: string;
  logs: ServiceControlLog[];
};

// ─── Metadata ─────────────────────────────────────────────────────────────────

const SERVICE_META: Record<string, { icon: React.ElementType; label: string; color: string; bg: string; desc: string }> = {
  car:        { icon: Car,         label: "Car Services",        color: "text-blue-600",   bg: "bg-blue-500/10",   desc: "On-demand car rides — drivers, trips, and pricing" },
  shuttle:    { icon: Bus,         label: "Shuttle Services",    color: "text-amber-600",  bg: "bg-amber-500/10",  desc: "Scheduled shuttle routes, buses, and driver assignments" },
  bike:       { icon: Bike,        label: "Bike Services",       color: "text-green-600",  bg: "bg-green-500/10",  desc: "On-demand bike rides — drivers, trips, and pricing" },
  motorcycle: { icon: Bike,        label: "Motorcycle Services", color: "text-orange-600", bg: "bg-orange-500/10", desc: "On-demand motorcycle rides" },
  delivery:   { icon: PackageOpen, label: "Delivery Services",   color: "text-violet-600", bg: "bg-violet-500/10", desc: "Package and food delivery" },
};

const DISPLAY_MODE_OPTIONS = [
  { value: "live",         label: "Live",         icon: Zap,           desc: "Service is running normally",              color: "text-green-600",  badge: "bg-green-500/10 text-green-600 border-green-300" },
  { value: "coming_soon",  label: "Coming Soon",  icon: Clock,         desc: "Grayed out with 'coming soon' badge",       color: "text-amber-600",  badge: "bg-amber-500/10 text-amber-600 border-amber-300" },
  { value: "unavailable",  label: "Unavailable",  icon: XCircle,       desc: "Show custom message to users",              color: "text-red-600",    badge: "bg-red-500/10 text-red-600 border-red-300" },
  { value: "maintenance",  label: "Maintenance",  icon: WrenchIcon,    desc: "Show message + optional ETA",               color: "text-orange-600", badge: "bg-orange-500/10 text-orange-600 border-orange-300" },
] as const;

const UNAVAILABLE_ACTION_OPTIONS = [
  { value: "none",          label: "Do Nothing",      desc: "Tap does nothing" },
  { value: "show_message",  label: "Show Message",    desc: "Show unavailable message in alert" },
  { value: "hide_service",  label: "Hide Service",    desc: "Service disappears from app entirely" },
] as const;

// ─── Helper components ────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color, loading }: { label: string; value: string | number; icon: React.ElementType; color: string; loading?: boolean }) {
  return (
    <Card>
      <CardContent className="pt-5 flex items-center gap-3">
        <div className={`p-2.5 rounded-lg ${color}`}><Icon className="h-5 w-5" /></div>
        <div>
          {loading ? <Skeleton className="h-7 w-14 mb-1" /> : <p className="text-2xl font-bold">{value}</p>}
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function DisplayModeBadge({ mode }: { mode: string }) {
  const opt = DISPLAY_MODE_OPTIONS.find(o => o.value === mode);
  if (!opt) return null;
  return (
    <Badge variant="outline" className={`text-xs ${opt.badge}`}>
      {opt.label}
    </Badge>
  );
}

function formatChanges(changes: Record<string, { before: unknown; after: unknown }>) {
  return Object.entries(changes).map(([key, { before, after }]) => (
    <span key={key} className="block text-xs">
      <span className="font-medium">{key}</span>:&nbsp;
      <span className="text-red-500 line-through">{JSON.stringify(before)}</span>
      {" → "}
      <span className="text-green-600">{JSON.stringify(after)}</span>
    </span>
  ));
}

// ─── Change Log Modal ─────────────────────────────────────────────────────────

function ChangeLogModal({ type, open, onClose }: { type: ServiceControlType; open: boolean; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["service-control", type],
    queryFn: () => adminFetch<ServiceControlData>(`/admin/services/${type}/control`),
    enabled: open,
  });

  const logs = data?.logs ?? [];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Change Log
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto pe-1 space-y-2 py-2">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-6 text-center">No changes recorded yet.</p>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="p-3 rounded-lg border bg-muted/20 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {log.changedBy ? `Admin #${log.changedBy}` : "System"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(log.changedAt).toLocaleString()}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {formatChanges(log.changes as Record<string, { before: unknown; after: unknown }>)}
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Service Control Panel ────────────────────────────────────────────────────

type ServiceControlType = "shuttle" | "car" | "motorcycle" | "delivery";

function ServiceControlPanel({ type }: { type: ServiceControlType }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["service-control", type],
    queryFn: () => adminFetch<ServiceControlData>(`/admin/services/${type}/control`),
  });

  const [draft, setDraft] = useState<Partial<ServiceControlData>>({});
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (data) {
      setDraft({
        isEnabled: data.isEnabled,
        displayMode: data.displayMode,
        unavailableMessage: data.unavailableMessage,
        unavailableAction: data.unavailableAction,
        activeZoneIds: data.activeZoneIds,
        maintenanceEta: data.maintenanceEta,
        maxActiveRides: data.maxActiveRides,
      });
      setIsDirty(false);
    }
  }, [data]);

  const updateDraft = (patch: Partial<ServiceControlData>) => {
    setDraft(prev => ({ ...prev, ...patch }));
    setIsDirty(true);
  };

  const saveMutation = useMutation({
    mutationFn: (values: Partial<ServiceControlData>) =>
      adminFetch<ServiceControlData>(`/admin/services/${type}/control`, {
        method: "PATCH",
        body: JSON.stringify(values),
      }),
    onSuccess: (updated) => {
      toast({ title: "Control settings saved" });
      queryClient.setQueryData(["service-control", type], updated);
      setIsDirty(false);
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const resetMutation = useMutation({
    mutationFn: () =>
      adminFetch<ServiceControlData>(`/admin/services/${type}/control/reset`, { method: "POST" }),
    onSuccess: (updated) => {
      toast({ title: "Reset to defaults" });
      queryClient.setQueryData(["service-control", type], updated);
      setIsDirty(false);
    },
    onError: (err: Error) => {
      toast({ title: "Reset failed", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading || !data || draft.isEnabled === undefined) {
    return (
      <Card>
        <CardContent className="pt-5 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Service Control
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <DisplayModeBadge mode={data.displayMode} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending}
              className="gap-1.5 text-xs"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
            {isDirty && (
              <Button
                size="sm"
                onClick={() => saveMutation.mutate(draft)}
                disabled={saveMutation.isPending}
                className="gap-1.5"
              >
                <Check className="h-3.5 w-3.5" />
                {saveMutation.isPending ? "Saving…" : "Save Changes"}
              </Button>
            )}
          </div>
        </div>
        <CardDescription>
          Control service visibility and availability in passenger and driver apps.{" "}
          <Link href={`/services/${type}/zones`} className="inline-flex items-center gap-1 text-primary font-medium hover:underline">
            <Globe className="h-3.5 w-3.5" />
            Manage Available Zones
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* 1 — Master toggle */}
        <div className="flex items-center justify-between gap-4 p-4 rounded-lg border bg-muted/30">
          <div className="flex items-center gap-2.5">
            <ToggleLeft className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Master Switch</p>
              <p className="text-xs text-muted-foreground">Enable or disable this service globally</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={draft.isEnabled ?? data.isEnabled}
              onCheckedChange={(v) => updateDraft({ isEnabled: v })}
            />
            <span className={`text-xs font-medium ${(draft.isEnabled ?? data.isEnabled) ? "text-green-600" : "text-muted-foreground"}`}>
              {(draft.isEnabled ?? data.isEnabled) ? "Enabled" : "Disabled"}
            </span>
          </div>
        </div>

        <Separator />

        {/* 2 — Display mode */}
        <div className="space-y-3">
          <Label className="text-sm font-medium flex items-center gap-2">
            <Radio className="h-4 w-4 text-muted-foreground" />
            Display Mode
          </Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {DISPLAY_MODE_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const selected = (draft.displayMode ?? data.displayMode) === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => updateDraft({ displayMode: opt.value })}
                  className={`flex items-start gap-3 p-3 rounded-lg border text-start transition-all ${
                    selected
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-border bg-muted/20 hover:bg-muted/50"
                  }`}
                >
                  <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${opt.color}`} />
                  <div>
                    <p className="text-sm font-medium">{opt.label}</p>
                    <p className="text-xs text-muted-foreground">{opt.desc}</p>
                  </div>
                  {selected && <CheckCircle2 className="h-4 w-4 text-primary ms-auto shrink-0 mt-0.5" />}
                </button>
              );
            })}
          </div>
        </div>

        <Separator />

        {/* 3 — Unavailable message */}
        <div className="space-y-2">
          <Label className="text-sm font-medium flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            Unavailable Message
          </Label>
          <p className="text-xs text-muted-foreground">Shown to passengers and drivers when display mode is not Live</p>
          <Textarea
            placeholder="e.g. This service is temporarily unavailable. Please try again later."
            value={draft.unavailableMessage ?? ""}
            onChange={(e) => updateDraft({ unavailableMessage: e.target.value || null })}
            rows={3}
            className="resize-none text-sm"
          />
        </div>

        <Separator />

        {/* 4 — Unavailable action */}
        <div className="space-y-3">
          <Label className="text-sm font-medium flex items-center gap-2">
            <MousePointer className="h-4 w-4 text-muted-foreground" />
            Action on Tap (when service is disabled)
          </Label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {UNAVAILABLE_ACTION_OPTIONS.map((opt) => {
              const selected = (draft.unavailableAction ?? data.unavailableAction) === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => updateDraft({ unavailableAction: opt.value })}
                  className={`flex flex-col gap-1 p-3 rounded-lg border text-start transition-all ${
                    selected
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-border bg-muted/20 hover:bg-muted/50"
                  }`}
                >
                  <p className="text-sm font-medium">{opt.label}</p>
                  <p className="text-xs text-muted-foreground">{opt.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        <Separator />

        {/* 5 — Maintenance ETA (shown when maintenance mode) */}
        {(draft.displayMode ?? data.displayMode) === "maintenance" && (
          <>
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Maintenance ETA (optional)
              </Label>
              <p className="text-xs text-muted-foreground">When do you expect the service to resume?</p>
              <Input
                type="datetime-local"
                value={draft.maintenanceEta ? new Date(draft.maintenanceEta).toISOString().slice(0, 16) : ""}
                onChange={(e) => updateDraft({ maintenanceEta: e.target.value ? new Date(e.target.value).toISOString() : null })}
                className="text-sm max-w-xs"
              />
            </div>
            <Separator />
          </>
        )}

        {/* 6 — Capacity limit */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              Max Active Rides Capacity
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">Cap concurrent active rides (leave empty = no limit)</p>
          </div>
          <Input
            type="number"
            min="1"
            placeholder="No limit"
            value={draft.maxActiveRides ?? ""}
            onChange={(e) => updateDraft({ maxActiveRides: e.target.value ? parseInt(e.target.value) : null })}
            className="w-28 text-end text-sm"
          />
        </div>


      </CardContent>
    </Card>
  );
}

// ─── Original ServiceSettingsPanel (driver requirements) ─────────────────────

function ServiceSettingsPanel({ type }: { type: "car" | "shuttle" | "bike" }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ServiceSettings | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["service-settings", type],
    queryFn: () => adminFetch<ServiceSettings>(`/admin/services/${type}/settings`),
  });

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const mutation = useMutation({
    mutationFn: (values: Partial<ServiceSettings>) =>
      adminFetch<ServiceSettings>(`/admin/services/${type}/settings`, {
        method: "PATCH",
        body: JSON.stringify(values),
      }),
    onSuccess: (updated) => {
      toast({ title: "Settings saved" });
      queryClient.setQueryData(["service-settings", type], updated);
      setDraft(updated);
      setEditing(false);
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const toggleEnabled = () => {
    if (!data) return;
    mutation.mutate({ isEnabled: !data.isEnabled });
  };

  const handleSave = () => {
    if (!draft) return;
    mutation.mutate(draft);
  };

  if (isLoading || !data || !draft) {
    return (
      <Card>
        <CardContent className="pt-5 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  const display = editing ? draft : data;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            Driver Requirements
          </CardTitle>
          <div className="flex items-center gap-2">
            {!editing && (
              <Button variant="outline" size="sm" onClick={() => { setDraft(data); setEditing(true); }} className="gap-1.5">
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
            )}
          </div>
        </div>
        <CardDescription>Configure driver requirements and service constraints</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <Separator />

        <div className="flex items-center justify-between gap-4">
          <div>
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <Star className="h-3.5 w-3.5 text-amber-500" /> Minimum Driver Rating
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">Drivers below this rating cannot accept rides</p>
          </div>
          {editing ? (
            <Input
              type="number"
              step="0.1"
              min="0"
              max="5"
              value={draft.minDriverRating}
              onChange={(e) => setDraft({ ...draft, minDriverRating: parseFloat(e.target.value) || 0 })}
              className="w-24 text-end"
            />
          ) : (
            <span className="text-lg font-bold">{display.minDriverRating.toFixed(1)} ★</span>
          )}
        </div>

        <Separator />

        <div className="flex items-center justify-between gap-4">
          <div>
            <Label className="text-sm font-medium">Max Active Rides per Driver</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Concurrent rides a driver can handle</p>
          </div>
          {editing ? (
            <Input
              type="number"
              min="1"
              max="10"
              value={draft.maxActiveRidesPerDriver}
              onChange={(e) => setDraft({ ...draft, maxActiveRidesPerDriver: parseInt(e.target.value) || 1 })}
              className="w-24 text-end"
            />
          ) : (
            <span className="text-lg font-bold">{display.maxActiveRidesPerDriver}</span>
          )}
        </div>

        {editing && (
          <div className="flex items-center gap-2 pt-2">
            <Button onClick={handleSave} disabled={mutation.isPending} className="gap-1.5">
              <Check className="h-3.5 w-3.5" />
              {mutation.isPending ? "Saving…" : "Save Changes"}
            </Button>
            <Button variant="ghost" onClick={() => { setDraft(data); setEditing(false); }} className="gap-1.5">
              <X className="h-3.5 w-3.5" /> Cancel
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Car / Bike view ──────────────────────────────────────────────────────────

function CarBikeView({ type }: { type: "car" | "bike" }) {
  const meta = SERVICE_META[type];
  const Icon = meta.icon;
  const [changeLogOpen, setChangeLogOpen] = useState(false);

  const ridesQuery = useQuery({
    queryKey: ["admin-rides", type],
    queryFn: () => adminFetch<{ data: Ride[]; total: number }>(`/admin/rides?vehicleType=${type}&limit=50`),
    refetchInterval: 30_000,
  });

  const pricingQuery = useQuery({
    queryKey: ["admin-rides-pricing"],
    queryFn: () => adminFetch<{ data: PricingConfig[] }>("/admin/rides/pricing"),
  });

  const rides = ridesQuery.data?.data ?? [];
  const total = ridesQuery.data?.total ?? 0;
  const active = rides.filter((r) => ["searching", "accepted", "arrived", "in_progress"].includes(r.status)).length;
  const completed = rides.filter((r) => r.status === "completed").length;
  const cancelled = rides.filter((r) => r.status === "cancelled").length;
  const pricing = pricingQuery.data?.data?.find((p) => p.vehicleType === type);

  return (
    <div className="p-6 space-y-6">
      <ChangeLogModal type={type as ServiceControlType} open={changeLogOpen} onClose={() => setChangeLogOpen(false)} />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-xl ${meta.bg}`}>
            <Icon className={`h-6 w-6 ${meta.color}`} />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{meta.label}</h1>
            <p className="text-sm text-muted-foreground">{meta.desc}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => setChangeLogOpen(true)}>
          <History className="h-3.5 w-3.5" />
          Change Log
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Rides"  value={total}     icon={Navigation}    color="bg-primary/10 text-primary"        loading={ridesQuery.isLoading} />
        <StatCard label="Active Now"   value={active}    icon={CheckCircle2}  color="bg-blue-500/10 text-blue-600"      loading={ridesQuery.isLoading} />
        <StatCard label="Completed"    value={completed} icon={CheckCircle2}  color="bg-green-500/10 text-green-600"    loading={ridesQuery.isLoading} />
        <StatCard label="Cancelled"    value={cancelled} icon={XCircle}       color="bg-red-500/10 text-red-500"        loading={ridesQuery.isLoading} />
      </div>

      <ServiceControlPanel type={type as ServiceControlType} />
      <ServiceSettingsPanel type={type} />

      {pricingQuery.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : pricing ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Current Pricing
              <Badge
                variant="outline"
                className={`ms-auto text-xs ${pricing.isActive ? "text-green-600 border-green-300" : "text-red-500 border-red-300"}`}
              >
                {pricing.isActive ? "Active" : "Inactive"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Base Fare",    value: `$${pricing.baseFare.toFixed(2)}` },
                { label: "Per Km",       value: `$${pricing.perKmRate.toFixed(2)}` },
                { label: "Per Minute",   value: `$${pricing.perMinuteRate.toFixed(2)}` },
                { label: "Minimum Fare", value: `$${pricing.minimumFare.toFixed(2)}` },
              ].map((item) => (
                <div key={item.label} className="p-3 rounded-lg bg-muted/50 text-center">
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="text-xl font-bold mt-1">{item.value}</p>
                </div>
              ))}
            </div>
            <Link href={`/pricing/${type}`}>
              <Button variant="outline" size="sm" className="gap-1.5">
                Edit Pricing <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Rides</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {ridesQuery.isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : rides.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">No rides found</div>
          ) : (
            <div className="divide-y divide-border">
              {rides.slice(0, 10).map((ride) => (
                <div key={ride.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Ride #{ride.id}</p>
                    <p className="text-xs text-muted-foreground">
                      {ride.rider?.name ?? "Unknown rider"}
                      {ride.driver?.name ? ` · ${ride.driver.name}` : " · Unassigned"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {ride.fareAmount != null && (
                      <span className="text-sm font-semibold">${ride.fareAmount.toFixed(2)}</span>
                    )}
                    <Badge
                      variant="outline"
                      className={
                        ride.status === "completed"   ? "text-green-600 border-green-200 bg-green-50 dark:bg-green-950" :
                        ride.status === "cancelled"   ? "text-red-500 border-red-200 bg-red-50 dark:bg-red-950" :
                        ride.status === "in_progress" ? "text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-950" :
                                                        "text-amber-600 border-amber-200 bg-amber-50 dark:bg-amber-950"
                      }
                    >
                      {ride.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Shuttle view ─────────────────────────────────────────────────────────────

function ShuttleView() {
  const [changeLogOpen, setChangeLogOpen] = useState(false);
  const routesQuery = useQuery({
    queryKey: ["routes-count"],
    queryFn: () => adminFetch<{ data: unknown[]; total: number }>("/routes?limit=1"),
  });
  const { data: busesData, isLoading: busesLoading } = useListBuses({ limit: 1 });
  const { data: driversData, isLoading: driversLoading } = useListDrivers({ limit: 1 });
  const { data: tripsData, isLoading: tripsLoading } = useListTrips({ limit: 1 });

  return (
    <div className="p-6 space-y-6">
      <ChangeLogModal type="shuttle" open={changeLogOpen} onClose={() => setChangeLogOpen(false)} />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-amber-500/10">
            <Bus className="h-6 w-6 text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Shuttle Services</h1>
            <p className="text-sm text-muted-foreground">Overview of scheduled shuttle operations</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => setChangeLogOpen(true)}>
          <History className="h-3.5 w-3.5" />
          Change Log
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Routes"          value={routesQuery.data?.total  ?? 0} icon={Map}        color="bg-amber-500/10 text-amber-600"  loading={routesQuery.isLoading} />
        <StatCard label="Buses"           value={busesData?.total         ?? 0} icon={Bus}        color="bg-blue-500/10 text-blue-600"    loading={busesLoading} />
        <StatCard label="Drivers"         value={driversData?.total       ?? 0} icon={UserCircle} color="bg-green-500/10 text-green-600"   loading={driversLoading} />
        <StatCard label="Trips Scheduled" value={tripsData?.total         ?? 0} icon={Navigation} color="bg-primary/10 text-primary"       loading={tripsLoading} />
      </div>

      <ServiceControlPanel type="shuttle" />
      <ServiceSettingsPanel type="shuttle" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Manage Routes",    desc: "Create and edit shuttle routes and stations",  href: "/routes",   icon: Map,        color: "bg-amber-500/10 text-amber-600" },
          { label: "Fleet Management", desc: "Register and manage the bus fleet",             href: "/vehicles", icon: Bus,        color: "bg-blue-500/10 text-blue-600" },
          { label: "Driver Roster",    desc: "Assign and manage shuttle drivers",             href: "/drivers",  icon: UserCircle, color: "bg-green-500/10 text-green-600" },
        ].map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="cursor-pointer hover:shadow-md transition-all hover:border-primary/30 h-full">
              <CardContent className="pt-5">
                <div className={`p-2.5 rounded-lg ${item.color} w-fit mb-3`}>
                  <item.icon className="h-5 w-5" />
                </div>
                <p className="font-semibold text-sm">{item.label}</p>
                <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>
                <div className="flex items-center gap-1 text-xs text-primary mt-3 font-medium">
                  Open <ArrowRight className="h-3 w-3" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ─── Motorcycle view ──────────────────────────────────────────────────────────

function MotorcycleView() {
  const [changeLogOpen, setChangeLogOpen] = useState(false);
  return (
    <div className="p-6 space-y-6">
      <ChangeLogModal type="motorcycle" open={changeLogOpen} onClose={() => setChangeLogOpen(false)} />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-orange-500/10">
            <Bike className="h-6 w-6 text-orange-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Motorcycle Services</h1>
            <p className="text-sm text-muted-foreground">On-demand motorcycle rides</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => setChangeLogOpen(true)}>
          <History className="h-3.5 w-3.5" />
          Change Log
        </Button>
      </div>
      <ServiceControlPanel type="motorcycle" />
    </div>
  );
}

// ─── Delivery view ────────────────────────────────────────────────────────────

function DeliveryView() {
  const [changeLogOpen, setChangeLogOpen] = useState(false);
  return (
    <div className="p-6 space-y-6">
      <ChangeLogModal type="delivery" open={changeLogOpen} onClose={() => setChangeLogOpen(false)} />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-violet-500/10">
            <PackageOpen className="h-6 w-6 text-violet-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Delivery Services</h1>
            <p className="text-sm text-muted-foreground">Package and food delivery</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => setChangeLogOpen(true)}>
          <History className="h-3.5 w-3.5" />
          Change Log
        </Button>
      </div>
      <ServiceControlPanel type="delivery" />
    </div>
  );
}

// ─── Services Landing Page ────────────────────────────────────────────────────

const LANDING_CARDS = [
  {
    type: "car",
    icon: Car,
    label: "Car Services",
    desc: "On-demand car rides — manage drivers, pricing, and service availability",
    color: "text-blue-600",
    bg: "bg-blue-500/10",
    border: "hover:border-blue-300",
    href: "/services/car",
  },
  {
    type: "shuttle",
    icon: Bus,
    label: "Shuttle Services",
    desc: "Scheduled shuttle routes, buses, driver assignments, and capacity",
    color: "text-amber-600",
    bg: "bg-amber-500/10",
    border: "hover:border-amber-300",
    href: "/services/shuttle",
  },
  {
    type: "motorcycle",
    icon: Bike,
    label: "Motorcycle Services",
    desc: "On-demand motorcycle rides — control availability and zone access",
    color: "text-orange-600",
    bg: "bg-orange-500/10",
    border: "hover:border-orange-300",
    href: "/services/motorcycle",
  },
  {
    type: "delivery",
    icon: PackageOpen,
    label: "Delivery Services",
    desc: "Package and food delivery — configure availability and service mode",
    color: "text-violet-600",
    bg: "bg-violet-500/10",
    border: "hover:border-violet-300",
    href: "/services/delivery",
  },
] as const;

type ServiceControlSnapshot = {
  serviceType: string;
  isEnabled: boolean;
  displayMode: string;
  unavailableMessage?: string | null;
  unavailableAction?: string;
};

function ServicesLanding() {
  const allControlsQuery = useQuery({
    queryKey: ["service-controls-all"],
    queryFn: () => adminFetch<{ data: ServiceControlSnapshot[] }>("/services/control"),
  });

  const [liveMap, setLiveMap] = useState<Record<string, ServiceControlSnapshot>>({});
  const [flashSet, setFlashSet] = useState<Set<string>>(new Set());
  const socketRef = useRef<Socket | null>(null);
  const flashTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const triggerFlash = useCallback((serviceType: string) => {
    if (flashTimers.current[serviceType]) {
      clearTimeout(flashTimers.current[serviceType]);
    }
    setFlashSet((prev) => new Set(prev).add(serviceType));
    flashTimers.current[serviceType] = setTimeout(() => {
      setFlashSet((prev) => {
        const next = new Set(prev);
        next.delete(serviceType);
        return next;
      });
    }, 1200);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    const socket = io(window.location.origin, {
      path: "/api/socket.io",
      auth: { token },
      transports: ["websocket", "polling"],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    socketRef.current = socket;

    socket.on("service:control:changed", (payload: ServiceControlSnapshot) => {
      setLiveMap((prev) => ({ ...prev, [payload.serviceType]: payload }));
      triggerFlash(payload.serviceType);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      Object.values(flashTimers.current).forEach(clearTimeout);
    };
  }, [triggerFlash]);

  const baseMap: Record<string, ServiceControlSnapshot> = Object.fromEntries(
    (allControlsQuery.data?.data ?? []).map((c) => [c.serviceType, c])
  );
  const controlMap = { ...baseMap, ...liveMap };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Services</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage availability, display mode, and service controls for each transport type
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          Live
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {LANDING_CARDS.map(({ type, icon: Icon, label, desc, color, bg, border, href }) => {
          const control = controlMap[type];
          const isFlashing = flashSet.has(type);
          const isDisabled = control && !control.isEnabled;

          return (
            <Link key={type} href={href}>
              <Card
                className={[
                  "cursor-pointer hover:shadow-md transition-all h-full",
                  border,
                  isFlashing ? "ring-2 ring-primary/40 shadow-md" : "",
                  isDisabled ? "opacity-70" : "",
                ].filter(Boolean).join(" ")}
                style={isFlashing ? { animation: "serviceFlash 1.2s ease-out" } : undefined}
              >
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-xl ${bg} shrink-0 transition-transform duration-300 ${isFlashing ? "scale-110" : ""}`}>
                      <Icon className={`h-6 w-6 ${color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-base">{label}</p>
                        {control ? (
                          <DisplayModeBadge mode={control.displayMode} />
                        ) : null}
                        {isDisabled && (
                          <Badge variant="outline" className="text-xs text-red-500 border-red-300 bg-red-50 dark:bg-red-950">
                            Disabled
                          </Badge>
                        )}
                        {isFlashing && (
                          <span className="text-xs text-primary font-medium animate-pulse">
                            Updated
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{desc}</p>
                      <div className="flex items-center gap-1 text-xs text-primary mt-3 font-medium">
                        Open Control Panel <ArrowRight className="h-3 w-3" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <style>{`
        @keyframes serviceFlash {
          0%   { background-color: hsl(var(--primary) / 0.08); }
          60%  { background-color: hsl(var(--primary) / 0.04); }
          100% { background-color: transparent; }
        }
      `}</style>
    </div>
  );
}

// ─── Root page ────────────────────────────────────────────────────────────────

export default function Services() {
  const [matchType, params] = useRoute("/services/:type");

  if (!matchType) return <ServicesLanding />;

  const type = params?.type ?? "car";

  if (type === "delivery") return <DeliveryView />;
  if (type === "motorcycle") return <MotorcycleView />;
  if (type === "shuttle") return <ShuttleView />;
  if (type === "car" || type === "bike") return <CarBikeView type={type as "car" | "bike"} />;
  return <ServicesLanding />;
}
