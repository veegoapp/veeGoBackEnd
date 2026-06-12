import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format, parseISO, isAfter, isBefore } from "date-fns";
import {
  Trophy, Plus, Edit, Trash2, ChevronRight, Users, CheckCircle2,
  Clock, TrendingUp, Zap, Star,
} from "lucide-react";
import { formatEGP } from "@/lib/currency";
import { Link } from "wouter";

type BonusTarget = {
  id: number;
  name: string;
  description: string | null;
  serviceType: string;
  targetType: "ride_count" | "earnings_amount";
  targetValue: number;
  bonusAmount: number;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  isDeleted: boolean;
  enrolledCount?: number;
  completedCount?: number;
};

type DriverProgress = {
  driverId: number;
  driverName: string | null;
  driverPhone: string | null;
  currentValue: number;
  isCompleted: boolean;
  completedAt: string | null;
};

const SERVICE_TYPE_OPTIONS = [
  { value: "all",      label: "All Services" },
  { value: "ride",     label: "Rides (Car/Bike/Delivery/Scooter)" },
  { value: "shuttle",  label: "Shuttle" },
  { value: "car",      label: "Car" },
  { value: "bike",     label: "Bike" },
  { value: "delivery", label: "Delivery" },
  { value: "scooter",  label: "Scooter" },
];

function targetStatus(t: BonusTarget): "active" | "upcoming" | "expired" | "disabled" {
  if (!t.isActive) return "disabled";
  const now = new Date();
  const start = parseISO(t.startsAt);
  const end = parseISO(t.endsAt);
  if (isAfter(now, start) && isBefore(now, end)) return "active";
  if (isBefore(now, start)) return "upcoming";
  return "expired";
}

const STATUS_META = {
  active:   { label: "Active",    cls: "text-green-600 border-green-200 bg-green-50 dark:bg-green-950" },
  upcoming: { label: "Upcoming",  cls: "text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-950" },
  expired:  { label: "Expired",   cls: "text-muted-foreground border-border bg-muted/30" },
  disabled: { label: "Disabled",  cls: "text-orange-600 border-orange-200 bg-orange-50 dark:bg-orange-950" },
};

