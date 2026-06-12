import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Percent, DollarSign, TrendingUp, RefreshCw } from "lucide-react";
import { format } from "date-fns";

type CommissionSettings = {
  appCommission: number;
  driverShare: number;
  payoutSchedule: "daily" | "weekly" | "monthly";
  minimumPayout: number;
};

type DriverAnalytics = {
  totalEarningsPaid: number;
  recentEarnings: { id: number; driverId: number; tripId: number; amount: number; status: string; date: string }[];
};

export default function FinanceCommission() {
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
            <h1 className="text-2xl font-bold">Commission Rates</h1>
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
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : editing && form ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">App Commission (%)</label>
                  <input
                    type="number" min={0} max={100} step={0.1}
                    value={form.appCommission}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setForm((f) => f ? { ...f, appCommission: v, driverShare: parseFloat((100 - v).toFixed(1)) } : f);
                    }}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Driver's cut per trip</p>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Payout Schedule</label>
                  <select
                    value={form.payoutSchedule}
                    onChange={(e) => setForm((f) => f ? { ...f, payoutSchedule: e.target.value as CommissionSettings["payoutSchedule"] } : f)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                  {saveMutation.isPending ? "Saving…" : "Save Changes"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: "App Commission",  value: `${current?.appCommission ?? 15}%`,        sub: "Platform cut per trip",      color: "bg-amber-500/10" },
                { label: "Driver Share",    value: `${current?.driverShare ?? 85}%`,           sub: "Driver earnings per trip",   color: "bg-green-500/10" },
                { label: "Payout Schedule", value: (current?.payoutSchedule ?? "weekly").charAt(0).toUpperCase() + (current?.payoutSchedule ?? "weekly").slice(1), sub: "How often drivers are paid", color: "bg-blue-500/10" },
                { label: "Min. Payout",     value: `EGP ${current?.minimumPayout ?? 100}`,    sub: "Threshold to trigger payout", color: "bg-purple-500/10" },
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
          { label: "Est. Platform Revenue (recent)", value: `EGP ${totalCommission.toFixed(2)}`,                      icon: DollarSign, color: "bg-amber-500/10 text-amber-600" },
          { label: "Total Driver Earnings Paid",      value: `EGP ${(analytics?.totalEarningsPaid ?? 0).toFixed(2)}`, icon: TrendingUp,  color: "bg-green-500/10 text-green-600" },
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

      {recentEarnings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Commission Deductions</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
