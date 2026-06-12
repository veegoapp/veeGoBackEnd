import React, { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Ticket, Ban, Search, X, Eye, RefreshCcw, DollarSign, Download } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { formatEGP } from "@/lib/currency";
import { exportCSV } from "@/lib/export";
import { useTranslation } from "react-i18next";
import { MoreHorizontal } from "lucide-react";

type BookingRow = {
  id: number;
  tripId: number;
  userId: number;
  seatCount: number;
  totalPrice: number;
  status: string;
  paymentStatus: string;
  createdAt: string;
  promoCodeId: number | null;
  userName: string | null;
  userEmail: string | null;
  userPhone: string | null;
  serviceType: string | null;
  departureTime: string | null;
  arrivalTime: string | null;
  routeName: string | null;
  fromLocation: string | null;
  toLocation: string | null;
};

type BookingsResponse = {
  data: BookingRow[];
  total: number;
  page: number;
  limit: number;
};

const STATUS_BADGE: Record<string, string> = {
  confirmed: "bg-blue-500/10 text-blue-700 border-blue-200 dark:text-blue-400",
  completed: "bg-green-500/10 text-green-700 border-green-200 dark:text-green-400",
  cancelled: "bg-red-500/10 text-red-700 border-red-200 dark:text-red-400",
  pending: "bg-amber-500/10 text-amber-700 border-amber-200 dark:text-amber-400",
};

const PAYMENT_BADGE: Record<string, string> = {
  paid: "bg-green-500/10 text-green-700 border-green-200 dark:text-green-400",
  pending: "bg-amber-500/10 text-amber-700 border-amber-200 dark:text-amber-400",
  refunded: "bg-purple-500/10 text-purple-700 border-purple-200 dark:text-purple-400",
  failed: "bg-red-500/10 text-red-700 border-red-200 dark:text-red-400",
};

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b last:border-0 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-right">{value ?? "—"}</span>
    </div>
  );
}

const SERVICE_OPTIONS_KEYS = [
  { value: "all",        labelKey: "bookings.allServices",  fallback: "All Services"  },
  { value: "shuttle",    labelKey: "nav.shuttle",           fallback: "Shuttle"        },
  { value: "car",        labelKey: "nav.cars",              fallback: "Car"            },
  { value: "motorcycle", labelKey: "nav.motorcycles",       fallback: "Motorcycle"     },
  { value: "delivery",   labelKey: "nav.delivery",          fallback: "Delivery"       },
];

