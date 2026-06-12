import React, { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { adminFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell, MessageSquare, ArrowUpRight, ShieldX, CheckCheck, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

type Alert = {
  id: string;
  type: "complaint" | "payout" | "suspension";
  title: string;
  subtitle: string;
  priority?: string;
  createdAt: string;
};

type AlertsSummary = {
  total: number;
  alerts: Alert[];
};

const SEEN_KEY = "admin_alerts_seen_ids";

function getSeenIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch {}
  return new Set();
}

function saveSeenIds(ids: Set<string>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...ids]));
  } catch {}
}

function alertIcon(type: string) {
  if (type === "complaint") return <MessageSquare className="h-3.5 w-3.5 text-amber-500" />;
  if (type === "payout") return <ArrowUpRight className="h-3.5 w-3.5 text-blue-500" />;
  return <ShieldX className="h-3.5 w-3.5 text-red-500" />;
}

function alertHref(alert: Alert): string {
  if (alert.type === "complaint") return "/complaints";
  if (alert.type === "payout") return "/payments/payouts";
  return "/drivers";
}

function priorityColor(priority?: string) {
  if (priority === "high") return "text-red-600";
  if (priority === "medium") return "text-amber-600";
  return "text-slate-500";
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [seenIds, setSeenIds] = useState<Set<string>>(getSeenIds);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { t } = useTranslation();

  const { data } = useQuery<AlertsSummary>({
    queryKey: ["admin-alerts-summary"],
    queryFn: () => adminFetch<AlertsSummary>("/admin/alerts/summary"),
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
  });

  const alerts = data?.alerts ?? [];
  const unreadCount = alerts.filter((a) => !seenIds.has(a.id)).length;

  const markAllRead = useCallback(() => {
    const next = new Set([...seenIds, ...alerts.map((a) => a.id)]);
    setSeenIds(next);
    saveSeenIds(next);
  }, [seenIds, alerts]);

  const markOneRead = useCallback((id: string) => {
    const next = new Set([...seenIds, id]);
    setSeenIds(next);
    saveSeenIds(next);
  }, [seenIds]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleOpen = () => {
    setOpen((o) => !o);
  };

  const handleAlertClick = (alert: Alert) => {
    markOneRead(alert.id);
    setOpen(false);
    navigate(alertHref(alert));
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="ghost"
        size="icon"
        className="relative h-8 w-8"
        onClick={handleOpen}
        aria-label={t("notifications.pageTitle")}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-80 rounded-xl border border-border bg-background shadow-lg">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">{t("notifBell.adminAlerts")}</span>
              {unreadCount > 0 && (
                <Badge variant="destructive" className="text-[10px] h-4 px-1.5">
                  {t("notifBell.newAlerts", { count: unreadCount })}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[11px] px-2 text-muted-foreground"
                  onClick={markAllRead}
                >
                  <CheckCheck className="h-3 w-3 me-1" />
                  {t("notifBell.markRead")}
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setOpen(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Alert list */}
          <div className="max-h-80 overflow-y-auto divide-y divide-border">
            {alerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <Bell className="h-8 w-8 mb-2 opacity-20" />
                <p className="text-xs">{t("notifBell.noActiveAlerts")}</p>
              </div>
            ) : (
              alerts.map((alert) => {
                const isUnread = !seenIds.has(alert.id);
                return (
                  <div
                    key={alert.id}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-muted/50",
                      isUnread && "bg-primary/5",
                    )}
                    onClick={() => handleAlertClick(alert)}
                  >
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
                      {alertIcon(alert.type)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-1">
                        <p className={cn("text-xs font-medium leading-snug", isUnread && "text-foreground font-semibold")}>
                          {alert.title}
                        </p>
                        {isUnread && (
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        )}
                      </div>
                      <p className={cn("text-[11px] text-muted-foreground mt-0.5", alert.priority && priorityColor(alert.priority))}>
                        {alert.subtitle}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border px-4 py-2.5 flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground">
              {alerts.length} · {t("notifBell.refreshesEvery")}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[11px] px-2"
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ["admin-alerts-summary"] });
              }}
            >
              {t("notifBell.refresh")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
