import React, { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { adminFetch } from "@/lib/api";
import { MapContainer, TileLayer, Circle, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import {
  MapPin, Plus, Pencil, Trash2, Car, Bus, Bike,
  CheckCircle2, X, Info, Navigation,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

type Zone = {
  id: number;
  name: string;
  description: string | null;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  services: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type ZoneForm = {
  name: string;
  description: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  services: string[];
  isActive: boolean;
};

const BLANK_FORM: ZoneForm = {
  name: "",
  description: "",
  centerLat: 30.0444,
  centerLng: 31.2357,
  radiusKm: 5,
  services: [],
  isActive: true,
};

const SERVICE_META: Record<string, { icon: React.ElementType; color: string; bg: string; tKey: string }> = {
  car:     { icon: Car,  color: "text-blue-600",  bg: "bg-blue-500/10",  tKey: "zones.serviceCar" },
  shuttle: { icon: Bus,  color: "text-amber-600", bg: "bg-amber-500/10", tKey: "zones.serviceShuttle" },
  bike:    { icon: Bike, color: "text-green-600", bg: "bg-green-500/10", tKey: "zones.serviceBike" },
};

const ZONE_COLORS = [
  "#3b82f6", "#22c55e", "#f59e0b", "#ef4444",
  "#8b5cf6", "#06b6d4", "#f97316", "#ec4899",
];

function zoneColor(id: number) {
  return ZONE_COLORS[id % ZONE_COLORS.length];
}

function MapClickHandler({ active, onMapClick }: { active: boolean; onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      if (active) onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function FlyToZone({ zone }: { zone: Zone | null }) {
  const map = useMap();
  useEffect(() => {
    if (zone) map.flyTo([zone.centerLat, zone.centerLng], 12, { duration: 0.8 });
  }, [zone, map]);
  return null;
}

export default function Zones() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [panelMode, setPanelMode] = useState<"list" | "create" | "edit">("list");
  const [editingZone, setEditingZone] = useState<Zone | null>(null);
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null);
  const [form, setForm] = useState<ZoneForm>(BLANK_FORM);
  const [placingPin, setPlacingPin] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Zone | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["zones"],
    queryFn: () => adminFetch<{ data: Zone[]; total: number }>("/zones"),
  });

  const zones = data?.data ?? [];

  const createMutation = useMutation({
    mutationFn: (body: ZoneForm) =>
      adminFetch<Zone>("/zones", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (zone) => {
      toast({ title: t("zones.zoneCreated"), description: t("zones.zoneCreatedDesc", { name: zone.name }) });
      queryClient.invalidateQueries({ queryKey: ["zones"] });
      setPanelMode("list");
      setForm(BLANK_FORM);
    },
    onError: (e: Error) => toast({ title: t("zones.createFailed"), description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<ZoneForm> }) =>
      adminFetch<Zone>(`/zones/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: (zone) => {
      toast({ title: t("zones.zoneUpdated"), description: t("zones.zoneUpdatedDesc", { name: zone.name }) });
      queryClient.invalidateQueries({ queryKey: ["zones"] });
      setPanelMode("list");
      setEditingZone(null);
      setSelectedZone(zone);
    },
    onError: (e: Error) => toast({ title: t("zones.updateFailed"), description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminFetch(`/zones/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: t("zones.zoneDeleted") });
      queryClient.invalidateQueries({ queryKey: ["zones"] });
      if (selectedZone?.id === deleteTarget?.id) setSelectedZone(null);
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast({ title: t("zones.deleteFailed"), description: e.message, variant: "destructive" }),
  });

  const openCreate = () => {
    setForm(BLANK_FORM);
    setEditingZone(null);
    setPanelMode("create");
    setPlacingPin(false);
  };

  const openEdit = (zone: Zone) => {
    setEditingZone(zone);
    setForm({
      name: zone.name,
      description: zone.description ?? "",
      centerLat: zone.centerLat,
      centerLng: zone.centerLng,
      radiusKm: zone.radiusKm,
      services: zone.services,
      isActive: zone.isActive,
    });
    setPanelMode("edit");
    setPlacingPin(false);
  };

  const cancelForm = () => {
    setPanelMode("list");
    setEditingZone(null);
    setPlacingPin(false);
    setForm(BLANK_FORM);
  };

  const handleMapClick = useCallback((lat: number, lng: number) => {
    setForm((f) => ({ ...f, centerLat: lat, centerLng: lng }));
    setPlacingPin(false);
  }, []);

  const toggleService = (svc: string) => {
    setForm((f) => ({
      ...f,
      services: f.services.includes(svc)
        ? f.services.filter((s) => s !== svc)
        : [...f.services, svc],
    }));
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      toast({ title: t("zones.nameRequired"), variant: "destructive" });
      return;
    }
    if (panelMode === "edit" && editingZone) {
      updateMutation.mutate({ id: editingZone.id, body: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const isFormMode = panelMode === "create" || panelMode === "edit";

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* ─── Left Sidebar ─── */}
      <div className="w-80 shrink-0 flex flex-col border-e border-border bg-card overflow-hidden">
        {isFormMode ? (
          /* ── Create / Edit Form ── */
          <div className="flex flex-col h-full overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <button onClick={cancelForm} className="p-1 rounded hover:bg-muted transition-colors">
                <X className="h-4 w-4" />
              </button>
              <h2 className="text-sm font-semibold">
                {panelMode === "edit"
                  ? t("zones.editTitle", { name: editingZone?.name })
                  : t("zones.newZone")}
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("zones.zoneNameRequired")}</Label>
                <Input
                  placeholder={t("zones.zoneName")}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">{t("zones.description")}</Label>
                <Textarea
                  placeholder={t("zones.descriptionOptional")}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                  className="resize-none text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">{t("zones.zoneLocation")}</Label>
                <div className="p-3 rounded-lg bg-muted/50 border border-border space-y-2">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 text-primary" />
                    <span className="font-mono">
                      {form.centerLat.toFixed(5)}, {form.centerLng.toFixed(5)}
                    </span>
                  </div>
                  <Button
                    variant={placingPin ? "default" : "outline"}
                    size="sm"
                    className="w-full gap-1.5 text-xs"
                    onClick={() => setPlacingPin((v) => !v)}
                  >
                    <Navigation className="h-3.5 w-3.5" />
                    {placingPin ? t("zones.clickMapPlace") : t("zones.clickMapSet")}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label className="text-xs">{t("zones.radius")}</Label>
                  <span className="text-xs font-semibold">{form.radiusKm.toFixed(1)} {t("zones.km")}</span>
                </div>
                <Slider
                  min={0.5}
                  max={50}
                  step={0.5}
                  value={[form.radiusKm]}
                  onValueChange={([v]) => setForm((f) => ({ ...f, radiusKm: v }))}
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>0.5 {t("zones.km")}</span>
                  <span>50 {t("zones.km")}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">{t("zones.availableServices")}</Label>
                <div className="flex flex-col gap-2">
                  {Object.entries(SERVICE_META).map(([key, meta]) => {
                    const Icon = meta.icon;
                    const active = form.services.includes(key);
                    return (
                      <button
                        key={key}
                        onClick={() => toggleService(key)}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                          active
                            ? `${meta.bg} ${meta.color} border-current`
                            : "border-border text-muted-foreground hover:border-primary/30"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {t(meta.tKey)}
                        {active && <CheckCircle2 className="h-3.5 w-3.5 ms-auto" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between py-1">
                <Label className="text-xs">{t("zones.zoneActive")}</Label>
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
                />
              </div>
            </div>

            <div className="p-4 border-t border-border flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={cancelForm}>
                {t("common.cancel")}
              </Button>
              <Button className="flex-1" onClick={handleSave} disabled={isPending}>
                {isPending
                  ? t("zones.saving")
                  : panelMode === "edit"
                  ? t("common.saveChanges")
                  : t("zones.createZone")}
              </Button>
            </div>
          </div>
        ) : (
          /* ── Zone List ── */
          <div className="flex flex-col h-full overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h2 className="text-sm font-semibold">
                {t("zones.title")}{" "}
                <span className="text-muted-foreground font-normal">({zones.length})</span>
              </h2>
              <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={openCreate}>
                <Plus className="h-3.5 w-3.5" /> {t("zones.newZone")}
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="p-3 space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full rounded-xl" />
                  ))}
                </div>
              ) : zones.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-4 py-10">
                  <div className="p-4 rounded-2xl bg-primary/10 mb-4">
                    <MapPin className="h-8 w-8 text-primary" />
                  </div>
                  <p className="text-sm font-medium">{t("zones.noZonesYet")}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("zones.createFirstDesc")}
                  </p>
                  <Button size="sm" className="mt-4 gap-1.5" onClick={openCreate}>
                    <Plus className="h-3.5 w-3.5" /> {t("zones.createZone")}
                  </Button>
                </div>
              ) : (
                <div className="p-2 space-y-1.5">
                  {zones.map((zone) => {
                    const isSelected = selectedZone?.id === zone.id;
                    const color = zoneColor(zone.id);
                    return (
                      <div
                        key={zone.id}
                        onClick={() => setSelectedZone(isSelected ? null : zone)}
                        className={`p-3 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-border hover:border-primary/30 hover:bg-muted/30"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div
                            className="h-3 w-3 rounded-full shrink-0"
                            style={{ backgroundColor: color }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-medium truncate">{zone.name}</p>
                              {!zone.isActive && (
                                <Badge variant="outline" className="text-[10px] text-muted-foreground shrink-0">
                                  {t("zones.inactive")}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {zone.radiusKm.toFixed(1)} {t("zones.kmRadius")}
                            </p>
                          </div>
                        </div>

                        {zone.services.length > 0 && (
                          <div className="flex gap-1 mt-2 flex-wrap">
                            {zone.services.map((svc) => {
                              const m = SERVICE_META[svc];
                              if (!m) return null;
                              const Icon = m.icon;
                              return (
                                <span
                                  key={svc}
                                  className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${m.bg} ${m.color}`}
                                >
                                  <Icon className="h-2.5 w-2.5" />
                                  {t(m.tKey)}
                                </span>
                              );
                            })}
                          </div>
                        )}

                        {zone.description && (
                          <p className="text-[11px] text-muted-foreground mt-1.5 line-clamp-1">
                            {zone.description}
                          </p>
                        )}

                        {isSelected && (
                          <div className="flex gap-1.5 mt-2.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 h-7 text-xs gap-1"
                              onClick={(e) => { e.stopPropagation(); openEdit(zone); }}
                            >
                              <Pencil className="h-3 w-3" /> {t("common.edit")}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 h-7 text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/5"
                              onClick={(e) => { e.stopPropagation(); setDeleteTarget(zone); }}
                            >
                              <Trash2 className="h-3 w-3" /> {t("common.delete")}
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ─── Map ─── */}
      <div className="flex-1 relative overflow-hidden">
        {placingPin && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-primary text-primary-foreground text-xs font-medium px-4 py-2 rounded-full shadow-lg flex items-center gap-2 pointer-events-none">
            <Navigation className="h-3.5 w-3.5" />
            {t("zones.clickPlaceCenter")}
          </div>
        )}

        <MapContainer
          center={[30.0444, 31.2357]}
          zoom={10}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />

          <MapClickHandler active={placingPin} onMapClick={handleMapClick} />
          <FlyToZone zone={selectedZone} />

          {zones.map((zone) => {
            const isSelected = selectedZone?.id === zone.id;
            const isBeingEdited = editingZone?.id === zone.id;
            const color = zoneColor(zone.id);
            return (
              <React.Fragment key={zone.id}>
                <Circle
                  center={[zone.centerLat, zone.centerLng]}
                  radius={zone.radiusKm * 1000}
                  pathOptions={{
                    color,
                    fillColor: color,
                    fillOpacity: isSelected ? 0.25 : 0.1,
                    weight: isSelected ? 3 : 1.5,
                    opacity: zone.isActive ? 1 : 0.35,
                  }}
                  eventHandlers={{
                    click: () => !isFormMode && setSelectedZone(isSelected ? null : zone),
                  }}
                />
                {!isBeingEdited && (
                  <Marker
                    position={[zone.centerLat, zone.centerLng]}
                    eventHandlers={{
                      click: () => !isFormMode && setSelectedZone(isSelected ? null : zone),
                    }}
                  />
                )}
              </React.Fragment>
            );
          })}

          {isFormMode && (
            <>
              <Circle
                center={[form.centerLat, form.centerLng]}
                radius={form.radiusKm * 1000}
                pathOptions={{
                  color: "#3b82f6",
                  fillColor: "#3b82f6",
                  fillOpacity: 0.2,
                  weight: 2,
                  dashArray: "6 4",
                }}
              />
              <Marker position={[form.centerLat, form.centerLng]} />
            </>
          )}
        </MapContainer>

        {zones.length === 0 && !isLoading && !isFormMode && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] bg-card border border-border rounded-xl px-5 py-3 shadow-lg text-sm flex items-center gap-2">
            <Info className="h-4 w-4 text-muted-foreground shrink-0" />
            <span>{t("zones.createFirst")}</span>
          </div>
        )}
      </div>

      {/* ─── Delete Confirmation ─── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("zones.deleteZone")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("zones.deleteConfirm", { name: deleteTarget?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {t("zones.deleteZone")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
