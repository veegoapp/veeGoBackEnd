import React, { useState, useMemo } from "react";
import { Link } from "wouter";
import { 
  useListRoutes, 
  useCreateRoute, 
  useUpdateRoute, 
  useDeleteRoute,
  useListTrips,
  getListRoutesQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Map, Plus, MoreHorizontal, Edit, Trash2, Search, ArrowRight, Route as RouteIcon, Clock, Banknote } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { formatEGP } from "@/lib/currency";
import { Label } from "@/components/ui/label";
import { useTranslation } from "react-i18next";

const routeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  fromLocation: z.string().min(1, "Origin is required"),
  toLocation: z.string().min(1, "Destination is required"),
  estimatedDuration: z.coerce.number().min(1, "Duration must be at least 1 minute"),
  basePrice: z.coerce.number().min(0, "Price must be positive"),
  isActive: z.boolean().default(true),
});

type RouteFormValues = z.infer<typeof routeSchema>;

function RouteActivityBadges({ stats }: { stats?: { total: number; active: number; scheduled: number } }) {
  const { t } = useTranslation();
  if (!stats || stats.total === 0) {
    return <span className="text-xs text-muted-foreground/50">—</span>;
  }
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {stats.active > 0 && (
        <span className="inline-flex items-center rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-xs font-medium">
          {stats.active} {t("routes.active")}
        </span>
      )}
      {stats.scheduled > 0 && (
        <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-xs font-medium">
          {stats.scheduled} {t("dashboard.scheduled")}
        </span>
      )}
      <span className="text-xs text-muted-foreground">{stats.total} {t("common.total")}</span>
    </div>
  );
}

