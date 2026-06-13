import React, { useState } from "react";
import { 
  useListDrivers, 
  useCreateDriver, 
  useUpdateDriver, 
  useListBuses,
  getListDriversQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { 
  UserCircle, 
  Plus, 
  Star, 
  Bus, 
  Search, 
  Radio, 
  WifiOff 
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import DriverDetailPanel from "@/components/DriverDetailPanel";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { Clock } from "lucide-react";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";

const driverSchema = z.object({
  userId: z.coerce.number().min(1, "User ID is required to link the account"),
  name: z.string().min(1, "Name is required"),
  phone: z.string().min(1, "Phone is required"),
  assignedBusId: z.coerce.number().optional().nullable(),
});

type DriverFormValues = z.infer<typeof driverSchema>;

export default function Drivers() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [, navigate] = useLocation();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();

  const { data, isLoading } = useListDrivers({
    page: page,
    limit: 15,
  });

  const { data: busesData } = useListBuses({ limit: 100 });

  const createMutation = useCreateDriver();

  const form = useForm<DriverFormValues>({
    resolver: zodResolver(driverSchema),
    defaultValues: {
      userId: 0,
      name: "",
      phone: "",
      assignedBusId: null,
    },
  });

  const onSubmitCreate = (data: DriverFormValues) => {
    createMutation.mutate({ data: {
      ...data,
      assignedBusId: data.assignedBusId || undefined
    } }, {
      onSuccess: () => {
        toast({ title: t("drivers.driverAdded", "Driver added") });
        setIsCreateOpen(false);
        form.reset();
        queryClient.invalidateQueries({ queryKey: getListDriversQueryKey() });
      }
    });
  };

  const driversList = data?.data || [];
  const filtered = driversList.filter((d: any) => {
    if (statusFilter === "online" && !d.isOnline) return false;
    if (statusFilter === "offline" && d.isOnline) return false;

    if (search.trim()) {
      const q = search.toLowerCase();
      if (!d.name.toLowerCase().includes(q) && !d.phone.includes(q)) return false;
    }
    return true;
  });

  const onlineCount = driversList.filter((d: any) => d.isOnline).length;
  const offlineCount = driversList.filter((d: any) => !d.isOnline).length;

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Bus className="h-7 w-7 text-primary" />
            {t("drivers.title")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {t("drivers.subtitle")}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/drivers/pending">
            <Button variant="outline" className="gap-1.5 shadow-sm">
              <Clock className="h-4 w-4" />
              {t("nav.pendingVerification")}
            </Button>
          </Link>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="shadow-sm">
              <Plus className="me-2 h-4 w-4" /> {t("drivers.addDriver")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("drivers.registerDriver", "Register Driver")}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmitCreate)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="userId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("drivers.linkedUserId", "Linked User ID")}</FormLabel>
                      <FormControl><Input type="number" placeholder={t("drivers.internalUserId", "Internal User ID")} {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("drivers.fullName", "Full Name")}</FormLabel>
                      <FormControl><Input placeholder="John Doe" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("common.phone")}</FormLabel>
                      <FormControl><Input placeholder="+20 1xx xxxx xxx" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="assignedBusId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("drivers.assignBus", "Assign Default Bus (Optional)")}</FormLabel>
                      <Select onValueChange={(val) => field.onChange(val && val !== "none" ? parseInt(val) : null)} value={field.value?.toString() || ""}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder={t("drivers.selectBus", "Select a bus")} /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">{t("common.none", "None")}</SelectItem>
                          {busesData?.data.map((b: any) => (
                            <SelectItem key={b.id} value={b.id.toString()}>{t("buses.plate", "Plate")}: {b.plateNumber}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending}>{t("drivers.registerDriver", "Register Driver")}</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: t("drivers.totalDrivers", "Total Drivers"), value: driversList.length, icon: UserCircle, color: "text-primary bg-primary/10" },
          { label: t("drivers.onDuty", "On Duty"), value: onlineCount, icon: Radio, color: "text-emerald-600 bg-emerald-100 dark:bg-emerald-900 dark:text-emerald-300" },
          { label: t("drivers.offDuty", "Off Duty"), value: offlineCount, icon: Radio, color: "text-slate-500 bg-slate-100 dark:bg-slate-800 dark:text-slate-300" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-5 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${s.color}`}>
                <s.icon className="h-5 w-5" />
              </div>
              <div>
                {isLoading ? (
                  <Skeleton className="h-7 w-10 mb-1" />
                ) : (
                  <p className="text-2xl font-bold">{s.value}</p>
                )}
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 items-center bg-card p-4 rounded-xl border border-border">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="ps-9"
            placeholder={t("drivers.searchDrivers")}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder={t("drivers.allStatuses", "All Statuses")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("drivers.allStatuses", "All Statuses")}</SelectItem>
            <SelectItem value="online">{t("drivers.onDuty", "On Duty")}</SelectItem>
            <SelectItem value="offline">{t("drivers.offDuty", "Off Duty")}</SelectItem>
          </SelectContent>
        </Select>
        {(search || statusFilter !== "all") && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setStatusFilter("all"); setPage(1); }}>
            {t("common.clear", "Clear")}
          </Button>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("drivers.title")}</TableHead>
              <TableHead>{t("common.phone")}</TableHead>
              <TableHead>{t("drivers.rating")}</TableHead>
              <TableHead>{t("drivers.assignment", "Assignment")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead className="text-end pe-6"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-10 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                  <TableCell className="text-end"><Skeleton className="h-8 w-16 ms-auto" /></TableCell>
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  {t("drivers.noDrivers")}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((driver: any) => (
                <TableRow
                  key={driver.id}
                  className="hover:bg-muted/40 transition-colors cursor-pointer"
                  onClick={() => navigate(`/drivers/${driver.id}`)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 bg-primary/10 text-primary rounded-full flex items-center justify-center shrink-0">
                        <UserCircle className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="font-medium text-sm">{driver.name}</div>
                        <div className="text-xs text-muted-foreground">{t("common.id")}: #{driver.id}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{driver.phone}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-sm font-medium">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      {driver.rating ? driver.rating.toFixed(1) : "0.0"}
                    </div>
                  </TableCell>
                  <TableCell>
                    {driver.assignedBusId ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Bus className="h-3.5 w-3.5" />
                        <span className="font-medium">{t("buses.title")} #{driver.assignedBusId}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">{t("drivers.unassigned", "Unassigned")}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {driver.isOnline ? (
                      <Badge variant="outline" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100">{t("drivers.onDuty", "On Duty")}</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{t("drivers.offDuty", "Off Duty")}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-end pe-6">
                    <Link
                      href={`/drivers/${driver.id}`}
                      className="text-sm text-primary hover:underline font-medium"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {t("drivers.viewProfile", "View Profile")}
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {data && Math.ceil(data.total / 15) > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
            <PaginationItem className="text-sm text-muted-foreground px-4">
              {t("common.page")} {page} {t("common.of")} {Math.ceil(data.total / 15)}
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                onClick={() => setPage((p) => Math.min(Math.ceil(data.total / 15), p + 1))}
                className={page >= Math.ceil(data.total / 15) ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

    </div>
  );
}