function TargetDialog({
  open, onClose, initial, onSave, saving,
}: {
  open: boolean; onClose: () => void; initial?: BonusTarget;
  onSave: (data: object) => void; saving: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [serviceType, setServiceType] = useState(initial?.serviceType ?? "all");
  const [targetType, setTargetType] = useState<"ride_count" | "earnings_amount">(initial?.targetType ?? "ride_count");
  const [targetValue, setTargetValue] = useState<number | "">(initial?.targetValue ?? "");
  const [bonusAmount, setBonusAmount] = useState<number | "">(initial?.bonusAmount ?? "");
  const [startsAt, setStartsAt] = useState(initial?.startsAt?.slice(0, 16) ?? "");
  const [endsAt, setEndsAt] = useState(initial?.endsAt?.slice(0, 16) ?? "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);

  React.useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setDescription(initial?.description ?? "");
      setServiceType(initial?.serviceType ?? "all");
      setTargetType(initial?.targetType ?? "ride_count");
      setTargetValue(initial?.targetValue ?? "");
      setBonusAmount(initial?.bonusAmount ?? "");
      setStartsAt(initial?.startsAt?.slice(0, 16) ?? "");
      setEndsAt(initial?.endsAt?.slice(0, 16) ?? "");
      setIsActive(initial?.isActive ?? true);
    }
  }, [open]);

  const canSave = name.trim() && targetValue !== "" && bonusAmount !== "" && startsAt && endsAt;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            {initial ? "Edit Bonus Target" : "Create Bonus Target"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input placeholder="e.g. Complete 50 Car Rides" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Description <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Textarea placeholder="Short description shown to drivers" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Service Type</Label>
              <Select value={serviceType} onValueChange={setServiceType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SERVICE_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Target Type</Label>
              <Select value={targetType} onValueChange={(v: any) => setTargetType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ride_count">Ride Count</SelectItem>
                  <SelectItem value="earnings_amount">Earnings Amount (EGP)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{targetType === "ride_count" ? "Target Rides" : "Target Earnings (EGP)"}</Label>
              <Input
                type="number" min={1} step={targetType === "ride_count" ? 1 : 0.01}
                placeholder={targetType === "ride_count" ? "e.g. 50" : "e.g. 1000.00"}
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value === "" ? "" : Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Bonus Payout (EGP)</Label>
              <Input
                type="number" min={0} step={0.01} placeholder="e.g. 200.00"
                value={bonusAmount}
                onChange={(e) => setBonusAmount(e.target.value === "" ? "" : Number(e.target.value))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Starts At</Label>
              <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Ends At</Label>
              <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Label>Active</Label>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!canSave || saving}
            onClick={() => onSave({
              name: name.trim(), description: description.trim() || null,
              serviceType, targetType,
              targetValue: Number(targetValue), bonusAmount: Number(bonusAmount),
              startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(),
              isActive,
            })}
          >
            {saving ? "Saving…" : "Save Target"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProgressDrilldown({ target, onClose }: { target: BonusTarget; onClose: () => void }) {
  const { data, isLoading } = useQuery<{ data: DriverProgress[] }>({
    queryKey: ["bonus-target-progress", target.id],
    queryFn: () => adminFetch<{ data: DriverProgress[] }>(`/admin/bonus-targets/${target.id}/progress`),
  });

  const drivers = data?.data ?? [];
  const pct = (v: number) => Math.min(100, Math.round((v / target.targetValue) * 100));

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            {target.name} — Driver Progress
          </DialogTitle>
          <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
            <span>Target: {target.targetType === "ride_count" ? `${target.targetValue} rides` : formatEGP(target.targetValue)}</span>
            <span>·</span>
            <span>Bonus: {formatEGP(target.bonusAmount)}</span>
            <span>·</span>
            <span>{format(parseISO(target.startsAt), "MMM d")} → {format(parseISO(target.endsAt), "MMM d, yyyy")}</span>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-3 p-2">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : drivers.length === 0 ? (
            <div className="py-14 text-center text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-3 opacity-30" />
              <p>No drivers enrolled yet</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {drivers.sort((a, b) => b.currentValue - a.currentValue).map((d) => {
                const p = pct(d.currentValue);
                return (
                  <div key={d.driverId} className="flex items-center gap-4 px-2 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Link href={`/drivers/${d.driverId}`}>
                          <span className="text-sm font-medium text-primary hover:underline cursor-pointer">
                            {d.driverName ?? `Driver #${d.driverId}`}
                          </span>
                        </Link>
                        {d.isCompleted && (
                          <Badge variant="outline" className="text-[10px] text-green-600 border-green-200 bg-green-50 dark:bg-green-950 gap-1">
                            <CheckCircle2 className="h-2.5 w-2.5" /> Completed
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1.5">
                        <Progress value={p} className="flex-1 h-2" />
                        <span className="text-xs font-bold shrink-0 w-10 text-end">{p}%</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {target.targetType === "ride_count"
                          ? `${Math.round(d.currentValue)} / ${target.targetValue} rides`
                          : `${formatEGP(d.currentValue)} / ${formatEGP(target.targetValue)}`}
                        {d.completedAt && ` · Completed ${format(parseISO(d.completedAt), "MMM d, yyyy")}`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function BonusTargets() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [dialog, setDialog] = useState<{ open: boolean; target?: BonusTarget }>({ open: false });
  const [drilldown, setDrilldown] = useState<BonusTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const { data, isLoading } = useQuery<{ data: BonusTarget[] }>({
    queryKey: ["bonus-targets"],
    queryFn: () => adminFetch<{ data: BonusTarget[] }>("/admin/bonus-targets"),
  });

  const createMutation = useMutation({
    mutationFn: (body: object) =>
      adminFetch("/admin/bonus-targets", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: "Bonus target created" });
      setDialog({ open: false });
      queryClient.invalidateQueries({ queryKey: ["bonus-targets"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) =>
      adminFetch(`/admin/bonus-targets/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      toast({ title: "Target updated" });
      setDialog({ open: false });
      queryClient.invalidateQueries({ queryKey: ["bonus-targets"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      adminFetch(`/admin/bonus-targets/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Target removed" });
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["bonus-targets"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const targets = (data?.data ?? []).filter((t) => !t.isDeleted);
  const activeCount = targets.filter((t) => targetStatus(t) === "active").length;

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-amber-500/10">
            <Trophy className="h-6 w-6 text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              Milestone Bonus Targets
              {activeCount > 0 && (
                <Badge variant="outline" className="text-xs text-green-600 border-green-200 bg-green-50">
                  {activeCount} active
                </Badge>
              )}
            </h1>
            <p className="text-sm text-muted-foreground">
              Create and manage driver incentive milestones — ride counts or earnings thresholds that pay bonuses automatically
            </p>
          </div>
        </div>
        <Button onClick={() => setDialog({ open: true })} className="gap-1.5">
          <Plus className="h-4 w-4" /> Create Target
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
      ) : targets.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-16 text-center text-muted-foreground">
          <Trophy className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No bonus targets defined</p>
          <p className="text-sm mt-1">Create your first milestone incentive to get started</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Target</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Goal</TableHead>
                <TableHead>Bonus</TableHead>
                <TableHead>Window</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Enrolled</TableHead>
                <TableHead className="text-end">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {targets.map((target) => {
                const st = targetStatus(target);
                const meta = STATUS_META[st];
                return (
                  <TableRow key={target.id}>
                    <TableCell>
                      <div className="font-medium text-sm">{target.name}</div>
                      {target.description && (
                        <div className="text-xs text-muted-foreground truncate max-w-[180px]">{target.description}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs capitalize">{target.serviceType}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {target.targetType === "ride_count"
                        ? <span className="flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />{target.targetValue} rides</span>
                        : <span className="flex items-center gap-1"><Zap className="h-3.5 w-3.5 text-muted-foreground" />{formatEGP(target.targetValue)}</span>
                      }
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold text-green-600">{formatEGP(target.bonusAmount)}</span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <div>{format(parseISO(target.startsAt), "MMM d")}</div>
                      <div>→ {format(parseISO(target.endsAt), "MMM d, yyyy")}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${meta.cls}`}>{meta.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <button
                        className="flex items-center gap-1 text-sm text-primary hover:underline"
                        onClick={() => setDrilldown(target)}
                      >
                        <Users className="h-3.5 w-3.5" />
                        {target.enrolledCount ?? "—"}
                        <ChevronRight className="h-3 w-3" />
                      </button>
                      {target.completedCount !== undefined && target.completedCount > 0 && (
                        <span className="text-xs text-green-600 flex items-center gap-0.5">
                          <Star className="h-2.5 w-2.5" /> {target.completedCount} completed
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => setDrilldown(target)}
                          title="View progress"
                        >
                          <TrendingUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => setDialog({ open: true, target })}
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(target.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <TargetDialog
        open={dialog.open}
        onClose={() => setDialog({ open: false })}
        initial={dialog.target}
        saving={createMutation.isPending || updateMutation.isPending}
        onSave={(formData) => {
          if (dialog.target) {
            updateMutation.mutate({ id: dialog.target.id, data: formData });
          } else {
            createMutation.mutate(formData);
          }
        }}
      />

      {drilldown && (
        <ProgressDrilldown target={drilldown} onClose={() => setDrilldown(null)} />
      )}

      <AlertDialog open={deleteTarget !== null} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Bonus Target?</AlertDialogTitle>
            <AlertDialogDescription>
              This will soft-delete the target. Drivers who have already earned the bonus will not be affected, but progress tracking will stop.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget !== null && deleteMutation.mutate(deleteTarget)}
            >
              {deleteMutation.isPending ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
