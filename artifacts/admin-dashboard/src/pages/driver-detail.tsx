import React, { useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { formatEGP } from "@/lib/currency";
import {
  ArrowLeft, Star, Phone, Bus, ShieldX, ShieldCheck, ToggleLeft, ToggleRight,
  UserCircle, Activity, CheckCircle2, XCircle, Clock, FileImage, ZoomIn, Hash,
  CalendarDays, Wallet, CreditCard, Mail, Tag, Copy, Check, Bell, Trash2, MessageSquare, MapPin,
} from "lucide-react";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { useTranslation } from "react-i18next";

// ─── Types ──────────────────────────────────────────────────────────────────

type Driver = {
  id: number;
  userId: number;
  name: string;
  phone: string;
  licenseNumber: string | null;
  nationalId: string | null;
  assignedBusId: number | null;
  status: "offline" | "online" | "busy" | "suspended";
  isActive: boolean;
  rating: number;
  createdAt: string;
  updatedAt: string;
};

type UserInfo = {
  id: number;
  email: string;
  walletBalance: number;
  isBlocked: boolean;
};

type DriverDocument = {
  id: number;
  driverId: number;
  type: string;
  fileUrl: string;
  mimeType: string | null;
  verificationStatus: "pending" | "approved" | "rejected";
  adminNotes: string | null;
  uploadedAt: string;
};

type ShuttleTrip = {
  id: number;
  status: string;
  departureTime: string;
  arrivalTime: string;
  totalSeats: number;
  availableSeats: number;
  price: number;
};

// ─── Constants ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  online:    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
  busy:      "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100",
  offline:   "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  suspended: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100",
};

const TRIP_STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled", waiting_driver: "Waiting Driver", driver_assigned: "Driver Assigned",
  boarding: "Boarding", active: "Active", completed: "Completed", cancelled: "Cancelled",
};

const ALL_DOC_TYPES = [
  { type: "profile_photo",         labelEn: "Profile Photo" },
  { type: "national_id_front",     labelEn: "National ID — Front" },
  { type: "national_id_back",      labelEn: "National ID — Back" },
  { type: "criminal_record",       labelEn: "Criminal Record (Feesh)" },
  { type: "driving_license_front", labelEn: "Driving License — Front" },
  { type: "driving_license_back",  labelEn: "Driving License — Back" },
  { type: "vehicle_license_front", labelEn: "Vehicle License — Front" },
  { type: "vehicle_license_back",  labelEn: "Vehicle License — Back" },
  { type: "vehicle_photo",         labelEn: "Vehicle Photos" },
];

// ─── Sub-components ─────────────────────────────────────────────────────────

function NotSetSpan() {
  const { t } = useTranslation();
  return <span className="text-muted-foreground italic text-xs">{t("driverDetail.notSet")}</span>;
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border last:border-0">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted mt-0.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="text-sm font-medium mt-0.5">{value ?? <NotSetSpan />}</div>
      </div>
    </div>
  );
}

