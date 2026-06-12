import React, { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Car, Bike, Zap, PackageOpen, DollarSign, Pencil, Check, X,
  Clock, Info, Plus, Trash2, MapPin, TrendingUp, Settings2, Layers,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

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

type PricingForm = {
  baseFare: string;
  perKmRate: string;
  perMinuteRate: string;
  minimumFare: string;
};

type Zone = { id: number; name: string; isActive: boolean };

type ZonePricing = {
  id: number;
  zoneId: number;
  zoneName: string;
  vehicleType: string;
  baseFare: number;
  perKmRate: number;
  minimumFare: number;
  isActive: boolean;
};

type SurgeSettings = {
  isEnabled: boolean;
  multiplier: number;
  maxMultiplier: number;
  activeHoursStart: string;
  activeHoursEnd: string;
  activeZoneIds: number[];
  triggerThreshold: number;
};

// ─── Car Categories ───────────────────────────────────────────────────────────

type CarCategory = {
  id: number;
  name: string;
  displayName?: string;
  baseFare: number;
  perKmRate: number;
  perMinuteRate: number;
  minimumFare: number;
};

type CarCategoryForm = {
  baseFare: string;
  perKmRate: string;
  perMinuteRate: string;
  minimumFare: string;
};

const CAR_CATEGORY_DISPLAY: Record<string, { label: string; color: string; bg: string; desc: string }> = {
  economy:      { label: "Economy",      color: "text-blue-600",   bg: "bg-blue-500/10",   desc: "Affordable everyday rides" },
  economy_plus: { label: "Economy Plus", color: "text-indigo-600", bg: "bg-indigo-500/10", desc: "A step up in comfort at a reasonable fare" },
  comfort:      { label: "Comfort",      color: "text-violet-600", bg: "bg-violet-500/10", desc: "Premium comfort for discerning passengers" },
};

function getDisplayName(cat: CarCategory): string {
  const key = cat.name?.toLowerCase().replace(/\s+/g, "_") ?? "";
  return CAR_CATEGORY_DISPLAY[key]?.label ?? cat.displayName ?? cat.name ?? "Unknown";
}
function getDisplayKey(cat: CarCategory): string {
  return cat.name?.toLowerCase().replace(/\s+/g, "_") ?? "economy";
}

function CarCategoryEditor() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<CarCategoryForm>({ baseFare: "", perKmRate: "", perMinuteRate: "", minimumFare: "" });

  const { data, isLoading } = useQuery({
    queryKey: ["car-categories"],
    queryFn: () => adminFetch<{ data: CarCategory[] }>("/admin/car-categories"),
  });

  const categories = data?.data ?? [];
  const selected = activeTab !== null ? categories.find((c) => c.id === activeTab) : categories[0] ?? null;

  useEffect(() => {
    if (categories.length > 0 && activeTab === null) setActiveTab(categories[0].id);
  }, [categories, activeTab]);

  useEffect(() => {
    if (selected) {
      setForm({
        baseFare:      String(selected.baseFare),
        perKmRate:     String(selected.perKmRate),
        perMinuteRate: String(selected.perMinuteRate),
        minimumFare:   String(selected.minimumFare),
      });
      setEditing(false);
    }
  }, [selected?.id]);

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: number; values: Record<string, number> }) =>
      adminFetch(`/admin/car-categories/${id}`, { method: "PATCH", body: JSON.stringify({ ...values, serviceType: "car" }) }),
    onSuccess: () => {
      toast({ title: "Category pricing updated" });
      queryClient.invalidateQueries({ queryKey: ["car-categories"] });
      setEditing(false);
    },
    onError: (err: Error) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const handleSave = () => {
    if (!selected) return;
    const values = {
      baseFare:      parseFloat(form.baseFare),
      perKmRate:     parseFloat(form.perKmRate),
      perMinuteRate: parseFloat(form.perMinuteRate),
      minimumFare:   parseFloat(form.minimumFare),
    };
    if (Object.values(values).some(isNaN)) {
      toast({ title: "Invalid values", description: "All fields must be valid numbers.", variant: "destructive" });
      return;
    }
    updateMutation.mutate({ id: selected.id, values });
  };

  const fields: { key: keyof CarCategoryForm; label: string; hint: string }[] = [
    { key: "baseFare",      label: "Base Fare (EGP)",       hint: "Flat fee at the start of every ride" },
    { key: "perKmRate",     label: "Per Km Rate (EGP)",     hint: "Amount charged per kilometer" },
    { key: "perMinuteRate", label: "Per Minute Rate (EGP)", hint: "Amount charged per minute of duration" },
    { key: "minimumFare",   label: "Minimum Fare (EGP)",    hint: "Minimum charge regardless of distance" },
  ];

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  if (categories.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-sm text-muted-foreground py-10">
          No car categories found. Seed the database to create Economy, Economy Plus, and Comfort categories.
        </CardContent>
      </Card>
    );
  }

  const displayKey = selected ? getDisplayKey(selected) : "economy";
  const displayMeta = CAR_CATEGORY_DISPLAY[displayKey] ?? { label: "Category", color: "text-primary", bg: "bg-primary/10" };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="h-4 w-4" /> Category-Based Pricing
          </CardTitle>
          {selected && !editing && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="gap-1.5">
              <Pencil className="h-3.5 w-3.5" /> Edit {getDisplayName(selected)}
            </Button>
          )}
        </div>
        <CardDescription className="text-xs">
          Select a vehicle category to view or edit its fare configuration
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex gap-1 p-1 bg-muted/50 rounded-lg border border-border w-fit">
          {categories.map((cat) => {
            const key = getDisplayKey(cat);
            const meta = CAR_CATEGORY_DISPLAY[key] ?? { label: cat.name, color: "text-primary", bg: "" };
            const isActive = cat.id === (selected?.id ?? null);
            return (
              <button
                key={cat.id}
                onClick={() => { setActiveTab(cat.id); setEditing(false); }}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  isActive
                    ? `bg-white dark:bg-slate-900 shadow-sm border border-border ${meta.color}`
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {meta.label}
              </button>
            );
          })}
        </div>

        {selected && (
          <>
            <div className={`flex items-center gap-2.5 p-3 rounded-lg ${displayMeta.bg}`}>
              <Car className={`h-5 w-5 ${displayMeta.color}`} />
              <div>
                <p className={`text-sm font-bold ${displayMeta.color}`}>{displayMeta.label}</p>
                <p className="text-xs text-muted-foreground">{displayMeta.desc}</p>
              </div>
            </div>

            <Separator />

            {fields.map((field, i) => (
              <React.Fragment key={field.key}>
                {i > 0 && <Separator />}
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <Label className="text-sm font-medium">{field.label}</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">{field.hint}</p>
                  </div>
                  {editing ? (
                    <Input
                      type="number" step="0.01" min="0"
                      value={form[field.key]}
                      onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                      className="w-28 text-end"
                    />
                  ) : (
                    <span className="text-lg font-bold w-28 text-end">
                      EGP {parseFloat(form[field.key] || "0").toFixed(2)}
                    </span>
                  )}
                </div>
              </React.Fragment>
            ))}

            {editing && (
              <div className="flex items-center gap-2 pt-2">
                <Button onClick={handleSave} disabled={updateMutation.isPending} className="gap-1.5">
                  <Check className="h-3.5 w-3.5" />
                  {updateMutation.isPending ? "Saving…" : "Save Changes"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditing(false);
                    setForm({
                      baseFare:      String(selected.baseFare),
                      perKmRate:     String(selected.perKmRate),
                      perMinuteRate: String(selected.perMinuteRate),
                      minimumFare:   String(selected.minimumFare),
                    });
                  }}
                  className="gap-1.5"
                >
                  <X className="h-3.5 w-3.5" /> Cancel
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── PRICING_META ─────────────────────────────────────────────────────────────

const PRICING_META: Record<string, { icon: React.ElementType; label: string; color: string; bg: string; desc: string }> = {
  car:      { icon: Car,         label: "Car Pricing",      color: "text-blue-600",   bg: "bg-blue-500/10",   desc: "Fare rates applied to on-demand car rides" },
  bike:     { icon: Bike,        label: "Scooter Pricing",  color: "text-green-600",  bg: "bg-green-500/10",  desc: "Fare rates applied to on-demand scooter rides" },
  delivery: { icon: PackageOpen, label: "Delivery Pricing", color: "text-violet-600", bg: "bg-violet-500/10", desc: "Fare rates applied to on-demand delivery orders" },
};

// ─── Base Fare Editor ─────────────────────────────────────────────────────────

function PricingEditor({ type }: { type: "car" | "bike" | "delivery" }) {
  const meta = PRICING_META[type];
  const Icon = meta.icon;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<PricingForm>({ baseFare: "", perKmRate: "", perMinuteRate: "", minimumFare: "" });

  const { data: pricingData, isLoading } = useQuery({
    queryKey: ["admin-rides-pricing"],
    queryFn: () => adminFetch<{ data: PricingConfig[] }>("/admin/rides/pricing"),
  });

  const pricing = pricingData?.data?.find((p) => p.vehicleType === type);

  useEffect(() => {
    if (pricing) {
      setForm({
        baseFare:      String(pricing.baseFare),
        perKmRate:     String(pricing.perKmRate),
        perMinuteRate: String(pricing.perMinuteRate),
        minimumFare:   String(pricing.minimumFare),
      });
    }
  }, [pricing]);

  const updateMutation = useMutation({
    mutationFn: (values: Record<string, number>) =>
      adminFetch(`/admin/rides/pricing/${type}`, { method: "PATCH", body: JSON.stringify(values) }),
    onSuccess: () => {
      toast({ title: "Pricing updated" });
      queryClient.invalidateQueries({ queryKey: ["admin-rides-pricing"] });
      setEditing(false);
    },
    onError: (err: Error) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const handleSave = () => {
    const values = {
      baseFare:      parseFloat(form.baseFare),
      perKmRate:     parseFloat(form.perKmRate),
      perMinuteRate: parseFloat(form.perMinuteRate),
      minimumFare:   parseFloat(form.minimumFare),
    };
    if (Object.values(values).some(isNaN)) {
      toast({ title: "Invalid values", description: "All fields must be valid numbers.", variant: "destructive" });
      return;
    }
    updateMutation.mutate(values);
  };

  const fields: { key: keyof PricingForm; label: string; hint: string }[] = [
    { key: "baseFare",      label: "Base Fare ($)",       hint: "Flat fee at the start of every ride" },
    { key: "perKmRate",     label: "Per Km Rate ($)",     hint: "Amount charged per kilometer" },
    { key: "perMinuteRate", label: "Per Minute Rate ($)", hint: "Amount charged per minute of duration" },
    { key: "minimumFare",   label: "Minimum Fare ($)",    hint: "Minimum charge regardless of distance" },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4" /> Base Fare Configuration
          </CardTitle>
          {isLoading ? null : pricing ? (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={pricing.isActive ? "text-green-600 border-green-300" : "text-red-500 border-red-300"}>
                {pricing.isActive ? "Active" : "Inactive"}
              </Badge>
              {!editing && (
                <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="gap-1.5">
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
              )}
            </div>
          ) : null}
        </div>
        {pricing && (
          <CardDescription className="flex items-center gap-1 text-xs">
            <Clock className="h-3 w-3" /> Last updated: {new Date(pricing.updatedAt).toLocaleString()}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
        ) : !pricing ? (
          <p className="text-muted-foreground text-sm">No pricing configuration found for {type}.</p>
        ) : (
          <>
            {fields.map((field, i) => (
              <React.Fragment key={field.key}>
                {i > 0 && <Separator />}
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <Label className="text-sm font-medium">{field.label}</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">{field.hint}</p>
                  </div>
                  {editing ? (
                    <Input
                      type="number" step="0.01" min="0"
                      value={form[field.key]}
                      onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                      className="w-28 text-end"
                    />
                  ) : (
                    <span className="text-lg font-bold w-28 text-end">
                      ${parseFloat(form[field.key] || "0").toFixed(2)}
                    </span>
                  )}
                </div>
              </React.Fragment>
            ))}
            {editing && (
              <div className="flex items-center gap-2 pt-2">
                <Button onClick={handleSave} disabled={updateMutation.isPending} className="gap-1.5">
                  <Check className="h-3.5 w-3.5" />
                  {updateMutation.isPending ? "Saving…" : "Save Changes"}
                </Button>
                <Button variant="ghost" onClick={() => { setEditing(false); if (pricing) setForm({ baseFare: String(pricing.baseFare), perKmRate: String(pricing.perKmRate), perMinuteRate: String(pricing.perMinuteRate), minimumFare: String(pricing.minimumFare) }); }} className="gap-1.5">
                  <X className="h-3.5 w-3.5" /> Cancel
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Zone Pricing Table ───────────────────────────────────────────────────────

type ZonePricingRowForm = { baseFare: string; perKmRate: string; minimumFare: string; isActive: boolean };

function ZonePricingTable({ type }: { type: "car" | "bike" | "delivery" }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<ZonePricingRowForm>({ baseFare: "", perKmRate: "", minimumFare: "", isActive: true });
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<{ zoneId: string; baseFare: string; perKmRate: string; minimumFare: string }>({
    zoneId: "", baseFare: "", perKmRate: "", minimumFare: "",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["zone-pricing", type],
    queryFn: () => adminFetch<{ data: ZonePricing[] }>(`/admin/zone-pricing?vehicleType=${type}`),
  });

  const { data: zonesData } = useQuery({
    queryKey: ["zones-list"],
    queryFn: () => adminFetch<{ data: Zone[] }>("/zones?limit=200"),
  });

  const rows = data?.data ?? [];
  const zones = zonesData?.data ?? [];
  const usedZoneIds = new Set(rows.map((r) => r.zoneId));
  const availableZones = zones.filter((z) => !usedZoneIds.has(z.id));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["zone-pricing", type] });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: number; values: Record<string, unknown> }) =>
      adminFetch(`/admin/zone-pricing/${id}`, { method: "PATCH", body: JSON.stringify(values) }),
    onSuccess: () => { toast({ title: "Zone pricing updated" }); invalidate(); setEditingId(null); },
    onError: (err: Error) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminFetch(`/admin/zone-pricing/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast({ title: "Zone pricing removed" }); invalidate(); },
    onError: (err: Error) => toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  const addMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      adminFetch("/admin/zone-pricing", { method: "POST", body: JSON.stringify(values) }),
    onSuccess: () => { toast({ title: "Zone pricing added" }); invalidate(); setAddOpen(false); setAddForm({ zoneId: "", baseFare: "", perKmRate: "", minimumFare: "" }); },
    onError: (err: Error) => toast({ title: "Add failed", description: err.message, variant: "destructive" }),
  });

  const startEdit = (row: ZonePricing) => {
    setEditingId(row.id);
    setEditForm({ baseFare: String(row.baseFare), perKmRate: String(row.perKmRate), minimumFare: String(row.minimumFare), isActive: row.isActive });
  };

  const saveEdit = (id: number) => {
    const values = {
      baseFare:    parseFloat(editForm.baseFare),
      perKmRate:   parseFloat(editForm.perKmRate),
      minimumFare: parseFloat(editForm.minimumFare),
      isActive:    editForm.isActive,
    };
    if (isNaN(values.baseFare) || isNaN(values.perKmRate) || isNaN(values.minimumFare)) {
      toast({ title: "Invalid values", variant: "destructive" }); return;
    }
    updateMutation.mutate({ id, values });
  };

  const handleAdd = () => {
    const values = {
      zoneId:      parseInt(addForm.zoneId),
      vehicleType: type,
      baseFare:    parseFloat(addForm.baseFare),
      perKmRate:   parseFloat(addForm.perKmRate),
      minimumFare: parseFloat(addForm.minimumFare),
    };
    if (!values.zoneId || isNaN(values.baseFare) || isNaN(values.perKmRate) || isNaN(values.minimumFare)) {
      toast({ title: "Fill in all fields with valid numbers", variant: "destructive" }); return;
    }
    addMutation.mutate(values);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4" /> Zone-Based Pricing
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Override base fare rates for specific service zones
              </CardDescription>
            </div>
            <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5" disabled={availableZones.length === 0}>
              <Plus className="h-3.5 w-3.5" /> Add Zone Price
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm">
              <MapPin className="h-8 w-8 mx-auto mb-2 opacity-30" />
              No zone-specific pricing configured.{" "}
              {zones.length === 0 ? "Create zones first to set zone pricing." : "Add an entry to override rates per zone."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-start px-4 py-2.5 text-xs font-semibold text-muted-foreground">Zone</th>
                    <th className="text-end px-3 py-2.5 text-xs font-semibold text-muted-foreground">Base Fare</th>
                    <th className="text-end px-3 py-2.5 text-xs font-semibold text-muted-foreground">Per Km</th>
                    <th className="text-end px-3 py-2.5 text-xs font-semibold text-muted-foreground">Min Fare</th>
                    <th className="text-center px-3 py-2.5 text-xs font-semibold text-muted-foreground">Status</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row) => {
                    const isEditing = editingId === row.id;
                    return (
                      <tr key={row.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 font-medium">{row.zoneName}</td>
                        {isEditing ? (
                          <>
                            <td className="px-3 py-2"><Input type="number" step="0.01" min="0" value={editForm.baseFare} onChange={(e) => setEditForm((p) => ({ ...p, baseFare: e.target.value }))} className="w-24 text-end h-8 text-xs" /></td>
                            <td className="px-3 py-2"><Input type="number" step="0.01" min="0" value={editForm.perKmRate} onChange={(e) => setEditForm((p) => ({ ...p, perKmRate: e.target.value }))} className="w-24 text-end h-8 text-xs" /></td>
                            <td className="px-3 py-2"><Input type="number" step="0.01" min="0" value={editForm.minimumFare} onChange={(e) => setEditForm((p) => ({ ...p, minimumFare: e.target.value }))} className="w-24 text-end h-8 text-xs" /></td>
                            <td className="px-3 py-2 text-center">
                              <Switch checked={editForm.isActive} onCheckedChange={(v) => setEditForm((p) => ({ ...p, isActive: v }))} />
                            </td>
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-1">
                                <Button size="sm" variant="default" className="h-7 px-2 gap-1 text-xs" onClick={() => saveEdit(row.id)} disabled={updateMutation.isPending}>
                                  <Check className="h-3 w-3" /> Save
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingId(null)}>
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-3 text-end font-mono">${row.baseFare.toFixed(2)}</td>
                            <td className="px-3 py-3 text-end font-mono">${row.perKmRate.toFixed(2)}</td>
                            <td className="px-3 py-3 text-end font-mono">${row.minimumFare.toFixed(2)}</td>
                            <td className="px-3 py-3 text-center">
                              <Badge variant="outline" className={row.isActive ? "text-green-600 border-green-200 text-xs" : "text-muted-foreground text-xs"}>
                                {row.isActive ? "Active" : "Inactive"}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1 justify-end">
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(row)}>
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(row.id)} disabled={deleteMutation.isPending}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Zone Price</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Zone</Label>
              <select
                value={addForm.zoneId}
                onChange={(e) => setAddForm((p) => ({ ...p, zoneId: e.target.value }))}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="">Select a zone…</option>
                {availableZones.map((z) => (
                  <option key={z.id} value={z.id}>{z.name}</option>
                ))}
              </select>
              {availableZones.length === 0 && <p className="text-xs text-muted-foreground">All zones already have a price entry.</p>}
            </div>
            {[
              { key: "baseFare" as const,    label: "Base Fare ($)" },
              { key: "perKmRate" as const,   label: "Per Km Rate ($)" },
              { key: "minimumFare" as const, label: "Minimum Fare ($)" },
            ].map(({ key, label }) => (
              <div key={key} className="space-y-1.5">
                <Label>{label}</Label>
                <Input
                  type="number" step="0.01" min="0" placeholder="0.00"
                  value={addForm[key]}
                  onChange={(e) => setAddForm((p) => ({ ...p, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={addMutation.isPending}>
              {addMutation.isPending ? "Adding…" : "Add Price"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Full Pricing View (car / bike / delivery) ───────────────────────────────

function PricingView({ type }: { type: "car" | "bike" | "delivery" }) {
  const meta = PRICING_META[type];
  const Icon = meta.icon;

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <div className={`p-3 rounded-xl ${meta.bg}`}>
          <Icon className={`h-6 w-6 ${meta.color}`} />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{meta.label}</h1>
          <p className="text-sm text-muted-foreground">{meta.desc}</p>
        </div>
      </div>

      {type === "car" ? (
        <CarCategoryEditor />
      ) : (
        <PricingEditor type={type} />
      )}
      <ZonePricingTable type={type} />

      <Card className="bg-muted/30 border-dashed">
        <CardContent className="pt-5 flex items-start gap-3">
          <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="text-sm text-muted-foreground space-y-1">
            <p>Base Fare: <strong>Flat fee + (Distance × Per Km Rate) + (Duration × Per Minute Rate)</strong></p>
            <p>Zone pricing overrides the base fare for rides that start within that zone. The minimum fare still applies.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Surge Pricing ────────────────────────────────────────────────────────────

function SurgePricingView() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<SurgeSettings | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["surge-settings"],
    queryFn: () => adminFetch<SurgeSettings>("/admin/surge-settings"),
  });

  const { data: zonesData } = useQuery({
    queryKey: ["zones-list"],
    queryFn: () => adminFetch<{ data: Zone[] }>("/zones?limit=200"),
  });

  const zones = zonesData?.data ?? [];

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const mutation = useMutation({
    mutationFn: (values: Partial<SurgeSettings>) =>
      adminFetch<SurgeSettings>("/admin/surge-settings", { method: "PATCH", body: JSON.stringify(values) }),
    onSuccess: (updated) => {
      toast({ title: "Surge settings saved" });
      queryClient.setQueryData(["surge-settings"], updated);
      setDraft(updated);
      setEditing(false);
    },
    onError: (err: Error) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const toggleEnabled = () => {
    if (!data) return;
    mutation.mutate({ isEnabled: !data.isEnabled });
  };

  const toggleZone = (zoneId: number) => {
    if (!draft) return;
    const has = draft.activeZoneIds.includes(zoneId);
    setDraft({
      ...draft,
      activeZoneIds: has ? draft.activeZoneIds.filter((id) => id !== zoneId) : [...draft.activeZoneIds, zoneId],
    });
  };

  if (isLoading || !data || !draft) {
    return (
      <div className="p-6 space-y-4 max-w-2xl">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
    );
  }

  const display = editing ? draft : data;

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-xl bg-amber-500/10">
          <Zap className="h-6 w-6 text-amber-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Surge Pricing</h1>
          <p className="text-sm text-muted-foreground">Dynamic fare multipliers based on demand levels</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings2 className="h-4 w-4" /> Surge Settings
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <Switch checked={data.isEnabled} onCheckedChange={toggleEnabled} disabled={mutation.isPending} />
                <span className={`text-xs font-medium ${data.isEnabled ? "text-amber-600" : "text-muted-foreground"}`}>
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
        </CardHeader>
        <CardContent className="space-y-5">
          <Separator />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-amber-500" /> Surge Multiplier
              </Label>
              <p className="text-xs text-muted-foreground">Applied to base fare during surge periods</p>
              {editing ? (
                <Input
                  type="number" step="0.1" min="1" max="5"
                  value={draft.multiplier}
                  onChange={(e) => setDraft({ ...draft, multiplier: parseFloat(e.target.value) || 1 })}
                />
              ) : (
                <p className="text-2xl font-bold">{display.multiplier.toFixed(1)}×</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Maximum Multiplier Cap</Label>
              <p className="text-xs text-muted-foreground">Fares will never exceed this multiplier</p>
              {editing ? (
                <Input
                  type="number" step="0.1" min="1" max="5"
                  value={draft.maxMultiplier}
                  onChange={(e) => setDraft({ ...draft, maxMultiplier: parseFloat(e.target.value) || 1 })}
                />
              ) : (
                <p className="text-2xl font-bold">{display.maxMultiplier.toFixed(1)}×</p>
              )}
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-blue-500" /> Active Hours
            </Label>
            <p className="text-xs text-muted-foreground">Surge pricing is applied automatically within this window</p>
            <div className="flex items-center gap-3">
              <div className="flex-1 space-y-1">
                <Label className="text-xs text-muted-foreground">From</Label>
                {editing ? (
                  <Input type="time" value={draft.activeHoursStart} onChange={(e) => setDraft({ ...draft, activeHoursStart: e.target.value })} />
                ) : (
                  <p className="text-xl font-bold">{display.activeHoursStart}</p>
                )}
              </div>
              <span className="text-muted-foreground mt-4">→</span>
              <div className="flex-1 space-y-1">
                <Label className="text-xs text-muted-foreground">To</Label>
                {editing ? (
                  <Input type="time" value={draft.activeHoursEnd} onChange={(e) => setDraft({ ...draft, activeHoursEnd: e.target.value })} />
                ) : (
                  <p className="text-xl font-bold">{display.activeHoursEnd}</p>
                )}
              </div>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label className="text-sm font-medium">Demand Trigger Threshold</Label>
            <p className="text-xs text-muted-foreground">
              Surge activates when driver utilisation exceeds this percentage
            </p>
            {editing ? (
              <div className="flex items-center gap-2">
                <Input
                  type="number" min="0" max="100"
                  value={draft.triggerThreshold}
                  onChange={(e) => setDraft({ ...draft, triggerThreshold: parseInt(e.target.value) || 0 })}
                  className="w-28"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            ) : (
              <p className="text-2xl font-bold">{display.triggerThreshold}%</p>
            )}
          </div>

          {zones.length > 0 && (
            <>
              <Separator />
              <div className="space-y-3">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-rose-500" /> Active Zones
                </Label>
                <p className="text-xs text-muted-foreground">Surge pricing only applies in selected zones (leave empty for all zones)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {zones.map((zone) => {
                    const active = display.activeZoneIds.includes(zone.id);
                    return (
                      <div key={zone.id} className="flex items-center gap-2.5 p-2.5 rounded-lg border bg-muted/30">
                        {editing ? (
                          <Checkbox
                            checked={draft.activeZoneIds.includes(zone.id)}
                            onCheckedChange={() => toggleZone(zone.id)}
                          />
                        ) : (
                          active
                            ? <Check className="h-3.5 w-3.5 text-green-600 shrink-0" />
                            : <div className="h-3.5 w-3.5 rounded-sm border border-muted-foreground/40 shrink-0" />
                        )}
                        <span className={`text-sm ${active ? "font-medium" : "text-muted-foreground"}`}>{zone.name}</span>
                      </div>
                    );
                  })}
                </div>
                {display.activeZoneIds.length === 0 && (
                  <p className="text-xs text-amber-600">No zones selected — surge applies platform-wide.</p>
                )}
              </div>
            </>
          )}

          {editing && (
            <div className="flex items-center gap-2 pt-2">
              <Button onClick={() => mutation.mutate(draft)} disabled={mutation.isPending} className="gap-1.5">
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

      <Card className="bg-muted/30 border-dashed">
        <CardContent className="pt-5 flex items-start gap-3">
          <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="text-sm text-muted-foreground space-y-1">
            <p>Surge pricing multiplies the calculated fare during high-demand windows.</p>
            <p>Example: If base fare is <strong>$5.00</strong> and surge multiplier is <strong>1.5×</strong>, the passenger pays <strong>$7.50</strong>.</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "1.0×", desc: "Normal demand — standard fares apply", color: "text-green-600 bg-green-50 border-green-200 dark:bg-green-950" },
          { label: `${data.multiplier.toFixed(1)}×`, desc: `Current surge — ${((data.multiplier - 1) * 100).toFixed(0)}% fare increase`, color: "text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-950" },
          { label: `${data.maxMultiplier.toFixed(1)}×`, desc: "Maximum cap — fares cannot exceed this", color: "text-red-500 bg-red-50 border-red-200 dark:bg-red-950" },
        ].map((tier) => (
          <div key={tier.label} className={`p-3 rounded-lg border ${tier.color}`}>
            <p className="text-2xl font-bold">{tier.label}</p>
            <p className="text-xs mt-1">{tier.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Root ────────────────────────────────────────────────────────────────────

export default function Pricing() {
  const [, params] = useRoute("/pricing/:type");
  const type = params?.type ?? "car";

  if (type === "surge")                     return <SurgePricingView />;
  if (type === "car")                        return <PricingView type="car" />;
  if (type === "bike" || type === "motorcycle") return <PricingView type="bike" />;
  if (type === "delivery")                   return <PricingView type="delivery" />;
  return <PricingView type="car" />;
}
