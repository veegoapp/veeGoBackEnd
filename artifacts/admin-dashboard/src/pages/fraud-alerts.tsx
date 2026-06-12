import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Link } from "wouter";
import { format } from "date-fns";
import {
  ShieldAlert, CheckCircle2, Clock, ExternalLink, AlertTriangle, RefreshCw,
} from "lucide-react";
import { io } from "socket.io-client";

type DuplicateAlert = {
  id: number;
  newDriverId: number;
  existingDriverId: number;
  matchType: string;
  resolvedAt: string | null;
  resolvedBy: number | null;
  notes: string | null;
  createdAt: string;
  newDriver?: { name: string | null };
  existingDriver?: { name: string | null };
};

type AlertsResponse = {
  data: DuplicateAlert[];
  total: number;
  limit: number;
};

export default function FraudAlerts() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [resolvedFilter, setResolvedFilter] = useState<"false" | "true" | "all">("false");
  const [resolveTarget, setResolveTarget] = useState<DuplicateAlert | null>(null);
  const [notes, setNotes] = useState("");
  const [liveCount, setLiveCount] = useState(0);

  const params = new URLSearchParams({ page: String(page), limit: "20" });
  if (resolvedFilter !== "all") params.set("resolved", resolvedFilter);

  const { data, isLoading, refetch } = useQuery<AlertsResponse>({
    queryKey: ["duplicate-alerts", page, resolvedFilter],
    queryFn: () => adminFetch<AlertsResponse>(`/admin/duplicate-alerts?${params}`),
  });

  const { data: unresolvedData } = useQuery<AlertsResponse>({
    queryKey: ["duplicate-alerts-unresolved-count"],
    queryFn: () => adminFetch<AlertsResponse>("/admin/duplicate-alerts?resolved=false&limit=1"),
    refetchInterval: 30000,
  });

  const unresolvedCount = unresolvedData?.total ?? 0;

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) return;
    const socket = io(window.location.origin, {
      path: "/api/socket.io",
      auth: { token },
      transports: ["websocket", "polling"],
    });
    socket.on("admin:duplicate_driver_alert", () => {
      setLiveCount((c) => c + 1);
      toast({
        title: "New Duplicate Driver Alert",
        description: "A new fraud flag has been raised. Review the Fraud Alerts page.",
        variant: "destructive",
      });
      queryClient.invalidateQueries({ queryKey: ["duplicate-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["duplicate-alerts-unresolved-count"] });
    });
    return () => { socket.disconnect(); };
  }, []);

  const resolveMutation = useMutation({
    mutationFn: ({ id, notes }: { id: number; notes: string }) =>
      adminFetch(`/admin/duplicate-alerts/${id}/resolve`, {
        method: "PATCH",
        body: JSON.stringify({ notes }),
      }),
    onSuccess: () => {
      toast({ title: "Alert resolved" });
      setResolveTarget(null);
      setNotes("");
      queryClient.invalidateQueries({ queryKey: ["duplicate-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["duplicate-alerts-unresolved-count"] });
    },
    onError: (err: Error) =>
      toast({ title: "Failed to resolve", description: err.message, variant: "destructive" }),
  });

  const alerts = data?.data ?? [];
  const total = data?.total ?? 0;
  const limit = data?.limit ?? 20;
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-red-500/10">
            <ShieldAlert className="h-6 w-6 text-red-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              Fraud &amp; Security Alerts
              {(unresolvedCount + liveCount) > 0 && (
                <Badge variant="destructive" className="text-xs">
                  {unresolvedCount + liveCount} unresolved
                </Badge>
              )}
            </h1>
            <p className="text-sm text-muted-foreground">
              Duplicate national ID registrations flagged for admin review
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Unresolved Flags",  value: unresolvedCount, color: "text-red-600",   bg: "bg-red-50 dark:bg-red-950",    icon: AlertTriangle },
          { label: "Showing on Page",   value: alerts.length,   color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950", icon: Clock },
          { label: "Resolved (all time)", value: total - unresolvedCount >= 0 ? "—" : 0, color: "text-green-600", bg: "bg-green-50 dark:bg-green-950", icon: CheckCircle2 },
        ].map(({ label, value, color, bg, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${bg}`}>
                <Icon className={`h-4 w-4 ${color}`} />
              </div>
              <div>
                <p className="text-lg font-bold">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-3 bg-card p-4 rounded-xl border border-border">
        <span className="text-sm font-medium">Status Filter:</span>
        <Select value={resolvedFilter} onValueChange={(v: any) => { setResolvedFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="false">Unresolved</SelectItem>
            <SelectItem value="true">Resolved</SelectItem>
            <SelectItem value="all">All Alerts</SelectItem>
          </SelectContent>
        </Select>
        {data && (
          <p className="ml-auto text-sm text-muted-foreground">{total} total alerts</p>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Alert ID</TableHead>
              <TableHead>New Driver</TableHead>
              <TableHead>Existing Driver</TableHead>
              <TableHead>Match Type</TableHead>
              <TableHead>Flagged At</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(6)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(7)].map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : alerts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-14 text-muted-foreground">
                  <ShieldAlert className="h-8 w-8 mx-auto mb-3 opacity-30" />
                  <p>No {resolvedFilter === "false" ? "unresolved" : ""} alerts found</p>
                </TableCell>
              </TableRow>
            ) : (
              alerts.map((alert) => (
                <TableRow key={alert.id}>
                  <TableCell className="font-mono text-sm text-muted-foreground">#{alert.id}</TableCell>
                  <TableCell>
                    <Link href={`/drivers/${alert.newDriverId}`}>
                      <span className="text-sm font-medium text-primary hover:underline cursor-pointer flex items-center gap-1">
                        {alert.newDriver?.name ?? `Driver #${alert.newDriverId}`}
                        <ExternalLink className="h-3 w-3" />
                      </span>
                    </Link>
                    <span className="text-xs text-muted-foreground">ID #{alert.newDriverId}</span>
                  </TableCell>
                  <TableCell>
                    <Link href={`/drivers/${alert.existingDriverId}`}>
                      <span className="text-sm font-medium text-primary hover:underline cursor-pointer flex items-center gap-1">
                        {alert.existingDriver?.name ?? `Driver #${alert.existingDriverId}`}
                        <ExternalLink className="h-3 w-3" />
                      </span>
                    </Link>
                    <span className="text-xs text-muted-foreground">ID #{alert.existingDriverId}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs border-orange-200 text-orange-700 bg-orange-50 dark:bg-orange-950">
                      {alert.matchType === "national_id" ? "National ID" : alert.matchType}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(alert.createdAt), "MMM d, yyyy HH:mm")}
                  </TableCell>
                  <TableCell>
                    {alert.resolvedAt ? (
                      <Badge variant="outline" className="text-xs text-green-600 border-green-200 bg-green-50 dark:bg-green-950 gap-1">
                        <CheckCircle2 className="h-2.5 w-2.5" /> Resolved
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="text-xs gap-1">
                        <AlertTriangle className="h-2.5 w-2.5" /> Open
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {!alert.resolvedAt && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7"
                        onClick={() => { setResolveTarget(alert); setNotes(""); }}
                      >
                        Resolve
                      </Button>
                    )}
                    {alert.resolvedAt && alert.notes && (
                      <span className="text-xs text-muted-foreground italic truncate max-w-[120px] block text-right">
                        {alert.notes}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))
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
              Page {page} of {totalPages}
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

      <Dialog open={!!resolveTarget} onOpenChange={(open) => !open && setResolveTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Resolve Alert #{resolveTarget?.id}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm space-y-1">
              <p><span className="text-muted-foreground">New Driver:</span> {resolveTarget?.newDriver?.name ?? `#${resolveTarget?.newDriverId}`}</p>
              <p><span className="text-muted-foreground">Existing Driver:</span> {resolveTarget?.existingDriver?.name ?? `#${resolveTarget?.existingDriverId}`}</p>
              <p><span className="text-muted-foreground">Match Type:</span> {resolveTarget?.matchType}</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Audit Notes <span className="text-muted-foreground text-xs">(optional)</span></label>
              <Textarea
                placeholder="e.g. Verified same person — duplicate blocked. OR Investigated — different individuals, false flag."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveTarget(null)}>Cancel</Button>
            <Button
              disabled={resolveMutation.isPending}
              onClick={() => resolveTarget && resolveMutation.mutate({ id: resolveTarget.id, notes })}
            >
              {resolveMutation.isPending ? "Resolving…" : "Mark as Resolved"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