function DocStatusBadge({ status }: { status: "pending" | "approved" | "rejected" }) {
  const { t } = useTranslation();
  if (status === "approved") return <Badge variant="outline" className="text-[10px] border-green-500/40 text-green-600 bg-green-500/10"><CheckCircle2 className="h-2.5 w-2.5 mr-1" />{t("driverDetail.approvedLabel")}</Badge>;
  if (status === "rejected") return <Badge variant="destructive" className="text-[10px]"><XCircle className="h-2.5 w-2.5 mr-1" />{t("driverDetail.rejectedLabel")}</Badge>;
  return <Badge variant="secondary" className="text-[10px] text-amber-600"><Clock className="h-2.5 w-2.5 mr-1" />{t("driverDetail.pendingLabel")}</Badge>;
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function DriverDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const driverId = parseInt(id || "0", 10);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [zoomDoc, setZoomDoc] = useState<DriverDocument | null>(null);
  const [tripsPage, setTripsPage] = useState(1);
  const [promoOpen, setPromoOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [msgOpen, setMsgOpen] = useState(false);
  const [msgTitle, setMsgTitle] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [, navigate] = useLocation();

  const qKey = ["driver-detail-page", driverId];

  const { data: driver, isLoading: driverLoading } = useQuery<Driver>({
    queryKey: [...qKey, "driver"],
    queryFn: () => adminFetch<Driver>(`/drivers/${driverId}`),
    enabled: !!driverId,
  });

  const { data: userInfo } = useQuery<UserInfo>({
    queryKey: [...qKey, "user"],
    queryFn: () => adminFetch<UserInfo>(`/admin/users/${driver!.userId}`),
    enabled: !!driver?.userId,
  });

  const { data: docsData, isLoading: docsLoading } = useQuery<{ documents: DriverDocument[] }>({
    queryKey: [...qKey, "docs"],
    queryFn: () => adminFetch(`/driver-documents/by-driver/${driverId}`),
    enabled: !!driverId,
  });

  const { data: tripsData, isLoading: tripsLoading } = useQuery<{ data: ShuttleTrip[]; meta: { total: number; pages: number } }>({
    queryKey: [...qKey, "trips", tripsPage],
    queryFn: () => adminFetch(`/admin/trips?driverId=${driverId}&page=${tripsPage}&limit=10`),
    enabled: !!driverId,
  });

  // ─── Mutations ──────────────────────────────────────────────────────────────

  const verifyMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: "approved" | "rejected" }) =>
      adminFetch(`/driver-documents/${id}`, { method: "PATCH", body: JSON.stringify({ verificationStatus: status }) }),
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: [...qKey, "docs"] });
      toast({ title: vars.status === "approved" ? "Document approved ✓" : "Document rejected" });
      setZoomDoc(null);
    },
  });

  const { data: promosData } = useQuery({
    queryKey: ["promo-codes-list"],
    queryFn: () => adminFetch<{ data: Array<{ id: number; code: string; discountType: string; discountValue: number; expiryDate: string | null; maxUsage: number | null; usedCount: number; isActive: boolean }>; total: number }>("/promo?limit=50"),
    enabled: promoOpen,
  });

  const sendNotifMutation = useMutation({
    mutationFn: ({ title, body }: { title: string; body: string }) =>
      adminFetch("/notifications", { method: "POST", body: JSON.stringify({ userId: driver?.userId, title, body }) }),
    onSuccess: () => { toast({ title: "Notification sent" }); setPromoOpen(false); },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const toggleBlockMutation = useMutation({
    mutationFn: () => adminFetch(`/admin/users/${driver!.userId}/toggle-block`, { method: "PATCH" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...qKey, "user"] });
      toast({ title: userInfo?.isBlocked ? "Driver unblocked" : "Driver blocked" });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: () =>
      adminFetch(`/drivers/${driverId}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !driver!.isActive, status: driver!.isActive ? "suspended" : "offline" }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...qKey, "driver"] });
      toast({ title: driver?.isActive ? "Driver suspended" : "Driver activated" });
    },
  });

  const sendMsgMutation = useMutation({
    mutationFn: ({ title, body }: { title: string; body: string }) =>
      adminFetch("/notifications", { method: "POST", body: JSON.stringify({ userId: driver?.userId, title, body }) }),
    onSuccess: () => {
      toast({ title: "Message sent" });
      setMsgOpen(false);
      setMsgTitle("");
      setMsgBody("");
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => adminFetch(`/admin/drivers/${driverId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Driver account deleted" });
      navigate("/drivers");
    },
    onError: (err: Error) => toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  // ─── Derived ────────────────────────────────────────────────────────────────

  const documents = docsData?.documents ?? [];
  const profilePhotoDoc = documents.find((d) => d.type === "profile_photo");
  const pendingDocs = documents.filter((d) => d.verificationStatus === "pending").length;
  const trips = tripsData?.data ?? [];
  const totalTrips = tripsData?.meta.total ?? 0;
  const tripsTotalPages = tripsData?.meta.pages ?? 1;
  const completedTrips = trips.filter((t) => t.status === "completed").length;

  // ─── Loading ─────────────────────────────────────────────────────────────

  if (driverLoading) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!driver) {
    return <div className="p-8 text-center text-muted-foreground">{t("driverDetail.notFound")}</div>;
  }

  return (
    <div className="p-8 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link href="/drivers"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex items-start gap-4 flex-1">
          <div className="h-16 w-16 rounded-xl overflow-hidden bg-primary/10 flex items-center justify-center shrink-0 border border-border">
            {profilePhotoDoc?.fileUrl ? (
              <img src={profilePhotoDoc.fileUrl} alt="Profile" className="w-full h-full object-cover"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
            ) : (
              <UserCircle className="h-9 w-9 text-primary" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold">{driver.name}</h1>
              <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[driver.status]}`}>{driver.status}</Badge>
              <Badge variant="outline" className={`text-[10px] ${driver.isActive ? "text-green-600 border-green-500/30 bg-green-500/10" : "text-destructive border-destructive/30 bg-destructive/10"}`}>
                {driver.isActive ? t("driverDetail.active") : t("common.inactive")}
              </Badge>
              {userInfo?.isBlocked && <Badge variant="destructive" className="text-[10px]">{t("driverDetail.accountBlocked")}</Badge>}
              {pendingDocs > 0 && <Badge variant="secondary" className="text-[10px] text-amber-600">{pendingDocs} {t("driverDetail.pendingLabel")}</Badge>}
            </div>
            <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{driver.phone}</span>
              <span className="flex items-center gap-1">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                <span className="font-semibold text-foreground">{Number(driver.rating).toFixed(1)}</span>
              </span>
              <span className="flex items-center gap-1"><Activity className="h-3 w-3" /><span className="font-semibold text-foreground">{totalTrips}</span> {t("nav.trips")}</span>
              <span className="flex items-center gap-1"><Hash className="h-3 w-3" />Driver ID #{driver.id}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={userInfo?.isBlocked ? "outline" : "destructive"}
          size="sm"
          onClick={() => {
            if (confirm(userInfo?.isBlocked ? "Unblock this driver's account?" : "Block this driver's account?"))
              toggleBlockMutation.mutate();
          }}
          disabled={toggleBlockMutation.isPending}
        >
          {userInfo?.isBlocked ? <ShieldCheck className="h-3.5 w-3.5 mr-1.5" /> : <ShieldX className="h-3.5 w-3.5 mr-1.5" />}
          {userInfo?.isBlocked ? t("driverDetail.unblockAccount") : t("driverDetail.blockAccount")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (confirm(driver.isActive ? "Suspend this driver?" : "Activate this driver?"))
              toggleActiveMutation.mutate();
          }}
          disabled={toggleActiveMutation.isPending}
        >
          {driver.isActive ? <ToggleLeft className="h-3.5 w-3.5 mr-1.5" /> : <ToggleRight className="h-3.5 w-3.5 mr-1.5 text-green-600" />}
          {driver.isActive ? t("driverDetail.suspendDriver") : t("driverDetail.activateDriver")}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setPromoOpen(true)}>
          <Tag className="h-3.5 w-3.5 mr-1.5" /> {t("driverDetail.sendPromo")}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setMsgOpen(true)}>
          <MessageSquare className="h-3.5 w-3.5 mr-1.5" /> {t("driverDetail.sendMessage")}
        </Button>
        <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="h-3.5 w-3.5 mr-1.5" /> {t("driverDetail.deleteAccount")}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: t("driverDetail.rating"), value: `${Number(driver.rating).toFixed(1)} / 5`, icon: Star, color: "bg-amber-500/10 text-amber-600" },
          { label: t("driverDetail.totalTripsLabel"), value: totalTrips, icon: Activity, color: "bg-blue-500/10 text-blue-600" },
          { label: t("driverDetail.walletBalance"), value: formatEGP(userInfo?.walletBalance ?? 0), icon: Wallet, color: "bg-green-500/10 text-green-600" },
          { label: t("driverDetail.documents"), value: `${documents.length} / ${ALL_DOC_TYPES.length}`, icon: FileImage, color: "bg-purple-500/10 text-purple-600" },
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
      <Tabs defaultValue="overview">
        <TabsList className="mb-4">
          <TabsTrigger value="overview">{t("driverDetail.tabOverview")}</TabsTrigger>
          <TabsTrigger value="trips">{t("driverDetail.tabTrips")}</TabsTrigger>
          <TabsTrigger value="documents">
            {t("driverDetail.tabDocuments")}
            {pendingDocs > 0 && <span className="ml-1.5 inline-flex items-center justify-center h-4 w-4 rounded-full bg-amber-500 text-white text-[9px] font-bold">{pendingDocs}</span>}
          </TabsTrigger>
          <TabsTrigger value="locations">{t("locations.tabLocationHistory", "Location History")}</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-base">{t("driverDetail.driverInfo")}</CardTitle></CardHeader>
              <CardContent>
                <InfoRow icon={Phone} label={t("driverDetail.phone")} value={driver.phone} />
                <InfoRow icon={Mail} label={t("driverDetail.userAccountId")} value={`#${driver.userId}`} />
                <InfoRow icon={Hash} label={t("driverDetail.licenseNumber")} value={driver.licenseNumber} />
                <InfoRow icon={Hash} label={t("driverDetail.nationalId")} value={driver.nationalId} />
                <InfoRow icon={Bus} label={t("driverDetail.assignedBus")} value={driver.assignedBusId ? `Bus #${driver.assignedBusId}` : null} />
                <InfoRow icon={CalendarDays} label={t("driverDetail.joined")} value={format(new Date(driver.createdAt), "PPP")} />
                <InfoRow icon={Clock} label={t("driverDetail.lastUpdated")} value={
                  `${format(parseISO(driver.updatedAt), "MMM d, yyyy HH:mm")} (${formatDistanceToNow(parseISO(driver.updatedAt), { addSuffix: true })})`
                } />
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">{t("driverDetail.accountStatus")}</CardTitle></CardHeader>
              <CardContent>
                <InfoRow icon={Activity} label={t("driverDetail.driverStatus")} value={
                  <Badge className={`text-[10px] ${STATUS_COLORS[driver.status]}`}>{driver.status}</Badge>
                } />
                <InfoRow icon={ShieldCheck} label={t("driverDetail.account")} value={
                  userInfo?.isBlocked
                    ? <Badge variant="destructive" className="text-[10px]">{t("driverDetail.blocked")}</Badge>
                    : <Badge variant="secondary" className="text-[10px] text-green-600">{t("driverDetail.active")}</Badge>
                } />
                <InfoRow icon={ToggleRight} label={t("driverDetail.driverActive")} value={
                  driver.isActive
                    ? <Badge variant="secondary" className="text-[10px] text-green-600">{t("driverDetail.active")}</Badge>
                    : <Badge variant="destructive" className="text-[10px]">{t("driverDetail.suspended")}</Badge>
                } />
                <InfoRow icon={Star} label={t("driverDetail.rating")} value={
                  <div className="flex items-center gap-1">
                    {[1,2,3,4,5].map((i) => (
                      <Star key={i} className={`h-3.5 w-3.5 ${i <= Math.round(driver.rating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
                    ))}
                    <span className="text-sm font-bold ml-1">{Number(driver.rating).toFixed(1)}</span>
                  </div>
                } />
                <InfoRow icon={Wallet} label={t("driverDetail.walletBalance")} value={<span className="font-bold text-green-600">{formatEGP(userInfo?.walletBalance ?? 0)}</span>} />
                <InfoRow icon={CheckCircle2} label={t("driverDetail.docsApproved")} value={`${documents.filter((d) => d.verificationStatus === "approved").length} of ${documents.length}`} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Trips */}
        <TabsContent value="trips">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" /> {t("driverDetail.tripHistory")} ({totalTrips})</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("driverDetail.colTripId")}</TableHead>
                    <TableHead>{t("driverDetail.colDeparture")}</TableHead>
                    <TableHead>{t("driverDetail.colArrival")}</TableHead>
                    <TableHead>{t("driverDetail.colSeats")}</TableHead>
                    <TableHead>{t("driverDetail.colStatus")}</TableHead>
                    <TableHead className="text-right">{t("driverDetail.colPrice")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tripsLoading ? (
                    [...Array(5)].map((_, i) => (
                      <TableRow key={i}>{[...Array(6)].map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                    ))
                  ) : !trips.length ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">{t("driverDetail.noTrips")}</TableCell></TableRow>
                  ) : (
                    trips.map((tr) => (
                      <TableRow key={tr.id}>
                        <TableCell className="font-mono text-sm">#{tr.id}</TableCell>
                        <TableCell className="text-sm">{format(new Date(tr.departureTime), "MMM d, HH:mm")}</TableCell>
                        <TableCell className="text-sm">{format(new Date(tr.arrivalTime), "MMM d, HH:mm")}</TableCell>
                        <TableCell className="text-sm">{tr.totalSeats - tr.availableSeats}/{tr.totalSeats}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`capitalize text-[10px] ${
                            tr.status === "completed" ? "text-green-600 border-green-200 bg-green-50 dark:bg-green-950" :
                            tr.status === "cancelled" ? "text-red-500 border-red-200 bg-red-50 dark:bg-red-950" :
                            tr.status === "active" ? "text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-950" : ""
                          }`}>{TRIP_STATUS_LABELS[tr.status] ?? tr.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">{formatEGP(tr.price)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
            {tripsTotalPages > 1 && (
              <div className="border-t border-border p-3">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious onClick={() => setTripsPage((p) => Math.max(1, p - 1))} className={tripsPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"} />
                    </PaginationItem>
                    <PaginationItem className="text-sm text-muted-foreground px-4">{tripsPage} / {tripsTotalPages}</PaginationItem>
                    <PaginationItem>
                      <PaginationNext onClick={() => setTripsPage((p) => Math.min(tripsTotalPages, p + 1))} className={tripsPage >= tripsTotalPages ? "pointer-events-none opacity-50" : "cursor-pointer"} />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Documents */}
        <TabsContent value="documents">
          {docsLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-52 rounded-xl" />)}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Summary */}
              <div className="flex gap-4 flex-wrap">
                {[
                  { label: t("driverDetail.approvedLabel"), count: documents.filter((d) => d.verificationStatus === "approved").length, color: "text-green-600 bg-green-500/10" },
                  { label: t("driverDetail.pendingLabel"), count: documents.filter((d) => d.verificationStatus === "pending").length, color: "text-amber-600 bg-amber-500/10" },
                  { label: t("driverDetail.rejectedLabel"), count: documents.filter((d) => d.verificationStatus === "rejected").length, color: "text-red-600 bg-red-500/10" },
                  { label: t("common.notFound"), count: ALL_DOC_TYPES.length - documents.length, color: "text-muted-foreground bg-muted" },
                ].map((s) => (
                  <div key={s.label} className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium ${s.color}`}>
                    {s.label}: <span className="font-bold">{s.count}</span>
                  </div>
                ))}
              </div>

              {/* Doc grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {ALL_DOC_TYPES.map(({ type, labelEn }) => {
                  const doc = documents.find((d) => d.type === type);
                  if (!doc) {
                    return (
                      <div key={type} className="rounded-xl border border-dashed border-border bg-muted/20 flex flex-col items-center justify-center p-4 min-h-[180px] gap-2 text-center">
                        <FileImage className="h-7 w-7 text-muted-foreground/30" />
                        <p className="text-xs font-medium text-muted-foreground">{labelEn}</p>
                        <Badge variant="outline" className="text-[10px] mt-1 text-muted-foreground">{t("driverDetail.notUploaded")}</Badge>
                      </div>
                    );
                  }
                  return (
                    <div key={type} className="rounded-xl border border-border overflow-hidden bg-card flex flex-col">
                      <div className="group relative aspect-video bg-muted flex items-center justify-center cursor-pointer" onClick={() => setZoomDoc(doc)}>
                        {doc.fileUrl ? (
                          <img src={doc.fileUrl} alt={labelEn} className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        ) : (
                          <FileImage className="h-8 w-8 text-muted-foreground/40" />
                        )}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <ZoomIn className="h-6 w-6 text-white" />
                        </div>
                      </div>
                      <div className="p-2.5 flex flex-col gap-1.5 flex-1">
                        <p className="text-xs font-semibold leading-tight">{labelEn}</p>
                        <p className="text-[10px] text-muted-foreground">{format(new Date(doc.uploadedAt), "MMM d, yyyy")}</p>
                        <DocStatusBadge status={doc.verificationStatus} />
                        {doc.verificationStatus === "pending" && (
                          <div className="flex gap-1 mt-1">
                            <Button size="sm" variant="destructive" className="flex-1 h-6 text-[10px] px-1" disabled={verifyMutation.isPending}
                              onClick={() => verifyMutation.mutate({ id: doc.id, status: "rejected" })}>
                              <XCircle className="h-2.5 w-2.5 mr-1" />{t("common.reject")}
                            </Button>
                            <Button size="sm" className="flex-1 h-6 text-[10px] px-1" disabled={verifyMutation.isPending}
                              onClick={() => verifyMutation.mutate({ id: doc.id, status: "approved" })}>
                              <CheckCircle2 className="h-2.5 w-2.5 mr-1" />{t("common.approve")}
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </TabsContent>

        {/* Location History */}
        <TabsContent value="locations">
          <DriverLocationHistoryTab driverId={Number(driverId)} />
        </TabsContent>
      </Tabs>

      {/* ── Promo Code Dialog ────────────────────────────────────────────── */}
      <Dialog open={promoOpen} onOpenChange={setPromoOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Tag className="h-4 w-4" /> {t("driverDetail.sendPromo")}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Pick a promo code to share with {driver.name}.</p>
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
                      {promo.expiryDate ? ` · Expires ${format(parseISO(promo.expiryDate), "MMM d, yyyy")}` : ""}
                      {promo.maxUsage ? ` · ${promo.usedCount}/${promo.maxUsage} used` : ""}
                    </p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(promo.code); setCopiedCode(promo.code); setTimeout(() => setCopiedCode(null), 2000); }}>
                      {copiedCode === promo.code ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                    <Button size="sm" disabled={sendNotifMutation.isPending} onClick={() => sendNotifMutation.mutate({ title: `Promo code: ${promo.code}`, body: `You've been sent a promo code: ${promo.code}. Use it on your next booking for ${promo.discountType === "percentage" ? `${promo.discountValue}% off` : `EGP ${promo.discountValue} off`}!` })}>
                      <Bell className="h-3.5 w-3.5 mr-1.5" /> {t("driverDetail.notifyBtn")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setPromoOpen(false)}>{t("common.close")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Zoom dialog */}
      <Dialog open={!!zoomDoc} onOpenChange={(o) => !o && setZoomDoc(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{ALL_DOC_TYPES.find((d) => d.type === zoomDoc?.type)?.labelEn ?? "Document"}</DialogTitle>
          </DialogHeader>
          {zoomDoc && (
            <div className="space-y-4">
              <img src={zoomDoc.fileUrl} alt="Document" className="w-full max-h-[60vh] object-contain rounded-lg bg-muted" />
              <div className="flex items-center justify-between">
                <DocStatusBadge status={zoomDoc.verificationStatus} />
                {zoomDoc.verificationStatus === "pending" && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="destructive" disabled={verifyMutation.isPending}
                      onClick={() => verifyMutation.mutate({ id: zoomDoc.id, status: "rejected" })}>
                      <XCircle className="h-4 w-4 mr-1.5" /> {t("common.reject")}
                    </Button>
                    <Button size="sm" disabled={verifyMutation.isPending}
                      onClick={() => verifyMutation.mutate({ id: zoomDoc.id, status: "approved" })}>
                      <CheckCircle2 className="h-4 w-4 mr-1.5" /> {t("common.approve")}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Send Message Dialog ──────────────────────────────────────────────── */}
      <Dialog open={msgOpen} onOpenChange={setMsgOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><MessageSquare className="h-4 w-4" /> {t("driverDetail.sendMsgTo")} {driver?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
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
            <Button variant="outline" onClick={() => setMsgOpen(false)}>{t("common.cancel")}</Button>
            <Button
              onClick={() => { if (msgTitle.trim() && msgBody.trim()) sendMsgMutation.mutate({ title: msgTitle.trim(), body: msgBody.trim() }); }}
              disabled={sendMsgMutation.isPending || !msgTitle.trim() || !msgBody.trim()}
            >
              {sendMsgMutation.isPending ? t("common.sending") : t("common.send")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Account Dialog ────────────────────────────────────────────── */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-4 w-4" /> {t("driverDetail.deleteDriverAccount")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This will permanently delete <strong>{driver?.name}</strong>'s driver account and all associated data. This action cannot be undone.
            </p>
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              ⚠ All trips, documents, and earnings data linked to this driver will also be removed.
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

// ─── Driver Location History Tab ─────────────────────────────────────────────

type DriverLocation = {
  id: number;
  driverId: number;
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number | null;
  recordedAt: string;
};

function DriverLocationHistoryTab({ driverId }: { driverId: number }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const LIMIT = 50;

  const { data, isLoading } = useQuery<{ data: DriverLocation[]; total: number; page: number; limit: number }>({
    queryKey: ["driver-locations", driverId, page],
    queryFn: () => adminFetch(`/admin/driver-locations?driverId=${driverId}&page=${page}&limit=${LIMIT}`),
    enabled: !!driverId,
  });

  const totalPages = data ? Math.ceil(data.total / LIMIT) : 1;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4 space-y-2">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          {t("locations.tabLocationHistory", "Location History")}
        </CardTitle>
        {data && (
          <span className="text-xs text-muted-foreground">{data.total} {t("auditLogs.records", "records")}</span>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {!data?.data.length ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            {t("locations.noLocationHistory", "No location history recorded yet")}
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("locations.latitude", "Latitude")}</TableHead>
                  <TableHead>{t("locations.longitude", "Longitude")}</TableHead>
                  <TableHead>{t("locations.speed", "Speed")}</TableHead>
                  <TableHead>{t("locations.heading", "Heading")}</TableHead>
                  <TableHead>{t("auditLogs.timestamp", "Timestamp")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((loc) => (
                  <TableRow key={loc.id}>
                    <TableCell className="font-mono text-xs">{loc.latitude.toFixed(6)}</TableCell>
                    <TableCell className="font-mono text-xs">{loc.longitude.toFixed(6)}</TableCell>
                    <TableCell className="text-xs">
                      {loc.speed != null ? `${loc.speed.toFixed(1)} km/h` : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-xs">
                      {loc.heading != null ? `${loc.heading.toFixed(0)}°` : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(loc.recordedAt), "dd MMM yyyy, HH:mm:ss")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {totalPages > 1 && (
              <div className="border-t border-border p-3">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious onClick={() => setPage((p) => Math.max(1, p - 1))} className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"} />
                    </PaginationItem>
                    <PaginationItem className="text-sm text-muted-foreground px-4">{page} / {totalPages}</PaginationItem>
                    <PaginationItem>
                      <PaginationNext onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className={page >= totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"} />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
