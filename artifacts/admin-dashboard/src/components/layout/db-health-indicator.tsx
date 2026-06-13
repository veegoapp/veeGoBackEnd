import { useEffect, useState } from "react";
import { Database, Wifi, WifiOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useTranslation } from "react-i18next";

interface DbHealth {
  status: "ok" | "error";
  database: "connected" | "disconnected";
  provider: string;
  isNeon: boolean;
  latencyMs?: number;
  error?: string;
  timestamp: string;
}

type CheckState = "loading" | "ok" | "error";

const POLL_INTERVAL_MS = 30_000;

export function DbHealthIndicator({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation();
  const [health, setHealth] = useState<DbHealth | null>(null);
  const [state, setState] = useState<CheckState>("loading");

  async function check() {
    try {
      const res = await fetch("/api/health/db");
      const data: DbHealth = await res.json();
      setHealth(data);
      setState(data.status === "ok" ? "ok" : "error");
    } catch {
      setState("error");
      setHealth(null);
    }
  }

  useEffect(() => {
    check();
    const id = setInterval(check, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const dot = (
    <span
      className={cn(
        "inline-block h-2 w-2 rounded-full shrink-0",
        state === "loading" && "bg-amber-400 animate-pulse",
        state === "ok" && "bg-emerald-500",
        state === "error" && "bg-red-500 animate-pulse",
      )}
    />
  );

  const Icon = state === "loading"
    ? Loader2
    : state === "ok"
      ? Wifi
      : WifiOff;

  const providerLabel = health?.provider ?? t("common.database", "Database");
  const latencyLabel = health?.latencyMs != null ? ` · ${health.latencyMs}ms` : "";
  const tooltipText =
    state === "loading"
      ? t("dbHealth.checking")
      : state === "ok"
        ? `${providerLabel}${latencyLabel} · ${t("dbHealth.connected")}`
        : `${providerLabel} · ${health?.error ?? t("dbHealth.disconnected")}`;

  if (collapsed) {
    return (
      <TooltipProvider>
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <div className="flex items-center justify-center py-1 cursor-default">
              <div className="relative">
                <Database className="h-4 w-4 text-slate-400" />
                <span className={cn(
                  "absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full border border-white dark:border-slate-900",
                  state === "loading" && "bg-amber-400 animate-pulse",
                  state === "ok" && "bg-emerald-500",
                  state === "error" && "bg-red-500 animate-pulse",
                )} />
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs max-w-[200px]">
            {tooltipText}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-default select-none hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <Database className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide truncate">
                {t("common.database", "Database")}
              </p>
              <p className="text-[11px] text-slate-700 dark:text-slate-300 truncate font-medium">
                {state === "loading" ? t("dbHealth.checking") : providerLabel}
              </p>
            </div>
            {dot}
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs max-w-[220px]">
          {tooltipText}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
