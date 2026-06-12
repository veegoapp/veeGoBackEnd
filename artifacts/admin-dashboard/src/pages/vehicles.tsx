import React, { useState } from "react";
import { useParams } from "wouter";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Car, Bike, PackageOpen, Plus, Edit, Trash2, Search, List, BookOpen } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { VehicleCatalogTab } from "@/components/VehicleCatalogTab";

const STATUS_COLORS: Record<string, string> = {
  verified:  "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
  pending:   "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100",
  rejected:  "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100",
  suspended: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100",
};

interface ServiceConfig {
  title: string;
  subtitle: string;
  Icon: React.ElementType;
  color: string;
  bg: string;
  allowedTypes: { value: string; label: string }[];
  defaultType: string;
  fixedType: boolean;
}

const SERVICE_CONFIGS: Record<string, ServiceConfig> = {
  car: {
    title: "Car Vehicles",
    subtitle: "Vehicles registered under the Car service",
    Icon: Car,
    color: "text-blue-600",
    bg: "bg-blue-500/10",
    allowedTypes: [{ value: "car", label: "Car" }],
    defaultType: "car",
    fixedType: true,
  },
  motorcycle: {
    title: "Motorcycle Vehicles",
    subtitle: "Vehicles registered under the Motorcycle service",
    Icon: Bike,
    color: "text-green-600",
    bg: "bg-green-500/10",
    allowedTypes: [{ value: "motorcycle", label: "Motorcycle" }],
    defaultType: "motorcycle",
    fixedType: true,
  },
  delivery: {
    title: "Delivery Vehicles",
    subtitle: "Vehicles registered under the Delivery service",
    Icon: PackageOpen,
    color: "text-orange-600",
    bg: "bg-orange-500/10",
    allowedTypes: [
      { value: "van",     label: "Van" },
      { value: "minibus", label: "Minibus" },
    ],
    defaultType: "van",
    fixedType: false,
  },
};

const vehicleSchema = z.object({
  driverId:    z.coerce.number().int().min(1, "Driver ID is required"),
  plateNumber: z.string().min(1, "Plate number is required"),
  make:        z.string().min(1, "Make is required"),
  model:       z.string().min(1, "Model is required"),
  year:        z.coerce.number().int().min(1900).max(new Date().getFullYear() + 1, "Invalid year"),
  color:       z.string().min(1, "Color is required"),
  vehicleType: z.enum(["car", "motorcycle", "van", "minibus"]),
  status:      z.enum(["pending", "verified", "rejected", "suspended"]).optional(),
  isActive:    z.boolean().optional(),
});

type VehicleFormValues = z.infer<typeof vehicleSchema>;

