import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, ShieldAlert, RotateCcw } from "lucide-react";

interface OffenceRow {
  id: number;
  userId: number;
  name: string;
  phone: string;
  actorType: "passenger" | "driver";
  offenceCount: number;
  lastAction: "warning" | "fined" | "suspended";
  lastOffenceAt: string;
}

interface OffencesResponse {
  data: OffenceRow[];
  total: number;
}

export default function ShuttleOffences() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const ACTION_META: Record<string, { label: string; cls: string }> = {
    warning:   { label: t("shuttleOffences.warning"),   cls: "border-amber-200 bg-amber-50 text-amber-700" },
    fined:     { label: t("shuttleOffences.fined"),     cls: "border-red-200 bg-red-50 text-red-700" },
    suspended: { label: t("shuttleOffences.suspended"), cls: "border-purple-200 bg-purple-50 text-purple-700" },
  };

  const ACTOR_META: Record<string, { label: string; cls: string }> = {
    passenger: { label: t("shuttleOffences.actorPassenger"), cls: "border-blue-200 bg-blue-50 text-blue-700" },
    driver:    { label: t("shuttleOffences.actorDriver"),    cls: "border-slate-200 bg-slate-100 text-slate-700" },
  };

  const [actorType, setActorType] = useState("all");
  const [lastAction, setLastAction] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [resettingId, setResettingId] = useState<number | null>(null);

  const params = new URLSearchParams();
  if (actorType !== "all")  params.set("actorType",  actorType);
  if (lastAction !== "all") params.set("lastAction",  lastAction);
  if (dateFrom)             params.set("dateFrom",    dateFrom);
  if (dateTo)               params.set("dateTo",      dateTo);

  const { data, isLoading, isError, refetch } = useQuery<OffencesResponse>({
    queryKey: ["shuttle-offences", actorType, lastAction, dateFrom, dateTo],
    queryFn:  () => adminFetch<OffencesResponse>(`/admin/shuttle/offences?${params.toString()}`),
  });

  const resetMutation = useMutation({
    mutationFn: (userId: number) =>
      adminFetch(`/admin/shuttle/offences/${userId}/reset`, { method: "PATCH" }),
    onSuccess: (_data, userId) => {
      toast({ title: t("shuttleOffences.offencesReset"), description: t("shuttleOffences.countCleared", { id: userId }) });
      setResettingId(null);
      void queryClient.invalidateQueries({ queryKey: ["shuttle-offences"] });
    },
    onError: (err: Error) => {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
      setResettingId(null);
    },
  });

  const handleReset = (userId: number) => {
    setResettingId(userId);
    resetMutation.mutate(userId);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-red-500" />
            {t("shuttleOffences.title")}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t("shuttleOffences.subtitle")}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          <RefreshCw className="h-4 w-4 me-2" />
          {t("common.refresh")}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={actorType} onValueChange={setActorType}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t("shuttleOffences.actorType")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("shuttleOffences.allTypes")}</SelectItem>
            <SelectItem value="passenger">{t("shuttleOffences.actorPassenger")}</SelectItem>
            <SelectItem value="driver">{t("shuttleOffences.actorDriver")}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={lastAction} onValueChange={setLastAction}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t("shuttleOffences.lastAction")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("shuttleOffences.allActions")}</SelectItem>
            <SelectItem value="warning">{t("shuttleOffences.warning")}</SelectItem>
            <SelectItem value="fined">{t("shuttleOffences.fined")}</SelectItem>
            <SelectItem value="suspended">{t("shuttleOffences.suspended")}</SelectItem>
          </SelectContent>
        </Select>

        <Input
          type="date"
          className="w-40"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          placeholder={t("common.from")}
        />
        <Input
          type="date"
          className="w-40"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          placeholder={t("common.to")}
        />

        {(actorType !== "all" || lastAction !== "all" || dateFrom || dateTo) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setActorType("all"); setLastAction("all"); setDateFrom(""); setDateTo(""); }}
          >
            {t("common.clearFilters")}
          </Button>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : isError ? (
            <div className="p-8 text-center text-red-500">
              {t("shuttleOffences.failedToLoad")}
            </div>
          ) : !data?.data.length ? (
            <div className="p-12 text-center text-muted-foreground">
              {t("shuttleOffences.noOffences")}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("shuttleOffences.colUser")}</TableHead>
                  <TableHead>{t("shuttleOffences.colPhone")}</TableHead>
                  <TableHead>{t("shuttleOffences.colType")}</TableHead>
                  <TableHead>{t("shuttleOffences.colOffenceCount")}</TableHead>
                  <TableHead>{t("shuttleOffences.colLastAction")}</TableHead>
                  <TableHead>{t("shuttleOffences.colLastOffence")}</TableHead>
                  <TableHead className="text-end">{t("shuttleOffences.colAction")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((row) => {
                  const actorMeta  = ACTOR_META[row.actorType]  ?? { label: row.actorType,  cls: "" };
                  const actionMeta = ACTION_META[row.lastAction] ?? { label: row.lastAction, cls: "" };
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-muted-foreground">{row.phone}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${actorMeta.cls}`}>
                          {actorMeta.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="font-bold text-lg">{row.offenceCount}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${actionMeta.cls}`}>
                          {actionMeta.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(row.lastOffenceAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-end">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          disabled={resettingId === row.userId}
                          onClick={() => handleReset(row.userId)}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          {resettingId === row.userId ? t("shuttleOffences.resetting") : t("shuttleOffences.resetOffences")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        {t("shuttleOffences.totalRecords", { count: data?.total ?? 0 })}
      </p>
    </div>
  );
}
