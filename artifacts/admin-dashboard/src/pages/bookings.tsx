import React, { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Ticket, Filter, Ban, Download, Search, X, RefreshCcw } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { exportCSV, exportExcel, todayStr } from "@/lib/export";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { formatEGP } from "@/lib/currency";
import { useTranslation } from "react-i18next";

type BookingRow = {
  id: number;
  tripId: number;
  userId: number;
  seatCount: number;
  totalPrice: number;
  status: string;
  paymentStatus: string;
  createdAt: string;
  promoCodId: number | null;
  userName: string | null;
  userEmail: string | null;
  userPhone: string | null;
  serviceType: string | null;
  departureTime: string | null;
};

type BookingsResponse = {
  data: BookingRow[];
  total: number;
  page: number;
  limit: number;
};

const STATUS_BADGE: Record<string, string> = {
  confirmed:  "bg-blue-500/10 text-blue-700 border-blue-200 dark:text-blue-400",
  completed:  "bg-green-500/10 text-green-700 border-green-200 dark:text-green-400",
  cancelled:  "bg-red-500/10 text-red-700 border-red-200 dark:text-red-400",
  pending:    "bg-amber-500/10 text-amber-700 border-amber-200 dark:text-amber-400",
};

const PAYMENT_BADGE: Record<string, string> = {
  paid:     "bg-green-500/10 text-green-700 border-green-200 dark:text-green-400",
  pending:  "bg-amber-500/10 text-amber-700 border-amber-200 dark:text-amber-400",
  refunded: "bg-purple-500/10 text-purple-700 border-purple-200 dark:text-purple-400",
  failed:   "bg-red-500/10 text-red-700 border-red-200 dark:text-red-400",
};

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function Bookings() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const debouncedSearch = useDebounce(search, 350);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();

  const queryParams = new URLSearchParams({
    page: String(page),
    limit: "20",
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(statusFilter !== "all" ? { status: statusFilter } : {}),
    ...(fromDate ? { fromDate } : {}),
    ...(toDate ? { toDate } : {}),
  });

  const { data, isLoading } = useQuery<BookingsResponse>({
    queryKey: ["admin-bookings", page, debouncedSearch, statusFilter, fromDate, toDate],
    queryFn: () => adminFetch<BookingsResponse>(`/admin/bookings?${queryParams}`),
    placeholderData: (prev) => prev,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) =>
      adminFetch(`/bookings/${id}/cancel`, { method: "PATCH" }),
    onSuccess: () => {
      toast({ title: t("bookings.cancelSuccess") });
      queryClient.invalidateQueries({ queryKey: ["admin-bookings"] });
    },
    onError: (err: Error) => toast({ title: t("bookings.cancelFailed"), description: err.message, variant: "destructive" }),
  });

  const handleCancel = useCallback((id: number) => {
    if (confirm(t("bookings.cancelConfirm"))) {
      cancelMutation.mutate(id);
    }
  }, [cancelMutation, t]);

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setFromDate("");
    setToDate("");
    setPage(1);
  };

  const hasFilters = search || statusFilter !== "all" || fromDate || toDate;

  const bookings = data?.data ?? [];
  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;

  const buildExportRows = () =>
    bookings.map((b) => ({
      "Booking ID": b.id,
      "Date": format(new Date(b.createdAt), "yyyy-MM-dd HH:mm"),
      "Customer Name": b.userName ?? `User #${b.userId}`,
      "Customer Email": b.userEmail ?? "",
      "Customer Phone": b.userPhone ?? "",
      "Trip ID": b.tripId,
      "Service": b.serviceType ?? "",
      "Departure": b.departureTime ? format(new Date(b.departureTime), "yyyy-MM-dd HH:mm") : "",
      "Seats": b.seatCount,
      "Total Price (EGP)": b.totalPrice,
      "Status": b.status,
      "Payment": b.paymentStatus,
    }));

  const exportSuffix = statusFilter !== "all" ? `-${statusFilter}` : "";

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-primary/10">
            <Ticket className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("bookings.title")}</h1>
            <p className="text-muted-foreground text-sm">
              {data ? t("bookings.totalCount", { count: data.total }) : t("common.loading2")}
            </p>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={isLoading || !bookings.length}>
              <Download className="h-4 w-4 mr-2" /> {t("bookings.export")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => exportCSV(buildExportRows(), `bookings${exportSuffix}-${todayStr()}.csv`)}>
              {t("bookings.exportCSV")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportExcel(buildExportRows(), `bookings${exportSuffix}-${todayStr()}.xlsx`, "Bookings")}>
              {t("bookings.exportExcel")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground shrink-0">
          <Filter className="h-4 w-4" /> {t("bookings.filters")}
        </div>

        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-8 h-9"
            placeholder={t("bookings.searchPlaceholder")}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>

        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue placeholder={t("bookings.allStatuses")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("bookings.allStatuses")}</SelectItem>
            <SelectItem value="pending">{t("bookings.statusPending")}</SelectItem>
            <SelectItem value="confirmed">{t("bookings.statusConfirmed")}</SelectItem>
            <SelectItem value="completed">{t("bookings.statusCompleted")}</SelectItem>
            <SelectItem value="cancelled">{t("bookings.statusCancelled")}</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground whitespace-nowrap">{t("bookings.from")}</span>
          <Input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} className="w-[140px] h-9" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground whitespace-nowrap">{t("bookings.to")}</span>
          <Input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} className="w-[140px] h-9" />
        </div>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9">
            <X className="h-3.5 w-3.5 mr-1.5" /> {t("bookings.clearBtn")}
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">{t("bookings.colId")}</TableHead>
              <TableHead>{t("bookings.colDate")}</TableHead>
              <TableHead>{t("bookings.colCustomer")}</TableHead>
              <TableHead>{t("bookings.trip")}</TableHead>
              <TableHead className="text-center">{t("bookings.seats")}</TableHead>
              <TableHead>{t("bookings.colAmount")}</TableHead>
              <TableHead>{t("bookings.colStatus")}</TableHead>
              <TableHead>{t("bookings.colPayment")}</TableHead>
              <TableHead className="text-right">{t("bookings.colActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : bookings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-14 text-muted-foreground">
                  <Ticket className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  <p>{t("bookings.noBookingsFound")}</p>
                  {hasFilters && <p className="text-xs mt-1">{t("bookings.clearFiltersHint")}</p>}
                </TableCell>
              </TableRow>
            ) : (
              bookings.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-mono text-sm font-medium text-muted-foreground">
                    #{b.id}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {format(new Date(b.createdAt), "MMM d, yyyy")}
                    <br />
                    <span className="text-xs">{format(new Date(b.createdAt), "HH:mm")}</span>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm font-medium">{b.userName ?? `User #${b.userId}`}</p>
                    {b.userPhone && <p className="text-xs text-muted-foreground">{b.userPhone}</p>}
                  </TableCell>
                  <TableCell>
                    <p className="text-sm font-mono">TRP-{b.tripId}</p>
                    {b.serviceType && (
                      <p className="text-xs text-muted-foreground capitalize">{b.serviceType}</p>
                    )}
                    {b.departureTime && (
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(b.departureTime), "MMM d, HH:mm")}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-center font-medium">{b.seatCount}</TableCell>
                  <TableCell className="font-semibold">{formatEGP(b.totalPrice)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs capitalize ${STATUS_BADGE[b.status] ?? ""}`}>
                      {b.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs capitalize ${PAYMENT_BADGE[b.paymentStatus] ?? ""}`}>
                      {b.paymentStatus}
                    </Badge>
                    {b.paymentStatus === "refunded" && (
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                        <RefreshCcw className="h-2.5 w-2.5" /> {t("bookings.refunded")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {(b.status === "confirmed" || b.status === "pending") && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive h-7 text-xs"
                        onClick={() => handleCancel(b.id)}
                        disabled={cancelMutation.isPending}
                      >
                        <Ban className="h-3 w-3 mr-1" /> {t("common.cancel")}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
            <PaginationItem className="text-sm text-muted-foreground px-4">
              {t("bookings.page")} {page} {t("bookings.of")} {totalPages}
              {data && <span className="ml-2 text-xs">({data.total.toLocaleString()} {t("bookings.total")})</span>}
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className={page >= totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
