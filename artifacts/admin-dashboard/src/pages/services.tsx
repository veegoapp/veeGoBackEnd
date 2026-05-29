import React, { useState, useEffect } from "react";
import { useRoute, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useListDrivers, useListBuses, useListTrips } from "@workspace/api-client-react";
import { adminFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  Car, Bus, Bike, PackageOpen, Navigation, DollarSign,
  CheckCircle2, XCircle, ArrowRight, Map, UserCircle,
  Settings2, ShieldCheck, Star, Pencil, Check, X,
} from "lucide-react";

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
  requiredLicenseTypes: string[];
  requireInsurance: boolean;
  requireBackgroundCheck: boolean;
  maxActiveRidesPerDriver: number;
};

const SERVICE_META: Record<string, { icon: React.ElementType; label: string; color: string; bg: string; desc: string }> = {
  car:      { icon: Car,         label: "Car Services",      color: "text-blue-600",   bg: "bg-blue-500/10",   desc: "On-demand car rides — drivers, trips, and pricing" },
  shuttle:  { icon: Bus,         label: "Shuttle Services",  color: "text-amber-600",  bg: "bg-amber-500/10",  desc: "Scheduled shuttle routes, buses, and driver assignments" },
  bike:     { icon: Bike,        label: "Bike Services",     color: "text-green-600",  bg: "bg-green-500/10",  desc: "On-demand bike rides — drivers, trips, and pricing" },
  delivery: { icon: PackageOpen, label: "Delivery Services", color: "text-violet-600", bg: "bg-violet-500/10", desc: "" },
};

