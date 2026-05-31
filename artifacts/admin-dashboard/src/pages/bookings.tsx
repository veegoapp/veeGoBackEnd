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
    onError: (err: Error) =>
      toast({
        title: t("bookings.cancelFailed"),
        description: err.message,
        variant: "destructive",
      }),
  });

  const handleCancel = useCallback(
    (id: number) => {
      if (confirm(t("bookings.cancelConfirm"))) {
        cancelMutation.mutate(id);
      }
    },
    [cancelMutation, t]
  );

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
    bookings.map((b) => {
      const createdDate = b.createdAt ? new Date(b.createdAt) : null;
      const depDate = b.departureTime ? new Date(b.departureTime) : null;

      return {
        "Booking ID": b.id,
        Date:
          createdDate && !isNaN(createdDate.getTime())
            ? format(createdDate, "yyyy-MM-dd HH:mm")
            : "",
        "Customer Name": b.userName ?? `User #${b.userId}`,
        "Customer Email": b.userEmail ?? "",
        "Customer Phone": b.userPhone ?? "",
        "Trip ID": b.tripId,
        Service: b.serviceType ?? "",
        Departure:
          depDate && !isNaN(depDate.getTime())
            ? format(depDate, "yyyy-MM-dd HH:mm")
            : "",
        Seats: b.seatCount,
        "Total Price (EGP)": b.totalPrice,
        Status: b.status,
        Payment: b.paymentStatus,
      };
    });

  return (
    <div className="p-8 space-y-6">
      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Trip</TableHead>
              <TableHead>Seats</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9}>Loading...</TableCell>
              </TableRow>
            ) : bookings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-10">
                  No bookings
                </TableCell>
              </TableRow>
            ) : (
              bookings.map((b) => {
                const createdDate = b.createdAt ? new Date(b.createdAt) : null;

                return (
                  <TableRow key={b.id}>
                    <TableCell>#{b.id}</TableCell>

                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {createdDate && !isNaN(createdDate.getTime()) ? (
                        <>
                          {format(createdDate, "MMM d, yyyy")}
                          <br />
                          <span className="text-xs">
                            {format(createdDate, "HH:mm")}
                          </span>
                        </>
                      ) : (
                        "-"
                      )}
                    </TableCell>

                    <TableCell>
                      {b.userName ?? `User #${b.userId}`}
                    </TableCell>

                    <TableCell>TRP-{b.tripId}</TableCell>

                    <TableCell>{b.seatCount}</TableCell>

                    <TableCell>{formatEGP(b.totalPrice)}</TableCell>

                    <TableCell>
                      <Badge>{b.status}</Badge>
                    </TableCell>

                    <TableCell>
                      <Badge>{b.paymentStatus}</Badge>
                    </TableCell>

                    <TableCell className="text-right">
                      {(b.status === "confirmed" ||
                        b.status === "pending") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCancel(b.id)}
                        >
                          <Ban className="h-3 w-3 mr-1" />
                          Cancel
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}