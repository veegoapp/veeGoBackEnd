import React, { useState } from "react";
import {
  useListVehicles,
  useCreateVehicle,
  useUpdateVehicle,
  useDeleteVehicle,
  getListVehiclesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Car, Plus, Edit, Trash2, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { useTranslation } from "react-i18next";

const vehicleSchema = z.object({
  driverId: z.coerce.number().int().min(1, "Driver ID is required"),
  plateNumber: z.string().min(1, "Plate number is required"),
  make: z.string().min(1, "Make is required"),
  model: z.string().min(1, "Model is required"),
  year: z.coerce.number().int().min(1900).max(new Date().getFullYear() + 1, "Invalid year"),
  color: z.string().min(1, "Color is required"),
  vehicleType: z.enum(["car", "motorcycle", "van", "minibus"]),
  status: z.enum(["pending", "verified", "rejected", "suspended"]).optional(),
  isActive: z.boolean().optional(),
});

type VehicleFormValues = z.infer<typeof vehicleSchema>;

const STATUS_COLORS: Record<string, string> = {
  verified: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100",
  suspended: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100",
};

const TYPE_LABELS: Record<string, string> = {
  car: "Car",
  motorcycle: "Motorcycle",
  van: "Van",
  minibus: "Minibus",
};

export default function Vehicles() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();

  const { data, isLoading } = useListVehicles({
    page,
    limit: 10,
    search: search || undefined,
    status: statusFilter !== "all" ? (statusFilter as any) : undefined,
    vehicleType: typeFilter !== "all" ? (typeFilter as any) : undefined,
  });

  const createMutation = useCreateVehicle();
  const updateMutation = useUpdateVehicle();
  const deleteMutation = useDeleteVehicle();

  const form = useForm<VehicleFormValues>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: {
      driverId: 0,
      plateNumber: "",
      make: "",
      model: "",
      year: new Date().getFullYear(),
      color: "",
      vehicleType: "car",
      status: "pending",
      isActive: true,
    },
  });

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const handleFilterChange = () => {
    setPage(1);
  };

  const onSubmitCreate = (values: VehicleFormValues) => {
    createMutation.mutate({ data: values }, {
      onSuccess: () => {
        toast({ title: t("vehicles.added", "Vehicle added successfully") });
        setIsCreateOpen(false);
        form.reset();
        queryClient.invalidateQueries({ queryKey: getListVehiclesQueryKey() });
      },
      onError: (err: any) => {
        toast({ title: t("common.error"), description: err?.message ?? "Failed to add vehicle", variant: "destructive" });
      },
    });
  };

  const onSubmitEdit = (values: VehicleFormValues) => {
    if (!editId) return;
    updateMutation.mutate({ id: editId, data: values }, {
      onSuccess: () => {
        toast({ title: t("vehicles.updated", "Vehicle updated") });
        setEditId(null);
        form.reset();
        queryClient.invalidateQueries({ queryKey: getListVehiclesQueryKey() });
      },
      onError: (err: any) => {
        toast({ title: t("common.error"), description: err?.message ?? "Failed to update vehicle", variant: "destructive" });
      },
    });
  };

  const handleDelete = (id: number) => {
    if (confirm(t("vehicles.deleteConfirm", "Are you sure you want to remove this vehicle?"))) {
      deleteMutation.mutate({ id }, {
        onSuccess: () => {
          toast({ title: t("vehicles.removed", "Vehicle removed") });
          queryClient.invalidateQueries({ queryKey: getListVehiclesQueryKey() });
        },
      });
    }
  };

  const handleOpenEdit = (vehicle: any) => {
    form.reset({
      driverId: vehicle.driverId,
      plateNumber: vehicle.plateNumber,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      color: vehicle.color,
      vehicleType: vehicle.vehicleType,
      status: vehicle.status,
      isActive: vehicle.isActive,
    });
    setEditId(vehicle.id);
  };

  const VehicleForm = ({ onSubmit, submitLabel }: { onSubmit: (v: VehicleFormValues) => void; submitLabel: string }) => (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField control={form.control} name="driverId" render={({ field }) => (
            <FormItem>
              <FormLabel>{t("vehicles.driverId", "Driver ID")}</FormLabel>
              <FormControl><Input type="number" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="plateNumber" render={({ field }) => (
            <FormItem>
              <FormLabel>{t("vehicles.plateNumber", "Plate Number")}</FormLabel>
              <FormControl><Input placeholder="ABC-123" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="make" render={({ field }) => (
            <FormItem>
              <FormLabel>{t("vehicles.make", "Make")}</FormLabel>
              <FormControl><Input placeholder="Toyota" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="model" render={({ field }) => (
            <FormItem>
              <FormLabel>{t("vehicles.model", "Model")}</FormLabel>
              <FormControl><Input placeholder="Corolla" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="year" render={({ field }) => (
            <FormItem>
              <FormLabel>{t("vehicles.year", "Year")}</FormLabel>
              <FormControl><Input type="number" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="color" render={({ field }) => (
            <FormItem>
              <FormLabel>{t("vehicles.color", "Color")}</FormLabel>
              <FormControl><Input placeholder="White" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField control={form.control} name="vehicleType" render={({ field }) => (
            <FormItem>
              <FormLabel>{t("vehicles.type", "Vehicle Type")}</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="car">Car</SelectItem>
                  <SelectItem value="motorcycle">Motorcycle</SelectItem>
                  <SelectItem value="van">Van</SelectItem>
                  <SelectItem value="minibus">Minibus</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="status" render={({ field }) => (
            <FormItem>
              <FormLabel>{t("common.status")}</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="verified">Verified</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>{submitLabel}</Button>
        </DialogFooter>
      </form>
    </Form>
  );

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Car className="h-7 w-7 text-primary" />
            {t("vehicles.title", "Vehicles")}
          </h1>
          <p className="text-muted-foreground text-sm">{t("vehicles.subtitle", "Manage all registered driver vehicles")}</p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> {t("vehicles.addVehicle", "Add Vehicle")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("vehicles.addNewVehicle", "Add New Vehicle")}</DialogTitle>
            </DialogHeader>
            <VehicleForm onSubmit={onSubmitCreate} submitLabel={t("vehicles.addVehicle", "Add Vehicle")} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-2 flex-1">
          <Input
            placeholder={t("vehicles.searchPlaceholder", "Search by plate, make or model...")}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="max-w-xs"
          />
          <Button variant="outline" size="icon" onClick={handleSearch}>
            <Search className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); handleFilterChange(); }}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder={t("common.status")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all", "All Statuses")}</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="verified">Verified</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); handleFilterChange(); }}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder={t("vehicles.type", "Type")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all", "All Types")}</SelectItem>
              <SelectItem value="car">Car</SelectItem>
              <SelectItem value="motorcycle">Motorcycle</SelectItem>
              <SelectItem value="van">Van</SelectItem>
              <SelectItem value="minibus">Minibus</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("common.id", "ID")}</TableHead>
              <TableHead>{t("vehicles.vehicle", "Vehicle")}</TableHead>
              <TableHead>{t("vehicles.plateNumber", "Plate")}</TableHead>
              <TableHead>{t("vehicles.type", "Type")}</TableHead>
              <TableHead>{t("vehicles.year", "Year")}</TableHead>
              <TableHead>{t("vehicles.driver", "Driver")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead className="text-right">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(8)].map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-6 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : data?.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                  {t("vehicles.noVehicles", "No vehicles found")}
                </TableCell>
              </TableRow>
            ) : (
              data?.data.map((vehicle: any) => (
                <TableRow key={vehicle.id}>
                  <TableCell className="font-medium">#{vehicle.id}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-semibold">{vehicle.make} {vehicle.model}</span>
                      <span className="text-xs text-muted-foreground capitalize">{vehicle.color}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono font-bold">{vehicle.plateNumber}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {TYPE_LABELS[vehicle.vehicleType] ?? vehicle.vehicleType}
                    </Badge>
                  </TableCell>
                  <TableCell>{vehicle.year}</TableCell>
                  <TableCell>
                    {vehicle.driverName ? (
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{vehicle.driverName}</span>
                        <span className="text-xs text-muted-foreground">{vehicle.driverPhone}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={STATUS_COLORS[vehicle.status] ?? ""}>
                      {vehicle.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(vehicle)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(vehicle.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
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
              {t("common.page")} {page} {t("common.of")} {Math.ceil(data.total / data.limit)}
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

      <Dialog open={!!editId} onOpenChange={(open) => !open && setEditId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("vehicles.editVehicle", "Edit Vehicle")}</DialogTitle>
          </DialogHeader>
          <VehicleForm onSubmit={onSubmitEdit} submitLabel={t("vehicles.updateVehicle", "Update Vehicle")} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
