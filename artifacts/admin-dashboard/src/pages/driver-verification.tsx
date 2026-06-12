import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  ShieldCheck, UserCircle, FileImage, CheckCircle2, XCircle,
  Clock, ChevronRight, ZoomIn, ChevronLeft, CheckCheck,
  AlertTriangle,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { useTranslation } from "react-i18next";

type DriverDocument = {
  id: number;
  driverId: number;
  type: string;
  fileUrl: string;
  mimeType: string | null;
  verificationStatus: "pending" | "approved" | "rejected";
  adminNotes: string | null;
  uploadedAt: string;
  driver: { name: string | null; phone: string | null };
};

type DriverDocs = {
  driver: { id: number; name: string; phone: string };
  documents: DriverDocument[];
};

function getDriverStatus(docs: DriverDocument[]): "verified" | "pending" | "rejected" | "empty" {
  if (docs.length === 0) return "empty";
  if (docs.some((d) => d.verificationStatus === "rejected")) return "rejected";
  if (docs.some((d) => d.verificationStatus === "pending"))  return "pending";
  return "verified";
}

const STATUS_CONFIG: Record<string, { variant: any; icon: React.ElementType; label: string; cls: string }> = {
  verified: { variant: "outline",     icon: CheckCircle2,   label: "Verified",  cls: "text-green-600 border-green-300 bg-green-50 dark:bg-green-950" },
  pending:  { variant: "secondary",   icon: Clock,          label: "Pending",   cls: "text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950" },
  rejected: { variant: "destructive", icon: AlertTriangle,  label: "Issues",    cls: "text-red-500 border-red-300 bg-red-50 dark:bg-red-950" },
  empty:    { variant: "outline",     icon: FileImage,      label: "No docs",   cls: "text-muted-foreground" },
};

