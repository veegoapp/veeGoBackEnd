import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, CheckCircle, RefreshCw, Wallet } from "lucide-react";

interface CashDebtRow {
  userId: number;
  name: string;
  phone: string;
  debtAmount: number;
  numberOfOffences: number;
  lastOffenceDate: string | null;
}

interface CashDebtsResponse {
  data: CashDebtRow[];
  total: number;
}

function formatEGP(amount: number): string {
  return `${Math.abs(amount).toFixed(2)} EGP`;
}

export default function ShuttleCashDebts() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [collectingId, setCollectingId] = useState<number | null>(null);

  const { data, isLoading, isError, refetch } = useQuery<CashDebtsResponse>({
    queryKey: ["shuttle-cash-debts"],
    queryFn:  () => adminFetch<CashDebtsResponse>("/admin/shuttle/cash-debts"),
  });

  const collectMutation = useMutation({
    mutationFn: (userId: number) =>
      adminFetch(`/admin/shuttle/cash-debts/${userId}/collect`, { method: "PATCH" }),
    onSuccess: (_data, userId) => {
      toast({ title: "Debt collected", description: `Balance reset to 0 for user #${userId}` });
      setCollectingId(null);
      void queryClient.invalidateQueries({ queryKey: ["shuttle-cash-debts"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setCollectingId(null);
    },
  });

  const handleCollect = (userId: number) => {
    setCollectingId(userId);
    collectMutation.mutate(userId);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cash Debts</h1>
          <p className="text-muted-foreground mt-1">
            Passengers with a negative wallet balance from shuttle no-show fines.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          <RefreshCw className="h-4 w-4 me-2" />
          Refresh
        </Button>
      </div>

      {/* Summary card */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Total Debtors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data?.total ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Wallet className="h-4 w-4 text-amber-500" />
              Total Outstanding
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">
              {data
                ? formatEGP(data.data.reduce((sum, r) => sum + r.debtAmount, 0))
                : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : isError ? (
            <div className="p-8 text-center text-red-500">
              Failed to load cash debts. Please refresh.
            </div>
          ) : !data?.data.length ? (
            <div className="p-12 text-center">
              <CheckCircle className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
              <p className="text-muted-foreground">No passengers with outstanding cash debts.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Passenger</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Debt Amount</TableHead>
                  <TableHead>No-Show Count</TableHead>
                  <TableHead>Last Offence</TableHead>
                  <TableHead className="text-end">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((row) => (
                  <TableRow key={row.userId}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-muted-foreground">{row.phone}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="border-red-200 bg-red-50 text-red-700 font-mono"
                      >
                        −{formatEGP(row.debtAmount)}
                      </Badge>
                    </TableCell>
                    <TableCell>{row.numberOfOffences}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {row.lastOffenceDate
                        ? new Date(row.lastOffenceDate).toLocaleString()
                        : "—"}
                    </TableCell>
                    <TableCell className="text-end">
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                        disabled={collectingId === row.userId}
                        onClick={() => handleCollect(row.userId)}
                      >
                        {collectingId === row.userId ? "Saving…" : "Mark Collected"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