export default function RoutesList() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editRoute, setEditRoute] = useState<any | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();

  const { data, isLoading } = useListRoutes({
    page,
    limit: 10,
    search: search || undefined,
  });

  const { data: allTripsData } = useListTrips({ limit: 500 }, { query: { staleTime: 60_000 } } as any);

  const tripStats = useMemo(() => {
    const map: Record<number, { total: number; active: number; scheduled: number }> = {};
    for (const trip of allTripsData?.data ?? []) {
      if (!map[trip.routeId]) map[trip.routeId] = { total: 0, active: 0, scheduled: 0 };
      map[trip.routeId].total++;
      if ((trip.status as string) === "active" || (trip.status as string) === "waiting_driver" || (trip.status as string) === "boarding") map[trip.routeId].active++;
      if ((trip.status as string) === "scheduled" || (trip.status as string) === "driver_assigned") map[trip.routeId].scheduled++;
    }
    return map;
  }, [allTripsData]);

  const createMutation = useCreateRoute();
  const updateMutation = useUpdateRoute();
  const deleteMutation = useDeleteRoute();

  const createForm = useForm<RouteFormValues>({
    resolver: zodResolver(routeSchema),
    defaultValues: {
      name: "",
      fromLocation: "",
      toLocation: "",
      estimatedDuration: 60,
      basePrice: 0,
      isActive: true,
    },
  });

  const editForm = useForm<RouteFormValues>({
    resolver: zodResolver(routeSchema),
    defaultValues: {
      name: "",
      fromLocation: "",
      toLocation: "",
      estimatedDuration: 60,
      basePrice: 0,
      isActive: true,
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const onSubmitCreate = (values: RouteFormValues) => {
    createMutation.mutate({ data: values }, {
      onSuccess: () => {
        toast({ title: t("routes.routeCreated", "Route created successfully") });
        setIsCreateOpen(false);
        createForm.reset();
        queryClient.invalidateQueries({ queryKey: getListRoutesQueryKey() });
      },
      onError: () => {
        toast({ title: t("routes.routeCreateFailed", "Failed to create route"), variant: "destructive" });
      }
    });
  };

  const onSubmitEdit = (values: RouteFormValues) => {
    if (!editRoute) return;
    updateMutation.mutate({ id: editRoute.id, data: values }, {
      onSuccess: () => {
        toast({ title: t("routes.routeUpdated", "Route updated successfully") });
        setEditRoute(null);
        queryClient.invalidateQueries({ queryKey: getListRoutesQueryKey() });
      },
      onError: () => {
        toast({ title: t("routes.routeUpdateFailed", "Failed to update route"), variant: "destructive" });
      }
    });
  };

  const handleDelete = (id: number) => {
    if (confirm(t("routes.deleteConfirm", "Delete this route? All associated stations will also be removed."))) {
      deleteMutation.mutate({ id }, {
        onSuccess: () => {
          toast({ title: t("routes.routeDeleted", "Route deleted") });
          queryClient.invalidateQueries({ queryKey: getListRoutesQueryKey() });
        }
      });
    }
  };

  const handleOpenEdit = (route: any) => {
    editForm.reset({
      name: route.name,
      fromLocation: route.fromLocation,
      toLocation: route.toLocation,
      estimatedDuration: route.estimatedDuration,
      basePrice: route.basePrice,
      isActive: route.isActive,
    });
    setEditRoute(route);
  };

  const handleToggleActive = (route: any) => {
    setTogglingId(route.id);
    updateMutation.mutate({ id: route.id, data: { isActive: !route.isActive } }, {
      onSuccess: () => {
        toast({
          title: !route.isActive ? t("routes.routeActivated", "Route activated") : t("routes.routeDeactivated", "Route deactivated"),
        });
        queryClient.invalidateQueries({ queryKey: getListRoutesQueryKey() });
      },
      onSettled: () => setTogglingId(null),
    });
  };

  const RouteForm = ({ form, onSubmit, isPending, submitLabel }: {
    form: any;
    onSubmit: (v: RouteFormValues) => void;
    isPending: boolean;
    submitLabel: string;
  }) => (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("routes.routeName")}</FormLabel>
              <FormControl><Input placeholder="e.g. Nasr City → Smart Village #1" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="fromLocation"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("routes.from")}</FormLabel>
                <FormControl><Input placeholder="e.g. Nasr City" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="toLocation"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("routes.to")}</FormLabel>
                <FormControl><Input placeholder="e.g. Smart Village" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="estimatedDuration"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("routes.durationMin", "Duration (minutes)")}</FormLabel>
                <FormControl><Input type="number" min={1} {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="basePrice"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("routes.basePriceEGP", "Base Price (EGP)")}</FormLabel>
                <FormControl><Input type="number" step="0.01" min={0} placeholder="0.00" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabel>{t("routes.activeStatus", "Active Status")}</FormLabel>
                <FormDescription className="text-xs">
                  {t("routes.inactiveHidden", "Inactive routes are hidden from passengers")}
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button type="submit" disabled={isPending}>{submitLabel}</Button>
        </DialogFooter>
      </form>
    </Form>
  );

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("routes.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("routes.managePricing", "Manage shuttle routes and pricing.")}</p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="me-2 h-4 w-4" /> {t("routes.addRoute")}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle>{t("routes.createNewRoute", "Create New Route")}</DialogTitle>
              <DialogDescription>{t("routes.createDesc", "Add a new shuttle route. Stations can be added after creation.")}</DialogDescription>
            </DialogHeader>
            <RouteForm
              form={createForm}
              onSubmit={onSubmitCreate}
              isPending={createMutation.isPending}
              submitLabel={t("routes.createRoute", "Create Route")}
            />
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={!!editRoute} onOpenChange={(open) => !open && setEditRoute(null)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{t("routes.editRoute", "Edit Route")}</DialogTitle>
            <DialogDescription>{t("routes.editDesc", "Update route details and pricing.")}</DialogDescription>
          </DialogHeader>
          <RouteForm
            form={editForm}
            onSubmit={onSubmitEdit}
            isPending={updateMutation.isPending}
            submitLabel={t("common.saveChanges")}
          />
        </DialogContent>
      </Dialog>

      <div className="flex items-center bg-card p-4 rounded-xl border border-border">
        <form onSubmit={handleSearch} className="flex-1 flex gap-2 w-full max-w-sm">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder={t("routes.searchRoutes")} 
              className="ps-9"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <Button type="submit" variant="secondary">{t("common.search")}</Button>
        </form>
        {data && (
          <p className="ms-auto text-sm text-muted-foreground">{data.total} {t("routes.routesTotal", "routes total")}</p>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("routes.title")}</TableHead>
              <TableHead>{t("routes.path", "Path")}</TableHead>
              <TableHead>{t("routes.duration")}</TableHead>
              <TableHead>{t("routes.basePrice")}</TableHead>
              <TableHead>{t("routes.activity", "Activity")}</TableHead>
              <TableHead>{t("routes.active")}</TableHead>
              <TableHead className="text-end">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-10 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-12" /></TableCell>
                  <TableCell className="text-end"><Skeleton className="h-8 w-8 ms-auto" /></TableCell>
                </TableRow>
              ))
            ) : data?.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                  {t("routes.noRoutes")}
                </TableCell>
              </TableRow>
            ) : (
              data?.data.map((route) => (
                <TableRow key={route.id}>
                  <TableCell>
                    <Link href={`/routes/${route.id}`} className="flex items-center gap-2 group">
                      <div className="h-8 w-8 rounded bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                        <Map className="h-4 w-4" />
                      </div>
                      <span className="font-medium group-hover:text-primary group-hover:underline underline-offset-2 transition-colors">{route.name}</span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-sm">
                      <span className="font-medium">{route.fromLocation}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="font-medium">{route.toLocation}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-sm">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span>{route.estimatedDuration} {t("routes.min", "min")}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-sm font-medium">
                      <Banknote className="h-3 w-3 text-muted-foreground" />
                      <span>{formatEGP(route.basePrice)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <RouteActivityBadges stats={tripStats[route.id]} />
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={route.isActive}
                      disabled={togglingId === route.id}
                      onCheckedChange={() => handleToggleActive(route)}
                      aria-label={route.isActive ? t("routes.deactivate", "Deactivate route") : t("routes.activate", "Activate route")}
                    />
                  </TableCell>
                  <TableCell className="text-end">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">{t("users.openMenu", "Open menu")}</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/routes/${route.id}`} className="flex w-full items-center cursor-pointer">
                            <RouteIcon className="me-2 h-4 w-4" />
                            {t("routes.manageStations", "Manage Stations")}
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleOpenEdit(route)}>
                          <Edit className="me-2 h-4 w-4" />
                          {t("routes.editRoute", "Edit Route")}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          onClick={() => handleDelete(route.id)}
                          className="text-destructive"
                        >
                          <Trash2 className="me-2 h-4 w-4" />
                          {t("routes.deleteRoute", "Delete Route")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
            <PaginationItem className="text-sm text-muted-foreground px-4">
              {t("common.page", "Page")} {page} {t("common.of", "of")} {Math.ceil(data.total / data.limit)}
            </PaginationItem>
            <PaginationItem>
              <PaginationNext 
                onClick={() => setPage(p => p + 1)}
                className={page >= Math.ceil(data.total / data.limit) ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