export default function DriverVerification() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewDriver, setViewDriver] = useState<DriverDocs | null>(null);

  const [zoomDocList, setZoomDocList] = useState<DriverDocument[]>([]);
  const [zoomDocIndex, setZoomDocIndex] = useState(0);
  const [adminNotes, setAdminNotes] = useState("");

  const zoomDoc = zoomDocList[zoomDocIndex] ?? null;

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();

  const docTypeLabels: Record<string, string> = {
    national_id_front:       t("verification.nationalIdFront", "National ID (Front)"),
    national_id_back:        t("verification.nationalIdBack", "National ID (Back)"),
    driving_license_front:   t("verification.drivingLicenseFront", "Driving License (Front)"),
    driving_license_back:    t("verification.drivingLicenseBack", "Driving License (Back)"),
    vehicle_license_front:   t("verification.vehicleLicenseFront", "Vehicle License (Front)"),
    vehicle_license_back:    t("verification.vehicleLicenseBack", "Vehicle License (Back)"),
    vehicle_photo:           t("verification.vehiclePhoto", "Vehicle Photo"),
    profile_photo:           t("verification.profilePhoto", "Profile Photo"),
    trip_selfie:             t("verification.tripSelfie", "Trip Selfie"),
  };

  const docGroups = [
    { label: t("verification.identityDocuments", "Identity Documents"), keys: ["national_id_front", "national_id_back"] },
    { label: t("verification.licenses", "Licenses"), keys: ["driving_license_front", "driving_license_back", "vehicle_license_front", "vehicle_license_back"] },
    { label: t("verification.vehicleAndProfile", "Vehicle & Profile"), keys: ["vehicle_photo", "profile_photo"] },
    { label: t("verification.tripSelfies", "Trip Selfies"), keys: ["trip_selfie"] },
  ];

  const docStatusConfig: Record<string, { variant: any; icon: React.ElementType }> = {
    pending:  { variant: "secondary",   icon: Clock },
    approved: { variant: "default",     icon: CheckCircle2 },
    rejected: { variant: "destructive", icon: XCircle },
  };

  const params = new URLSearchParams({ page: String(page), limit: "20" });
  if (statusFilter !== "all") params.set("verificationStatus", statusFilter);

  const { data, isLoading } = useQuery({
    queryKey: ["driver-documents", page, statusFilter],
    queryFn: () => adminFetch<{ data: DriverDocument[]; total: number; limit: number }>(`/driver-documents?${params}`),
  });

  const { data: stats } = useQuery({
    queryKey: ["driver-documents-stats"],
    queryFn: () => adminFetch<Record<string, number>>("/driver-documents/stats"),
  });

  const openDriverDocs = async (driverId: number) => {
    const result = await adminFetch<DriverDocs>(`/driver-documents/by-driver/${driverId}`);
    setViewDriver(result);
  };

  const openZoom = (doc: DriverDocument, allDocs: DriverDocument[]) => {
    const idx = allDocs.findIndex((d) => d.id === doc.id);
    setZoomDocList(allDocs);
    setZoomDocIndex(idx >= 0 ? idx : 0);
    setAdminNotes(doc.adminNotes || "");
  };

  const goNextDoc = () => {
    const next = Math.min(zoomDocIndex + 1, zoomDocList.length - 1);
    setZoomDocIndex(next);
    setAdminNotes(zoomDocList[next]?.adminNotes || "");
  };

  const goPrevDoc = () => {
    const prev = Math.max(zoomDocIndex - 1, 0);
    setZoomDocIndex(prev);
    setAdminNotes(zoomDocList[prev]?.adminNotes || "");
  };

  const updateMutation = useMutation({
    mutationFn: ({ id, status, notes }: { id: number; status: string; notes: string }) =>
      adminFetch(`/driver-documents/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ verificationStatus: status, adminNotes: notes }),
      }),
    onSuccess: async (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["driver-documents"] });
      queryClient.invalidateQueries({ queryKey: ["driver-documents-stats"] });
      toast({ title: vars.status === "approved" ? t("verification.documentApproved", "Document approved") : t("verification.documentRejected", "Document rejected") });
      if (viewDriver) {
        const updated = await adminFetch<DriverDocs>(`/driver-documents/by-driver/${viewDriver.driver.id}`);
        setViewDriver(updated);
        const updatedList = updated.documents;
        setZoomDocList(updatedList);
      }
    },
  });

  const approveAllMutation = useMutation({
    mutationFn: async (driverId: number) => {
      const pendingDocs = viewDriver!.documents.filter((d) => d.verificationStatus === "pending");
      await Promise.all(
        pendingDocs.map((d) =>
          adminFetch(`/driver-documents/${d.id}`, {
            method: "PATCH",
            body: JSON.stringify({ verificationStatus: "approved", adminNotes: "" }),
          })
        )
      );
    },
    onSuccess: async () => {
      toast({ title: "All pending documents approved", description: `${viewDriver?.driver.name}'s documents have been approved.` });
      queryClient.invalidateQueries({ queryKey: ["driver-documents"] });
      queryClient.invalidateQueries({ queryKey: ["driver-documents-stats"] });
      const updated = await adminFetch<DriverDocs>(`/driver-documents/by-driver/${viewDriver!.driver.id}`);
      setViewDriver(updated);
    },
  });

  const uniqueDriverIds = [...new Set(data?.data.map((d) => d.driverId) || [])];

  const allDocsFlatForDriver = viewDriver
    ? docGroups.flatMap((g) => viewDriver.documents.filter((d) => g.keys.includes(d.type)))
    : [];

  const pendingCount = viewDriver?.documents.filter((d) => d.verificationStatus === "pending").length ?? 0;

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("verification.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("verification.subtitle")}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { key: "pending",  label: t("suggestions.pendingReview", "Pending Review"), icon: Clock,        cls: "text-amber-500" },
          { key: "approved", label: t("verification.approved"),       icon: CheckCircle2, cls: "text-green-500" },
          { key: "rejected", label: t("verification.rejected"),       icon: XCircle,      cls: "text-destructive" },
        ].map(({ key, label, icon: Icon, cls }) => (
          <Card
            key={key}
            className={`cursor-pointer transition-colors ${statusFilter === key ? "border-primary bg-primary/5" : "hover:border-primary/50"}`}
            onClick={() => { setStatusFilter(key); setPage(1); }}
          >
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <Icon className={`h-5 w-5 shrink-0 ${cls}`} />
              <div>
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="text-xl font-bold">{stats?.[key] ?? 0}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-3 bg-card p-4 rounded-xl border border-border">
        <span className="text-sm font-medium">{t("common.filter", "Filter")}:</span>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder={t("verification.allStatus", "All Status")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("verification.allDocuments", "All Documents")}</SelectItem>
            <SelectItem value="pending">{t("verification.pending")}</SelectItem>
            <SelectItem value="approved">{t("verification.approved")}</SelectItem>
            <SelectItem value="rejected">{t("verification.rejected")}</SelectItem>
          </SelectContent>
        </Select>
        {statusFilter !== "all" && (
          <Button variant="ghost" size="sm" onClick={() => setStatusFilter("all")}>Clear</Button>
        )}
        {data && <p className="ml-auto text-sm text-muted-foreground">{data.total} {t("verification.documentsTotal", "documents total")}</p>}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : uniqueDriverIds.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          <ShieldCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>{t("verification.noDocuments", "No documents found")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {uniqueDriverIds.map((driverId) => {
            const driverDocs = data!.data.filter((d) => d.driverId === driverId);
            const firstDoc = driverDocs[0];
            const driverStatus = getDriverStatus(driverDocs);
            const statusMeta = STATUS_CONFIG[driverStatus];
            const StatusIcon = statusMeta.icon;
            const pending = driverDocs.filter((d) => d.verificationStatus === "pending").length;
            const approved = driverDocs.filter((d) => d.verificationStatus === "approved").length;
            const rejected = driverDocs.filter((d) => d.verificationStatus === "rejected").length;

            return (
              <div
                key={driverId}
                className="p-4 bg-card border border-border rounded-xl flex items-center gap-4 hover:border-primary/40 cursor-pointer transition-all hover:shadow-sm"
                onClick={() => openDriverDocs(driverId)}
              >
                <div className="h-11 w-11 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <UserCircle className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">{firstDoc.driver.name || `${t("drivers.title")} #${driverId}`}</div>
                  <div className="text-xs text-muted-foreground">{firstDoc.driver.phone}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  <Badge variant="outline" className={`text-[10px] gap-1 ${statusMeta.cls}`}>
                    <StatusIcon className="h-2.5 w-2.5" />
                    {statusMeta.label}
                  </Badge>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span>{driverDocs.length} docs</span>
                    {pending > 0  && <Badge variant="secondary"    className="text-[10px]">{pending} pending</Badge>}
                    {approved > 0 && <Badge variant="outline"      className="text-[10px] text-green-600">{approved} ✓</Badge>}
                    {rejected > 0 && <Badge variant="destructive"  className="text-[10px]">{rejected} ✗</Badge>}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {data && data.total > data.limit && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious onClick={() => setPage((p) => Math.max(1, p - 1))}
                className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"} />
            </PaginationItem>
            <PaginationItem className="text-sm text-muted-foreground px-4">
              {t("common.page", "Page")} {page} {t("common.of", "of")} {Math.ceil(data.total / data.limit)}
            </PaginationItem>
            <PaginationItem>
              <PaginationNext onClick={() => setPage((p) => p + 1)}
                className={page >= Math.ceil(data.total / data.limit) ? "pointer-events-none opacity-50" : "cursor-pointer"} />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      {/* Driver Documents Panel */}
      <Dialog open={!!viewDriver} onOpenChange={(open) => !open && setViewDriver(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between gap-3">
              <DialogTitle className="flex items-center gap-2">
                <UserCircle className="h-5 w-5" />
                {viewDriver?.driver.name} — {t("verification.documents", "Documents")}
              </DialogTitle>
              {pendingCount > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-green-600 border-green-300 hover:bg-green-50 shrink-0"
                  disabled={approveAllMutation.isPending}
                  onClick={() => approveAllMutation.mutate(viewDriver!.driver.id)}
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  {approveAllMutation.isPending ? "Approving…" : `Approve All (${pendingCount})`}
                </Button>
              )}
            </div>
            {viewDriver && (
              <div className="flex items-center gap-2 pt-1">
                {(() => {
                  const st = getDriverStatus(viewDriver.documents);
                  const meta = STATUS_CONFIG[st];
                  const Icon = meta.icon;
                  return (
                    <Badge variant="outline" className={`text-xs gap-1 ${meta.cls}`}>
                      <Icon className="h-3 w-3" /> {meta.label}
                    </Badge>
                  );
                })()}
                <span className="text-xs text-muted-foreground">
                  {viewDriver.documents.length} document{viewDriver.documents.length !== 1 ? "s" : ""} uploaded
                </span>
              </div>
            )}
          </DialogHeader>

          {viewDriver && (() => {
            const REQUIRED_DOC_TYPES = [
              "national_id_front", "national_id_back",
              "driving_license_front", "driving_license_back",
              "vehicle_license_front", "vehicle_license_back",
              "profile_photo", "vehicle_photo",
            ];
            const approvedRequiredCount = REQUIRED_DOC_TYPES.filter((type) =>
              viewDriver.documents.some((d) => d.type === type && d.verificationStatus === "approved")
            ).length;
            const allAlreadyApproved = approvedRequiredCount === REQUIRED_DOC_TYPES.length;
            const isSeventhApproved = approvedRequiredCount === 7;
            return (
              <>
                {isSeventhApproved && !allAlreadyApproved && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950 p-3 flex items-start gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-800 dark:text-amber-200 font-medium">
                      Approving this final required document will trigger <strong>immediate automatic account activation</strong> for this driver.
                    </p>
                  </div>
                )}
                {allAlreadyApproved && (
                  <div className="rounded-lg border border-green-300 bg-green-50 dark:bg-green-950 p-3 flex items-start gap-2 mb-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                    <p className="text-sm text-green-800 dark:text-green-200 font-medium">
                      All required documents approved — this driver's account has been automatically activated.
                    </p>
                  </div>
                )}
              </>
            );
          })()}

          {viewDriver && (
            <div className="flex-1 overflow-y-auto space-y-6 pr-1">
              {docGroups.map((group) => {
                const groupDocs = viewDriver.documents.filter((d) => group.keys.includes(d.type));
                if (groupDocs.length === 0) return null;
                return (
                  <div key={group.label}>
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">{group.label}</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {groupDocs.map((doc) => {
                        const cfg = docStatusConfig[doc.verificationStatus];
                        const StatusIcon = cfg.icon;
                        return (
                          <div key={doc.id} className="group relative rounded-xl border border-border overflow-hidden bg-muted/30 hover:border-primary/40 transition-colors">
                            <div
                              className="aspect-video bg-muted flex items-center justify-center cursor-pointer relative"
                              onClick={() => openZoom(doc, allDocsFlatForDriver)}
                            >
                              {doc.fileUrl ? (
                                <img
                                  src={doc.fileUrl}
                                  alt={docTypeLabels[doc.type]}
                                  className="w-full h-full object-cover"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                />
                              ) : (
                                <FileImage className="h-8 w-8 text-muted-foreground" />
                              )}
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <ZoomIn className="h-6 w-6 text-white" />
                              </div>
                            </div>
                            <div className="p-2">
                              <p className="text-xs font-medium truncate">{docTypeLabels[doc.type] || doc.type}</p>
                              <div className="flex items-center gap-1 mt-1">
                                <Badge variant={cfg.variant} className="text-[10px]">
                                  <StatusIcon className="h-2.5 w-2.5 mr-1" />
                                  {doc.verificationStatus}
                                </Badge>
                              </div>
                              {doc.adminNotes && (
                                <p className="text-[10px] text-muted-foreground mt-1 truncate">{doc.adminNotes}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {viewDriver.documents.length === 0 && (
                <div className="py-10 text-center text-muted-foreground">
                  <FileImage className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">{t("verification.noDocumentsUploaded", "No documents uploaded yet")}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Document Zoom + Review Panel */}
      <Dialog open={!!zoomDoc} onOpenChange={(open) => !open && setZoomDocList([])}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <FileImage className="h-5 w-5" />
                {zoomDoc ? docTypeLabels[zoomDoc.type] || zoomDoc.type : ""}
              </DialogTitle>
              {zoomDocList.length > 1 && (
                <span className="text-xs text-muted-foreground">
                  {zoomDocIndex + 1} / {zoomDocList.length}
                </span>
              )}
            </div>
          </DialogHeader>

          {zoomDoc && (
            <div className="space-y-4">
              <div className="relative">
                <div className="rounded-xl overflow-hidden bg-muted flex items-center justify-center min-h-[200px] max-h-[360px]">
                  {zoomDoc.fileUrl ? (
                    <img
                      src={zoomDoc.fileUrl}
                      alt="Document"
                      className="max-w-full max-h-[360px] object-contain"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground py-10">
                      <FileImage className="h-12 w-12 opacity-30" />
                      <p className="text-sm">{t("verification.imageNotAvailable", "Image not available")}</p>
                    </div>
                  )}
                </div>

                {zoomDocList.length > 1 && (
                  <>
                    <button
                      onClick={goPrevDoc}
                      disabled={zoomDocIndex === 0}
                      className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/60 text-white flex items-center justify-center disabled:opacity-30 hover:bg-black/80 transition-colors"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      onClick={goNextDoc}
                      disabled={zoomDocIndex === zoomDocList.length - 1}
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/60 text-white flex items-center justify-center disabled:opacity-30 hover:bg-black/80 transition-colors"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>

              {zoomDocList.length > 1 && (
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {zoomDocList.map((d, i) => {
                    const isActive = i === zoomDocIndex;
                    const cfg = docStatusConfig[d.verificationStatus];
                    return (
                      <button
                        key={d.id}
                        onClick={() => { setZoomDocIndex(i); setAdminNotes(d.adminNotes || ""); }}
                        className={`shrink-0 h-12 w-16 rounded-lg border-2 overflow-hidden transition-all ${isActive ? "border-primary" : "border-border opacity-60 hover:opacity-90"}`}
                      >
                        {d.fileUrl ? (
                          <img src={d.fileUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className={`w-full h-full flex items-center justify-center bg-muted`}>
                            <cfg.icon className="h-3 w-3 text-muted-foreground" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>Uploaded {format(new Date(zoomDoc.uploadedAt), "MMM d, yyyy HH:mm")}</span>
                {zoomDoc.mimeType && <><span>·</span><span>{zoomDoc.mimeType}</span></>}
              </div>

              {zoomDoc.adminNotes && (
                <div className="bg-muted/50 rounded-lg p-3 text-sm">
                  <span className="font-medium text-xs text-muted-foreground">Previous note: </span>
                  {zoomDoc.adminNotes}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">{t("verification.adminNotes", "Admin Notes")}</label>
                <Textarea
                  placeholder={t("verification.notesPlaceholder", "Optional notes about this document...")}
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="flex gap-3">
                <Button
                  variant="destructive"
                  className="flex-1"
                  disabled={updateMutation.isPending || zoomDoc.verificationStatus === "rejected"}
                  onClick={() => updateMutation.mutate({ id: zoomDoc.id, status: "rejected", notes: adminNotes })}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  {zoomDoc.verificationStatus === "rejected" ? t("verification.rejected") : t("verification.reject", "Reject")}
                </Button>
                <Button
                  className="flex-1"
                  disabled={updateMutation.isPending || zoomDoc.verificationStatus === "approved"}
                  onClick={() => updateMutation.mutate({ id: zoomDoc.id, status: "approved", notes: adminNotes })}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  {zoomDoc.verificationStatus === "approved" ? t("verification.approved") : t("verification.approve", "Approve")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
