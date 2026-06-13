import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { adminFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import {
  Plus, Edit, Trash2, Tag, Palette, ChevronRight, Car, Calendar,
  Layers, ArrowLeft, Home, Check, Zap, Upload, Loader2, Copy, CheckCheck, AlertTriangle,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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
  seatCapacity?: number | null;
  createdAt: string;
};

type VehicleColor = {
  id: number;
  hexCode: string;
  nameEn: string;
  nameAr: string;
  isActive: boolean;
  createdAt: string;
};

type VehicleYear = {
  id: number;
  modelId: number;
  year: number;
  pricingCategory: "Economy" | "EconomyPlus" | "Comfort" | null;
  isActive: boolean;
  createdAt: string;
};

type ViewState =
  | { level: "brands" }
  | { level: "models"; brand: VehicleBrand }
  | { level: "years"; brand: VehicleBrand; model: VehicleModel };

const PRICING_CATEGORIES = [
  { value: "Economy",     label: "Economy",      labelAr: "اقتصادي",        color: "text-blue-600  bg-blue-50  border-blue-200  dark:bg-blue-950" },
  { value: "EconomyPlus", label: "Economy Plus", labelAr: "اقتصادي بلس",    color: "text-violet-600 bg-violet-50 border-violet-200 dark:bg-violet-950" },
  { value: "Comfort",     label: "Comfort",      labelAr: "كومفورت",         color: "text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-950" },
] as const;

function pricingMeta(cat: string | null | undefined) {
  return PRICING_CATEGORIES.find((c) => c.value === cat) ?? null;
}

// ─── Breadcrumb ───────────────────────────────────────────────────────────────

function Breadcrumb({
  viewState,
  onNavigate,
}: {
  viewState: ViewState;
  onNavigate: (v: ViewState) => void;
}) {
  const { t } = useTranslation();
  const segments: { label: string; action: ViewState | null }[] = [
    { label: t("vehicleCatalog.title"), action: { level: "brands" } },
  ];
  if (viewState.level === "models" || viewState.level === "years") {
    segments.push({ label: viewState.brand.name, action: { level: "models", brand: viewState.brand } });
  }
  if (viewState.level === "years") {
    segments.push({ label: viewState.model.name, action: null });
  }

  return (
    <nav className="flex items-center gap-1.5 text-sm flex-wrap">
      <Home className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1;
        return (
          <React.Fragment key={i}>
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
            {isLast || !seg.action ? (
              <span className={`font-medium ${isLast ? "text-foreground" : "text-muted-foreground"}`}>
                {seg.label}
              </span>
            ) : (
              <button
                onClick={() => seg.action && onNavigate(seg.action)}
                className="font-medium text-primary hover:underline underline-offset-2 transition-colors"
              >
                {seg.label}
              </button>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

// ─── Brand Dialog ─────────────────────────────────────────────────────────────

function BrandDialog({
  open, onClose, initial, onSave, saving,
}: {
  open: boolean; onClose: () => void;
  initial?: Partial<VehicleBrand>;
  onSave: (data: { name: string; isChinese: boolean; isActive: boolean }) => void;
  saving: boolean;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? "");
  const [isChinese, setIsChinese] = useState(initial?.isChinese ?? false);
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  React.useEffect(() => {
    if (open) { setName(initial?.name ?? ""); setIsChinese(initial?.isChinese ?? false); setIsActive(initial?.isActive ?? true); }
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{initial?.id ? t("vehicleCatalog.editBrand") : t("vehicleCatalog.addBrand")}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5"><Label>{t("vehicleCatalog.brandName")}</Label>
            <Input placeholder="e.g. Toyota" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex items-center justify-between"><Label>{t("vehicleCatalog.chineseBrand")}</Label>
            <Switch checked={isChinese} onCheckedChange={setIsChinese} />
          </div>
          <div className="flex items-center justify-between"><Label>{t("vehicleCatalog.active")}</Label>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("vehicleCatalog.cancel")}</Button>
          <Button disabled={!name.trim() || saving} onClick={() => onSave({ name: name.trim(), isChinese, isActive })}>
            {saving ? t("vehicleCatalog.saving") : t("vehicleCatalog.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Model Dialog ─────────────────────────────────────────────────────────────

function ModelDialog({
  open, onClose, initial, brandId, isShuttle, onSave, saving,
}: {
  open: boolean; onClose: () => void;
  initial?: Partial<VehicleModel>;
  brandId: number;
  isShuttle: boolean;
  onSave: (data: { brandId: number; name: string; minYear: number; maxYear: number | null; isActive: boolean; seatCapacity?: number | null }) => void;
  saving: boolean;
}) {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();
  const [name, setName] = useState(initial?.name ?? "");
  const [minYear, setMinYear] = useState(initial?.minYear ?? 2015);
  const [maxYear, setMaxYear] = useState<number | "">(initial?.maxYear ?? "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [seatCapacity, setSeatCapacity] = useState<number | "">(initial?.seatCapacity ?? 14);
  React.useEffect(() => {
    if (open) {
      setName(initial?.name ?? ""); setMinYear(initial?.minYear ?? 2015);
      setMaxYear(initial?.maxYear ?? ""); setIsActive(initial?.isActive ?? true);
      setSeatCapacity(initial?.seatCapacity ?? 14);
    }
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{initial?.id ? t("vehicleCatalog.editModel") : t("vehicleCatalog.addModel")}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5"><Label>{t("vehicleCatalog.modelName")}</Label>
            <Input placeholder="e.g. Corolla" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>{t("vehicleCatalog.minYear")}</Label>
              <Input type="number" min={1900} max={currentYear + 2} value={minYear}
                onChange={(e) => setMinYear(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("vehicleCatalog.maxYearOptional")}</Label>
              <Input type="number" min={1900} max={currentYear + 2} placeholder={t("vehicleCatalog.noYearLimit")} value={maxYear}
                onChange={(e) => setMaxYear(e.target.value === "" ? "" : Number(e.target.value))} />
            </div>
          </div>
          {isShuttle && (
            <div className="space-y-1.5"><Label>{t("vehicleCatalog.seatCapacity")}</Label>
              <Input type="number" min={1} max={100} placeholder="e.g. 14" value={seatCapacity}
                onChange={(e) => setSeatCapacity(e.target.value === "" ? "" : Number(e.target.value))} />
            </div>
          )}
          <div className="flex items-center justify-between"><Label>{t("vehicleCatalog.active")}</Label>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("vehicleCatalog.cancel")}</Button>
          <Button disabled={!name.trim() || saving} onClick={() => onSave({
            brandId, name: name.trim(), minYear,
            maxYear: maxYear === "" ? null : Number(maxYear), isActive,
            ...(isShuttle ? { seatCapacity: seatCapacity === "" ? null : Number(seatCapacity) } : {}),
          })}>
            {saving ? t("vehicleCatalog.saving") : t("vehicleCatalog.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Year Dialog ──────────────────────────────────────────────────────────────

function YearDialog({
  open, onClose, modelId, onSave, saving,
}: {
  open: boolean; onClose: () => void;
  modelId: number;
  onSave: (data: { year: number; pricingCategories: string[]; isActive: boolean }) => void;
  saving: boolean;
}) {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);
  const [selected, setSelected] = useState<Set<string>>(new Set(["Economy"]));
  const [isActive, setIsActive] = useState(true);

  React.useEffect(() => {
    if (open) { setYear(currentYear); setSelected(new Set(["Economy"])); setIsActive(true); }
  }, [open]);

  const toggle = (value: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{t("vehicleCatalog.registerYear")}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>{t("vehicleCatalog.yearOfManufacture")}</Label>
            <Input type="number" min={1990} max={currentYear + 2} value={year}
              onChange={(e) => setYear(Number(e.target.value))} />
          </div>
          <div className="space-y-2">
            <Label>{t("vehicleCatalog.pricingTiers")}</Label>
            <div className="space-y-2">
              {PRICING_CATEGORIES.map((c) => {
                const checked = selected.has(c.value);
                return (
                  <label
                    key={c.value}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors select-none ${
                      checked ? `${c.color} border-current` : "border-border hover:bg-muted/40"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(c.value)}
                      className="h-4 w-4 shrink-0 rounded accent-current"
                    />
                    <div className="flex-1">
                      <span className="font-medium text-sm">{c.label}</span>
                      <span className="ms-2 text-xs opacity-70">{c.labelAr}</span>
                    </div>
                    {checked && <Check className="h-3.5 w-3.5 shrink-0" />}
                  </label>
                );
              })}
            </div>
            {selected.size === 0 && (
              <p className="text-xs text-destructive">{t("vehicleCatalog.selectOneTier")}</p>
            )}
          </div>
          <div className="flex items-center justify-between">
            <Label>{t("vehicleCatalog.active")}</Label>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("vehicleCatalog.cancel")}</Button>
          <Button
            disabled={!year || selected.size === 0 || saving}
            onClick={() => onSave({ year, pricingCategories: Array.from(selected), isActive })}
          >
            {saving
              ? t("vehicleCatalog.saving")
              : selected.size > 1
                ? t("vehicleCatalog.registerYearMultiBtn", { count: selected.size })
                : t("vehicleCatalog.registerYearBtn")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Color Dialog ─────────────────────────────────────────────────────────────

function ColorDialog({
  open, onClose, initial, onSave, saving,
}: {
  open: boolean; onClose: () => void;
  initial?: Partial<VehicleColor>;
  onSave: (data: { hexCode: string; nameEn: string; nameAr: string; isActive: boolean }) => void;
  saving: boolean;
}) {
  const { t } = useTranslation();
  const [hexCode, setHexCode] = React.useState(initial?.hexCode ?? "#000000");
  const [nameEn, setNameEn] = React.useState(initial?.nameEn ?? "");
  const [nameAr, setNameAr] = React.useState(initial?.nameAr ?? "");
  const [isActive, setIsActive] = React.useState(initial?.isActive ?? true);
  React.useEffect(() => {
    if (open) { setHexCode(initial?.hexCode ?? "#000000"); setNameEn(initial?.nameEn ?? ""); setNameAr(initial?.nameAr ?? ""); setIsActive(initial?.isActive ?? true); }
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{initial?.id ? t("vehicleCatalog.editColor") : t("vehicleCatalog.addColor")}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5"><Label>{t("vehicleCatalog.colorSwatch")}</Label>
            <div className="flex items-center gap-3">
              <input type="color" value={hexCode} onChange={(e) => setHexCode(e.target.value)}
                className="h-10 w-12 rounded-md cursor-pointer border border-border bg-transparent p-0.5" />
              <Input placeholder="#000000" value={hexCode} onChange={(e) => setHexCode(e.target.value)}
                className="font-mono text-sm flex-1" />
            </div>
          </div>
          <div className="space-y-1.5"><Label>{t("vehicleCatalog.englishName")}</Label>
            <Input placeholder="e.g. Pearl White" value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
          </div>
          <div className="space-y-1.5"><Label>{t("vehicleCatalog.arabicName")}</Label>
            <Input placeholder="e.g. أبيض لؤلؤي" value={nameAr} onChange={(e) => setNameAr(e.target.value)}
              dir="rtl" className="text-end" />
          </div>
          <div className="flex items-center justify-between"><Label>{t("vehicleCatalog.active")}</Label>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("vehicleCatalog.cancel")}</Button>
          <Button disabled={!nameEn.trim() || !hexCode || saving}
            onClick={() => onSave({ hexCode, nameEn: nameEn.trim(), nameAr: nameAr.trim(), isActive })}>
            {saving ? t("vehicleCatalog.saving") : t("vehicleCatalog.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Bulk Import Dialog ───────────────────────────────────────────────────────

type CatalogEntry = { brandName: string; models: string[] };

const BULK_TEMPLATE: CatalogEntry[] = [
  { brandName: "Yamaha",  models: ["NMAX 155", "XMAX 300", "Aerox 155"] },
  { brandName: "Honda",   models: ["PCX 160", "FORZA 350"] },
  { brandName: "Suzuki",  models: ["Burgman 400"] },
];

function BulkImportDialog({
  open, onClose, serviceType, onImport, importing,
}: {
  open: boolean;
  onClose: () => void;
  serviceType: string;
  onImport: (catalogData: CatalogEntry[]) => void;
  importing: boolean;
}) {
  const { t } = useTranslation();
  const [raw, setRaw] = React.useState("");
  const [parseError, setParseError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const TEMPLATE = JSON.stringify(BULK_TEMPLATE, null, 2);

  React.useEffect(() => {
    if (open) { setRaw(""); setParseError(null); setCopied(false); }
  }, [open]);

  const handleCopy = () => {
    navigator.clipboard.writeText(TEMPLATE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleProcess = () => {
    if (!raw.trim()) return;
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      setParseError("Invalid JSON — please check syntax and try again.");
      return;
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      setParseError("Input must be a non-empty JSON array.");
      return;
    }
    for (let i = 0; i < parsed.length; i++) {
      const entry = parsed[i];
      if (typeof entry.brandName !== "string" || !entry.brandName.trim()) {
        setParseError(`Entry #${i + 1}: "brandName" must be a non-empty string.`);
        return;
      }
      if (!Array.isArray(entry.models)) {
        setParseError(`Entry #${i + 1}: "models" must be an array of strings.`);
        return;
      }
      for (const m of entry.models) {
        if (typeof m !== "string" || !m.trim()) {
          setParseError(`Entry #${i + 1} (${entry.brandName}): all model names must be non-empty strings.`);
          return;
        }
      }
    }
    setParseError(null);
    onImport(parsed.map((e: any) => ({
      brandName: e.brandName.trim(),
      models: (e.models as string[]).map((m) => m.trim()).filter(Boolean),
    })));
  };

  const brandCount = React.useMemo(() => {
    if (!raw.trim()) return null;
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p.length : null; } catch { return null; }
  }, [raw]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !importing && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" />
            {t("vehicleCatalog.bulkImportTitle")}{" "}
            <span className="capitalize text-primary font-semibold">{serviceType}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">
                {t("vehicleCatalog.jsonTemplate")}
              </Label>
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1 text-xs text-primary hover:underline underline-offset-2 transition-colors"
              >
                {copied
                  ? <><CheckCheck className="h-3 w-3" /> {t("vehicleCatalog.copied")}</>
                  : <><Copy className="h-3 w-3" /> {t("vehicleCatalog.copyTemplate")}</>}
              </button>
            </div>
            <pre className="rounded-md border border-border bg-muted/50 px-3 py-2.5 text-[11px] font-mono leading-relaxed overflow-auto max-h-36 text-muted-foreground select-all cursor-text">
              {TEMPLATE}
            </pre>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>{t("vehicleCatalog.pasteHere")}</Label>
              {brandCount !== null && (
                <span className="text-xs text-muted-foreground">
                  {t("vehicleCatalog.brandsDetected", { count: brandCount })}
                </span>
              )}
            </div>
            <Textarea
              value={raw}
              onChange={(e) => { setRaw(e.target.value); setParseError(null); }}
              placeholder={`[{"brandName": "Yamaha", "models": ["NMAX 155", "XMAX 300"]}]`}
              className="font-mono text-xs min-h-[160px] resize-y"
              spellCheck={false}
              disabled={importing}
            />
            {parseError && (
              <p className="flex items-start gap-1.5 text-xs text-destructive mt-0.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                {parseError}
              </p>
            )}
          </div>

          <p className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2 leading-relaxed">
            {t("vehicleCatalog.importNote")}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={importing}>
            {t("vehicleCatalog.cancel")}
          </Button>
          <Button
            onClick={handleProcess}
            disabled={!raw.trim() || importing}
            className="gap-1.5 min-w-[140px]"
          >
            {importing
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("vehicleCatalog.processing")}</>
              : <><Upload className="h-3.5 w-3.5" /> {t("vehicleCatalog.processImport")}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Level 1: Brands View ─────────────────────────────────────────────────────

function BrandsView({
  onSelectBrand,
  isShuttle,
  serviceType,
}: {
  onSelectBrand: (brand: VehicleBrand) => void;
  isShuttle: boolean;
  serviceType: string;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [brandDialog, setBrandDialog] = useState<{ open: boolean; brand?: VehicleBrand }>({ open: false });
  const [deleteBrand, setDeleteBrand] = useState<number | null>(null);
  const [colorDialog, setColorDialog] = useState<{ open: boolean; color?: VehicleColor }>({ open: false });
  const [deleteColor, setDeleteColor] = useState<number | null>(null);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);

  const brandsQuery = useQuery({
    queryKey: ["vehicle-catalog-brands", serviceType],
    queryFn: () => adminFetch<{ data: VehicleBrand[] }>(`/admin/vehicle-catalog/brands?serviceType=${encodeURIComponent(serviceType)}`),
  });
  const brands = brandsQuery.data?.data ?? [];

  const colorsQuery = useQuery({
    queryKey: ["vehicle-catalog-colors"],
    queryFn: () => adminFetch<{ data: VehicleColor[] }>("/admin/vehicle-catalog/colors"),
  });
  const colors = colorsQuery.data?.data ?? [];

  const createBrand = useMutation({
    mutationFn: (data: object) => adminFetch("/admin/vehicle-catalog/brands", { method: "POST", body: JSON.stringify({ ...data, serviceType }) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["vehicle-catalog-brands", serviceType] }); setBrandDialog({ open: false }); toast({ title: t("vehicleCatalog.brandAdded") }); },
    onError: (e: any) => toast({ title: t("vehicleCatalog.errorTitle"), description: e?.message, variant: "destructive" }),
  });
  const updateBrand = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) => adminFetch(`/admin/vehicle-catalog/brands/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["vehicle-catalog-brands", serviceType] }); setBrandDialog({ open: false }); toast({ title: t("vehicleCatalog.brandUpdated") }); },
    onError: (e: any) => toast({ title: t("vehicleCatalog.errorTitle"), description: e?.message, variant: "destructive" }),
  });
  const deleteBrandMutation = useMutation({
    mutationFn: (id: number) => adminFetch(`/admin/vehicle-catalog/brands/${id}`, { method: "DELETE" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["vehicle-catalog-brands", serviceType] }); setDeleteBrand(null); toast({ title: t("vehicleCatalog.brandDeleted") }); },
    onError: (e: any) => toast({ title: t("vehicleCatalog.errorTitle"), description: e?.message, variant: "destructive" }),
  });
  const bulkImportMutation = useMutation({
    mutationFn: (catalogData: CatalogEntry[]) =>
      adminFetch<{ brandsCreated: number; brandsExisting: number; modelsCreated: number; modelsExisting: number }>(
        "/admin/vehicle-catalog/bulk-import",
        { method: "POST", body: JSON.stringify({ serviceType, catalogData }) },
      ),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["vehicle-catalog-brands", serviceType] });
      queryClient.invalidateQueries({ queryKey: ["vehicle-catalog-models"] });
      setBulkImportOpen(false);
      toast({
        title: t("vehicleCatalog.importComplete"),
        description: `${result.brandsCreated} brand${result.brandsCreated !== 1 ? "s" : ""} and ${result.modelsCreated} model${result.modelsCreated !== 1 ? "s" : ""} imported.${result.brandsExisting + result.modelsExisting > 0 ? ` (${result.brandsExisting + result.modelsExisting} duplicate${result.brandsExisting + result.modelsExisting !== 1 ? "s" : ""} skipped)` : ""}`.trim(),
      });
    },
    onError: (e: any) => toast({ title: t("vehicleCatalog.importFailed"), description: e?.message, variant: "destructive" }),
  });

  const createColor = useMutation({
    mutationFn: (data: object) => adminFetch("/admin/vehicle-catalog/colors", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["vehicle-catalog-colors"] }); setColorDialog({ open: false }); toast({ title: t("vehicleCatalog.colorAdded") }); },
    onError: (e: any) => toast({ title: t("vehicleCatalog.errorTitle"), description: e?.message, variant: "destructive" }),
  });
  const updateColor = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) => adminFetch(`/admin/vehicle-catalog/colors/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["vehicle-catalog-colors"] }); setColorDialog({ open: false }); toast({ title: t("vehicleCatalog.colorUpdated") }); },
    onError: (e: any) => toast({ title: t("vehicleCatalog.errorTitle"), description: e?.message, variant: "destructive" }),
  });
  const deleteColorMutation = useMutation({
    mutationFn: (id: number) => adminFetch(`/admin/vehicle-catalog/colors/${id}`, { method: "DELETE" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["vehicle-catalog-colors"] }); setDeleteColor(null); toast({ title: t("vehicleCatalog.colorDeleted") }); },
    onError: (e: any) => toast({ title: t("vehicleCatalog.errorTitle"), description: e?.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-8">

      {/* ── Approved Brands ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">{t("vehicleCatalog.approvedBrands")}</h3>
            {!brandsQuery.isLoading && <Badge variant="secondary" className="text-xs">{brands.length}</Badge>}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setBulkImportOpen(true)}>
              <Upload className="h-3.5 w-3.5" /> {t("vehicleCatalog.bulkImport")}
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => setBrandDialog({ open: true })}>
              <Plus className="h-3.5 w-3.5" /> {t("vehicleCatalog.addBrand")}
            </Button>
          </div>
        </div>

        {brandsQuery.isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : brands.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-12 text-center text-muted-foreground text-sm">
            <Car className="h-7 w-7 mx-auto mb-2 opacity-30" />
            {t("vehicleCatalog.noBrands")}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {brands.map((brand) => (
              <div
                key={brand.id}
                className="group relative rounded-xl border border-border bg-card p-4 cursor-pointer transition-all hover:border-primary/50 hover:shadow-md hover:bg-primary/[0.02]"
                onClick={() => onSelectBrand(brand)}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Car className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="h-6 w-6 rounded-md flex items-center justify-center hover:bg-muted transition-colors"
                      onClick={() => setBrandDialog({ open: true, brand })}
                    >
                      <Edit className="h-3 w-3 text-muted-foreground" />
                    </button>
                    <button
                      className="h-6 w-6 rounded-md flex items-center justify-center hover:bg-destructive/10 transition-colors"
                      onClick={() => setDeleteBrand(brand.id)}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </button>
                  </div>
                </div>
                <p className="font-semibold text-sm truncate">{brand.name}</p>
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  {brand.isChinese && (
                    <Badge variant="outline" className="text-[10px] border-red-200 text-red-600 bg-red-50 dark:bg-red-950 px-1.5">{t("vehicleCatalog.chineseBadge")}</Badge>
                  )}
                  <Badge variant="outline" className={`text-[10px] px-1.5 ${brand.isActive ? "text-green-700 border-green-200 bg-green-50 dark:bg-green-950" : "text-slate-500 border-slate-200 bg-slate-50 dark:bg-slate-900"}`}>
                    {brand.isActive ? t("vehicleCatalog.active") : t("common.inactive")}
                  </Badge>
                </div>
                <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ChevronRight className="h-4 w-4 text-primary" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Approved Colors ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">{t("vehicleCatalog.approvedColors")}</h3>
            {!colorsQuery.isLoading && <Badge variant="secondary" className="text-xs">{colors.length}</Badge>}
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => setColorDialog({ open: true })}>
            <Plus className="h-3.5 w-3.5" /> {t("vehicleCatalog.addColor")}
          </Button>
        </div>

        {colorsQuery.isLoading ? (
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-32 rounded-lg" />)}
          </div>
        ) : colors.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-10 text-center text-muted-foreground text-sm">
            <Palette className="h-7 w-7 mx-auto mb-2 opacity-30" />
            {t("vehicleCatalog.noColors")}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {colors.map((color) => (
              <div key={color.id} className="group flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 hover:border-primary/40 transition-colors">
                <div className="h-5 w-5 rounded-full border border-border shadow-sm shrink-0" style={{ backgroundColor: color.hexCode }} />
                <span className="text-sm font-medium">{color.nameEn}</span>
                <span className="text-xs text-muted-foreground" dir="rtl">{color.nameAr}</span>
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ms-1">
                  <button onClick={() => setColorDialog({ open: true, color })} className="h-5 w-5 rounded flex items-center justify-center hover:bg-muted">
                    <Edit className="h-2.5 w-2.5 text-muted-foreground" />
                  </button>
                  <button onClick={() => setDeleteColor(color.id)} className="h-5 w-5 rounded flex items-center justify-center hover:bg-destructive/10">
                    <Trash2 className="h-2.5 w-2.5 text-destructive" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <BulkImportDialog
        open={bulkImportOpen}
        onClose={() => setBulkImportOpen(false)}
        serviceType={serviceType}
        importing={bulkImportMutation.isPending}
        onImport={(catalogData) => bulkImportMutation.mutate(catalogData)}
      />
      <BrandDialog
        open={brandDialog.open} onClose={() => setBrandDialog({ open: false })} initial={brandDialog.brand}
        saving={createBrand.isPending || updateBrand.isPending}
        onSave={(data) => brandDialog.brand?.id ? updateBrand.mutate({ id: brandDialog.brand.id, data }) : createBrand.mutate(data)}
      />
      <ColorDialog
        open={colorDialog.open} onClose={() => setColorDialog({ open: false })} initial={colorDialog.color}
        saving={createColor.isPending || updateColor.isPending}
        onSave={(data) => colorDialog.color?.id ? updateColor.mutate({ id: colorDialog.color.id, data }) : createColor.mutate(data)}
      />
      <AlertDialog open={deleteBrand !== null} onOpenChange={(v) => !v && setDeleteBrand(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("vehicleCatalog.deleteBrandTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("vehicleCatalog.deleteBrandDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("vehicleCatalog.cancel")}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteBrand !== null && deleteBrandMutation.mutate(deleteBrand)}>
              {deleteBrandMutation.isPending ? t("vehicleCatalog.deleting") : t("vehicleCatalog.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={deleteColor !== null} onOpenChange={(v) => !v && setDeleteColor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("vehicleCatalog.deleteColorTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("vehicleCatalog.deleteColorDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("vehicleCatalog.cancel")}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteColor !== null && deleteColorMutation.mutate(deleteColor)}>
              {deleteColorMutation.isPending ? t("vehicleCatalog.deleting") : t("vehicleCatalog.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Level 2: Models View ─────────────────────────────────────────────────────

function ModelsView({
  brand,
  onSelectModel,
  isShuttle,
}: {
  brand: VehicleBrand;
  onSelectModel: (model: VehicleModel) => void;
  isShuttle: boolean;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [modelDialog, setModelDialog] = useState<{ open: boolean; model?: VehicleModel }>({ open: false });
  const [deleteModel, setDeleteModel] = useState<number | null>(null);

  const modelsQuery = useQuery({
    queryKey: ["vehicle-catalog-models", brand.id],
    queryFn: () => adminFetch<{ data: VehicleModel[] }>(`/admin/vehicle-catalog/models?brandId=${brand.id}`),
  });
  const models = modelsQuery.data?.data ?? [];

  const createModel = useMutation({
    mutationFn: (data: object) => adminFetch("/admin/vehicle-catalog/models", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["vehicle-catalog-models", brand.id] }); setModelDialog({ open: false }); toast({ title: t("vehicleCatalog.modelAdded") }); },
    onError: (e: any) => toast({ title: t("vehicleCatalog.errorTitle"), description: e?.message, variant: "destructive" }),
  });
  const updateModel = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) => adminFetch(`/admin/vehicle-catalog/models/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["vehicle-catalog-models", brand.id] }); setModelDialog({ open: false }); toast({ title: t("vehicleCatalog.modelUpdated") }); },
    onError: (e: any) => toast({ title: t("vehicleCatalog.errorTitle"), description: e?.message, variant: "destructive" }),
  });
  const deleteModelMutation = useMutation({
    mutationFn: (id: number) => adminFetch(`/admin/vehicle-catalog/models/${id}`, { method: "DELETE" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["vehicle-catalog-models", brand.id] }); setDeleteModel(null); toast({ title: t("vehicleCatalog.modelDeleted") }); },
    onError: (e: any) => toast({ title: t("vehicleCatalog.errorTitle"), description: e?.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      {/* Brand header card */}
      <Card className="border-primary/20 bg-primary/[0.02]">
        <CardContent className="py-3 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Car className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-semibold">{brand.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {brand.isChinese && <Badge variant="outline" className="text-[10px] border-red-200 text-red-600 bg-red-50 dark:bg-red-950 px-1.5">{t("vehicleCatalog.chineseBrandBadge")}</Badge>}
              <span className="text-xs text-muted-foreground">{t("vehicleCatalog.modelsRegistered", { count: models.length })}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Models table */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-sm">{brand.name} {t("vehicleCatalog.approvedModels")}</h3>
          {!modelsQuery.isLoading && <Badge variant="secondary" className="text-xs">{models.length}</Badge>}
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setModelDialog({ open: true })}>
          <Plus className="h-3.5 w-3.5" /> {t("vehicleCatalog.addNewModel")}
        </Button>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>{t("vehicleCatalog.modelName")}</TableHead>
              <TableHead className="text-center">{t("vehicleCatalog.yearRange")}</TableHead>
              {isShuttle && <TableHead className="text-center">{t("vehicleCatalog.seats")}</TableHead>}
              <TableHead className="text-center">{t("vehicleCatalog.status")}</TableHead>
              <TableHead className="text-end">{t("vehicleCatalog.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {modelsQuery.isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: isShuttle ? 6 : 5 }).map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : models.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isShuttle ? 6 : 5} className="text-center py-12 text-muted-foreground text-sm">
                  <Layers className="h-7 w-7 mx-auto mb-2 opacity-30" />
                  {t("vehicleCatalog.noModels", { brand: brand.name })}
                </TableCell>
              </TableRow>
            ) : (
              models.map((model, idx) => (
                <TableRow
                  key={model.id}
                  className="cursor-pointer hover:bg-primary/[0.02] group"
                  onClick={() => onSelectModel(model)}
                >
                  <TableCell className="text-muted-foreground text-sm">{idx + 1}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{model.name}</span>
                      <ChevronRight className="h-3.5 w-3.5 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    {model.minYear}
                    {model.maxYear ? ` – ${model.maxYear}` : ` – ${t("vehicleCatalog.present")}`}
                  </TableCell>
                  {isShuttle && (
                    <TableCell className="text-center text-sm">{model.seatCapacity ?? "—"}</TableCell>
                  )}
                  <TableCell className="text-center">
                    <Badge variant="outline" className={`text-xs ${model.isActive ? "text-green-700 border-green-200 bg-green-50 dark:bg-green-950" : "text-slate-500 border-slate-200 bg-slate-50 dark:bg-slate-900"}`}>
                      {model.isActive ? t("vehicleCatalog.active") : t("common.inactive")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-end" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setModelDialog({ open: true, model })}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteModel(model.id)}>
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

      <ModelDialog
        open={modelDialog.open} onClose={() => setModelDialog({ open: false })} initial={modelDialog.model}
        brandId={brand.id} isShuttle={isShuttle}
        saving={createModel.isPending || updateModel.isPending}
        onSave={(data) => modelDialog.model?.id ? updateModel.mutate({ id: modelDialog.model.id, data }) : createModel.mutate(data)}
      />
      <AlertDialog open={deleteModel !== null} onOpenChange={(v) => !v && setDeleteModel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("vehicleCatalog.deleteModelTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("vehicleCatalog.deleteModelDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("vehicleCatalog.cancel")}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteModel !== null && deleteModelMutation.mutate(deleteModel)}>
              {deleteModelMutation.isPending ? t("vehicleCatalog.deleting") : t("vehicleCatalog.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Level 3: Years View ──────────────────────────────────────────────────────

function YearsView({
  brand,
  model,
}: {
  brand: VehicleBrand;
  model: VehicleModel;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [yearDialog, setYearDialog] = useState(false);
  const [deleteYear, setDeleteYear] = useState<number | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const yearsQuery = useQuery({
    queryKey: ["vehicle-catalog-years", model.id],
    queryFn: () => adminFetch<{ data: VehicleYear[] }>(`/admin/vehicle-catalog/models/${model.id}/years`),
  });
  const years = (yearsQuery.data?.data ?? []).sort((a, b) => b.year - a.year);

  const createYear = useMutation({
    mutationFn: async (data: { year: number; pricingCategories: string[]; isActive: boolean }) => {
      for (const pricingCategory of data.pricingCategories) {
        await adminFetch(`/admin/vehicle-catalog/models/${model.id}/years`, {
          method: "POST",
          body: JSON.stringify({ year: data.year, pricingCategory, isActive: data.isActive }),
        });
      }
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["vehicle-catalog-years", model.id] });
      setYearDialog(false);
      toast({
        title: t("vehicleCatalog.yearRegistered"),
        description: vars.pricingCategories.length > 1
          ? `${vars.year} added for ${vars.pricingCategories.length} pricing tiers`
          : undefined,
      });
    },
    onError: (e: any) => toast({ title: t("vehicleCatalog.errorTitle"), description: e?.message, variant: "destructive" }),
  });

  const updateYearCategory = useMutation({
    mutationFn: ({ yearId, pricingCategory }: { yearId: number; pricingCategory: string }) =>
      adminFetch(`/admin/vehicle-catalog/models/${model.id}/years/${yearId}`, { method: "PATCH", body: JSON.stringify({ pricingCategory }) }),
    onMutate: ({ yearId }) => setUpdatingId(yearId),
    onSuccess: (_data, { yearId, pricingCategory }) => {
      setUpdatingId(null);
      queryClient.invalidateQueries({ queryKey: ["vehicle-catalog-years", model.id] });
      const cat = pricingMeta(pricingCategory);
      toast({ title: t("vehicleCatalog.pricingCategoryUpdated"), description: cat ? `Set to ${cat.label} (${cat.labelAr})` : undefined });
    },
    onError: (e: any) => { setUpdatingId(null); toast({ title: t("vehicleCatalog.errorTitle"), description: e?.message, variant: "destructive" }); },
  });

  const deleteYearMutation = useMutation({
    mutationFn: (yearId: number) => adminFetch(`/admin/vehicle-catalog/models/${model.id}/years/${yearId}`, { method: "DELETE" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["vehicle-catalog-years", model.id] }); setDeleteYear(null); toast({ title: t("vehicleCatalog.yearRemoved") }); },
    onError: (e: any) => toast({ title: t("vehicleCatalog.errorTitle"), description: e?.message, variant: "destructive" }),
  });

  const updateYearStatus = useMutation({
    mutationFn: ({ yearId, isActive }: { yearId: number; isActive: boolean }) =>
      adminFetch(`/admin/vehicle-catalog/models/${model.id}/years/${yearId}`, { method: "PATCH", body: JSON.stringify({ isActive }) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["vehicle-catalog-years", model.id] }); },
    onError: (e: any) => toast({ title: t("vehicleCatalog.errorTitle"), description: e?.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      {/* Model header card */}
      <Card className="border-primary/20 bg-primary/[0.02]">
        <CardContent className="py-3 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Layers className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold">{brand.name} {model.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("vehicleCatalog.modelYearRange", {
                min: model.minYear,
                max: model.maxYear ?? t("vehicleCatalog.present"),
                count: years.length,
              })}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Pricing category legend */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">{t("vehicleCatalog.pricingTiersLabel")}</span>
        </div>
        {PRICING_CATEGORIES.map((c) => (
          <Badge key={c.value} variant="outline" className={`text-xs gap-1 ${c.color}`}>
            {c.label} <span className="opacity-70">({c.labelAr})</span>
          </Badge>
        ))}
      </div>

      {/* Years & pricing category table */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-sm">{model.name} — {t("vehicleCatalog.manufacturingYears")}</h3>
          {!yearsQuery.isLoading && <Badge variant="secondary" className="text-xs">{years.length}</Badge>}
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setYearDialog(true)}>
          <Plus className="h-3.5 w-3.5" /> {t("vehicleCatalog.addYear")}
        </Button>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">{t("vehicleCatalog.yearCol")}</TableHead>
              <TableHead>{t("vehicleCatalog.pricingCategory")}</TableHead>
              <TableHead className="text-center w-28">{t("vehicleCatalog.status")}</TableHead>
              <TableHead className="text-end w-20">{t("vehicleCatalog.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {yearsQuery.isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 4 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}
                </TableRow>
              ))
            ) : years.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-12 text-muted-foreground text-sm">
                  <Calendar className="h-7 w-7 mx-auto mb-2 opacity-30" />
                  {t("vehicleCatalog.noYears")}
                </TableCell>
              </TableRow>
            ) : (
              years.map((yr) => {
                const cat = pricingMeta(yr.pricingCategory);
                const isUpdating = updatingId === yr.id;
                return (
                  <TableRow key={yr.id} className={isUpdating ? "opacity-60" : ""}>
                    <TableCell>
                      <span className="font-bold text-base tabular-nums">{yr.year}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Select
                          value={yr.pricingCategory ?? ""}
                          disabled={isUpdating}
                          onValueChange={(value) => updateYearCategory.mutate({ yearId: yr.id, pricingCategory: value })}
                        >
                          <SelectTrigger className="w-52 h-8 text-sm">
                            <SelectValue placeholder={t("vehicleCatalog.noCategoryAssigned")} />
                          </SelectTrigger>
                          <SelectContent>
                            {PRICING_CATEGORIES.map((c) => (
                              <SelectItem key={c.value} value={c.value}>
                                <div className="flex items-center gap-2">
                                  <span>{c.label}</span>
                                  <span className="text-muted-foreground text-xs">({c.labelAr})</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {cat && (
                          <Badge variant="outline" className={`text-xs shrink-0 ${cat.color}`}>
                            {cat.label}
                          </Badge>
                        )}
                        {isUpdating && (
                          <span className="text-xs text-muted-foreground animate-pulse">{t("vehicleCatalog.saving")}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={yr.isActive}
                        onCheckedChange={(checked) => updateYearStatus.mutate({ yearId: yr.id, isActive: checked })}
                      />
                    </TableCell>
                    <TableCell className="text-end">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setDeleteYear(yr.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <YearDialog
        open={yearDialog} onClose={() => setYearDialog(false)} modelId={model.id}
        saving={createYear.isPending}
        onSave={(data) => createYear.mutate(data)}
      />
      <AlertDialog open={deleteYear !== null} onOpenChange={(v) => !v && setDeleteYear(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("vehicleCatalog.deleteYearTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("vehicleCatalog.deleteYearDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("vehicleCatalog.cancel")}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteYear !== null && deleteYearMutation.mutate(deleteYear)}>
              {deleteYearMutation.isPending ? t("vehicleCatalog.removing") : t("vehicleCatalog.remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function VehicleCatalogTab({
  isShuttle = false,
  serviceType = "car",
}: {
  isShuttle?: boolean;
  serviceType?: string;
}) {
  const { t } = useTranslation();
  const [viewState, setViewState] = useState<ViewState>({ level: "brands" });

  return (
    <div className="space-y-5">
      {/* Breadcrumb nav — always visible when not at root */}
      <div className="flex items-center justify-between gap-4">
        <Breadcrumb viewState={viewState} onNavigate={setViewState} />
        {viewState.level !== "brands" && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-foreground shrink-0"
            onClick={() => {
              if (viewState.level === "years") setViewState({ level: "models", brand: viewState.brand });
              else setViewState({ level: "brands" });
            }}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("vehicleCatalog.back")}
          </Button>
        )}
      </div>

      {/* Level separator */}
      {viewState.level !== "brands" && (
        <div className="h-px bg-border" />
      )}

      {/* Level renders */}
      {viewState.level === "brands" && (
        <BrandsView
          isShuttle={isShuttle}
          serviceType={serviceType}
          onSelectBrand={(brand) => setViewState({ level: "models", brand })}
        />
      )}

      {viewState.level === "models" && (
        <ModelsView
          brand={viewState.brand}
          isShuttle={isShuttle}
          onSelectModel={(model) =>
            setViewState({ level: "years", brand: viewState.brand, model })
          }
        />
      )}

      {viewState.level === "years" && (
        <YearsView brand={viewState.brand} model={viewState.model} />
      )}
    </div>
  );
}
