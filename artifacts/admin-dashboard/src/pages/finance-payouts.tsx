import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  ArrowUpRight, Percent, DollarSign, Star, TrendingUp,
  CheckCircle2, Clock, Ban, ChevronDown, ChevronUp,
} from "lucide-react";

type DriverPayout = {
  driver_id: number;
  driver_name: string;
  driver_phone: string;
  service_type?: string;
  rating: number;
  total_trips: number;
  gross_amount: number;
  commission_amount: number;
  driver_share: number;
  payout_status: "paid" | "pending" | "no_earnings";
  last_earning_date: string | null;
};

const SERVICE_TYPE_OPTIONS = [
  { value: "all",      label: "All Services" },
  { value: "car",      label: "Car" },
  { value: "scooter",  label: "Scooter" },
  { value: "delivery", label: "Delivery" },
  { value: "shuttle",  label: "Shuttle" },
];

const statusIcon = (s: string) =>
  s === "paid"      ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
  : s === "pending" ? <Clock className="h-3.5 w-3.5 text-amber-600" />
  : <Ban className="h-3.5 w-3.5 text-muted-foreground" />;

const statusColor = (s: string) =>
  s === "paid"      ? "text-green-600 border-green-200 bg-green-50 dark:bg-green-950"
  : s === "pending" ? "text-amber-600 border-amber-200 bg-amber-50 dark:bg-amber-950"
  : "text-muted-foreground border-border";

function SortIcon({ field, sortField, sortDir }: { field: string; sortField: string; sortDir: string }) {
  if (sortField !== field) return null;
  return sortDir === "asc"
    ? <ChevronDown className="h-3 w-3 ml-1 inline" />
    : <ChevronUp className="h-3 w-3 ml-1 inline" />;
}

