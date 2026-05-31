import React, { useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminFetch } from "@/lib/api";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { formatEGP } from "@/lib/currency";
import {
  ArrowLeft, Edit2, Save, User as UserIcon, Wallet, ShieldX, ShieldCheck,
  Bell, Plus, MessageSquare, Ticket, CreditCard, AlertCircle, X, Tag, Copy, Check, Trash2, MapPin, Home, Briefcase,
} from "lucide-react";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { useTranslation } from "react-i18next";

// ─── Types ──────────────────────────────────────────────────────────────────

type User = {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: "user" | "driver" | "admin";
  isBlocked: boolean;
  walletBalance: number;
  createdAt: string;
  updatedAt: string;
};

type PromoCode = {
  id: number;
  code: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  expiryDate: string | null;
  maxUsage: number | null;
  usedCount: number;
  isActive: boolean;
};

type Booking = {
  id: number;
  tripId: number;
  seatCount: number;
  totalPrice: number;
  status: string;
  paymentStatus: string;
  createdAt: string;
};

type Txn = {
  id: number;
  amount: number;
  type: "deposit" | "payment" | "refund";
  description: string;
  createdAt: string;
};

type Ticket = {
  id: number;
  subject: string;
  type: string;
  priority: string;
  status: string;
  createdAt: string;
};

const editSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  role: z.enum(["user", "driver", "admin"]),
});
type EditForm = z.infer<typeof editSchema>;

// ─── Status badges ───────────────────────────────────────────────────────────

function BookingStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    confirmed: "border-green-500/30 bg-green-500/10 text-green-700",
    cancelled: "border-red-500/30 bg-red-500/10 text-red-700",
    pending: "border-amber-500/30 bg-amber-500/10 text-amber-700",
    completed: "border-blue-500/30 bg-blue-500/10 text-blue-700",
  };
  return <Badge variant="outline" className={`capitalize text-[10px] ${colors[status] ?? ""}`}>{status}</Badge>;
}

