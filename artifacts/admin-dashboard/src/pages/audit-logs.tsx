import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { adminFetch } from "@/lib/api";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronLeft, ChevronRight, RefreshCw, Eye, Shield } from "lucide-react";
import { format } from "date-fns";

type AuditLog = {
  id: number;
  userId: number | null;
  action: string;
  entityType: string;
  entityId: number | null;
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  adminName: string | null;
  adminEmail: string | null;
};

type AuditLogsResponse = {
  data: AuditLog[];
  total: number;
  page: number;
  limit: number;
};

const ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
  UPDATE: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100",
  DELETE: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100",
};

const LIMIT = 25;

export default function AuditLogs() {
  const { t } = useTranslation();

  const [page, setPage] = useState(1);
  const [action, setAction] = useState<string>("");
  const [entityType, setEntityType] = useState<string>("");
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
  if (action) params.set("action", action);
  if (entityType) params.set("entityType", entityType);

  const { data, isLoading, refetch } = useQuery<AuditLogsResponse>({
    queryKey: ["audit-logs", page, action, entityType],
    queryFn: () => adminFetch<AuditLogsResponse>(`/admin/audit-logs?${params}`),
    staleTime: 30_000,
  });

  const { data: actions } = useQuery<string[]>({
    queryKey: ["audit-log-actions"],
    queryFn: () => adminFetch<string[]>("/admin/audit-logs/distinct/actions"),
    staleTime: 300_000,
  });

  const { data: entityTypes } = useQuery<string[]>({
    queryKey: ["audit-log-entity-types"],
    queryFn: () => adminFetch<string[]>("/admin/audit-logs/distinct/entity-types"),
    staleTime: 300_000,
  });

  const totalPages = data ? Math.ceil(data.total / LIMIT) : 1;

  function resetFilters() {
    setAction("");
    setEntityType("");
    setPage(1);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="h-7 w-7 text-primary" />
            {t("auditLogs.title", "Audit Logs")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {t("auditLogs.subtitle", "Complete record of all admin actions in the system")}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
          <RefreshCw className="h-4 w-4" />
          {t("common.refresh", "Refresh")}
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select
          value={action || "all"}
          onValueChange={(v) => { setAction(v === "all" ? "" : v); setPage(1); }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder={t("auditLogs.filterAction", "Action")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.all", "All Actions")}</SelectItem>
            {(actions ?? ["CREATE", "UPDATE", "DELETE"]).map((a) => (
              <SelectItem key={a} value={a}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={entityType || "all"}
          onValueChange={(v) => { setEntityType(v === "all" ? "" : v); setPage(1); }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder={t("auditLogs.filterEntity", "Entity Type")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.all", "All Entities")}</SelectItem>
            {(entityTypes ?? []).map((e) => (
              <SelectItem key={e} value={e}>{e}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(action || entityType) && (
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            {t("common.clearFilters", "Clear Filters")}
          </Button>
        )}

        {data && (
          <span className="ml-auto text-sm text-muted-foreground self-center">
            {data.total} {t("auditLogs.records", "records")}
          </span>
        )}
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">{t("common.id", "ID")}</TableHead>
              <TableHead>{t("auditLogs.action", "Action")}</TableHead>
              <TableHead>{t("auditLogs.entity", "Entity")}</TableHead>
              <TableHead>{t("auditLogs.performedBy", "Performed By")}</TableHead>
              <TableHead>{t("auditLogs.ipAddress", "IP Address")}</TableHead>
              <TableHead>{t("auditLogs.timestamp", "Timestamp")}</TableHead>
              <TableHead className="w-16">{t("common.details", "Details")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 10 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
              : data?.data.length === 0
                ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      {t("auditLogs.noLogs", "No audit logs found")}
                    </TableCell>
                  </TableRow>
                )
                : data?.data.map((log) => (
                  <TableRow key={log.id} className="hover:bg-muted/50">
                    <TableCell className="font-mono text-xs text-muted-foreground">#{log.id}</TableCell>
                    <TableCell>
                      <Badge className={ACTION_COLORS[log.action] ?? "bg-gray-100 text-gray-800"}>
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium capitalize">{log.entityType}</span>
                      {log.entityId && (
                        <span className="text-xs text-muted-foreground ml-1">#{log.entityId}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {log.adminName
                        ? <span className="font-medium">{log.adminName}</span>
                        : <span className="text-muted-foreground text-xs">—</span>
                      }
                      {log.adminEmail && (
                        <div className="text-xs text-muted-foreground">{log.adminEmail}</div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {log.ipAddress ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(log.createdAt), "dd MMM yyyy, HH:mm:ss")}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setSelectedLog(log)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
            }
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {t("common.page", "Page")} {page} {t("common.of", "of")} {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              {t("auditLogs.logDetail", "Audit Log Detail")} #{selectedLog?.id}
            </DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <ScrollArea className="max-h-[60vh] pr-4">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">{t("auditLogs.action", "Action")}</p>
                    <Badge className={ACTION_COLORS[selectedLog.action] ?? ""}>
                      {selectedLog.action}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">{t("auditLogs.entity", "Entity")}</p>
                    <p className="font-medium capitalize">
                      {selectedLog.entityType} {selectedLog.entityId ? `#${selectedLog.entityId}` : ""}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">{t("auditLogs.performedBy", "Performed By")}</p>
                    <p className="font-medium">{selectedLog.adminName ?? "—"}</p>
                    {selectedLog.adminEmail && (
                      <p className="text-xs text-muted-foreground">{selectedLog.adminEmail}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">{t("auditLogs.timestamp", "Timestamp")}</p>
                    <p>{format(new Date(selectedLog.createdAt), "dd MMM yyyy, HH:mm:ss")}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">{t("auditLogs.ipAddress", "IP Address")}</p>
                    <p className="font-mono text-xs">{selectedLog.ipAddress ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">{t("auditLogs.userAgent", "User Agent")}</p>
                    <p className="text-xs break-all">{selectedLog.userAgent ?? "—"}</p>
                  </div>
                </div>

                {selectedLog.oldData && (
                  <div>
                    <p className="text-muted-foreground text-xs mb-1 font-medium">{t("auditLogs.oldData", "Before")}</p>
                    <pre className="bg-muted rounded p-3 text-xs overflow-auto whitespace-pre-wrap break-all">
                      {JSON.stringify(selectedLog.oldData, null, 2)}
                    </pre>
                  </div>
                )}

                {selectedLog.newData && (
                  <div>
                    <p className="text-muted-foreground text-xs mb-1 font-medium">{t("auditLogs.newData", "After")}</p>
                    <pre className="bg-muted rounded p-3 text-xs overflow-auto whitespace-pre-wrap break-all">
                      {JSON.stringify(selectedLog.newData, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