export default function FinancePayouts() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [sortField, setSortField] = useState<keyof DriverPayout>("gross_amount");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterService, setFilterService] = useState<string>("all");

  const params = new URLSearchParams();
  if (filterService !== "all") params.set("serviceType", filterService);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-payouts", filterService],
    queryFn: () =>
      adminFetch<{ data: DriverPayout[]; total: number }>(
        `/admin/payouts${filterService !== "all" ? `?${params.toString()}` : ""}`
      ),
  });

  const confirmMutation = useMutation({
    mutationFn: (driverId: number) =>
      adminFetch<{ success: boolean; updated: number }>(`/admin/payouts/${driverId}/confirm`, { method: "PATCH" }),
    onSuccess: (result, driverId) => {
      queryClient.invalidateQueries({ queryKey: ["admin-payouts"] });
      toast({ title: `Payment confirmed — ${result.updated} earning(s) marked as paid for Driver #${driverId}` });
    },
    onError: (err: Error) => toast({ title: "Failed to confirm", description: err.message, variant: "destructive" }),
  });

  const rows = data?.data ?? [];

  const filtered = rows.filter((r) => {
    const statusOk = filterStatus === "all" || r.payout_status === filterStatus;
    const serviceOk = filterService === "all" || !r.service_type || r.service_type === filterService;
    return statusOk && serviceOk;
  });

  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortField] as number | string | null;
    const bv = b[sortField] as number | string | null;
    const cmp = (av ?? 0) < (bv ?? 0) ? -1 : (av ?? 0) > (bv ?? 0) ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  });

  function toggleSort(field: keyof DriverPayout) {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("desc"); }
  }

  const totalGross        = rows.reduce((s, r) => s + r.gross_amount, 0);
  const totalDriverShare  = rows.reduce((s, r) => s + r.driver_share, 0);
  const totalCommission   = rows.reduce((s, r) => s + r.commission_amount, 0);
  const pendingDrivers    = rows.filter((r) => r.payout_status === "pending").length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-xl bg-green-500/10">
          <ArrowUpRight className="h-6 w-6 text-green-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Driver Payouts</h1>
          <p className="text-sm text-muted-foreground">Per-driver earnings breakdown with commission split and payout status</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
        ) : [
          { label: "Total Platform Revenue", value: `$${totalGross.toFixed(2)}`,       icon: DollarSign, color: "bg-primary/10 text-primary" },
          { label: "Total Driver Earnings",  value: `$${totalDriverShare.toFixed(2)}`, icon: TrendingUp,  color: "bg-green-500/10 text-green-600" },
          { label: "App Commission",         value: `$${totalCommission.toFixed(2)}`,  icon: Percent,     color: "bg-amber-500/10 text-amber-600" },
          { label: "Pending Payouts",        value: pendingDrivers,                     icon: Clock,       color: "bg-orange-500/10 text-orange-600" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-5 flex items-center gap-3">
              <div className={`p-2.5 rounded-lg ${s.color}`}><s.icon className="h-5 w-5" /></div>
              <div>
                <p className="text-xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3 flex-wrap gap-3">
          <CardTitle className="text-base">Driver Earnings Table</CardTitle>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Service:</span>
              <Select value={filterService} onValueChange={setFilterService}>
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Status:</span>
              {["all", "pending", "paid", "no_earnings"].map((s) => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    filterStatus === s
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {s === "no_earnings" ? "No Earnings" : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : sorted.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">No drivers found</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Driver</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Service</th>
                      <th
                        className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs cursor-pointer hover:text-foreground"
                        onClick={() => toggleSort("total_trips")}
                      >
                        Trips <SortIcon field="total_trips" sortField={String(sortField)} sortDir={sortDir} />
                      </th>
                      <th
                        className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs cursor-pointer hover:text-foreground"
                        onClick={() => toggleSort("driver_share")}
                      >
                        Total Balance <SortIcon field="driver_share" sortField={String(sortField)} sortDir={sortDir} />
                      </th>
                      <th
                        className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs cursor-pointer hover:text-foreground"
                        onClick={() => toggleSort("commission_amount")}
                      >
                        Commission <SortIcon field="commission_amount" sortField={String(sortField)} sortDir={sortDir} />
                      </th>
                      <th className="text-center px-4 py-2.5 font-medium text-muted-foreground text-xs">Status</th>
                      <th className="text-center px-4 py-2.5 font-medium text-muted-foreground text-xs">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {sorted.map((row) => (
                      <tr key={row.driver_id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <span className="text-xs font-bold text-primary">{row.driver_name.charAt(0)}</span>
                            </div>
                            <div>
                              <p className="font-medium leading-tight">{row.driver_name}</p>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                                {(row.rating ?? 0).toFixed(1)}
                                {row.last_earning_date && (
                                  <span className="ml-1">· Last: {format(new Date(row.last_earning_date), "MMM d")}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {row.service_type ? (
                            <Badge variant="outline" className="text-xs capitalize">{row.service_type}</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">{row.total_trips}</td>
                        <td className="px-4 py-3 text-right text-green-600 font-bold">${row.driver_share.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right text-amber-600 font-medium">${row.commission_amount.toFixed(2)}</td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant="outline" className={`text-xs gap-1 ${statusColor(row.payout_status)}`}>
                            {statusIcon(row.payout_status)}
                            {row.payout_status === "no_earnings" ? "No Earnings" : row.payout_status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {row.payout_status === "pending" ? (
                            <Button
                              size="sm"
                              className="h-7 text-xs"
                              disabled={confirmMutation.isPending}
                              onClick={() => confirmMutation.mutate(row.driver_id)}
                            >
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Confirm Payout
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3 border-t border-border bg-muted/20 flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-2">
                <span>{sorted.length} driver{sorted.length !== 1 ? "s" : ""}</span>
                <div className="flex gap-4 flex-wrap">
                  <span>Gross: <strong className="text-foreground">${sorted.reduce((s, r) => s + r.gross_amount, 0).toFixed(2)}</strong></span>
                  <span>Driver share: <strong className="text-green-600">${sorted.reduce((s, r) => s + r.driver_share, 0).toFixed(2)}</strong></span>
                  <span>Commission: <strong className="text-amber-600">${sorted.reduce((s, r) => s + r.commission_amount, 0).toFixed(2)}</strong></span>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