const ALL_LICENSE_TYPES = [
  { value: "standard",   label: "Standard License" },
  { value: "commercial", label: "Commercial License" },
  { value: "cdl",        label: "CDL (Commercial Driver's License)" },
  { value: "motorcycle", label: "Motorcycle License" },
];

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

  const toggleLicense = (value: string) => {
    if (!draft) return;
    const has = draft.requiredLicenseTypes.includes(value);
    setDraft({
      ...draft,
      requiredLicenseTypes: has
        ? draft.requiredLicenseTypes.filter((l) => l !== value)
        : [...draft.requiredLicenseTypes, value],
    });
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
            Service Settings
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2" title={data.isEnabled ? "Disable service" : "Enable service"}>
              <Switch
                checked={data.isEnabled}
                onCheckedChange={toggleEnabled}
                disabled={mutation.isPending}
              />
              <span className={`text-xs font-medium ${data.isEnabled ? "text-green-600" : "text-muted-foreground"}`}>
                {data.isEnabled ? "Enabled" : "Disabled"}
              </span>
            </div>
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
              className="w-24 text-right"
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
              className="w-24 text-right"
            />
          ) : (
            <span className="text-lg font-bold">{display.maxActiveRidesPerDriver}</span>
          )}
        </div>

        <Separator />

        <div className="space-y-3">
          <Label className="text-sm font-medium flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-blue-500" /> Required Driver Verifications
          </Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { key: "requireInsurance" as const, label: "Vehicle Insurance", desc: "Must have active insurance" },
              { key: "requireBackgroundCheck" as const, label: "Background Check", desc: "Criminal background cleared" },
            ].map(({ key, label, desc }) => (
              <div key={key} className="flex items-start gap-2.5 p-3 rounded-lg border bg-muted/30">
                {editing ? (
                  <Checkbox
                    checked={draft[key]}
                    onCheckedChange={(v) => setDraft({ ...draft, [key]: !!v })}
                    className="mt-0.5"
                  />
                ) : (
                  display[key]
                    ? <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                    : <XCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                )}
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
          <Label className="text-sm font-medium">Required License Types</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ALL_LICENSE_TYPES.map(({ value, label }) => {
              const active = display.requiredLicenseTypes.includes(value);
              return (
                <div key={value} className="flex items-center gap-2.5 p-2.5 rounded-lg border bg-muted/30">
                  {editing ? (
                    <Checkbox
                      checked={draft.requiredLicenseTypes.includes(value)}
                      onCheckedChange={() => toggleLicense(value)}
                    />
                  ) : (
                    active
                      ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                      : <div className="h-3.5 w-3.5 rounded-sm border border-muted-foreground/40 shrink-0" />
                  )}
                  <span className={`text-sm ${active ? "font-medium" : "text-muted-foreground"}`}>{label}</span>
                </div>
              );
            })}
          </div>
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

function CarBikeView({ type }: { type: "car" | "bike" }) {
  const meta = SERVICE_META[type];
  const Icon = meta.icon;

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
      <div className="flex items-center gap-3">
        <div className={`p-3 rounded-xl ${meta.bg}`}>
          <Icon className={`h-6 w-6 ${meta.color}`} />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{meta.label}</h1>
          <p className="text-sm text-muted-foreground">{meta.desc}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Rides"  value={total}     icon={Navigation}    color="bg-primary/10 text-primary"        loading={ridesQuery.isLoading} />
        <StatCard label="Active Now"   value={active}    icon={CheckCircle2}  color="bg-blue-500/10 text-blue-600"      loading={ridesQuery.isLoading} />
        <StatCard label="Completed"    value={completed} icon={CheckCircle2}  color="bg-green-500/10 text-green-600"    loading={ridesQuery.isLoading} />
        <StatCard label="Cancelled"    value={cancelled} icon={XCircle}       color="bg-red-500/10 text-red-500"        loading={ridesQuery.isLoading} />
      </div>

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
                className={`ml-auto text-xs ${pricing.isActive ? "text-green-600 border-green-300" : "text-red-500 border-red-300"}`}
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

function ShuttleView() {
  const routesQuery = useQuery({
    queryKey: ["routes-count"],
    queryFn: () => adminFetch<{ data: unknown[]; total: number }>("/routes?limit=1"),
  });
  const { data: busesData, isLoading: busesLoading } = useListBuses({ limit: 1 });
  const { data: driversData, isLoading: driversLoading } = useListDrivers({ limit: 1 });
  const { data: tripsData, isLoading: tripsLoading } = useListTrips({ limit: 1 });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-xl bg-amber-500/10">
          <Bus className="h-6 w-6 text-amber-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Shuttle Services</h1>
          <p className="text-sm text-muted-foreground">Overview of scheduled shuttle operations</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Routes"          value={routesQuery.data?.total  ?? 0} icon={Map}        color="bg-amber-500/10 text-amber-600"  loading={routesQuery.isLoading} />
        <StatCard label="Buses"           value={busesData?.total         ?? 0} icon={Bus}        color="bg-blue-500/10 text-blue-600"    loading={busesLoading} />
        <StatCard label="Drivers"         value={driversData?.total       ?? 0} icon={UserCircle} color="bg-green-500/10 text-green-600"   loading={driversLoading} />
        <StatCard label="Trips Scheduled" value={tripsData?.total         ?? 0} icon={Navigation} color="bg-primary/10 text-primary"       loading={tripsLoading} />
      </div>

      <ServiceSettingsPanel type="shuttle" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Manage Routes",    desc: "Create and edit shuttle routes and stations",  href: "/routes",  icon: Map,        color: "bg-amber-500/10 text-amber-600" },
          { label: "Fleet Management", desc: "Register and manage the bus fleet",             href: "/buses",   icon: Bus,        color: "bg-blue-500/10 text-blue-600" },
          { label: "Driver Roster",    desc: "Assign and manage shuttle drivers",             href: "/drivers", icon: UserCircle, color: "bg-green-500/10 text-green-600" },
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

export default function Services() {
  const [, params] = useRoute("/services/:type");
  const type = params?.type ?? "car";

  if (type === "delivery") {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="p-5 rounded-2xl bg-violet-500/10 mb-5">
          <PackageOpen className="h-10 w-10 text-violet-500" />
        </div>
        <span className="text-xs font-bold uppercase tracking-widest text-violet-500 bg-violet-500/10 px-3 py-1 rounded-full mb-4">
          Coming Soon
        </span>
        <h2 className="text-2xl font-bold">Delivery Services</h2>
        <p className="text-muted-foreground text-sm mt-2 max-w-sm">
          Delivery service management is currently in development and will be available in a future release.
        </p>
      </div>
    );
  }

  if (type === "shuttle") return <ShuttleView />;
  if (type === "car" || type === "bike") return <CarBikeView type={type} />;
  return <CarBikeView type="car" />;
}