function TicketPriorityBadge({ priority }: { priority: string }) {
  return (
    <Badge variant="outline" className={`capitalize text-[10px] ${
      priority === "high" ? "border-red-500/30 bg-red-500/10 text-red-700" :
      priority === "medium" ? "border-amber-500/30 bg-amber-500/10 text-amber-700" :
      "border-muted"
    }`}>{priority}</Badge>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UserDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const userId = parseInt(id || "0", 10);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState("overview");
  const [bookingsPage, setBookingsPage] = useState(1);
  const [txnPage, setTxnPage] = useState(1);
  const [ticketsPage, setTicketsPage] = useState(1);

  const [editOpen, setEditOpen] = useState(false);
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [balanceAmount, setBalanceAmount] = useState("");
  const [balanceNote, setBalanceNote] = useState("");
  const [messageOpen, setMessageOpen] = useState(false);
  const [msgTitle, setMsgTitle] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [promoOpen, setPromoOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [, navigate] = useLocation();

  // ─── Queries ────────────────────────────────────────────────────────────────

  const { data: user, isLoading: userLoading } = useQuery<User>({
    queryKey: ["admin-user", userId],
    queryFn: () => adminFetch<User>(`/admin/users/${userId}`),
    enabled: !!userId,
  });

  const { data: bookingsData, isLoading: bookingsLoading } = useQuery({
    queryKey: ["user-bookings", userId, bookingsPage],
    queryFn: () =>
      adminFetch<{ data: Booking[]; total: number; limit: number }>(
        `/bookings?userId=${userId}&page=${bookingsPage}&limit=8`
      ),
    enabled: !!userId,
  });

  const { data: txnData, isLoading: txnLoading } = useQuery({
    queryKey: ["user-txns", userId, txnPage],
    queryFn: () =>
      adminFetch<{ data: Txn[]; total: number; limit: number }>(
        `/admin/wallet/transactions?userId=${userId}&page=${txnPage}&limit=8`
      ),
    enabled: !!userId,
  });

  const { data: ticketsData, isLoading: ticketsLoading } = useQuery({
    queryKey: ["user-tickets", userId, ticketsPage],
    queryFn: () =>
      adminFetch<{ data: Ticket[]; total: number; limit: number }>(
        `/support/tickets?userId=${userId}&page=${ticketsPage}&limit=8`
      ),
    enabled: !!userId,
  });

  const { data: promosData } = useQuery({
    queryKey: ["promo-codes-list"],
    queryFn: () => adminFetch<{ data: PromoCode[]; total: number }>("/promo?limit=50"),
    enabled: promoOpen,
  });

  // ─── Mutations ───────────────────────────────────────────────────────────────

  const toggleBlockMutation = useMutation({
    mutationFn: () => adminFetch(`/admin/users/${userId}/toggle-block`, { method: "PATCH" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-user", userId] });
      toast({ title: user?.isBlocked ? "User unblocked" : "User blocked" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: EditForm) =>
      adminFetch(`/admin/users/${userId}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-user", userId] });
      toast({ title: "User updated" });
      setEditOpen(false);
    },
    onError: (err: Error) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const addBalanceMutation = useMutation({
    mutationFn: ({ amount, description }: { amount: number; description: string }) =>
      adminFetch("/admin/wallet/refund", {
        method: "POST",
        body: JSON.stringify({ userId, amount, description }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-user", userId] });
      queryClient.invalidateQueries({ queryKey: ["user-txns", userId] });
      toast({ title: "Balance added" });
      setBalanceOpen(false);
      setBalanceAmount("");
      setBalanceNote("");
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const sendMessageMutation = useMutation({
    mutationFn: ({ title, body }: { title: string; body: string }) =>
      adminFetch("/notifications", { method: "POST", body: JSON.stringify({ userId, title, body }) }),
    onSuccess: () => {
      toast({ title: "Message sent" });
      setMessageOpen(false);
      setMsgTitle("");
      setMsgBody("");
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => adminFetch(`/admin/users/${userId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Account deleted" });
      navigate("/users");
    },
    onError: (err: Error) => toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  // ─── Edit form ─────────────────────────────────────────────────────────────

  const editForm = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    values: {
      name: user?.name ?? "",
      email: user?.email ?? "",
      phone: user?.phone ?? "",
      role: user?.role ?? "user",
    },
  });

  const onEdit = (data: EditForm) => updateMutation.mutate(data);

  // ─── Loading / not found ──────────────────────────────────────────────────

  if (userLoading) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        {t("userDetail.notFound")}
      </div>
    );
  }

  const bookingsTotalPages = bookingsData ? Math.ceil(bookingsData.total / bookingsData.limit) : 1;
  const txnTotalPages = txnData ? Math.ceil(txnData.total / txnData.limit) : 1;
  const ticketsTotalPages = ticketsData ? Math.ceil(ticketsData.total / ticketsData.limit) : 1;

  return (
    <div className="p-8 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link href="/users"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{user.name}</h1>
          <p className="text-sm text-muted-foreground">{user.email} · ID #{user.id}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Badge variant={user.isBlocked ? "destructive" : "secondary"} className="capitalize">
            {user.isBlocked ? t("userDetail.blockedLabel") : t("userDetail.activeLabel")}
          </Badge>
          <Badge variant="outline" className="capitalize">{user.role}</Badge>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          <Edit2 className="h-3.5 w-3.5 mr-1.5" /> {t("common.edit")}
        </Button>
        <Button
          variant={user.isBlocked ? "outline" : "destructive"}
          size="sm"
          onClick={() => {
            if (confirm(user.isBlocked ? "Unblock this user?" : "Block this user?"))
              toggleBlockMutation.mutate();
          }}
          disabled={toggleBlockMutation.isPending}
        >
          {user.isBlocked ? <ShieldCheck className="h-3.5 w-3.5 mr-1.5" /> : <ShieldX className="h-3.5 w-3.5 mr-1.5" />}
          {user.isBlocked ? t("driverDetail.unblockAccount") : t("driverDetail.blockAccount")}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setBalanceOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> {t("userDetail.addBalance")}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setMessageOpen(true)}>
          <Bell className="h-3.5 w-3.5 mr-1.5" /> {t("driverDetail.sendMessage")}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setNoteOpen(true)}>
          <MessageSquare className="h-3.5 w-3.5 mr-1.5" /> {t("userDetail.addNote")}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setPromoOpen(true)}>
          <Tag className="h-3.5 w-3.5 mr-1.5" /> {t("driverDetail.sendPromo")}
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="h-3.5 w-3.5 mr-1.5" /> {t("driverDetail.deleteAccount")}
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: t("userDetail.walletBalance"), value: formatEGP(user.walletBalance), icon: Wallet, color: "bg-green-500/10 text-green-600" },
          { label: t("userDetail.totalBookings"), value: bookingsData?.total ?? "—", icon: Ticket, color: "bg-blue-500/10 text-blue-600" },
          { label: t("userDetail.transactions"), value: txnData?.total ?? "—", icon: CreditCard, color: "bg-purple-500/10 text-purple-600" },
          { label: t("userDetail.complaintsLabel"), value: ticketsData?.total ?? "—", icon: AlertCircle, color: "bg-red-500/10 text-red-600" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <div className={`p-2 rounded-lg shrink-0 ${s.color}`}>
                <s.icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-lg font-bold leading-tight">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="overview">{t("driverDetail.tabOverview")}</TabsTrigger>
          <TabsTrigger value="trips">{t("driverDetail.tabTrips")}</TabsTrigger>
          <TabsTrigger value="payments">{t("userDetail.tabPayments")}</TabsTrigger>
          <TabsTrigger value="complaints">{t("userDetail.tabComplaints")}</TabsTrigger>
          <TabsTrigger value="locations">{t("locations.tabSavedLocations", "Saved Locations")}</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><UserIcon className="h-4 w-4" /> {t("userDetail.profile")}</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                {[
                  { label: t("userDetail.fullName"), value: user.name },
                  { label: t("common.email"), value: user.email },
                  { label: t("driverDetail.phone"), value: user.phone },
                  { label: t("common.role"), value: <span className="capitalize">{user.role}</span> },
                  { label: t("userDetail.accountStatus"), value: user.isBlocked ? <Badge variant="destructive">{t("userDetail.blockedLabel")}</Badge> : <Badge variant="secondary">{t("userDetail.activeLabel")}</Badge> },
                  { label: t("userDetail.walletBalance"), value: <span className="font-bold text-green-600">{formatEGP(user.walletBalance)}</span> },
                  { label: t("userDetail.joined"), value: format(new Date(user.createdAt), "PPP") },
                  { label: t("userDetail.lastUpdated"), value: format(new Date(user.updatedAt), "PPP HH:mm") },
                ].map((row) => (
                  <div key={row.label}>
                    <p className="text-xs text-muted-foreground mb-0.5">{row.label}</p>
                    <div className="text-sm font-medium">{row.value}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Trips */}
        <TabsContent value="trips">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Ticket className="h-4 w-4" /> {t("userDetail.bookingHistory")}</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("tripDetail.colBookingId")}</TableHead>
                    <TableHead>{t("common.trip")}</TableHead>
                    <TableHead>{t("tripDetail.colSeats")}</TableHead>
                    <TableHead>{t("common.status")}</TableHead>
                    <TableHead>{t("tripDetail.colPayment")}</TableHead>
                    <TableHead className="text-right">{t("tripDetail.colTotal")}</TableHead>
                    <TableHead>{t("common.date")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bookingsLoading ? (
                    [...Array(5)].map((_, i) => (
                      <TableRow key={i}>{[...Array(7)].map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                    ))
                  ) : !bookingsData?.data.length ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">{t("userDetail.noBookings")}</TableCell></TableRow>
                  ) : (
                    bookingsData.data.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-mono text-sm">#{b.id}</TableCell>
                        <TableCell className="text-sm">Trip #{b.tripId}</TableCell>
                        <TableCell className="text-sm">{b.seatCount}</TableCell>
                        <TableCell><BookingStatusBadge status={b.status} /></TableCell>
                        <TableCell><Badge variant="outline" className="capitalize text-[10px]">{b.paymentStatus}</Badge></TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatEGP(b.totalPrice)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{format(new Date(b.createdAt), "MMM d, yyyy")}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
            {bookingsTotalPages > 1 && (
              <div className="border-t border-border p-3">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious onClick={() => setBookingsPage((p) => Math.max(1, p - 1))} className={bookingsPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"} />
                    </PaginationItem>
                    <PaginationItem className="text-sm text-muted-foreground px-4">{bookingsPage} / {bookingsTotalPages}</PaginationItem>
                    <PaginationItem>
                      <PaginationNext onClick={() => setBookingsPage((p) => Math.min(bookingsTotalPages, p + 1))} className={bookingsPage >= bookingsTotalPages ? "pointer-events-none opacity-50" : "cursor-pointer"} />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Payments */}
        <TabsContent value="payments">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><CreditCard className="h-4 w-4" /> {t("userDetail.walletTransactions")}</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("userDetail.colTxnId")}</TableHead>
                    <TableHead>{t("common.type")}</TableHead>
                    <TableHead>{t("userDetail.colDescription")}</TableHead>
                    <TableHead className="text-right">{t("userDetail.colAmount")}</TableHead>
                    <TableHead>{t("common.date")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {txnLoading ? (
                    [...Array(5)].map((_, i) => (
                      <TableRow key={i}>{[...Array(5)].map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                    ))
                  ) : !txnData?.data.length ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">{t("userDetail.noTransactions")}</TableCell></TableRow>
                  ) : (
                    txnData.data.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-mono text-sm">TXN-{t.id}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`capitalize text-[10px] ${
                            t.type === "deposit" ? "text-green-600 border-green-200 bg-green-50 dark:bg-green-950" :
                            t.type === "refund" ? "text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-950" :
                            "text-red-500 border-red-200 bg-red-50 dark:bg-red-950"
                          }`}>{t.type}</Badge>
                        </TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate">{t.description}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          <span className={t.type === "payment" ? "text-destructive" : "text-green-600"}>
                            {t.type === "payment" ? "-" : "+"}{formatEGP(t.amount)}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{format(new Date(t.createdAt), "MMM d, yyyy HH:mm")}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
            {txnTotalPages > 1 && (
              <div className="border-t border-border p-3">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious onClick={() => setTxnPage((p) => Math.max(1, p - 1))} className={txnPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"} />
                    </PaginationItem>
                    <PaginationItem className="text-sm text-muted-foreground px-4">{txnPage} / {txnTotalPages}</PaginationItem>
                    <PaginationItem>
                      <PaginationNext onClick={() => setTxnPage((p) => Math.min(txnTotalPages, p + 1))} className={txnPage >= txnTotalPages ? "pointer-events-none opacity-50" : "cursor-pointer"} />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Complaints */}
        <TabsContent value="complaints">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertCircle className="h-4 w-4" /> {t("userDetail.supportTickets")}</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>{t("userDetail.colSubject")}</TableHead>
                    <TableHead>{t("common.type")}</TableHead>
                    <TableHead>{t("userDetail.colPriority")}</TableHead>
                    <TableHead>{t("common.status")}</TableHead>
                    <TableHead>{t("common.date")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ticketsLoading ? (
                    [...Array(4)].map((_, i) => (
                      <TableRow key={i}>{[...Array(6)].map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                    ))
                  ) : !ticketsData?.data.length ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">{t("userDetail.noComplaints")}</TableCell></TableRow>
                  ) : (
                    ticketsData.data.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-mono text-sm">#{t.id}</TableCell>
                        <TableCell className="text-sm max-w-[220px] truncate font-medium">{t.subject}</TableCell>
                        <TableCell><Badge variant="outline" className="capitalize text-[10px]">{t.type}</Badge></TableCell>
                        <TableCell><TicketPriorityBadge priority={t.priority} /></TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`capitalize text-[10px] ${
                            t.status === "open" ? "text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-950" :
                            t.status === "resolved" || t.status === "closed" ? "text-green-600 border-green-200 bg-green-50 dark:bg-green-950" :
                            ""
                          }`}>{t.status}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{format(new Date(t.createdAt), "MMM d, yyyy")}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
            {ticketsTotalPages > 1 && (
              <div className="border-t border-border p-3">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious onClick={() => setTicketsPage((p) => Math.max(1, p - 1))} className={ticketsPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"} />
                    </PaginationItem>
                    <PaginationItem className="text-sm text-muted-foreground px-4">{ticketsPage} / {ticketsTotalPages}</PaginationItem>
                    <PaginationItem>
                      <PaginationNext onClick={() => setTicketsPage((p) => Math.min(ticketsTotalPages, p + 1))} className={ticketsPage >= ticketsTotalPages ? "pointer-events-none opacity-50" : "cursor-pointer"} />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Saved Locations */}
        <TabsContent value="locations">
          <UserSavedLocationsTab userId={Number(userId)} />
        </TabsContent>
      </Tabs>

      {/* ── Edit Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("userDetail.editUser")}</DialogTitle></DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEdit)} className="space-y-4">
              <FormField control={editForm.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>{t("userDetail.fullName")}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={editForm.control} name="email" render={({ field }) => (
                <FormItem><FormLabel>{t("common.email")}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={editForm.control} name="phone" render={({ field }) => (
                <FormItem><FormLabel>{t("driverDetail.phone")}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={editForm.control} name="role" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("common.role")}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="user">{t("common.customer")}</SelectItem>
                      <SelectItem value="driver">{t("common.driver")}</SelectItem>
                      <SelectItem value="admin">{t("common.admin")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>{t("common.cancel")}</Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  <Save className="h-4 w-4 mr-2" /> {t("common.saveChanges")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ── Add Balance Dialog ──────────────────────────────────────────── */}
      <Dialog open={balanceOpen} onOpenChange={setBalanceOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("userDetail.addBalance")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">{t("userDetail.amountEGP")}</label>
              <Input type="number" step="0.01" min="0.01" placeholder="0.00" value={balanceAmount} onChange={(e) => setBalanceAmount(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">{t("userDetail.noteRef")}</label>
              <Input placeholder={t("userDetail.noteRefPlaceholder")} value={balanceNote} onChange={(e) => setBalanceNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBalanceOpen(false)}>{t("common.cancel")}</Button>
            <Button
              disabled={addBalanceMutation.isPending || !balanceAmount}
              onClick={() => addBalanceMutation.mutate({ amount: parseFloat(balanceAmount), description: balanceNote || "Manual balance top-up" })}
            >
              <Plus className="h-4 w-4 mr-2" /> {t("userDetail.addBalance")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Send Message Dialog ─────────────────────────────────────────── */}
      <Dialog open={messageOpen} onOpenChange={setMessageOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("userDetail.sendInAppMessage")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">{t("driverDetail.notifTitle")}</label>
              <Input placeholder={t("driverDetail.notifTitlePlaceholder")} value={msgTitle} onChange={(e) => setMsgTitle(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">{t("driverDetail.notifMessage")}</label>
              <Textarea placeholder={t("driverDetail.notifMessagePlaceholder")} className="min-h-[100px]" value={msgBody} onChange={(e) => setMsgBody(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMessageOpen(false)}>{t("common.cancel")}</Button>
            <Button
              disabled={sendMessageMutation.isPending || !msgTitle || !msgBody}
              onClick={() => sendMessageMutation.mutate({ title: msgTitle, body: msgBody })}
            >
              <Bell className="h-4 w-4 mr-2" /> {t("common.send")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Promo Code Dialog ───────────────────────────────────────────── */}
      <Dialog open={promoOpen} onOpenChange={setPromoOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Tag className="h-4 w-4" /> {t("driverDetail.sendPromo")}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Pick a promo code to share with {user.name}.</p>
          {!promosData?.data.length ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              {promosData ? t("driverDetail.noActivePromos") : t("common.loading")}
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {promosData.data.filter((p) => p.isActive).map((promo) => (
                <div key={promo.id} className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-muted/40 transition-colors">
                  <div>
                    <p className="font-mono font-bold text-sm">{promo.code}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {promo.discountType === "percentage" ? `${promo.discountValue}% off` : `EGP ${promo.discountValue} off`}
                      {promo.expiryDate ? ` · Expires ${format(new Date(promo.expiryDate), "MMM d, yyyy")}` : ""}
                      {promo.maxUsage ? ` · ${promo.usedCount}/${promo.maxUsage} used` : ""}
                    </p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Button
                      size="sm" variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(promo.code);
                        setCopiedCode(promo.code);
                        setTimeout(() => setCopiedCode(null), 2000);
                      }}
                    >
                      {copiedCode === promo.code ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        sendMessageMutation.mutate({
                          title: `You have a promo code: ${promo.code}`,
                          body: `Use code ${promo.code} on your next booking to get ${promo.discountType === "percentage" ? `${promo.discountValue}% off` : `EGP ${promo.discountValue} off`}!`,
                        });
                        setPromoOpen(false);
                      }}
                    >
                      <Bell className="h-3.5 w-3.5 mr-1.5" /> {t("driverDetail.notifyBtn")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPromoOpen(false)}>{t("common.close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Note Dialog ─────────────────────────────────────────────── */}
      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("userDetail.addInternalNote")}</DialogTitle></DialogHeader>
          <div>
            <label className="text-sm font-medium mb-1.5 block">{t("userDetail.noteLabel")}</label>
            <Textarea placeholder={t("userDetail.notePlaceholder")} className="min-h-[120px]" value={noteText} onChange={(e) => setNoteText(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={() => { toast({ title: t("tripDetail.noteSaved") }); setNoteOpen(false); setNoteText(""); }}>
              {t("tripDetail.saveNote")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Account Dialog ─────────────────────────────────────────── */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-4 w-4" /> {t("driverDetail.deleteAccount")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This will permanently delete <strong>{user?.name}</strong>'s account and all associated data. This action cannot be undone.
            </p>
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              ⚠ All bookings, wallet transactions, and notifications linked to this account will also be removed.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>{t("common.cancel")}</Button>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              {deleteMutation.isPending ? t("common.loading") : t("driverDetail.deleteAccount")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── User Saved Locations Tab ─────────────────────────────────────────────────

type UserLocation = {
  id: number;
  userId: number;
  label: "home" | "work" | "other";
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

const LOCATION_LABEL_ICONS: Record<string, React.ReactNode> = {
  home: <Home className="h-3.5 w-3.5" />,
  work: <Briefcase className="h-3.5 w-3.5" />,
  other: <MapPin className="h-3.5 w-3.5" />,
};

function UserSavedLocationsTab({ userId }: { userId: number }) {
  const { t } = useTranslation();

  const { data, isLoading } = useQuery<{ data: UserLocation[]; total: number }>({
    queryKey: ["user-saved-locations", userId],
    queryFn: () => adminFetch(`/admin/user-locations?userId=${userId}`),
    enabled: !!userId,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4 space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          {t("locations.tabSavedLocations", "Saved Locations")}
        </CardTitle>
        <span className="text-xs text-muted-foreground">{data?.total ?? 0} {t("auditLogs.records", "records")}</span>
      </CardHeader>
      <CardContent className="p-0">
        {!data?.data.length ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            {t("locations.noSavedLocations", "No saved locations yet")}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.type")}</TableHead>
                <TableHead>{t("locations.locationName", "Name")}</TableHead>
                <TableHead>{t("locations.address", "Address")}</TableHead>
                <TableHead>{t("locations.coordinates", "Coordinates")}</TableHead>
                <TableHead>{t("locations.default", "Default")}</TableHead>
                <TableHead>{t("common.date")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((loc) => (
                <TableRow key={loc.id}>
                  <TableCell>
                    <Badge variant="outline" className="capitalize text-[10px] flex items-center gap-1 w-fit">
                      {LOCATION_LABEL_ICONS[loc.label]}
                      {loc.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium text-sm">{loc.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{loc.address}</TableCell>
                  <TableCell className="font-mono text-[11px] whitespace-nowrap">
                    {loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)}
                  </TableCell>
                  <TableCell>
                    {loc.isDefault ? (
                      <Badge className="text-[10px] bg-green-600 hover:bg-green-700">{t("locations.default", "Default")}</Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(loc.createdAt), "dd MMM yyyy")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
