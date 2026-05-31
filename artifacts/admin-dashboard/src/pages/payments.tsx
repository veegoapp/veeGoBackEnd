import React, { useState } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  Wallet, ArrowUpRight, Percent, DollarSign, Users, Star,
  TrendingUp, ArrowDownLeft, ArrowUpRight as ArrowUp, RefreshCw,
  CheckCircle2, Clock, Ban, ChevronDown, ChevronUp, CreditCard, Eye,
} from "lucide-react";
import { formatEGP } from "@/lib/currency";

type Transaction = {
  id: number;
  userId: number;
  amount: number;
  type: "deposit" | "payment" | "refund";
  description: string;
  createdAt: string;
  user: {
    id: number;
    name: string;
    email: string;
    phone: string;
    role: string;
    walletBalance: string;
  } | null;
};

type DriverAnalytics = {
  totalDrivers: number;
  onlineDrivers: number;
  busyDrivers: number;
  suspendedDrivers: number;
  totalEarningsPaid: number;
  totalTripsCompleted: number;
  topEarners: { id: number; name: string; rating: number; total_earnings: number; trip_count: number }[];
  recentEarnings: { id: number; driverId: number; tripId: number; amount: number; status: string; date: string }[];
};

type DriverPayout = {
  driver_id: number;
  driver_name: string;
  driver_phone: string;
  rating: number;
  total_trips: number;
  gross_amount: number;
  commission_amount: number;
  driver_share: number;
  payout_status: "paid" | "pending" | "no_earnings";
  last_earning_date: string | null;
};

function txTypeColor(type: string) {
  if (type === "deposit")  return "text-green-600 bg-green-50 border-green-200 dark:bg-green-950";
  if (type === "refund")   return "text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-950";
  return "text-red-500 bg-red-50 border-red-200 dark:bg-red-950";
}

function txIcon(type: string) {
  if (type === "deposit") return <ArrowDownLeft className="h-4 w-4 text-green-600" />;
  if (type === "refund")  return <RefreshCw className="h-4 w-4 text-blue-600" />;
  return <ArrowUp className="h-4 w-4 text-red-500" />;
}

