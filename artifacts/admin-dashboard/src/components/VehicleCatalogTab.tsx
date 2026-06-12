import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Edit, Trash2, Tag, BookOpen } from "lucide-react";
import { Label } from "@/components/ui/label";

// ─── Types ────────────────────────────────────────────────────────────────────

type VehicleBrand = {
  id: number;
  name: string;
  isChinese: boolean;
  isActive: boolean;
  createdAt: string;
};

type VehicleModel = {
  id: number;
  brandId: number;
  brandName?: string;
  name: string;
  minYear: number;
  maxYear: number | null;
  isActive: boolean;
  createdAt: string;
};

// ─── Brand Dialog ─────────────────────────────────────────────────────────────

function BrandDialog({
  open,
  onClose,
  initial,
  onSave,
  saving,
}: {
  open: boolean;
  onClose: () => void;
  initial?: Partial<VehicleBrand>;
  onSave: (data: { name: string; isChinese: boolean; isActive: boolean }) => void;
  saving: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [isChinese, setIsChinese] = useState(initial?.isChinese ?? false);
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);

  React.useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setIsChinese(initial?.isChinese ?? false);
      setIsActive(initial?.isActive ?? true);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Edit Brand" : "Add Brand"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Brand Name</Label>
            <Input placeholder="e.g. Toyota" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex items-center justify-between">
            <Label>Chinese Brand</Label>
            <Switch checked={isChinese} onCheckedChange={setIsChinese} />
          </div>
          <div className="flex items-center justify-between">
            <Label>Active</Label>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!name.trim() || saving} onClick={() => onSave({ name: name.trim(), isChinese, isActive })}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Model Dialog ─────────────────────────────────────────────────────────────

