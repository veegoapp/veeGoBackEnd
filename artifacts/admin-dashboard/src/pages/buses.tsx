import React, { useState } from "react";
import { 
  useListBuses, 
  useCreateBus, 
  useUpdateBus, 
  useDeleteBus,
  getListBusesQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Bus as BusIcon, Plus, Edit, Trash2, MapPin } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { useTranslation } from "react-i18next";

const busSchema = z.object({
  plateNumber: z.string().min(1, "Plate number is required"),
  capacity: z.coerce.number().min(1, "Capacity must be at least 1"),
  model: z.string().min(1, "Model is required"),
});

type BusFormValues = z.infer<typeof busSchema>;

export default function Buses() {
  const [page, setPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();

  const { data, isLoading } = useListBuses({
    page,
    limit: 10,
  });

  const createMutation = useCreateBus();
  const updateMutation = useUpdateBus();
  const deleteMutation = useDeleteBus();

  const form = useForm<BusFormValues>({
    resolver: zodResolver(busSchema),
    defaultValues: {
      plateNumber: "",
      capacity: 40,
      model: "",
    },
  });

  const onSubmitCreate = (data: BusFormValues) => {
    createMutation.mutate({ data }, {
      onSuccess: () => {
        toast({ title: t("buses.busAdded", "Bus added to fleet") });
        setIsCreateOpen(false);
        form.reset();
        queryClient.invalidateQueries({ queryKey: getListBusesQueryKey() });
      }
    });
  };

  const onSubmitEdit = (data: BusFormValues) => {
    if (!editId) return;
    updateMutation.mutate({ id: editId, data }, {
      onSuccess: () => {
        toast({ title: t("buses.busUpdated", "Bus updated") });
        setEditId(null);
        form.reset();
        queryClient.invalidateQueries({ queryKey: getListBusesQueryKey() });
      }
    });
  };

  const handleDelete = (id: number) => {
    if (confirm(t("buses.deleteConfirm", "Are you sure you want to remove this bus from the fleet?"))) {
      deleteMutation.mutate({ id }, {
        onSuccess: () => {
          toast({ title: t("buses.busRemoved", "Bus removed") });
          queryClient.invalidateQueries({ queryKey: getListBusesQueryKey() });
        }
      });
    }
  };

  const handleOpenEdit = (bus: any) => {
    form.reset({
      plateNumber: bus.plateNumber,
      capacity: bus.capacity,
      model: bus.model,
    });
    setEditId(bus.id);
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("buses.fleetManagement", "Fleet Management")}</h1>
          <p className="text-muted-foreground text-sm">{t("buses.subtitle")}</p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> {t("buses.addBus")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("buses.addNewBus", "Add New Bus")}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmitCreate)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="plateNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("buses.plate")}</FormLabel>
                      <FormControl><Input placeholder="ABC-123" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="model"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("buses.makeModel", "Make & Model")}</FormLabel>
                      <FormControl><Input placeholder="Volvo B11R" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="capacity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("buses.capacity")}</FormLabel>
                      <FormControl><Input type="number" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending}>{t("buses.addToFleet", "Add to Fleet")}</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={!!editId} onOpenChange={(open) => !open && setEditId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("buses.editBus", "Edit Bus")}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmitEdit)} className="space-y-4">
              <FormField
                control={form.control}
                name="plateNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("buses.plate")}</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="model"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("buses.makeModel", "Make & Model")}</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="capacity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("buses.capacity")}</FormLabel>
                    <FormControl><Input type="number" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit" disabled={updateMutation.isPending}>{t("buses.updateBus", "Update Bus")}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("buses.busId", "Bus ID")}</TableHead>
              <TableHead>{t("buses.plateAndModel", "Plate & Model")}</TableHead>
              <TableHead>{t("buses.capacity")}</TableHead>
              <TableHead>{t("buses.liveLocation", "Live Location")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead className="text-right">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-6 w-12" /></TableCell>
                  <TableCell><Skeleton className="h-10 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : data?.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                  {t("buses.noBuses")}
                </TableCell>
              </TableRow>
            ) : (
              data?.data.map((bus) => (
                <TableRow key={bus.id}>
                  <TableCell className="font-medium">#{bus.id}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-bold">{bus.plateNumber}</span>
                      <span className="text-xs text-muted-foreground">{bus.model}</span>
                    </div>
                  </TableCell>
                  <TableCell>{bus.capacity} {t("buses.seats", "seats")}</TableCell>
                  <TableCell>
                    {bus.currentLatitude && bus.currentLongitude ? (
                      <div className="flex items-center gap-1 text-sm">
                        <MapPin className="h-3 w-3 text-primary" />
                        <span>{bus.currentLatitude.toFixed(4)}, {bus.currentLongitude.toFixed(4)}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t("buses.noSignal", "No signal")}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {bus.isActive ? (
                      <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">{t("buses.operational", "Operational")}</Badge>
                    ) : (
                      <Badge variant="outline">{t("buses.maintenance", "Maintenance")}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(bus)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(bus.id)}>
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