function VehicleFormDialog({
  open,
  onClose,
  title,
  defaultValues,
  allowedTypes,
  onSubmit,
  isLoading,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  defaultValues?: Partial<VehicleFormValues>;
  allowedTypes: { value: string; label: string }[];
  onSubmit: (v: VehicleFormValues) => void;
  isLoading: boolean;
}) {
  const form = useForm<VehicleFormValues>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: {
      driverId: 0,
      plateNumber: "",
      make: "",
      model: "",
      year: new Date().getFullYear(),
      color: "",
      vehicleType: (allowedTypes[0]?.value ?? "car") as VehicleFormValues["vehicleType"],
      status: "pending",
      isActive: true,
      ...defaultValues,
    },
  });

  React.useEffect(() => {
    if (open) {
      form.reset({
        driverId: 0,
        plateNumber: "",
        make: "",
        model: "",
        year: new Date().getFullYear(),
        color: "",
        vehicleType: (allowedTypes[0]?.value ?? "car") as VehicleFormValues["vehicleType"],
        status: "pending",
        isActive: true,
        ...defaultValues,
      });
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="driverId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Driver ID</FormLabel>
                  <FormControl><Input type="number" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="plateNumber" render={({ field }) => (
                <FormItem>
                  <FormLabel>Plate Number</FormLabel>
                  <FormControl><Input placeholder="ABC-1234" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="make" render={({ field }) => (
                <FormItem>
                  <FormLabel>Make</FormLabel>
                  <FormControl><Input placeholder="Toyota" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="model" render={({ field }) => (
                <FormItem>
                  <FormLabel>Model</FormLabel>
                  <FormControl><Input placeholder="Corolla" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="year" render={({ field }) => (
                <FormItem>
                  <FormLabel>Year</FormLabel>
                  <FormControl><Input type="number" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="color" render={({ field }) => (
                <FormItem>
                  <FormLabel>Color</FormLabel>
                  <FormControl><Input placeholder="White" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="vehicleType" render={({ field }) => (
                <FormItem>
                  <FormLabel>Vehicle Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={allowedTypes.length === 1}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {allowedTypes.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
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
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={isLoading}>{isLoading ? "Saving..." : "Save"}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Registered Fleet Tab ─────────────────────────────────────────────────────

function RegisteredFleetTab({ config, serviceType }: { config: ServiceConfig; serviceType: string }) {
  const { Icon, allowedTypes, defaultType, fixedType } = config;
  const [page, setPage]               = useState(1);
  const [search, setSearch]           = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter]   = useState(defaultType);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editVehicle, setEditVehicle] = useState<any | null>(null);
  const [deleteId, setDeleteId]       = useState<number | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useListVehicles({
    page,
    limit: 15,
    search: search || undefined,
    status: statusFilter !== "all" ? (statusFilter as any) : undefined,
    vehicleType: typeFilter as any,
  });

  const createMutation = useCreateVehicle({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListVehiclesQueryKey() });
        setIsCreateOpen(false);
        toast({ title: "Vehicle added" });
      },
      onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
    },
  });

  const updateMutation = useUpdateVehicle({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListVehiclesQueryKey() });
        setEditVehicle(null);
        toast({ title: "Vehicle updated" });
      },
      onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
    },
  });

  const deleteMutation = useDeleteVehicle({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListVehiclesQueryKey() });
        setDeleteId(null);
        toast({ title: "Vehicle removed" });
      },
      onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
    },
  });

  const totalPages = data ? Math.ceil(data.total / data.limit) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {data ? `${data.total} vehicles registered` : "Loading…"}
        </p>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Add Vehicle
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8 w-56"
            placeholder="Search plate, make, model..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setSearch(searchInput); setPage(1); } }}
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="verified">Verified</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
        {!fixedType && (
          <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
            <SelectTrigger className="w-32"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              {allowedTypes.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {search && (
          <Button variant="ghost" onClick={() => { setSearch(""); setSearchInput(""); }}>Clear</Button>
        )}
      </div>

      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Vehicle</TableHead>
              <TableHead>Plate</TableHead>
              <TableHead>Year</TableHead>
              <TableHead>Color</TableHead>
              <TableHead>Driver</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : !data?.data.length ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                  <Icon className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  No vehicles found
                </TableCell>
              </TableRow>
            ) : (
              data.data.map((vehicle: any, idx: number) => (
                <TableRow key={vehicle.id}>
                  <TableCell className="text-sm text-muted-foreground">{(page - 1) * 15 + idx + 1}</TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{vehicle.make} {vehicle.model}</p>
                      <p className="text-xs text-muted-foreground capitalize">{vehicle.vehicleType}</p>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono font-medium">{vehicle.plateNumber}</TableCell>
                  <TableCell>{vehicle.year}</TableCell>
                  <TableCell className="capitalize">{vehicle.color}</TableCell>
                  <TableCell>
                    {vehicle.driverName ? (
                      <div>
                        <p className="text-sm font-medium">{vehicle.driverName}</p>
                        <p className="text-xs text-muted-foreground">{vehicle.driverPhone}</p>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary" className={STATUS_COLORS[vehicle.status] ?? ""}>
                      {vehicle.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditVehicle(vehicle)}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(vehicle.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious onClick={() => setPage((p) => Math.max(1, p - 1))} aria-disabled={page === 1} />
            </PaginationItem>
            <PaginationItem>
              <span className="text-sm px-3 py-1 text-muted-foreground">Page {page} of {totalPages}</span>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext onClick={() => setPage((p) => Math.min(totalPages, p + 1))} aria-disabled={page === totalPages} />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      <VehicleFormDialog
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Add Vehicle"
        allowedTypes={allowedTypes}
        isLoading={createMutation.isPending}
        onSubmit={(values) => createMutation.mutate({ data: values })}
      />

      {editVehicle && (
        <VehicleFormDialog
          open={!!editVehicle}
          onClose={() => setEditVehicle(null)}
          title="Edit Vehicle"
          allowedTypes={allowedTypes}
          defaultValues={{
            driverId:    editVehicle.driverId,
            plateNumber: editVehicle.plateNumber,
            make:        editVehicle.make,
            model:       editVehicle.model,
            year:        editVehicle.year,
            color:       editVehicle.color,
            vehicleType: editVehicle.vehicleType,
            status:      editVehicle.status,
            isActive:    editVehicle.isActive,
          }}
          isLoading={updateMutation.isPending}
          onSubmit={(values) => updateMutation.mutate({ id: editVehicle.id, data: values })}
        />
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Vehicle?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the vehicle from the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId !== null && deleteMutation.mutate({ id: deleteId })}
            >
              {deleteMutation.isPending ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Vehicles() {
  const params = useParams<{ serviceType?: string }>();
  const serviceType = params.serviceType ?? "car";
  const config = SERVICE_CONFIGS[serviceType] ?? SERVICE_CONFIGS.car;
  const { Icon, title, subtitle, color, bg } = config;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${bg}`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
        <div>
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      <Tabs defaultValue="fleet">
        <TabsList className="mb-2">
          <TabsTrigger value="fleet" className="gap-2">
            <List className="h-3.5 w-3.5" />
            Registered Fleet
          </TabsTrigger>
          <TabsTrigger value="catalog" className="gap-2">
            <BookOpen className="h-3.5 w-3.5" />
            Allowed Catalog
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fleet">
          <RegisteredFleetTab config={config} serviceType={serviceType} />
        </TabsContent>

        <TabsContent value="catalog">
          <VehicleCatalogTab isShuttle={false} serviceType={serviceType} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
