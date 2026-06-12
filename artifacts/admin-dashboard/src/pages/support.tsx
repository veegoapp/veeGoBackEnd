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
  MessageSquare, Search, Filter, ChevronRight,
  AlertCircle, Clock, CheckCircle2, XCircle, Send, RefreshCw
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { useTranslation } from "react-i18next";

type Ticket = {
  id: number;
  subject: string;
  message: string;
  status: "open" | "pending" | "resolved" | "closed";
  priority: "low" | "medium" | "high";
  type: "passenger" | "driver";
  createdAt: string;
  updatedAt: string;
  user: { name: string; email: string } | null;
  driver: { name: string } | null;
};

type TicketDetail = Ticket & {
  messages: { id: number; senderType: string; message: string; createdAt: string }[];
};

export default function Support() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedTicket, setSelectedTicket] = useState<TicketDetail | null>(null);
  const [replyText, setReplyText] = useState("");
  const [newStatus, setNewStatus] = useState<string>("");

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();

  const statusConfig: Record<string, { label: string; variant: any; icon: React.ElementType }> = {
    open:     { label: t("support.open"),     variant: "default",     icon: AlertCircle },
    pending:  { label: t("support.pending"),  variant: "secondary",   icon: Clock },
    resolved: { label: t("support.resolved"), variant: "outline",     icon: CheckCircle2 },
    closed:   { label: t("support.closed"),   variant: "destructive", icon: XCircle },
  };

  const priorityConfig: Record<string, { label: string; className: string }> = {
    low:    { label: t("support.low"),    className: "bg-muted text-muted-foreground" },
    medium: { label: t("support.medium"), className: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
    high:   { label: t("support.high"),   className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  };

  const params = new URLSearchParams({ page: String(page), limit: "15" });
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (priorityFilter !== "all") params.set("priority", priorityFilter);
  if (typeFilter !== "all") params.set("type", typeFilter);
  if (search) params.set("search", search);

  const { data, isLoading } = useQuery({
    queryKey: ["support-tickets", page, statusFilter, priorityFilter, typeFilter, search],
    queryFn: () => adminFetch<{ data: Ticket[]; total: number; limit: number }>(`/support/tickets?${params}`),
  });

  const { data: stats } = useQuery({
    queryKey: ["support-stats"],
    queryFn: () => adminFetch<Record<string, number>>("/support/stats"),
  });

  const openTicketDetail = async (id: number) => {
    const detail = await adminFetch<TicketDetail>(`/support/tickets/${id}`);
    setSelectedTicket(detail);
    setNewStatus(detail.status);
    setReplyText("");
  };

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      adminFetch(`/support/tickets/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["support-stats"] });
      toast({ title: t("support.ticketUpdated", "Ticket updated") });
    },
  });

  const replyMutation = useMutation({
    mutationFn: ({ id, message }: { id: number; message: string }) =>
      adminFetch(`/support/tickets/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({ message, senderType: "admin" }),
      }),
    onSuccess: async () => {
      if (selectedTicket) {
        const updated = await adminFetch<TicketDetail>(`/support/tickets/${selectedTicket.id}`);
        setSelectedTicket(updated);
      }
      setReplyText("");
      queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
      toast({ title: t("support.replySent", "Reply sent") });
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const clearFilters = () => {
    setSearch(""); setSearchInput("");
    setStatusFilter("all"); setPriorityFilter("all"); setTypeFilter("all");
    setPage(1);
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("support.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("support.subtitle")}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {["open", "pending", "resolved", "closed"].map((s) => {
          const cfg = statusConfig[s];
          const Icon = cfg.icon;
          return (
            <Card key={s} className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => { setStatusFilter(s); setPage(1); }}>
              <CardContent className="pt-4 pb-3 flex items-center gap-3">
                <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                <div>
                  <div className="text-xs text-muted-foreground">{cfg.label}</div>
                  <div className="text-xl font-bold">{stats?.[s] ?? 0}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 items-center bg-card p-4 rounded-xl border border-border">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder={t("support.searchTickets")} className="ps-9 w-48"
              value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          </div>
          <Button type="submit" variant="secondary" size="sm">{t("common.search")}</Button>
        </form>

        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder={t("common.status")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("support.allStatus", "All Status")}</SelectItem>
            <SelectItem value="open">{t("support.open")}</SelectItem>
            <SelectItem value="pending">{t("support.pending")}</SelectItem>
            <SelectItem value="resolved">{t("support.resolved")}</SelectItem>
            <SelectItem value="closed">{t("support.closed")}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={priorityFilter} onValueChange={(v) => { setPriorityFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[120px]"><SelectValue placeholder={t("support.priority")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("support.allPriority", "All Priority")}</SelectItem>
            <SelectItem value="high">{t("support.high")}</SelectItem>
            <SelectItem value="medium">{t("support.medium")}</SelectItem>
            <SelectItem value="low">{t("support.low")}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[120px]"><SelectValue placeholder={t("support.type")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("support.allTypes", "All Types")}</SelectItem>
            <SelectItem value="passenger">{t("nav.passengers")}</SelectItem>
            <SelectItem value="driver">{t("nav.drivers")}</SelectItem>
          </SelectContent>
        </Select>

        {(search || statusFilter !== "all" || priorityFilter !== "all" || typeFilter !== "all") && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>{t("common.clear", "Clear")}</Button>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
        {isLoading ? (
          [...Array(6)].map((_, i) => (
            <div key={i} className="p-4 flex gap-4">
              <Skeleton className="h-10 w-10 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-64" />
                <Skeleton className="h-3 w-40" />
              </div>
              <Skeleton className="h-6 w-20" />
            </div>
          ))
        ) : data?.data.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>{t("support.noTickets")}</p>
          </div>
        ) : (
          data?.data.map((ticket) => {
            const cfg = statusConfig[ticket.status];
            const Icon = cfg.icon;
            const pri = priorityConfig[ticket.priority];
            return (
              <div
                key={ticket.id}
                className="p-4 flex items-start gap-4 hover:bg-muted/40 cursor-pointer transition-colors"
                onClick={() => openTicketDetail(ticket.id)}
              >
                <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${
                  ticket.type === "driver" ? "bg-purple-100 dark:bg-purple-900" : "bg-blue-100 dark:bg-blue-900"
                }`}>
                  <MessageSquare className={`h-4 w-4 ${
                    ticket.type === "driver" ? "text-purple-600" : "text-blue-600"
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 flex-wrap">
                    <p className="font-medium text-sm truncate">{ticket.subject}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${pri.className}`}>
                      {pri.label}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {ticket.user?.name || ticket.driver?.name || t("support.anonymous", "Anonymous")} ·{" "}
                    {ticket.type} · #{ticket.id} ·{" "}
                    {format(new Date(ticket.createdAt), "MMM d, yyyy")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 truncate">{ticket.message}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={cfg.variant} className="text-xs">
                    <Icon className="h-3 w-3 me-1" />{cfg.label}
                  </Badge>
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
              {t("common.page", "Page")} {page} {t("common.of", "of")} {Math.ceil(data.total / data.limit)}
            </PaginationItem>
            <PaginationItem>
              <PaginationNext onClick={() => setPage(p => p + 1)}
                className={page >= Math.ceil(data.total / data.limit) ? "pointer-events-none opacity-50" : "cursor-pointer"} />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      <Dialog open={!!selectedTicket} onOpenChange={(open) => !open && setSelectedTicket(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-start gap-3 pe-8">
              <span className="flex-1 text-start">{selectedTicket?.subject}</span>
              <Badge variant={statusConfig[selectedTicket?.status || "open"]?.variant} className="shrink-0">
                {statusConfig[selectedTicket?.status || "open"]?.label}
              </Badge>
            </DialogTitle>
          </DialogHeader>

          {selectedTicket && (
            <div className="flex-1 overflow-y-auto space-y-4 pe-1">
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>#{selectedTicket.id}</span>
                <span>·</span>
                <span className="capitalize">{selectedTicket.type}</span>
                <span>·</span>
                <span>{t("support.priority")}: <span className={`font-medium px-1 rounded ${priorityConfig[selectedTicket.priority].className}`}>
                  {priorityConfig[selectedTicket.priority].label}
                </span></span>
                <span>·</span>
                <span>{selectedTicket.user?.name || selectedTicket.driver?.name || t("support.anonymous", "Anonymous")}</span>
                <span>·</span>
                <span>{format(new Date(selectedTicket.createdAt), "MMM d, yyyy HH:mm")}</span>
              </div>

              <div className="bg-muted rounded-lg p-4">
                <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">{t("support.originalMessage", "Original Message")}</div>
                <p className="text-sm">{selectedTicket.message}</p>
              </div>

              {selectedTicket.messages.length > 0 && (
                <div className="space-y-3">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("support.replies", "Replies")}</div>
                  {selectedTicket.messages.map((msg) => (
                    <div key={msg.id} className={`flex gap-3 ${msg.senderType === "admin" ? "flex-row-reverse" : ""}`}>
                      <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        msg.senderType === "admin"
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-secondary-foreground"
                      }`}>
                        {msg.senderType === "admin" ? "A" : msg.senderType[0].toUpperCase()}
                      </div>
                      <div className={`flex-1 rounded-lg p-3 text-sm ${
                        msg.senderType === "admin"
                          ? "bg-primary/10 text-end"
                          : "bg-muted"
                      }`}>
                        <p>{msg.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(msg.createdAt), "MMM d, HH:mm")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-3 pt-2 border-t">
                <span className="text-sm font-medium shrink-0">{t("common.status")}:</span>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">{t("support.open")}</SelectItem>
                    <SelectItem value="pending">{t("support.pending")}</SelectItem>
                    <SelectItem value="resolved">{t("support.resolved")}</SelectItem>
                    <SelectItem value="closed">{t("support.closed")}</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline"
                  disabled={newStatus === selectedTicket.status || updateMutation.isPending}
                  onClick={() => updateMutation.mutate({ id: selectedTicket.id, data: { status: newStatus } })}>
                  <RefreshCw className="h-3.5 w-3.5 me-1.5" /> {t("common.update")}
                </Button>
              </div>

              <div className="space-y-2 pt-2 border-t">
                <div className="text-sm font-medium">{t("support.reply", "Reply")}</div>
                <Textarea
                  placeholder={t("support.replyPlaceholder", "Write your reply...")}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  rows={3}
                />
                <Button
                  className="w-full"
                  disabled={!replyText.trim() || replyMutation.isPending}
                  onClick={() => replyMutation.mutate({ id: selectedTicket.id, message: replyText })}
                >
                  <Send className="h-4 w-4 me-2" /> {t("support.sendReply", "Send Reply")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
