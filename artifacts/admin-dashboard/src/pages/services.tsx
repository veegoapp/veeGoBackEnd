import React, { useState, useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { useRoute, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
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

// ─── Metadata (static style data — labels come from i18n) ─────────────────────

const SERVICE_META_STATIC: Record<string, { icon: React.ElementType; color: string; bg: string; labelKey: string; descShortKey: string }> = {
  car:        { icon: Car,         color: "text-blue-600",   bg: "bg-blue-500/10",   labelKey: "services.carLabel",         descShortKey: "services.carDescShort" },
  shuttle:    { icon: Bus,         color: "text-amber-600",  bg: "bg-amber-500/10",  labelKey: "services.shuttleLabel",     descShortKey: "services.shuttleDescShort" },
  bike:       { icon: Bike,        color: "text-green-600",  bg: "bg-green-500/10",  labelKey: "services.bikeLabel",        descShortKey: "services.bikeDescShort" },
  motorcycle: { icon: Bike,        color: "text-orange-600", bg: "bg-orange-500/10", labelKey: "services.motorcycleLabel",  descShortKey: "services.motorcycleDescShort" },
  delivery:   { icon: PackageOpen, color: "text-violet-600", bg: "bg-violet-500/10", labelKey: "services.deliveryLabel",    descShortKey: "services.deliveryDescShort" },
};

const DISPLAY_MODE_OPTIONS = [
  { value: "live",         labelKey: "services.displayLive",         descKey: "services.displayLiveDesc",         icon: Zap,        color: "text-green-600",  badge: "bg-green-500/10 text-green-600 border-green-300" },
  { value: "coming_soon",  labelKey: "services.displayComingSoon",    descKey: "services.displayComingSoonDesc",    icon: Clock,      color: "text-amber-600",  badge: "bg-amber-500/10 text-amber-600 border-amber-300" },
  { value: "unavailable",  labelKey: "services.displayUnavailable",   descKey: "services.displayUnavailableDesc",   icon: XCircle,    color: "text-red-600",    badge: "bg-red-500/10 text-red-600 border-red-300" },
  { value: "maintenance",  labelKey: "services.displayMaintenance",   descKey: "services.displayMaintenanceDesc",   icon: WrenchIcon, color: "text-orange-600", badge: "bg-orange-500/10 text-orange-600 border-orange-300" },
] as const;

const UNAVAILABLE_ACTION_OPTIONS = [
  { value: "none",          labelKey: "services.actionNone",         descKey: "services.actionNoneDesc" },
  { value: "show_message",  labelKey: "services.actionShowMessage",  descKey: "services.actionShowMessageDesc" },
  { value: "hide_service",  labelKey: "services.actionHideService",  descKey: "services.actionHideServiceDesc" },
] as const;

const LANDING_CARDS_STATIC = [
  { type: "car",        icon: Car,         color: "text-blue-600",   bg: "bg-blue-500/10",   border: "hover:border-blue-300",   href: "/services/car",        labelKey: "services.carLabel",        descKey: "services.carDesc" },
  { type: "shuttle",    icon: Bus,         color: "text-amber-600",  bg: "bg-amber-500/10",  border: "hover:border-amber-300",  href: "/services/shuttle",    labelKey: "services.shuttleLabel",    descKey: "services.shuttleDesc" },
  { type: "motorcycle", icon: Bike,        color: "text-orange-600", bg: "bg-orange-500/10", border: "hover:border-orange-300", href: "/services/motorcycle", labelKey: "services.motorcycleLabel", descKey: "services.motorcycleDesc" },
  { type: "delivery",   icon: PackageOpen, color: "text-violet-600", bg: "bg-violet-500/10", border: "hover:border-violet-300", href: "/services/delivery",   labelKey: "services.deliveryLabel",   descKey: "services.deliveryDesc" },
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
  const { t } = useTranslation();
  const opt = DISPLAY_MODE_OPTIONS.find(o => o.value === mode);
  if (!opt) return null;
  return (
    <Badge variant="outline" className={`text-xs ${opt.badge}`}>
      {t(opt.labelKey)}
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

type ServiceControlType = "shuttle" | "car" | "motorcycle" | "delivery";

function ChangeLogModal({ type, open, onClose }: { type: ServiceControlType; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
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
            {t("services.changeLog")}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto pe-1 space-y-2 py-2">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-6 text-center">{t("services.noChangesYet")}</p>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="p-3 rounded-lg border bg-muted/20 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {log.changedBy ? t("services.adminNum", { id: log.changedBy }) : t("services.system")}
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

function ServiceControlPanel({ type }: { type: ServiceControlType }) {
  const { t } = useTranslation();
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
      toast({ title: t("services.controlSaved") });
      queryClient.setQueryData(["service-control", type], updated);
      setIsDirty(false);
    },
    onError: (err: Error) => {
      toast({ title: t("services.controlSaveFailed"), description: err.message, variant: "destructive" });
    },
  });

  const resetMutation = useMutation({
    mutationFn: () =>
      adminFetch<ServiceControlData>(`/admin/services/${type}/control/reset`, { method: "POST" }),
    onSuccess: (updated) => {
      toast({ title: t("services.resetDefaults") });
      queryClient.setQueryData(["service-control", type], updated);
      setIsDirty(false);
    },
    onError: (err: Error) => {
      toast({ title: t("services.resetFailed"), description: err.message, variant: "destructive" });
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
            {t("services.controlTitle")}
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
              {t("services.reset")}
            </Button>
            {isDirty && (
              <Button
                size="sm"
                onClick={() => saveMutation.mutate(draft)}
                disabled={saveMutation.isPending}
                className="gap-1.5"
              >
                <Check className="h-3.5 w-3.5" />
                {saveMutation.isPending ? t("services.saving") : t("services.saveChanges")}
              </Button>
            )}
          </div>
        </div>
        <CardDescription>
          {t("services.controlDesc")}{" "}
          <Link href={`/services/${type}/zones`} className="inline-flex items-center gap-1 text-primary font-medium hover:underline">
            <Globe className="h-3.5 w-3.5" />
            {t("services.manageZones")}
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* 1 — Master toggle */}
        <div className="flex items-center justify-between gap-4 p-4 rounded-lg border bg-muted/30">
          <div className="flex items-center gap-2.5">
            <ToggleLeft className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">{t("services.masterSwitch")}</p>
              <p className="text-xs text-muted-foreground">{t("services.masterSwitchDesc")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={draft.isEnabled ?? data.isEnabled}
              onCheckedChange={(v) => updateDraft({ isEnabled: v })}
            />
            <span className={`text-xs font-medium ${(draft.isEnabled ?? data.isEnabled) ? "text-green-600" : "text-muted-foreground"}`}>
              {(draft.isEnabled ?? data.isEnabled) ? t("services.enabled") : t("services.disabled")}
            </span>
          </div>
        </div>

        <Separator />

        {/* 2 — Display mode */}
        <div className="space-y-3">
          <Label className="text-sm font-medium flex items-center gap-2">
            <Radio className="h-4 w-4 text-muted-foreground" />
            {t("services.displayMode")}
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
                    <p className="text-sm font-medium">{t(opt.labelKey)}</p>
                    <p className="text-xs text-muted-foreground">{t(opt.descKey)}</p>
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
            {t("services.unavailableMsg")}
          </Label>
          <p className="text-xs text-muted-foreground">{t("services.unavailableMsgDesc")}</p>
          <Textarea
            placeholder={t("services.unavailableMsgPlaceholder")}
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
            {t("services.actionOnTap")}
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
                  <p className="text-sm font-medium">{t(opt.labelKey)}</p>
                  <p className="text-xs text-muted-foreground">{t(opt.descKey)}</p>
                </button>
              );
            })}
          </div>
        </div>

        <Separator />

        {/* 5 — Maintenance ETA */}
        {(draft.displayMode ?? data.displayMode) === "maintenance" && (
          <>
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                {t("services.maintenanceEta")}
              </Label>
              <p className="text-xs text-muted-foreground">{t("services.maintenanceEtaDesc")}</p>
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
              {t("services.maxCapacity")}
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">{t("services.maxCapacityDesc")}</p>
          </div>
          <Input
            type="number"
            min="1"
            placeholder={t("services.noLimit")}
            value={draft.maxActiveRides ?? ""}
            onChange={(e) => updateDraft({ maxActiveRides: e.target.value ? parseInt(e.target.value) : null })}
            className="w-28 text-end text-sm"
          />
        </div>

      </CardContent>
    </Card>
  );
}

// ─── Service Settings Panel (driver requirements) ─────────────────────────────

function ServiceSettingsPanel({ type }: { type: "car" | "shuttle" | "bike" }) {
  const { t } = useTranslation();
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
      toast({ title: t("services.settingsSaved") });
      queryClient.setQueryData(["service-settings", type], updated);
      setDraft(updated);
      setEditing(false);
    },
    onError: (err: Error) => {
      toast({ title: t("services.settingsSaveFailed"), description: err.message, variant: "destructive" });
    },
  });

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
            {t("services.driverReqTitle")}
          </CardTitle>
          <div className="flex items-center gap-2">
            {!editing && (
              <Button variant="outline" size="sm" onClick={() => { setDraft(data); setEditing(true); }} className="gap-1.5">
                <Pencil className="h-3.5 w-3.5" /> {t("services.edit")}
              </Button>
            )}
          </div>
        </div>
        <CardDescription>{t("services.driverReqDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <Separator />

        <div className="flex items-center justify-between gap-4">
          <div>
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <Star className="h-3.5 w-3.5 text-amber-500" /> {t("services.minRating")}
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">{t("services.minRatingDesc")}</p>
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
            <Label className="text-sm font-medium">{t("services.maxRides")}</Label>
            <p className="text-xs text-muted-foreground mt-0.5">{t("services.maxRidesDesc")}</p>
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
              {mutation.isPending ? t("services.saving") : t("services.saveChanges")}
            </Button>
            <Button variant="ghost" onClick={() => { setDraft(data); setEditing(false); }} className="gap-1.5">
              <X className="h-3.5 w-3.5" /> {t("services.cancel")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Car / Bike view ──────────────────────────────────────────────────────────

function CarBikeView({ type }: { type: "car" | "bike" }) {
  const { t } = useTranslation();
  const meta = SERVICE_META_STATIC[type];
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
            <h1 className="text-2xl font-bold">{t(meta.labelKey)}</h1>
            <p className="text-sm text-muted-foreground">{t(meta.descShortKey)}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => setChangeLogOpen(true)}>
          <History className="h-3.5 w-3.5" />
          {t("services.changeLog")}
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t("services.totalRides")} value={total}     icon={Navigation}    color="bg-primary/10 text-primary"        loading={ridesQuery.isLoading} />
        <StatCard label={t("services.activeNow")}  value={active}    icon={CheckCircle2}  color="bg-blue-500/10 text-blue-600"      loading={ridesQuery.isLoading} />
        <StatCard label={t("services.completed")}  value={completed} icon={CheckCircle2}  color="bg-green-500/10 text-green-600"    loading={ridesQuery.isLoading} />
        <StatCard label={t("services.cancelled")}  value={cancelled} icon={XCircle}       color="bg-red-500/10 text-red-500"        loading={ridesQuery.isLoading} />
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
              {t("services.currentPricing")}
              <Badge
                variant="outline"
                className={`ms-auto text-xs ${pricing.isActive ? "text-green-600 border-green-300" : "text-red-500 border-red-300"}`}
              >
                {pricing.isActive ? t("services.pricingActive") : t("services.pricingInactive")}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: t("services.baseFare"),    value: `$${pricing.baseFare.toFixed(2)}` },
                { label: t("services.perKm"),       value: `$${pricing.perKmRate.toFixed(2)}` },
                { label: t("services.perMinute"),   value: `$${pricing.perMinuteRate.toFixed(2)}` },
                { label: t("services.minimumFare"), value: `$${pricing.minimumFare.toFixed(2)}` },
              ].map((item) => (
                <div key={item.label} className="p-3 rounded-lg bg-muted/50 text-center">
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="text-xl font-bold mt-1">{item.value}</p>
                </div>
              ))}
            </div>
            <Link href={`/pricing/${type}`}>
              <Button variant="outline" size="sm" className="gap-1.5">
                {t("services.editPricing")} <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("services.recentRides")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {ridesQuery.isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : rides.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">{t("services.noRides")}</div>
          ) : (
            <div className="divide-y divide-border">
              {rides.slice(0, 10).map((ride) => (
                <div key={ride.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{t("services.rideNum", { id: ride.id })}</p>
                    <p className="text-xs text-muted-foreground">
                      {ride.rider?.name ?? t("services.unknownRider")}
                      {ride.driver?.name ? ` · ${ride.driver.name}` : ` · ${t("services.unassigned")}`}
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
  const { t } = useTranslation();
  const [changeLogOpen, setChangeLogOpen] = useState(false);
  const routesQuery = useQuery({
    queryKey: ["routes-count"],
    queryFn: () => adminFetch<{ data: unknown[]; total: number }>("/routes?limit=1"),
  });
  const { data: busesData, isLoading: busesLoading } = useListBuses({ limit: 1 });
  const { data: driversData, isLoading: driversLoading } = useListDrivers({ limit: 1 });
  const { data: tripsData, isLoading: tripsLoading } = useListTrips({ limit: 1 });

  const shuttleMgmtCards = [
    { labelKey: "services.manageRoutes",    descKey: "services.manageRoutesDesc",    href: "/routes",   icon: Map,        color: "bg-amber-500/10 text-amber-600" },
    { labelKey: "services.fleetManagement", descKey: "services.fleetManagementDesc", href: "/vehicles", icon: Bus,        color: "bg-blue-500/10 text-blue-600" },
    { labelKey: "services.driverRoster",    descKey: "services.driverRosterDesc",    href: "/drivers",  icon: UserCircle, color: "bg-green-500/10 text-green-600" },
  ];

  return (
    <div className="p-6 space-y-6">
      <ChangeLogModal type="shuttle" open={changeLogOpen} onClose={() => setChangeLogOpen(false)} />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-amber-500/10">
            <Bus className="h-6 w-6 text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{t("services.shuttleLabel")}</h1>
            <p className="text-sm text-muted-foreground">{t("services.shuttleOverview")}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => setChangeLogOpen(true)}>
          <History className="h-3.5 w-3.5" />
          {t("services.changeLog")}
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t("services.routes")}         value={routesQuery.data?.total  ?? 0} icon={Map}        color="bg-amber-500/10 text-amber-600"  loading={routesQuery.isLoading} />
        <StatCard label={t("services.buses")}          value={busesData?.total         ?? 0} icon={Bus}        color="bg-blue-500/10 text-blue-600"    loading={busesLoading} />
        <StatCard label={t("services.drivers")}        value={driversData?.total       ?? 0} icon={UserCircle} color="bg-green-500/10 text-green-600"   loading={driversLoading} />
        <StatCard label={t("services.tripsScheduled")} value={tripsData?.total         ?? 0} icon={Navigation} color="bg-primary/10 text-primary"       loading={tripsLoading} />
      </div>

      <ServiceControlPanel type="shuttle" />
      <ServiceSettingsPanel type="shuttle" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {shuttleMgmtCards.map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="cursor-pointer hover:shadow-md transition-all hover:border-primary/30 h-full">
              <CardContent className="pt-5">
                <div className={`p-2.5 rounded-lg ${item.color} w-fit mb-3`}>
                  <item.icon className="h-5 w-5" />
                </div>
                <p className="font-semibold text-sm">{t(item.labelKey)}</p>
                <p className="text-xs text-muted-foreground mt-1">{t(item.descKey)}</p>
                <div className="flex items-center gap-1 text-xs text-primary mt-3 font-medium">
                  {t("services.open")} <ArrowRight className="h-3 w-3" />
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
  const { t } = useTranslation();
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
            <h1 className="text-2xl font-bold">{t("services.motorcycleLabel")}</h1>
            <p className="text-sm text-muted-foreground">{t("services.motorcycleDescShort")}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => setChangeLogOpen(true)}>
          <History className="h-3.5 w-3.5" />
          {t("services.changeLog")}
        </Button>
      </div>
      <ServiceControlPanel type="motorcycle" />
    </div>
  );
}

// ─── Delivery view ────────────────────────────────────────────────────────────

function DeliveryView() {
  const { t } = useTranslation();
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
            <h1 className="text-2xl font-bold">{t("services.deliveryLabel")}</h1>
            <p className="text-sm text-muted-foreground">{t("services.deliveryDescShort")}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => setChangeLogOpen(true)}>
          <History className="h-3.5 w-3.5" />
          {t("services.changeLog")}
        </Button>
      </div>
      <ServiceControlPanel type="delivery" />
    </div>
  );
}

