import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Star, Trash2, Eye, MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";

// ─── Types ────────────────────────────────────────────────────────────────────

type RatingRow = {
  id: number;
  raterId: number;
  driverId: number;
  tripId: number | null;
  rideId: number | null;
  context: "trip" | "ride";
  score: string;
  comment: string | null;
  createdAt: string;
  raterName: string | null;
  raterEmail: string | null;
  driverName: string | null;
  driverPhone: string | null;
  driverRating: string | null;
};

type RatingStats = {
  total: number;
  avgScore: number;
  tripCount: number;
  rideCount: number;
  distribution: { score: number; count: number }[];
};

// ─── Stars display ────────────────────────────────────────────────────────────

function Stars({ score }: { score: number }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`h-3.5 w-3.5 ${s <= Math.round(score) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
        />
      ))}
      <span className="ms-1 text-xs font-medium text-muted-foreground">{score.toFixed(1)}</span>
    </div>
  );
}

// ─── Score distribution bar ───────────────────────────────────────────────────

function ScoreBar({ score, count, total }: { score: number; count: number; total: number }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="flex items-center gap-0.5 w-14 shrink-0">
        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
        <span className="text-muted-foreground">{score}</span>
      </div>
      <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
        <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-end text-muted-foreground">{count}</span>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Ratings() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [filterContext, setFilterContext] = useState<string>("all");
  const [filterMinScore, setFilterMinScore] = useState<string>("all");
  const [selected, setSelected] = useState<RatingRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RatingRow | null>(null);
  const LIMIT = 25;

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", String(LIMIT));
  if (filterContext !== "all") params.set("context", filterContext);
  if (filterMinScore !== "all") params.set("minScore", filterMinScore);

  const { data, isLoading } = useQuery<{ data: RatingRow[]; total: number; page: number; limit: number }>({
    queryKey: ["admin-ratings", page, filterContext, filterMinScore],
    queryFn: () => adminFetch(`/admin/ratings?${params.toString()}`),
  });

  const { data: stats } = useQuery<RatingStats>({
    queryKey: ["admin-ratings-stats"],
    queryFn: () => adminFetch("/admin/ratings/stats"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminFetch(`/admin/ratings/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-ratings"] });
      queryClient.invalidateQueries({ queryKey: ["admin-ratings-stats"] });
      setDeleteTarget(null);
      toast({ title: t("ratings.deleted", "Rating deleted") });
    },
    onError: (err: Error) => toast({ title: t("common.error", "Error"), description: err.message, variant: "destructive" }),
  });

  const rows = data?.data ?? [];
  const totalPages = data ? Math.ceil(data.total / LIMIT) : 1;

  const handleFilterChange = (key: string, val: string) => {
    setPage(1);
    if (key === "context") setFilterContext(val);
    if (key === "minScore") setFilterMinScore(val);
  };

  const fullDist = [5, 4, 3, 2, 1].map((s) => ({
    score: s,
    count: stats?.distribution.find((d) => d.score === s)?.count ?? 0,
  }));

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-xl bg-amber-500/10">
          <Star className="h-6 w-6 text-amber-500 fill-amber-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{t("ratings.title", "Ratings & Reviews")}</h1>
          <p className="text-sm text-muted-foreground">{t("ratings.subtitle", "All driver ratings submitted by passengers")}</p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {!stats ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
        ) : (
          <>
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-amber-500/10">
                    <Star className="h-5 w-5 text-amber-500 fill-amber-400" />
                  </div>
                  <div>
                    <p className="text-3xl font-black">{stats.avgScore ? Number(stats.avgScore).toFixed(2) : "—"}</p>
                    <p className="text-xs text-muted-foreground">{t("ratings.avgScore", "Average Score")}</p>
                  </div>
                </div>
                {stats.avgScore && (
                  <div className="mt-3">
                    <Stars score={Number(stats.avgScore)} />
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="text-3xl font-black">{stats.total}</p>
                <p className="text-xs text-muted-foreground mb-3">{t("ratings.totalRatings", "Total Ratings")}</p>
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-[10px]">{stats.rideCount} {t("common.ride", "Rides")}</Badge>
                  <Badge variant="outline" className="text-[10px]">{stats.tripCount} {t("common.trip", "Trips")}</Badge>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="text-xs font-medium mb-3 text-muted-foreground">{t("ratings.distribution", "Score Distribution")}</p>
                <div className="space-y-1.5">
                  {fullDist.map((d) => (
                    <ScoreBar key={d.score} score={d.score} count={d.count} total={stats.total} />
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <Select value={filterContext} onValueChange={(v) => handleFilterChange("context", v)}>
          <SelectTrigger className="w-36 h-9 text-sm"><SelectValue placeholder="All contexts" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("ratings.allContexts", "All contexts")}</SelectItem>
            <SelectItem value="ride">{t("ratings.contextRide", "Ride")}</SelectItem>
            <SelectItem value="trip">{t("ratings.contextTrip", "Shuttle Trip")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterMinScore} onValueChange={(v) => handleFilterChange("minScore", v)}>
          <SelectTrigger className="w-44 h-9 text-sm"><SelectValue placeholder="Min score" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("ratings.allScores", "All scores")}</SelectItem>
            <SelectItem value="4">{t("ratings.minScore4", "4★ and above")}</SelectItem>
            <SelectItem value="3">{t("ratings.minScore3", "3★ and above")}</SelectItem>
            <SelectItem value="1">{t("ratings.minScore1", "Low scores only (1-2★)")}</SelectItem>
          </SelectContent>
        </Select>
        {(filterContext !== "all" || filterMinScore !== "all") && (
          <Button size="sm" variant="ghost" className="h-9" onClick={() => { setFilterContext("all"); setFilterMinScore("all"); setPage(1); }}>
            {t("common.clearFilters", "Clear")}
          </Button>
        )}
        {data && (
          <span className="text-xs text-muted-foreground ms-auto">{data.total} {t("auditLogs.records", "records")}</span>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : !rows.length ? (
            <div className="py-12 text-center text-muted-foreground text-sm">{t("ratings.noRatings", "No ratings found")}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>{t("ratings.passenger", "Passenger")}</TableHead>
                  <TableHead>{t("ratings.driver", "Driver")}</TableHead>
                  <TableHead>{t("ratings.score", "Score")}</TableHead>
                  <TableHead>{t("ratings.context", "Context")}</TableHead>
                  <TableHead>{t("ratings.comment", "Comment")}</TableHead>
                  <TableHead>{t("common.date", "Date")}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-sm">#{row.id}</TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">{row.raterName ?? `User #${row.raterId}`}</p>
                        <p className="text-[10px] text-muted-foreground">{row.raterEmail ?? ""}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">{row.driverName ?? `Driver #${row.driverId}`}</p>
                        <p className="text-[10px] text-muted-foreground">{row.driverPhone ?? ""}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Stars score={parseFloat(row.score)} />
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize text-[10px]">{t(`ratings.context${row.context.charAt(0).toUpperCase() + row.context.slice(1)}`, row.context)}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      {row.comment ? (
                        <div className="flex items-start gap-1">
                          <MessageSquare className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                          <p className="text-xs text-muted-foreground truncate">{row.comment}</p>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(row.createdAt), "dd MMM, HH:mm")}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setSelected(row)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(row)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious onClick={() => setPage((p) => Math.max(1, p - 1))} className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"} />
            </PaginationItem>
            <PaginationItem className="text-sm text-muted-foreground px-4">{t("common.pageOf", "Page")} {page} / {totalPages}</PaginationItem>
            <PaginationItem>
              <PaginationNext onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className={page >= totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"} />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Star className="h-4 w-4 text-amber-500 fill-amber-400" /> {t("ratings.ratingDetail", "Rating Detail")} #{selected?.id}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-center py-2">
                <Stars score={parseFloat(selected.score)} />
              </div>
              {[
                { label: t("ratings.passenger", "Passenger"), value: selected.raterName ?? `${t("common.user")} #${selected.raterId}` },
                { label: t("ratings.driver", "Driver"), value: selected.driverName ?? `${t("common.driver")} #${selected.driverId}` },
                { label: t("ratings.context", "Context"), value: <Badge variant="outline" className="capitalize text-[10px]">{t(`ratings.context${selected.context.charAt(0).toUpperCase() + selected.context.slice(1)}`, selected.context)}</Badge> },
                { label: t("ratings.reference", "Reference"), value: selected.tripId ? `${t("common.trip")} #${selected.tripId}` : selected.rideId ? `${t("common.ride")} #${selected.rideId}` : "—" },
                { label: t("ratings.comment", "Comment"), value: selected.comment ?? "—" },
                { label: t("common.date", "Date"), value: format(new Date(selected.createdAt), "dd MMM yyyy, HH:mm:ss") },
              ].map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-4 py-1 border-b border-border last:border-0">
                  <span className="text-muted-foreground text-xs w-28 shrink-0">{row.label}</span>
                  <span className="text-xs text-end">{row.value}</span>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>{t("common.close", "Close")}</Button>
            <Button variant="destructive" size="sm" onClick={() => { if (selected) setDeleteTarget(selected); setSelected(null); }}>
              <Trash2 className="h-3.5 w-3.5 me-1.5" /> {t("ratings.deleteRating", "Delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-destructive"><Trash2 className="h-4 w-4" /> {t("ratings.deleteConfirmTitle", "Delete Rating")}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("ratings.deleteConfirmBody", "This will permanently remove rating")} #{deleteTarget?.id} ({deleteTarget?.score}★) {t("ratings.deleteConfirmBy", "left by")} {deleteTarget?.raterName ?? `${t("common.user")} #${deleteTarget?.raterId}`}.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>{t("common.cancel", "Cancel")}</Button>
            <Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>
              {deleteMutation.isPending ? t("common.loading", "...") : t("ratings.confirmDelete", "Delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