export default function Bookings() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const debouncedSearch = useDebounce(search, 350);

  const [detailBooking, setDetailBooking] = useState<BookingRow | null>(null);
  const [refundDialog, setRefundDialog] = useState<{ open: false } | { open: true; booking: BookingRow }>({ open: false });
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");

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
    mutationFn: (id: number) => adminFetch(`/bookings/${id}/cancel`, { method: "PATCH" }),
    onSuccess: () => {
      toast({ title: t("bookings.cancelSuccess") });
      queryClient.invalidateQueries({ queryKey: ["admin-bookings"] });
    },
    onError: (err: Error) =>
      toast({ title: t("bookings.cancelFailed"), description: err.message, variant: "destructive" }),
  });

  const refundMutation = useMutation({
    mutationFn: ({ userId, amount, description }: { userId: number; amount: number; description: string }) =>
      adminFetch("/admin/wallet/refund", {
        method: "POST",
        body: JSON.stringify({ userId, amount, description }),
      }),
    onSuccess: () => {
      toast({ title: "Refund issued successfully" });
      setRefundDialog({ open: false });
      setRefundAmount("");
      setRefundReason("");
      queryClient.invalidateQueries({ queryKey: ["admin-bookings"] });
    },
    onError: (err: Error) =>
      toast({ title: "Refund failed", description: err.message, variant: "destructive" }),
  });

  const handleCancel = useCallback(
    (id: number) => {
      if (confirm(t("bookings.cancelConfirm"))) cancelMutation.mutate(id);
    },
    [cancelMutation, t],
  );

  const handleRefundSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundDialog.open) return;
    const amt = parseFloat(refundAmount);
    if (isNaN(amt) || amt <= 0) {
      toast({ title: "Enter a valid positive amount", variant: "destructive" });
      return;
    }
    refundMutation.mutate({
      userId: refundDialog.booking.userId,
      amount: amt,
      description: refundReason || `Admin refund for booking #${refundDialog.booking.id}`,
    });
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setServiceFilter("all");
    setFromDate("");
    setToDate("");
    setPage(1);
  };

  const hasFilters = search || statusFilter !== "all" || serviceFilter !== "all" || fromDate || toDate;
  const allBookings = data?.data ?? [];
  const bookings = serviceFilter === "all"
    ? allBookings
    : allBookings.filter((b) => (b.serviceType ?? "").toLowerCase() === serviceFilter);
  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;

  const handleExport = () => {
    exportCSV(
      bookings.map((b) => ({
        "Booking ID": b.id,
        Date: b.createdAt ? format(new Date(b.createdAt), "yyyy-MM-dd HH:mm") : "",
        "Customer Name": b.userName ?? `User #${b.userId}`,
        "Customer Email": b.userEmail ?? "",
        "Customer Phone": b.userPhone ?? "",
        "Trip ID": b.tripId,
        Route: b.routeName ?? "",
        From: b.fromLocation ?? "",
        To: b.toLocation ?? "",
        Service: b.serviceType ?? "",
        Departure: b.departureTime ? format(new Date(b.departureTime), "yyyy-MM-dd HH:mm") : "",
        Seats: b.seatCount,
        "Total Price": b.totalPrice,
        Status: b.status,
        Payment: b.paymentStatus,
      })),
      `bookings-${format(new Date(), "yyyy-MM-dd")}`,
    );
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Ticket className="h-7 w-7 text-primary" />
            {t("bookings.title")}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {data ? `${data.total} total bookings` : "Loading…"}
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport} disabled={bookings.length === 0}>
          <Download className="h-4 w-4" /> {t("bookings.exportCSV", "Export CSV")}
        </Button>
      </div>

      {/* Service filter bar */}
      <div className="flex flex-wrap gap-2 items-center bg-card border border-border rounded-xl px-4 py-3">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mr-1">{t("nav.services")}</span>
        {SERVICE_OPTIONS_KEYS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => { setServiceFilter(opt.value); setPage(1); }}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors border ${
              serviceFilter === opt.value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
            }`}
          >
            {t(opt.labelKey, opt.fallback)}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center bg-card p-4 rounded-xl border border-border">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("bookings.searchPlaceholder", "Search by customer name, email, or phone…")}
            className="pl-9"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t("common.status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("bookings.allStatuses", "All Statuses")}</SelectItem>
            <SelectItem value="confirmed">{t("common.confirmed")}</SelectItem>
            <SelectItem value="pending">{t("common.pending")}</SelectItem>
            <SelectItem value="completed">{t("common.completed")}</SelectItem>
            <SelectItem value="cancelled">{t("common.cancelled")}</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Label className="text-xs">{t("bookings.from", "From")}</Label>
          <Input type="date" className="w-36 h-9 text-xs" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} />
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Label className="text-xs">{t("bookings.to", "To")}</Label>
          <Input type="date" className="w-36 h-9 text-xs" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} />
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={clearFilters}>
            <X className="h-3.5 w-3.5" /> {t("common.clear")}
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">{t("common.id")}</TableHead>
              <TableHead>{t("bookings.colDate")}</TableHead>
              <TableHead>{t("bookings.passenger")}</TableHead>
              <TableHead>{t("bookings.tripRoute", "Trip / Route")}</TableHead>
              <TableHead className="w-16 text-center">{t("bookings.seats")}</TableHead>
              <TableHead>{t("common.amount")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead>{t("common.payment")}</TableHead>
              <TableHead className="text-right w-16">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : bookings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                  {t("bookings.noBookings", "No bookings found")}
                </TableCell>
              </TableRow>
            ) : (
              bookings.map((b) => {
                const createdDate = b.createdAt ? new Date(b.createdAt) : null;
                const depDate = b.departureTime ? new Date(b.departureTime) : null;
                const canCancel = b.status === "confirmed" || b.status === "pending";
                const canRefund = b.paymentStatus === "paid" && b.status !== "cancelled";

                return (
                  <TableRow key={b.id} className="hover:bg-muted/30">
                    <TableCell className="font-mono text-sm text-muted-foreground">#{b.id}</TableCell>

                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {createdDate && !isNaN(createdDate.getTime()) ? (
                        <>
                          {format(createdDate, "MMM d, yyyy")}
                          <br />
                          <span className="text-xs">{format(createdDate, "HH:mm")}</span>
                        </>
                      ) : "—"}
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">{b.userName ?? `User #${b.userId}`}</span>
                        {b.userPhone && <span className="text-xs text-muted-foreground">{b.userPhone}</span>}
                        {b.userEmail && <span className="text-xs text-muted-foreground">{b.userEmail}</span>}
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">
                          {b.routeName ?? `Trip #${b.tripId}`}
                        </span>
                        {(b.fromLocation || b.toLocation) && (
                          <span className="text-xs text-muted-foreground">
                            {b.fromLocation} → {b.toLocation}
                          </span>
                        )}
                        {depDate && !isNaN(depDate.getTime()) && (
                          <span className="text-xs text-muted-foreground">
                            {format(depDate, "MMM d, HH:mm")}
                          </span>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="text-center">{b.seatCount}</TableCell>

                    <TableCell className="font-semibold">{formatEGP(b.totalPrice)}</TableCell>

                    <TableCell>
                      <Badge variant="outline" className={`capitalize ${STATUS_BADGE[b.status] ?? ""}`}>
                        {b.status}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      <Badge variant="outline" className={`capitalize ${PAYMENT_BADGE[b.paymentStatus] ?? ""}`}>
                        {b.paymentStatus}
                      </Badge>
                    </TableCell>

                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setDetailBooking(b)}>
                            <Eye className="mr-2 h-4 w-4" /> {t("bookings.viewDetails", "View Details")}
                          </DropdownMenuItem>
                          {canRefund && (
                            <DropdownMenuItem
                              onClick={() => {
                                setRefundAmount(String(b.totalPrice));
                                setRefundReason(`Refund for booking #${b.id}`);
                                setRefundDialog({ open: true, booking: b });
                              }}
                            >
                              <DollarSign className="mr-2 h-4 w-4 text-green-600" />
                              <span className="text-green-700 dark:text-green-400">{t("bookings.refundToWallet", "Refund to Wallet")}</span>
                            </DropdownMenuItem>
                          )}
                          {canCancel && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => handleCancel(b.id)}
                                disabled={cancelMutation.isPending}
                              >
                                <Ban className="mr-2 h-4 w-4" /> {t("bookings.cancelBooking", "Cancel Booking")}
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
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
              {t("common.page", "Page")} {page} {t("common.of", "of")} {totalPages}
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

      {/* View Details Dialog */}
      <Dialog open={!!detailBooking} onOpenChange={(o) => { if (!o) setDetailBooking(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ticket className="h-4 w-4" /> Booking #{detailBooking?.id}
            </DialogTitle>
          </DialogHeader>
          {detailBooking && (
            <div className="space-y-4 py-1">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Passenger</p>
                <DetailRow label="Name" value={detailBooking.userName ?? `User #${detailBooking.userId}`} />
                <DetailRow label="Email" value={detailBooking.userEmail} />
                <DetailRow label="Phone" value={detailBooking.userPhone} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Trip</p>
                <DetailRow label="Trip ID" value={`#${detailBooking.tripId}`} />
                <DetailRow label="Route" value={detailBooking.routeName} />
                <DetailRow label="From" value={detailBooking.fromLocation} />
                <DetailRow label="To" value={detailBooking.toLocation} />
                <DetailRow label="Service" value={detailBooking.serviceType} />
                <DetailRow
                  label="Departure"
                  value={detailBooking.departureTime
                    ? format(new Date(detailBooking.departureTime), "MMM d, yyyy HH:mm")
                    : null}
                />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Booking</p>
                <DetailRow label="Seats" value={detailBooking.seatCount} />
                <DetailRow label="Total Price" value={formatEGP(detailBooking.totalPrice)} />
                <DetailRow label="Status" value={
                  <Badge variant="outline" className={`capitalize ${STATUS_BADGE[detailBooking.status] ?? ""}`}>
                    {detailBooking.status}
                  </Badge>
                } />
                <DetailRow label="Payment" value={
                  <Badge variant="outline" className={`capitalize ${PAYMENT_BADGE[detailBooking.paymentStatus] ?? ""}`}>
                    {detailBooking.paymentStatus}
                  </Badge>
                } />
                <DetailRow
                  label="Booked At"
                  value={detailBooking.createdAt
                    ? format(new Date(detailBooking.createdAt), "MMM d, yyyy HH:mm")
                    : null}
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            {detailBooking && detailBooking.paymentStatus === "paid" && detailBooking.status !== "cancelled" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setRefundAmount(String(detailBooking.totalPrice));
                  setRefundReason(`Refund for booking #${detailBooking.id}`);
                  setRefundDialog({ open: true, booking: detailBooking });
                  setDetailBooking(null);
                }}
              >
                <DollarSign className="mr-1.5 h-3.5 w-3.5 text-green-600" /> {t("bookings.refundToWallet", "Refund to Wallet")}
              </Button>
            )}
            {detailBooking && (detailBooking.status === "confirmed" || detailBooking.status === "pending") && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => { setDetailBooking(null); handleCancel(detailBooking.id); }}
              >
                <Ban className="mr-1.5 h-3.5 w-3.5" /> {t("bookings.cancelBooking", "Cancel Booking")}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setDetailBooking(null)}>{t("common.close", "Close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Refund Dialog */}
      <Dialog open={refundDialog.open} onOpenChange={(o) => { if (!o) setRefundDialog({ open: false }); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-600" />
              Refund to Wallet
            </DialogTitle>
          </DialogHeader>
          {refundDialog.open && (
            <form onSubmit={handleRefundSubmit} className="space-y-4 py-1">
              <p className="text-sm text-muted-foreground">
                Refund wallet credit to <strong>{refundDialog.booking.userName ?? `User #${refundDialog.booking.userId}`}</strong> for booking <strong>#{refundDialog.booking.id}</strong>.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="refund-amount">Amount (EGP)</Label>
                <Input
                  id="refund-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="refund-reason">Reason</Label>
                <Input
                  id="refund-reason"
                  placeholder="e.g. Trip cancelled by operator"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setRefundDialog({ open: false })}>
                  Cancel
                </Button>
                <Button type="submit" disabled={refundMutation.isPending}>
                  {refundMutation.isPending ? "Processing…" : "Issue Refund"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
