import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  Lightbulb, Search, ChevronRight, MapPin, Navigation,
  Edit3, CheckCircle2, XCircle, Clock
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { useTranslation } from "react-i18next";

type Suggestion = {
  id: number;
  type: "new_route" | "new_station" | "route_edit";
  title: string;
  description: string;
  startLocation: string | null;
  endLocation: string | null;
  status: "pending" | "approved" | "rejected";
  adminNotes: string | null;
  createdAt: string;
  user: { name: string; email: string } | null;
  driver: { name: string } | null;
};

export default function Suggestions() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selected, setSelected] = useState<Suggestion | null>(null);
  const [adminNotes, setAdminNotes] = useState("");

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();

  const typeConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
    new_route:   { label: t("suggestions.newRoute", "New Route"),   icon: Navigation, color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
    new_station: { label: t("suggestions.newStation", "New Station"), icon: MapPin,      color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
    route_edit:  { label: t("suggestions.routeEdit", "Route Edit"),  icon: Edit3,       color: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" },
  };

  const statusConfig: Record<string, { label: string; variant: any }> = {
    pending:  { label: t("verification.pending"),  variant: "secondary" },
    approved: { label: t("suggestions.approved"), variant: "default" },
    rejected: { label: t("suggestions.rejected"), variant: "destructive" },
  };

  const params = new URLSearchParams({ page: String(page), limit: "15" });
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (typeFilter !== "all") params.set("type", typeFilter);
  if (search) params.set("search", search);

  const { data, isLoading } = useQuery({
    queryKey: ["suggestions", page, statusFilter, typeFilter, search],
    queryFn: () => adminFetch<{ data: Suggestion[]; total: number; limit: number }>(`/suggestions?${params}`),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status, notes }: { id: number; status: string; notes: string }) =>
      adminFetch(`/suggestions/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, adminNotes: notes }),
      }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["suggestions"] });
      setSelected(null);
      toast({ title: vars.status === "approved" ? t("suggestions.suggestionApproved") : t("suggestions.suggestionRejected") });
    },
  });

  const openDetail = async (s: Suggestion) => {
    const detail = await adminFetch<Suggestion>(`/suggestions/${s.id}`);
    setSelected(detail);
    setAdminNotes(detail.adminNotes || "");
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("suggestions.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("suggestions.subtitle")}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { key: "pending", label: t("suggestions.pendingReview"), icon: Clock, cls: "text-amber-500" },
          { key: "approved", label: t("suggestions.approved"), icon: CheckCircle2, cls: "text-green-500" },
          { key: "rejected", label: t("suggestions.rejected"), icon: XCircle, cls: "text-destructive" },
        ].map(({ key, label, icon: Icon, cls }) => (
          <Card key={key} className="cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => { setStatusFilter(key); setPage(1); }}>
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <Icon className={`h-5 w-5 shrink-0 ${cls}`} />
              <div>
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="text-xl font-bold">
                  {data?.data.filter(s => s.status === key).length ?? "—"}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 items-center bg-card p-4 rounded-xl border border-border">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder={t("suggestions.searchSuggestions")} className="ps-9 w-48"
              value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          </div>
          <Button type="submit" variant="secondary" size="sm">{t("common.search")}</Button>
        </form>

        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder={t("common.status")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.allStatuses")}</SelectItem>
            <SelectItem value="pending">{t("verification.pending")}</SelectItem>
            <SelectItem value="approved">{t("suggestions.approved")}</SelectItem>
            <SelectItem value="rejected">{t("suggestions.rejected")}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder={t("common.type")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("support.allTypes")}</SelectItem>
            <SelectItem value="new_route">{t("suggestions.newRoute")}</SelectItem>
            <SelectItem value="new_station">{t("suggestions.newStation")}</SelectItem>
            <SelectItem value="route_edit">{t("suggestions.routeEdit")}</SelectItem>
          </SelectContent>
        </Select>

        {(search || statusFilter !== "all" || typeFilter !== "all") && (
          <Button variant="ghost" size="sm" onClick={() => {
            setSearch(""); setSearchInput(""); setStatusFilter("all"); setTypeFilter("all"); setPage(1);
          }}>{t("common.clear")}</Button>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
        {isLoading ? (
          [...Array(5)].map((_, i) => (
            <div key={i} className="p-4 flex gap-4">
              <Skeleton className="h-10 w-10 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-64" />
                <Skeleton className="h-3 w-40" />
              </div>
            </div>
          ))
        ) : data?.data.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <Lightbulb className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>{t("suggestions.noSuggestions")}</p>
          </div>
        ) : (
          data?.data.map((s) => {
            const typeCfg = typeConfig[s.type];
            const Icon = typeCfg.icon;
            const statusCfg = statusConfig[s.status];
            return (
              <div
                key={s.id}
                className="p-4 flex items-start gap-4 hover:bg-muted/40 cursor-pointer transition-colors"
                onClick={() => openDetail(s)}
              >
                <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${typeCfg.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{s.title}</span>
                    <Badge variant="outline" className={`text-[10px] ${typeCfg.color} border-0`}>
                      {typeCfg.label}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {s.user?.name || s.driver?.name || t("common.unknown")} · #{s.id} ·{" "}
                    {format(new Date(s.createdAt), "MMM d, yyyy")}
                  </p>
                  {(s.startLocation || s.endLocation) && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {s.startLocation} {s.startLocation && s.endLocation && "→"} {s.endLocation}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            );
          })
        )}
      </div>

      {data && data.total > data.limit && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious onClick={() => setPage(p => Math.max(1, p - 1))}
                className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"} />
            </PaginationItem>
            <PaginationItem className="text-sm text-muted-foreground px-4">
              {t("common.page")} {page} {t("common.of")} {Math.ceil(data.total / data.limit)}
            </PaginationItem>
            <PaginationItem>
              <PaginationNext onClick={() => setPage(p => p + 1)}
                className={page >= Math.ceil(data.total / data.limit) ? "pointer-events-none opacity-50" : "cursor-pointer"} />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selected && (() => {
                const cfg = typeConfig[selected.type];
                const Icon = cfg.icon;
                return <><Icon className="h-5 w-5" />{selected.title}</>;
              })()}
            </DialogTitle>
          </DialogHeader>

          {selected && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>#{selected.id}</span>
                <span>·</span>
                <span>{typeConfig[selected.type].label}</span>
                <span>·</span>
                <span>{selected.user?.name || selected.driver?.name || t("common.unknown")}</span>
                <span>·</span>
                <span>{format(new Date(selected.createdAt), "MMM d, yyyy")}</span>
              </div>

              <div className="bg-muted rounded-lg p-4">
                <p className="text-sm">{selected.description}</p>
              </div>

              {(selected.startLocation || selected.endLocation) && (
                <div className="flex items-center gap-2 text-sm p-3 bg-muted/50 rounded-lg">
                  <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>{selected.startLocation}</span>
                  {selected.startLocation && selected.endLocation && (
                    <span className="text-muted-foreground">→</span>
                  )}
                  <span>{selected.endLocation}</span>
                </div>
              )}

              {selected.adminNotes && (
                <div className="border rounded-lg p-3">
                  <div className="text-xs text-muted-foreground mb-1 font-medium">{t("suggestions.previousAdminNotes")}</div>
                  <p className="text-sm">{selected.adminNotes}</p>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">{t("suggestions.adminNotes")}</label>
                <Textarea
                  placeholder={t("suggestions.notesPlaceholder")}
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={3}
                />
              </div>

              {selected.status === "pending" && (
                <DialogFooter className="flex gap-2">
                  <Button
                    variant="destructive"
                    disabled={updateMutation.isPending}
                    onClick={() => updateMutation.mutate({ id: selected.id, status: "rejected", notes: adminNotes })}
                  >
                    <XCircle className="h-4 w-4 me-2" /> {t("common.reject")}
                  </Button>
                  <Button
                    disabled={updateMutation.isPending}
                    onClick={() => updateMutation.mutate({ id: selected.id, status: "approved", notes: adminNotes })}
                  >
                    <CheckCircle2 className="h-4 w-4 me-2" /> {t("common.approve")}
                  </Button>
                </DialogFooter>
              )}

              {selected.status !== "pending" && (
                <div className="flex justify-end">
                  <Button variant="outline"
                    onClick={() => updateMutation.mutate({ id: selected.id, status: "pending", notes: adminNotes })}>
                    {t("suggestions.reopenPending")}
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
