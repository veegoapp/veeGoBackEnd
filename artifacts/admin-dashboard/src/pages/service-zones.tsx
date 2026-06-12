import React, { useState } from "react";
import { useRoute, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Car, Bus, Bike, PackageOpen, Globe, ArrowLeft, MapPin,
  CheckCircle2, AlertCircle,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Zone = {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
};

type ServiceControlData = {
  id: number;
  serviceType: string;
  isEnabled: boolean;
  activeZoneIds: number[];
};

type ServiceType = "car" | "motorcycle" | "delivery" | "shuttle";

// ─── Metadata ─────────────────────────────────────────────────────────────────

const SERVICE_META: Record<ServiceType, { icon: React.ElementType; label: string; color: string; bg: string }> = {
  car:        { icon: Car,         label: "Car",         color: "text-blue-600",   bg: "bg-blue-500/10" },
  shuttle:    { icon: Bus,         label: "Shuttle",     color: "text-amber-600",  bg: "bg-amber-500/10" },
  motorcycle: { icon: Bike,        label: "Motorcycle",  color: "text-orange-600", bg: "bg-orange-500/10" },
  delivery:   { icon: PackageOpen, label: "Delivery",    color: "text-violet-600", bg: "bg-violet-500/10" },
};

const VALID_TYPES: ServiceType[] = ["car", "motorcycle", "delivery", "shuttle"];

// ─── Main Component ────────────────────────────────────────────────────────────

export default function ServiceZones() {
  const [, params] = useRoute("/services/:type/zones");
  const type = (params?.type ?? "car") as ServiceType;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [pendingToggles, setPendingToggles] = useState<Set<number>>(new Set());

  const meta = SERVICE_META[type];

  const zonesQuery = useQuery({
    queryKey: ["zones-list"],
    queryFn: () => adminFetch<{ data: Zone[]; total: number }>("/zones?limit=200"),
  });

  const controlQuery = useQuery({
    queryKey: ["service-control", type],
    queryFn: () => adminFetch<ServiceControlData>(`/admin/services/${type}/control`),
  });

  const patchMutation = useMutation({
    mutationFn: ({ activeZoneIds }: { activeZoneIds: number[] }) =>
      adminFetch<ServiceControlData>(`/admin/services/${type}/control`, {
        method: "PATCH",
        body: JSON.stringify({ activeZoneIds }),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["service-control", type], updated);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update zone", description: err.message, variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: ["service-control", type] });
    },
  });

  const handleToggle = (zoneId: number, currentlyEnabled: boolean) => {
    const currentIds = controlQuery.data?.activeZoneIds ?? [];
    let nextIds: number[];
    if (currentlyEnabled) {
      nextIds = currentIds.filter((id) => id !== zoneId);
    } else {
      nextIds = [...currentIds, zoneId];
    }

    setPendingToggles((prev) => new Set([...prev, zoneId]));
    queryClient.setQueryData(["service-control", type], (old: ServiceControlData | undefined) =>
      old ? { ...old, activeZoneIds: nextIds } : old
    );

    patchMutation.mutate(
      { activeZoneIds: nextIds },
      {
        onSettled: () => {
          setPendingToggles((prev) => {
            const next = new Set(prev);
            next.delete(zoneId);
            return next;
          });
        },
        onSuccess: () => {
          toast({
            title: currentlyEnabled ? "Zone disabled for this service" : "Zone enabled for this service",
          });
        },
      }
    );
  };

  if (!VALID_TYPES.includes(type)) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Invalid service type.</p>
      </div>
    );
  }

  const zones = zonesQuery.data?.data ?? [];
  const activeZoneIds = controlQuery.data?.activeZoneIds ?? [];
  const allZonesActive = activeZoneIds.length === 0;
  const isLoading = zonesQuery.isLoading || controlQuery.isLoading;

  const Icon = meta?.icon ?? Car;

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link href={`/services/${type}`}>
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground -ml-2 mt-0.5">
            <ArrowLeft className="h-4 w-4" />
            Back to {meta?.label ?? type}
          </Button>
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <div className={`p-3 rounded-xl ${meta?.bg ?? "bg-muted"} shrink-0`}>
          <Icon className={`h-6 w-6 ${meta?.color ?? "text-foreground"}`} />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{meta?.label ?? type} — Available Zones</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Toggle each zone to enable or disable this service within it
          </p>
        </div>
      </div>

      {/* Info banner */}
      {!isLoading && allZonesActive && (
        <div className="flex items-center gap-2.5 p-3 rounded-lg border border-green-300 bg-green-50 dark:bg-green-950/30 dark:border-green-800">
          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
          <p className="text-sm text-green-700 dark:text-green-400">
            No zones restricted — this service is currently available in <strong>all zones</strong>. Enable specific zones below to restrict it.
          </p>
        </div>
      )}

      {/* Zones table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Zones
          </CardTitle>
          <CardDescription>
            {isLoading
              ? "Loading zones…"
              : `${zones.length} zone${zones.length !== 1 ? "s" : ""} configured · ${activeZoneIds.length === 0 ? "All active" : `${activeZoneIds.length} selected`}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : zones.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <MapPin className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No zones have been created yet.</p>
              <Link href="/zones">
                <Button variant="outline" size="sm" className="mt-1">
                  Go to Zones page
                </Button>
              </Link>
            </div>
          ) : (
            <div className="divide-y">
              {/* Table header */}
              <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-2.5 text-xs font-medium text-muted-foreground bg-muted/40 rounded-t-none">
                <span>Zone Name &amp; Description</span>
                <span className="text-center w-24">Operation Status</span>
                <span className="text-center w-20">Service Active</span>
              </div>

              {/* Zone rows */}
              {zones.map((zone) => {
                const isServiceActive = activeZoneIds.length === 0 || activeZoneIds.includes(zone.id);
                const isExplicitlyEnabled = activeZoneIds.includes(zone.id);
                const isPending = pendingToggles.has(zone.id);

                return (
                  <div
                    key={zone.id}
                    className="grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-3.5 items-center hover:bg-muted/20 transition-colors"
                  >
                    {/* Name & Description */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{zone.name}</span>
                        {!zone.isActive && (
                          <Badge variant="outline" className="text-xs text-muted-foreground border-muted-foreground/30">
                            GIS Inactive
                          </Badge>
                        )}
                      </div>
                      {zone.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{zone.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground/60 mt-0.5">
                        {zone.centerLat.toFixed(4)}, {zone.centerLng.toFixed(4)} · {zone.radiusKm} km radius
                      </p>
                    </div>

                    {/* Operation Status */}
                    <div className="w-24 flex justify-center">
                      {zone.isActive ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                          <AlertCircle className="h-3.5 w-3.5" />
                          Inactive
                        </span>
                      )}
                    </div>

                    {/* Toggle */}
                    <div className="w-20 flex flex-col items-center gap-1">
                      <Switch
                        checked={isServiceActive}
                        onCheckedChange={() => handleToggle(zone.id, isExplicitlyEnabled)}
                        disabled={isPending || allZonesActive}
                        aria-label={`Toggle ${zone.name} for ${meta?.label ?? type} service`}
                      />
                      <span className={`text-xs font-medium ${isServiceActive ? "text-green-600" : "text-muted-foreground"}`}>
                        {isPending ? "Saving…" : isServiceActive ? "On" : "Off"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Footer note */}
      {!isLoading && zones.length > 0 && (
        <p className="text-xs text-muted-foreground text-center pb-2">
          Toggle a zone to instantly enable or disable this service within it. Changes are saved automatically.
          {allZonesActive && " Currently showing as globally active — enable a specific zone to start zone-based restrictions."}
        </p>
      )}
    </div>
  );
}