// ─── Services Landing Page ────────────────────────────────────────────────────

type ServiceControlSnapshot = {
  serviceType: string;
  isEnabled: boolean;
  displayMode: string;
  unavailableMessage?: string | null;
  unavailableAction?: string;
};

function ServicesLanding() {
  const { t } = useTranslation();
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
          <h1 className="text-2xl font-bold">{t("services.pageTitle")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("services.pageSubtitle")}</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          {t("services.live")}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {LANDING_CARDS_STATIC.map(({ type, icon: Icon, color, bg, border, href, labelKey, descKey }) => {
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
                        <p className="font-semibold text-base">{t(labelKey)}</p>
                        {control ? (
                          <DisplayModeBadge mode={control.displayMode} />
                        ) : null}
                        {isDisabled && (
                          <Badge variant="outline" className="text-xs text-red-500 border-red-300 bg-red-50 dark:bg-red-950">
                            {t("services.disabled")}
                          </Badge>
                        )}
                        {isFlashing && (
                          <span className="text-xs text-primary font-medium animate-pulse">
                            {t("services.updated")}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{t(descKey)}</p>
                      <div className="flex items-center gap-1 text-xs text-primary mt-3 font-medium">
                        {t("services.openControlPanel")} <ArrowRight className="h-3 w-3" />
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