function WalletsView() {
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: ["admin-wallet-transactions", page],
    queryFn: () => adminFetch<{ data: Transaction[]; total: number; page: number; limit: number }>(
      `/admin/wallet/transactions?page=${page}&limit=${limit}`
    ),
  });

  const transactions = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  const totalDeposits = transactions.filter((t) => t.type === "deposit").reduce((s, t) => s + t.amount, 0);
  const totalPayments = transactions.filter((t) => t.type === "payment").reduce((s, t) => s + t.amount, 0);
  const totalRefunds  = transactions.filter((t) => t.type === "refund").reduce((s, t) => s + t.amount, 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-xl bg-blue-500/10">
          <Wallet className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Wallets</h1>
          <p className="text-sm text-muted-foreground">All passenger wallet transactions across the platform</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
        ) : [
          { label: "Deposits (this page)",  value: `$${totalDeposits.toFixed(2)}`,  icon: ArrowDownLeft, color: "bg-green-500/10 text-green-600" },
          { label: "Payments (this page)",  value: `$${totalPayments.toFixed(2)}`,  icon: ArrowUp,        color: "bg-red-500/10 text-red-500" },
          { label: "Refunds (this page)",   value: `$${totalRefunds.toFixed(2)}`,   icon: RefreshCw,      color: "bg-blue-500/10 text-blue-600" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-5 flex items-center gap-3">
              <div className={`p-2.5 rounded-lg ${s.color}`}>
                <s.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transaction History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : transactions.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">No transactions found</div>
          ) : (
            <div className="divide-y divide-border">
              {transactions.map((tx) => (
                <div key={tx.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="p-2 rounded-full bg-muted shrink-0">{txIcon(tx.type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{tx.user?.name ?? `User #${tx.userId}`}</p>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${txTypeColor(tx.type)}`}>
                        {tx.type}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{tx.description || "—"}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-semibold ${tx.type === "deposit" || tx.type === "refund" ? "text-green-600" : "text-red-500"}`}>
                      {tx.type === "deposit" || tx.type === "refund" ? "+" : "-"}${Math.abs(tx.amount).toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground">{format(new Date(tx.createdAt), "MMM d, HH:mm")}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious onClick={() => setPage((p) => Math.max(1, p - 1))} className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"} />
            </PaginationItem>
            <PaginationItem className="text-sm text-muted-foreground px-4">
              Page {page} of {totalPages}
            </PaginationItem>
            <PaginationItem>
              <PaginationNext onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className={page >= totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"} />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}

function PayoutsView() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [sortField, setSortField] = useState<keyof DriverPayout>("gross_amount");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-payouts"],
    queryFn: () => adminFetch<{ data: DriverPayout[]; total: number }>("/admin/payouts"),
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

  const sorted = [...rows]
    .filter((r) => filterStatus === "all" || r.payout_status === filterStatus)
    .sort((a, b) => {
      const av = a[sortField] as number | string | null;
      const bv = b[sortField] as number | string | null;
      const cmp = (av ?? 0) < (bv ?? 0) ? -1 : (av ?? 0) > (bv ?? 0) ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });

  function toggleSort(field: keyof DriverPayout) {
    if (sortField === field) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  }

  function SortIcon({ field }: { field: keyof DriverPayout }) {
    if (sortField !== field) return null;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3 ml-1 inline" /> : <ChevronDown className="h-3 w-3 ml-1 inline" />;
  }

  const totalGross = rows.reduce((s, r) => s + r.gross_amount, 0);
  const totalDriverShare = rows.reduce((s, r) => s + r.driver_share, 0);
  const totalCommission = rows.reduce((s, r) => s + r.commission_amount, 0);
  const pendingDrivers = rows.filter((r) => r.payout_status === "pending").length;

  const statusIcon = (s: string) =>
    s === "paid"        ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
    : s === "pending"   ? <Clock className="h-3.5 w-3.5 text-amber-600" />
    : <Ban className="h-3.5 w-3.5 text-muted-foreground" />;

  const statusColor = (s: string) =>
    s === "paid"        ? "text-green-600 border-green-200 bg-green-50 dark:bg-green-950"
    : s === "pending"   ? "text-amber-600 border-amber-200 bg-amber-50 dark:bg-amber-950"
    : "text-muted-foreground border-border";

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
          { label: "Gross Revenue",     value: `$${totalGross.toFixed(2)}`,        icon: DollarSign,  color: "bg-primary/10 text-primary" },
          { label: "Driver Payouts",    value: `$${totalDriverShare.toFixed(2)}`,  icon: TrendingUp,  color: "bg-green-500/10 text-green-600" },
          { label: "App Commission",    value: `$${totalCommission.toFixed(2)}`,   icon: Percent,     color: "bg-amber-500/10 text-amber-600" },
          { label: "Pending Payouts",   value: pendingDrivers,                      icon: Clock,       color: "bg-orange-500/10 text-orange-600" },
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
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Driver Earnings Table</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Filter:</span>
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
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : sorted.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">No drivers found</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Driver</th>
                      <th
                        className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs cursor-pointer hover:text-foreground"
                        onClick={() => toggleSort("total_trips")}
                      >
                        Trips<SortIcon field="total_trips" />
                      </th>
                      <th
                        className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs cursor-pointer hover:text-foreground"
                        onClick={() => toggleSort("gross_amount")}
                      >
                        Gross<SortIcon field="gross_amount" />
                      </th>
                      <th
                        className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs cursor-pointer hover:text-foreground"
                        onClick={() => toggleSort("commission_amount")}
                      >
                        Commission<SortIcon field="commission_amount" />
                      </th>
                      <th
                        className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs cursor-pointer hover:text-foreground"
                        onClick={() => toggleSort("driver_share")}
                      >
                        Driver Share<SortIcon field="driver_share" />
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
                        <td className="px-4 py-3 text-right font-medium">{row.total_trips}</td>
                        <td className="px-4 py-3 text-right font-medium">${row.gross_amount.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right text-amber-600 font-medium">${row.commission_amount.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right text-green-600 font-bold">${row.driver_share.toFixed(2)}</td>
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
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Confirm
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
              <div className="px-4 py-3 border-t border-border bg-muted/20 flex items-center justify-between text-xs text-muted-foreground">
                <span>{sorted.length} drivers</span>
                <div className="flex gap-4">
                  <span>Total gross: <strong className="text-foreground">${sorted.reduce((s, r) => s + r.gross_amount, 0).toFixed(2)}</strong></span>
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

type CommissionSettings = {
  appCommission: number;
  driverShare: number;
  payoutSchedule: "daily" | "weekly" | "monthly";
  minimumPayout: number;
};

function CommissionView() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<CommissionSettings | null>(null);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["commission-settings"],
    queryFn: () => adminFetch<CommissionSettings>("/admin/settings/commission"),
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ["admin-driver-analytics"],
    queryFn: () => adminFetch<DriverAnalytics>("/admin/driver-analytics"),
  });

  const saveMutation = useMutation({
    mutationFn: (body: Partial<CommissionSettings>) =>
      adminFetch<CommissionSettings>("/admin/settings/commission", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["commission-settings"], updated);
      toast({ title: "Commission settings saved" });
      setEditing(false);
    },
    onError: (err: Error) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const startEdit = () => {
    if (settings) setForm({ ...settings });
    setEditing(true);
  };

  const recentEarnings = analytics?.recentEarnings ?? [];
  const totalCommission = recentEarnings.reduce(
    (s, e) => s + e.amount * ((settings?.appCommission ?? 15) / 100),
    0
  );

  const current = settings;

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-amber-500/10">
            <Percent className="h-6 w-6 text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Commission Settings</h1>
            <p className="text-sm text-muted-foreground">Configure platform commission rates and payout schedule</p>
          </div>
        </div>
        {!editing && (
          <Button variant="outline" size="sm" onClick={startEdit} disabled={isLoading}>
            <RefreshCw className="h-4 w-4 mr-2" /> Edit Settings
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Percent className="h-4 w-4" /> Rate Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : editing && form ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">App Commission (%)</label>
                  <input
                    type="number" min={0} max={100} step={0.1}
                    value={form.appCommission}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setForm((f) => f ? { ...f, appCommission: v, driverShare: parseFloat((100 - v).toFixed(1)) } : f);
                    }}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Platform's cut per trip</p>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Driver Share (%)</label>
                  <input
                    type="number" min={0} max={100} step={0.1}
                    value={form.driverShare}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setForm((f) => f ? { ...f, driverShare: v, appCommission: parseFloat((100 - v).toFixed(1)) } : f);
                    }}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Driver's cut per trip</p>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Payout Schedule</label>
                  <select
                    value={form.payoutSchedule}
                    onChange={(e) => setForm((f) => f ? { ...f, payoutSchedule: e.target.value as CommissionSettings["payoutSchedule"] } : f)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Minimum Payout (EGP)</label>
                  <input
                    type="number" min={0} step={1}
                    value={form.minimumPayout}
                    onChange={(e) => setForm((f) => f ? { ...f, minimumPayout: parseFloat(e.target.value) } : f)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Minimum balance before payout</p>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setEditing(false)}>Cancel</Button>
                <Button
                  className="flex-1"
                  disabled={saveMutation.isPending}
                  onClick={() => form && saveMutation.mutate(form)}
                >
                  Save Changes
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "App Commission", value: `${current?.appCommission ?? 15}%`, sub: "Platform cut per trip", color: "bg-amber-500/10" },
                { label: "Driver Share", value: `${current?.driverShare ?? 85}%`, sub: "Driver earnings per trip", color: "bg-green-500/10" },
                { label: "Payout Schedule", value: (current?.payoutSchedule ?? "weekly").charAt(0).toUpperCase() + (current?.payoutSchedule ?? "weekly").slice(1), sub: "How often drivers are paid", color: "bg-blue-500/10" },
                { label: "Min. Payout", value: `EGP ${current?.minimumPayout ?? 100}`, sub: "Threshold to trigger payout", color: "bg-purple-500/10" },
              ].map((item) => (
                <div key={item.label} className={`rounded-xl p-4 ${item.color}`}>
                  <p className="text-2xl font-black">{item.value}</p>
                  <p className="text-sm font-semibold mt-1">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.sub}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {analyticsLoading ? (
          Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
        ) : [
          { label: "Est. Platform Revenue (recent)", value: `EGP ${totalCommission.toFixed(2)}`, icon: DollarSign, color: "bg-amber-500/10 text-amber-600" },
          { label: "Total Driver Earnings Paid", value: `EGP ${(analytics?.totalEarningsPaid ?? 0).toFixed(2)}`, icon: TrendingUp, color: "bg-green-500/10 text-green-600" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-5 flex items-center gap-3">
              <div className={`p-2.5 rounded-lg ${s.color}`}>
                <s.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent Commission Deductions</CardTitle></CardHeader>
        <CardContent className="p-0">
          {analyticsLoading ? (
            <div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : recentEarnings.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">No earnings data available</div>
          ) : (
            <div className="divide-y divide-border">
              {recentEarnings.map((earning) => (
                <div key={earning.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Trip #{earning.tripId} · Driver #{earning.driverId}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(earning.date), "MMM d, yyyy HH:mm")}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Driver: EGP {earning.amount.toFixed(2)}</p>
                    <p className="text-xs font-bold text-amber-600">
                      Platform: EGP {(earning.amount * ((settings?.appCommission ?? 15) / 100)).toFixed(2)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Payment Ledger (paymentsTable) ──────────────────────────────────────────

type PaymentRecord = {
  id: number;
  userId: number;
  bookingId: number | null;
  rideId: number | null;
  amount: string;
  method: "wallet" | "cash" | "card";
  status: "pending" | "completed" | "failed" | "refunded";
  transactionRef: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  userName: string | null;
  userEmail: string | null;
  userPhone: string | null;
};

type PaymentSummary = {
  total: number;
  totalAmount: number;
  completedCount: number;
  completedAmount: number;
  refundedCount: number;
  refundedAmount: number;
  pendingCount: number;
  failedCount: number;
  walletCount: number;
  cashCount: number;
  cardCount: number;
};

function statusColor(s: string) {
  if (s === "completed") return "text-green-600 border-green-200 bg-green-50 dark:bg-green-950";
  if (s === "refunded")  return "text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-950";
  if (s === "failed")    return "text-red-600 border-red-200 bg-red-50 dark:bg-red-950";
  return "text-amber-600 border-amber-200 bg-amber-50 dark:bg-amber-950";
}

function methodIcon(m: string) {
  if (m === "card")   return <CreditCard className="h-3.5 w-3.5" />;
  if (m === "wallet") return <Wallet className="h-3.5 w-3.5" />;
  return <DollarSign className="h-3.5 w-3.5" />;
}

function PaymentLedgerView() {
  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterMethod, setFilterMethod] = useState<string>("all");
  const [selected, setSelected] = useState<PaymentRecord | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const LIMIT = 25;

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", String(LIMIT));
  if (filterStatus !== "all") params.set("status", filterStatus);
  if (filterMethod !== "all") params.set("method", filterMethod);

  const { data, isLoading } = useQuery<{ data: PaymentRecord[]; total: number; page: number; limit: number }>({
    queryKey: ["admin-payments", page, filterStatus, filterMethod],
    queryFn: () => adminFetch(`/admin/payments?${params.toString()}`),
  });

  const { data: summary } = useQuery<PaymentSummary>({
    queryKey: ["admin-payments-summary"],
    queryFn: () => adminFetch("/admin/payments/summary"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      adminFetch(`/admin/payments/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-payments"] });
      queryClient.invalidateQueries({ queryKey: ["admin-payments-summary"] });
      setSelected(null);
      toast({ title: "Payment status updated" });
    },
    onError: (err: Error) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const rows = data?.data ?? [];
  const totalPages = data ? Math.ceil(data.total / LIMIT) : 1;

  const handleFilterChange = (key: string, val: string) => {
    setPage(1);
    if (key === "status") setFilterStatus(val);
    if (key === "method") setFilterMethod(val);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-xl bg-purple-500/10">
          <CreditCard className="h-6 w-6 text-purple-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Payment Ledger</h1>
          <p className="text-sm text-muted-foreground">Authoritative record of all payment transactions (bookings + rides)</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {!summary ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
        ) : [
          { label: "Total Payments",   value: summary.total,                           sub: "all records",       color: "bg-primary/10 text-primary" },
          { label: "Completed",        value: formatEGP(summary.completedAmount),       sub: `${summary.completedCount} transactions`, color: "bg-green-500/10 text-green-600" },
          { label: "Refunded",         value: formatEGP(summary.refundedAmount),        sub: `${summary.refundedCount} refunds`,       color: "bg-blue-500/10 text-blue-600" },
          { label: "Pending / Failed", value: summary.pendingCount + summary.failedCount, sub: "require attention", color: "bg-amber-500/10 text-amber-600" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-5 flex items-center gap-3">
              <div className={`p-2.5 rounded-lg ${s.color}`}>
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-[10px] text-muted-foreground">{s.sub}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <Select value={filterStatus} onValueChange={(v) => handleFilterChange("status", v)}>
          <SelectTrigger className="w-40 h-9 text-sm"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="refunded">Refunded</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterMethod} onValueChange={(v) => handleFilterChange("method", v)}>
          <SelectTrigger className="w-36 h-9 text-sm"><SelectValue placeholder="All methods" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All methods</SelectItem>
            <SelectItem value="wallet">Wallet</SelectItem>
            <SelectItem value="cash">Cash</SelectItem>
            <SelectItem value="card">Card</SelectItem>
          </SelectContent>
        </Select>
        {(filterStatus !== "all" || filterMethod !== "all") && (
          <Button size="sm" variant="ghost" className="h-9" onClick={() => { setFilterStatus("all"); setFilterMethod("all"); setPage(1); }}>
            Clear
          </Button>
        )}
        {data && (
          <span className="text-xs text-muted-foreground ml-auto">{data.total} records</span>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : !rows.length ? (
            <div className="py-12 text-center text-muted-foreground text-sm">No payment records found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-sm">#{p.id}</TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">{p.userName ?? `User #${p.userId}`}</p>
                        <p className="text-[10px] text-muted-foreground">{p.userEmail ?? ""}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {p.bookingId ? `Booking #${p.bookingId}` : p.rideId ? `Ride #${p.rideId}` : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize text-[10px] gap-1">
                        {methodIcon(p.method)}{p.method}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`capitalize text-[10px] ${statusColor(p.status)}`}>
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className={`text-right font-bold text-sm ${p.status === "refunded" ? "text-blue-600" : p.status === "completed" ? "text-green-600" : ""}`}>
                      {p.status === "refunded" ? "-" : ""}{formatEGP(parseFloat(p.amount))}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(p.createdAt), "dd MMM, HH:mm")}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setSelected(p)}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
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
            <PaginationItem className="text-sm text-muted-foreground px-4">Page {page} of {totalPages}</PaginationItem>
            <PaginationItem>
              <PaginationNext onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className={page >= totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"} />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      {/* Detail dialog */}
      {selected && (
        <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><CreditCard className="h-4 w-4" /> Payment #{selected.id}</DialogTitle></DialogHeader>
            <div className="space-y-3 text-sm">
              {[
                { label: "User",           value: selected.userName ?? `User #${selected.userId}` },
                { label: "Email",          value: selected.userEmail ?? "—" },
                { label: "Reference",      value: selected.bookingId ? `Booking #${selected.bookingId}` : selected.rideId ? `Ride #${selected.rideId}` : "—" },
                { label: "Method",         value: <Badge variant="outline" className="capitalize text-[10px]">{selected.method}</Badge> },
                { label: "Status",         value: <Badge variant="outline" className={`capitalize text-[10px] ${statusColor(selected.status)}`}>{selected.status}</Badge> },
                { label: "Amount",         value: <span className="font-bold">{formatEGP(parseFloat(selected.amount))}</span> },
                { label: "Transaction Ref",value: selected.transactionRef ?? "—" },
                { label: "Notes",          value: selected.notes ?? "—" },
                { label: "Created",        value: format(new Date(selected.createdAt), "dd MMM yyyy, HH:mm:ss") },
                { label: "Updated",        value: format(new Date(selected.updatedAt), "dd MMM yyyy, HH:mm:ss") },
              ].map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-4 py-1 border-b border-border last:border-0">
                  <span className="text-muted-foreground text-xs w-32 shrink-0">{row.label}</span>
                  <span className="text-xs text-right">{row.value}</span>
                </div>
              ))}
            </div>
            {selected.status === "pending" && (
              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="destructive" className="flex-1" disabled={updateMutation.isPending}
                  onClick={() => updateMutation.mutate({ id: selected.id, status: "failed" })}>
                  Mark Failed
                </Button>
                <Button size="sm" className="flex-1" disabled={updateMutation.isPending}
                  onClick={() => updateMutation.mutate({ id: selected.id, status: "completed" })}>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Mark Completed
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export default function Payments() {
  const [, params] = useRoute("/payments/:section");
  const [section, setSection] = useState(params?.section ?? "ledger");

  const TABS = [
    { key: "ledger",     label: "Payment Ledger" },
    { key: "wallets",    label: "Wallets" },
    { key: "payouts",    label: "Driver Payouts" },
    { key: "commission", label: "Commission" },
  ];

  return (
    <div>
      <div className="border-b border-border px-6 pt-4 flex gap-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSection(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              section === tab.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {section === "ledger"     && <PaymentLedgerView />}
      {section === "wallets"    && <WalletsView />}
      {section === "payouts"    && <PayoutsView />}
      {section === "commission" && <CommissionView />}
    </div>
  );
}
