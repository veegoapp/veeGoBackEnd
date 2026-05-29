import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAdminRefund, getListAllTransactionsQueryKey } from "@workspace/api-client-react";
import { adminFetch } from "@/lib/api";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Wallet as WalletIcon, ArrowDownRight, ArrowUpRight, Filter, RefreshCcw, Search, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { formatEGP } from "@/lib/currency";
import { useTranslation } from "react-i18next";

type Txn = {
  id: number;
  userId: number;
  amount: number;
  type: "deposit" | "payment" | "refund";
  description: string;
  createdAt: string;
  user: { name: string; email: string } | null;
};

const refundSchema = z.object({
  userId: z.coerce.number().min(1, "User ID is required"),
  amount: z.coerce.number().min(0.01, "Amount must be greater than 0"),
  description: z.string().min(1, "Reason for refund is required"),
});

type RefundFormValues = z.infer<typeof refundSchema>;

export default function Wallet() {
  const [page, setPage] = useState(1);
  const [userIdFilter, setUserIdFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [isRefundOpen, setIsRefundOpen] = useState(false);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();

  const buildParams = () => {
    const p = new URLSearchParams();
    p.set("page", String(page));
    p.set("limit", "15");
    if (userIdFilter) p.set("userId", userIdFilter);
    if (typeFilter !== "all") p.set("type", typeFilter);
    if (dateFrom) p.set("dateFrom", dateFrom);
    if (dateTo) p.set("dateTo", dateTo);
    if (search.trim()) p.set("search", search.trim());
    return p.toString();
  };

  const { data, isLoading } = useQuery({
    queryKey: ["wallet-transactions", page, userIdFilter, typeFilter, dateFrom, dateTo, search],
    queryFn: () =>
      adminFetch<{ data: Txn[]; total: number; limit: number }>(
        `/admin/wallet/transactions?${buildParams()}`
      ),
  });

  const refundMutation = useAdminRefund();

  const form = useForm<RefundFormValues>({
    resolver: zodResolver(refundSchema),
    defaultValues: { userId: 0, amount: 0, description: "" },
  });

  const onSubmitRefund = (values: RefundFormValues) => {
    refundMutation.mutate({ data: values }, {
      onSuccess: () => {
        toast({ title: "Refund issued successfully" });
        setIsRefundOpen(false);
        form.reset();
        queryClient.invalidateQueries({ queryKey: getListAllTransactionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: ["wallet-transactions"] });
      },
    });
  };

  const hasFilters = userIdFilter || typeFilter !== "all" || dateFrom || dateTo || search;

  const clearFilters = () => {
    setUserIdFilter("");
    setTypeFilter("all");
    setDateFrom("");
    setDateTo("");
    setSearch("");
    setPage(1);
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("wallet.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("wallet.subtitle")}</p>
        </div>

        <Dialog open={isRefundOpen} onOpenChange={setIsRefundOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="border-primary text-primary hover:bg-primary/10">
              <RefreshCcw className="mr-2 h-4 w-4" /> Issue Manual Refund
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Issue Manual Refund</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmitRefund)} className="space-y-4">
                <FormField control={form.control} name="userId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>User ID</FormLabel>
                    <FormControl><Input type="number" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="amount" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount (EGP)</FormLabel>
                    <FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="description" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason / Reference</FormLabel>
                    <FormControl><Input placeholder="Customer service compensation" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <DialogFooter>
                  <Button type="submit" disabled={refundMutation.isPending}>Process Refund</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 items-center bg-card p-4 rounded-xl border border-border">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filters:</span>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search name or description..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-8 w-[220px]"
          />
        </div>

        <Input
          placeholder="User ID..."
          value={userIdFilter}
          onChange={(e) => { setUserIdFilter(e.target.value); setPage(1); }}
          className="w-[100px]"
          type="number"
        />

        <Select value={typeFilter} onValueChange={(val) => { setTypeFilter(val); setPage(1); }}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="deposit">Deposit</SelectItem>
            <SelectItem value="payment">Payment</SelectItem>
            <SelectItem value="refund">Refund</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">From</span>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="w-[150px]"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">To</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="w-[150px]"
          />
        </div>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="ml-auto gap-1">
            <X className="h-3.5 w-3.5" /> Clear
          </Button>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Txn ID</TableHead>
              <TableHead>Date & Time</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount (EGP)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(8)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(6)].map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : !data?.data.length ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  No transactions found.
                </TableCell>
              </TableRow>
            ) : (
              data.data.map((txn) => (
                <TableRow key={txn.id}>
                  <TableCell className="font-mono text-sm">TXN-{txn.id}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(txn.createdAt), "MMM d, yyyy HH:mm")}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-sm">{txn.user?.name || `User #${txn.userId}`}</div>
                    {txn.user?.email && <div className="text-xs text-muted-foreground">{txn.user.email}</div>}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {txn.type === "deposit" || txn.type === "refund" ? (
                        <ArrowDownRight className="h-4 w-4 text-green-500" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4 text-destructive" />
                      )}
                      <Badge
                        variant="outline"
                        className={
                          txn.type === "deposit"
                            ? "text-green-600 border-green-200 bg-green-50 dark:bg-green-950"
                            : txn.type === "refund"
                            ? "text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-950"
                            : "text-red-500 border-red-200 bg-red-50 dark:bg-red-950"
                        }
                      >
                        {txn.type}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm max-w-[280px] truncate">{txn.description}</TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    <span className={txn.type === "payment" ? "text-destructive" : "text-green-600 dark:text-green-500"}>
                      {txn.type === "payment" ? "-" : "+"}{formatEGP(txn.amount)}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {data && data.total > data.limit && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
            <PaginationItem className="text-sm text-muted-foreground px-4">
              Page {page} of {Math.ceil(data.total / data.limit)}
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                onClick={() => setPage((p) => p + 1)}
                className={page >= Math.ceil(data.total / data.limit) ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