function ModelDialog({
  open,
  onClose,
  initial,
  brands,
  isShuttle,
  onSave,
  saving,
}: {
  open: boolean;
  onClose: () => void;
  initial?: Partial<VehicleModel>;
  brands: VehicleBrand[];
  isShuttle: boolean;
  onSave: (data: {
    brandId: number;
    name: string;
    minYear: number;
    maxYear: number | null;
    isActive: boolean;
    seatCapacity?: number | null;
  }) => void;
  saving: boolean;
}) {
  const currentYear = new Date().getFullYear();
  const [brandId, setBrandId] = useState<number>(initial?.brandId ?? (brands[0]?.id ?? 0));
  const [name, setName] = useState(initial?.name ?? "");
  const [minYear, setMinYear] = useState<number>(initial?.minYear ?? 2015);
  const [maxYear, setMaxYear] = useState<number | "">(initial?.maxYear ?? "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [seatCapacity, setSeatCapacity] = useState<number | "">(14);

  React.useEffect(() => {
    if (open) {
      setBrandId(initial?.brandId ?? (brands[0]?.id ?? 0));
      setName(initial?.name ?? "");
      setMinYear(initial?.minYear ?? 2015);
      setMaxYear(initial?.maxYear ?? "");
      setIsActive(initial?.isActive ?? true);
      setSeatCapacity(14);
    }
  }, [open]);

  const handleSave = () => {
    if (!brandId || !name.trim()) return;
    onSave({
      brandId,
      name: name.trim(),
      minYear,
      maxYear: maxYear === "" ? null : Number(maxYear),
      isActive,
      ...(isShuttle ? { seatCapacity: seatCapacity === "" ? null : Number(seatCapacity) } : {}),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Edit Model" : "Add Model"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Brand</Label>
            <Select value={String(brandId)} onValueChange={(v) => setBrandId(Number(v))}>
              <SelectTrigger><SelectValue placeholder="Select brand" /></SelectTrigger>
              <SelectContent>
                {brands.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Model Name</Label>
            <Input placeholder="e.g. Corolla" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Min Year</Label>
              <Input
                type="number"
                min={1900}
                max={currentYear + 2}
                value={minYear}
                onChange={(e) => setMinYear(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Max Year <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input
                type="number"
                min={1900}
                max={currentYear + 2}
                placeholder="No limit"
                value={maxYear}
                onChange={(e) => setMaxYear(e.target.value === "" ? "" : Number(e.target.value))}
              />
            </div>
          </div>
          {isShuttle && (
            <div className="space-y-1.5">
              <Label>Seat Capacity</Label>
              <Input
                type="number"
                min={1}
                max={100}
                placeholder="e.g. 14"
                value={seatCapacity}
                onChange={(e) => setSeatCapacity(e.target.value === "" ? "" : Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">Default seats for this shuttle model (e.g. 14 for microbus, 28 for minibus)</p>
            </div>
          )}
          <div className="flex items-center justify-between">
            <Label>Active</Label>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!name.trim() || !brandId || saving} onClick={handleSave}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function VehicleCatalogTab({ isShuttle = false }: { isShuttle?: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [brandDialog, setBrandDialog] = useState<{ open: boolean; brand?: VehicleBrand }>({ open: false });
  const [modelDialog, setModelDialog] = useState<{ open: boolean; model?: VehicleModel }>({ open: false });
  const [deleteBrand, setDeleteBrand] = useState<number | null>(null);
  const [deleteModel, setDeleteModel] = useState<number | null>(null);
  const [selectedBrandFilter, setSelectedBrandFilter] = useState<string>("all");

  // ── Brands query
  const brandsQuery = useQuery({
    queryKey: ["vehicle-catalog-brands"],
    queryFn: () => adminFetch<{ data: VehicleBrand[] }>("/admin/vehicle-catalog/brands"),
  });
  const brands = brandsQuery.data?.data ?? [];

  // ── Models query
  const modelsQuery = useQuery({
    queryKey: ["vehicle-catalog-models"],
    queryFn: () => adminFetch<{ data: VehicleModel[] }>("/admin/vehicle-catalog/models"),
  });
  const allModels = modelsQuery.data?.data ?? [];
  const filteredModels = selectedBrandFilter === "all"
    ? allModels
    : allModels.filter((m) => String(m.brandId) === selectedBrandFilter);

  // ── Brand mutations
  const createBrand = useMutation({
    mutationFn: (data: { name: string; isChinese: boolean; isActive: boolean }) =>
      adminFetch("/admin/vehicle-catalog/brands", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicle-catalog-brands"] });
      setBrandDialog({ open: false });
      toast({ title: "Brand added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });

  const updateBrand = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<VehicleBrand> }) =>
      adminFetch(`/admin/vehicle-catalog/brands/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicle-catalog-brands"] });
      setBrandDialog({ open: false });
      toast({ title: "Brand updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });

  const deleteBrandMutation = useMutation({
    mutationFn: (id: number) =>
      adminFetch(`/admin/vehicle-catalog/brands/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicle-catalog-brands"] });
      queryClient.invalidateQueries({ queryKey: ["vehicle-catalog-models"] });
      setDeleteBrand(null);
      toast({ title: "Brand deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });

  // ── Model mutations
  const createModel = useMutation({
    mutationFn: (data: object) =>
      adminFetch("/admin/vehicle-catalog/models", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicle-catalog-models"] });
      setModelDialog({ open: false });
      toast({ title: "Model added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });

  const updateModel = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) =>
      adminFetch(`/admin/vehicle-catalog/models/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicle-catalog-models"] });
      setModelDialog({ open: false });
      toast({ title: "Model updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });

  const deleteModelMutation = useMutation({
    mutationFn: (id: number) =>
      adminFetch(`/admin/vehicle-catalog/models/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicle-catalog-models"] });
      setDeleteModel(null);
      toast({ title: "Model deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-8">

      {/* ── Approved Brands ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">Approved Brands</h3>
            {!brandsQuery.isLoading && (
              <Badge variant="secondary" className="text-xs">{brands.length}</Badge>
            )}
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => setBrandDialog({ open: true })}>
            <Plus className="h-3.5 w-3.5" /> Add Brand
          </Button>
        </div>

        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Brand Name</TableHead>
                <TableHead className="text-center">Chinese Brand</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {brandsQuery.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 5 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : brands.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-muted-foreground text-sm">
                    No brands defined yet. Add the first one.
                  </TableCell>
                </TableRow>
              ) : (
                brands.map((brand, idx) => (
                  <TableRow key={brand.id}>
                    <TableCell className="text-muted-foreground text-sm">{idx + 1}</TableCell>
                    <TableCell className="font-medium">{brand.name}</TableCell>
                    <TableCell className="text-center">
                      {brand.isChinese ? (
                        <Badge variant="outline" className="text-xs border-red-200 text-red-600 bg-red-50 dark:bg-red-950">Chinese</Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={brand.isActive
                        ? "text-green-700 border-green-200 bg-green-50 dark:bg-green-950 text-xs"
                        : "text-slate-500 border-slate-200 bg-slate-50 dark:bg-slate-900 text-xs"}>
                        {brand.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => setBrandDialog({ open: true, brand })}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setDeleteBrand(brand.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* ── Approved Models ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">Approved Models</h3>
            {!modelsQuery.isLoading && (
              <Badge variant="secondary" className="text-xs">{filteredModels.length}</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Select value={selectedBrandFilter} onValueChange={setSelectedBrandFilter}>
              <SelectTrigger className="w-40 h-8 text-xs">
                <SelectValue placeholder="All Brands" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Brands</SelectItem>
                {brands.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" className="gap-1.5" onClick={() => setModelDialog({ open: true })}>
              <Plus className="h-3.5 w-3.5" /> Add Model
            </Button>
          </div>
        </div>

        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Model Name</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead className="text-center">Min Year</TableHead>
                <TableHead className="text-center">Max Year</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {modelsQuery.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filteredModels.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10 text-muted-foreground text-sm">
                    No models found. Add the first one.
                  </TableCell>
                </TableRow>
              ) : (
                filteredModels.map((model, idx) => (
                  <TableRow key={model.id}>
                    <TableCell className="text-muted-foreground text-sm">{idx + 1}</TableCell>
                    <TableCell className="font-medium">{model.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{model.brandName ?? "—"}</TableCell>
                    <TableCell className="text-center text-sm">{model.minYear}</TableCell>
                    <TableCell className="text-center text-sm text-muted-foreground">
                      {model.maxYear ?? <span className="italic text-xs">No limit</span>}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={model.isActive
                        ? "text-green-700 border-green-200 bg-green-50 dark:bg-green-950 text-xs"
                        : "text-slate-500 border-slate-200 bg-slate-50 dark:bg-slate-900 text-xs"}>
                        {model.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => setModelDialog({ open: true, model })}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setDeleteModel(model.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* ── Dialogs ── */}
      <BrandDialog
        open={brandDialog.open}
        onClose={() => setBrandDialog({ open: false })}
        initial={brandDialog.brand}
        saving={createBrand.isPending || updateBrand.isPending}
        onSave={(data) => {
          if (brandDialog.brand?.id) {
            updateBrand.mutate({ id: brandDialog.brand.id, data });
          } else {
            createBrand.mutate(data);
          }
        }}
      />

      <ModelDialog
        open={modelDialog.open}
        onClose={() => setModelDialog({ open: false })}
        initial={modelDialog.model}
        brands={brands}
        isShuttle={isShuttle}
        saving={createModel.isPending || updateModel.isPending}
        onSave={(data) => {
          if (modelDialog.model?.id) {
            updateModel.mutate({ id: modelDialog.model.id, data });
          } else {
            createModel.mutate(data);
          }
        }}
      />

      <AlertDialog open={deleteBrand !== null} onOpenChange={(v) => !v && setDeleteBrand(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Brand?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the brand and all its models from the catalog. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteBrand !== null && deleteBrandMutation.mutate(deleteBrand)}
            >
              {deleteBrandMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteModel !== null} onOpenChange={(v) => !v && setDeleteModel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Model?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this model from the catalog.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteModel !== null && deleteModelMutation.mutate(deleteModel)}
            >
              {deleteModelMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
