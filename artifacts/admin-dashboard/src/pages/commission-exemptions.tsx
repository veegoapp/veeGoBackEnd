import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { adminFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format, isAfter, isBefore, parseISO } from "date-fns";
import { Percent, Plus, Edit, Trash2, Clock, CheckCircle2, CalendarRange } from "lucide-react";
import { Link } from "wouter";

type Exemption = {
  id: number;
  driverId: number;
  startsAt: string;
  endsAt: string;
  reason: string | null;
  isActive: boolean;
  createdAt: string;
  driver?: { name: string | null; phone: string | null };
};

type ExemptionsResponse = {
  data: Exemption[];
  total: number;
  limit: number;
};

type Driver = { id: number; name: string; phone: string };

function exemptionStatus(ex: Exemption): "active" | "future" | "expired" | "disabled" {
  if (!ex.isActive) return "disabled";
  const now = new Date();
  const start = parseISO(ex.startsAt);
  const end = parseISO(ex.endsAt);
  if (isAfter(now, start) && isBefore(now, end)) return "active";
  if (isBefore(now, start)) return "future";
  return "expired";
}

const STATUS_META = {
  active:   { label: "Active Now",  cls: "text-green-600 border-green-200 bg-green-50 dark:bg-green-950",   icon: CheckCircle2 },
  future:   { label: "Upcoming",    cls: "text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-950",       icon: CalendarRange },
  expired:  { label: "Expired",     cls: "text-muted-foreground border-border bg-muted/30",                  icon: Clock },
  disabled: { label: "Disabled",    cls: "text-orange-600 border-orange-200 bg-orange-50 dark:bg-orange-950", icon: Clock },
};

function ExemptionDialog({
  open,
  onClose,
  initial,
  onSave,
  saving,
}: {
  open: boolean;
  onClose: () => void;
  initial?: Exemption;
  onSave: (data: {
    driverId?: number;
    startsAt: string;
    endsAt: string;
    reason: string;
    isActive: boolean;
  }) => void;
  saving: boolean;
}) {
  const { t } = useTranslation();
  const [driverSearch, setDriverSearch] = useState("");
  const [selectedDriverId, setSelectedDriverId] = useState<number | "">(initial?.driverId ?? "");
  const [startsAt, setStartsAt] = useState(initial?.startsAt?.slice(0, 16) ?? "");
  const [endsAt, setEndsAt] = useState(initial?.endsAt?.slice(0, 16) ?? "");
  const [reason, setReason] = useState(initial?.reason ?? "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);

  const { data: driversData } = useQuery<{ data: Driver[] }>({
    queryKey: ["drivers-search", driverSearch],
    queryFn: () => adminFetch<{ data: Driver[] }>(`/drivers?limit=20${driverSearch ? `&search=${driverSearch}` : ""}`),
    enabled: open && !initial,
  });

  React.useEffect(() => {
    if (open) {
      setSelectedDriverId(initial?.driverId ?? "");
      setStartsAt(initial?.startsAt?.slice(0, 16) ?? "");
      setEndsAt(initial?.endsAt?.slice(0, 16) ?? "");
      setReason(initial?.reason ?? "");
      setIsActive(initial?.isActive ?? true);
      setDriverSearch("");
    }
  }, [open]);

  const canSave = (initial || selectedDriverId !== "") && startsAt && endsAt;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? t("commissionExemptions.editPeriodTitle") : t("commissionExemptions.createPeriodTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          {!initial && (
            <div className="space-y-1.5">
              <Label>{t("common.driver")}</Label>
              <Input
                placeholder={t("commissionExemptions.searchDriverPlaceholder")}
                value={driverSearch}
                onChange={(e) => setDriverSearch(e.target.value)}
              />
              {driversData?.data && driversData.data.length > 0 && (
                <div className="border border-border rounded-md max-h-36 overflow-y-auto divide-y divide-border">
                  {driversData.data.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => { setSelectedDriverId(d.id); setDriverSearch(d.name); }}
                      className={`w-full text-start px-3 py-2 text-sm hover:bg-muted transition-colors ${selectedDriverId === d.id ? "bg-primary/10 text-primary font-medium" : ""}`}
                    >
                      {d.name} <span className="text-muted-foreground text-xs">· {d.phone}</span>
                    </button>
                  ))}
                </div>
              )}
              {selectedDriverId !== "" && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> {t("commissionExemptions.driverSelected", { id: selectedDriverId })}
                </p>
              )}
            </div>
          )}
          {initial && (
            <div className="rounded-lg bg-muted/40 border border-border px-3 py-2 text-sm">
              <span className="text-muted-foreground">{t("common.driver")}: </span>
              <span className="font-medium">{initial.driver?.name ?? `#${initial.driverId}`}</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("commissionExemptions.startsAt")}</Label>
              <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("commissionExemptions.endsAt")}</Label>
              <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("commissionExemptions.reason")} <span className="text-muted-foreground text-xs">{t("bonusTargets.optional")}</span></Label>
            <Textarea
              placeholder={t("commissionExemptions.reasonPlaceholder")}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>{t("commissionExemptions.activeToggle")}</Label>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button
            disabled={!canSave || saving}
            onClick={() => onSave({
              ...(initial ? {} : { driverId: selectedDriverId as number }),
              startsAt: new Date(startsAt).toISOString(),
              endsAt: new Date(endsAt).toISOString(),
              reason,
              isActive,
            })}
          >
            {saving ? t("commissionExemptions.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function CommissionExemptions() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<{ open: boolean; exemption?: Exemption }>({ open: false });
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const { data, isLoading } = useQuery<ExemptionsResponse>({
    queryKey: ["commission-exemptions", page],
    queryFn: () => adminFetch<ExemptionsResponse>(`/admin/commission-exemptions?page=${page}&limit=15`),
  });

  const createMutation = useMutation({
    mutationFn: (body: object) =>
      adminFetch("/admin/commission-exemptions", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: t("commissionExemptions.exemptionCreated") });
      setDialog({ open: false });
      queryClient.invalidateQueries({ queryKey: ["commission-exemptions"] });
    },
    onError: (e: Error) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) =>
      adminFetch(`/admin/commission-exemptions/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      toast({ title: t("commissionExemptions.exemptionUpdated") });
      setDialog({ open: false });
      queryClient.invalidateQueries({ queryKey: ["commission-exemptions"] });
    },
    onError: (e: Error) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      adminFetch(`/admin/commission-exemptions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: t("commissionExemptions.exemptionDeleted") });
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["commission-exemptions"] });
    },
    onError: (e: Error) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const exemptions = data?.data ?? [];
  const total = data?.total ?? 0;
  const limit = data?.limit ?? 15;
  const totalPages = Math.ceil(total / limit);

  const STATUS_META_DYNAMIC = {
    active:   { label: t("commissionExemptions.activeNow"),  cls: "text-green-600 border-green-200 bg-green-50 dark:bg-green-950",   icon: CheckCircle2 },
    future:   { label: t("commissionExemptions.upcoming"),    cls: "text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-950",       icon: CalendarRange },
    expired:  { label: t("commissionExemptions.expired"),     cls: "text-muted-foreground border-border bg-muted/30",                  icon: Clock },
    disabled: { label: t("commissionExemptions.disabled"),    cls: "text-orange-600 border-orange-200 bg-orange-50 dark:bg-orange-950", icon: Clock },
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-purple-500/10">
            <Percent className="h-6 w-6 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("commissionExemptions.periodTitle")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("commissionExemptions.periodSubtitle")}
            </p>
          </div>
        </div>
        <Button onClick={() => setDialog({ open: true })} className="gap-1.5">
          <Plus className="h-4 w-4" /> {t("commissionExemptions.createBtn")}
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">{t("commissionExemptions.colId")}</TableHead>
              <TableHead>{t("common.driver")}</TableHead>
              <TableHead>{t("commissionExemptions.colWindow")}</TableHead>
              <TableHead>{t("commissionExemptions.reason")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead className="text-end">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(6)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(6)].map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : exemptions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-14 text-muted-foreground">
                  <Percent className="h-8 w-8 mx-auto mb-3 opacity-30" />
                  <p>{t("commissionExemptions.noExemptions")}</p>
                </TableCell>
              </TableRow>
            ) : (
              exemptions.map((ex) => {
                const st = exemptionStatus(ex);
                const meta = STATUS_META_DYNAMIC[st];
                const Icon = meta.icon;
                return (
                  <TableRow key={ex.id}>
                    <TableCell className="font-mono text-sm text-muted-foreground">#{ex.id}</TableCell>
                    <TableCell>
                      <Link href={`/drivers/${ex.driverId}`}>
                        <span className="text-sm font-medium text-primary hover:underline cursor-pointer">
                          {ex.driver?.name ?? `${t("common.driver")} #${ex.driverId}`}
                        </span>
                      </Link>
                      {ex.driver?.phone && (
                        <div className="text-xs text-muted-foreground">{ex.driver.phone}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">
                        {format(parseISO(ex.startsAt), "MMM d, yyyy")}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        → {format(parseISO(ex.endsAt), "MMM d, yyyy")}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <p className="text-sm text-muted-foreground truncate">
                        {ex.reason || <span className="italic">{t("commissionExemptions.noReason")}</span>}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs gap-1 ${meta.cls}`}>
                        <Icon className="h-2.5 w-2.5" /> {meta.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => setDialog({ open: true, exemption: ex })}
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(ex.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
            <PaginationItem className="text-sm text-muted-foreground px-4">
              {t("common.page")} {page} {t("common.of")} {totalPages}
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className={page >= totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      <ExemptionDialog
        open={dialog.open}
        onClose={() => setDialog({ open: false })}
        initial={dialog.exemption}
        saving={createMutation.isPending || updateMutation.isPending}
        onSave={(formData) => {
          if (dialog.exemption) {
            updateMutation.mutate({ id: dialog.exemption.id, data: formData });
          } else {
            createMutation.mutate(formData);
          }
        }}
      />

      <AlertDialog open={deleteTarget !== null} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("commissionExemptions.deleteConfirmTitle", { id: deleteTarget })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("commissionExemptions.deleteConfirmDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget !== null && deleteMutation.mutate(deleteTarget)}
            >
              {deleteMutation.isPending ? t("commissionExemptions.deleting") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
