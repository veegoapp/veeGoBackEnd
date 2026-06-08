import React, { useState } from "react";
import {
  useListBuses,
  useCreateBus,
  useUpdateBus,
  useDeleteBus,
  getListBusesQueryKey,
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
import { Bus, Plus, Edit, Trash2, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
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
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";

const busSchema = z.object({
  plateNumber: z.string().min(1, "Plate number is required"),
  model: z.string().min(1, "Model is required"),
  capacity: z.coerce.number().int().min(1, "Capacity must be at least 1"),
  isActive: z.boolean().optional(),
});

type BusFormValues = z.infer<typeof busSchema>;

interface BusType {
  id: number;
  plateNumber: string;
  model: string;
  capacity: number;
  isActive: boolean;
  createdAt: string;
}

function BusFormDialog({
  open,
  onClose,
  defaultValues,
  onSubmit,
  isLoading,
  title,
}: {
  open: boolean;
  onClose: () => void;
  defaultValues?: Partial<BusFormValues>;
  onSubmit: (values: BusFormValues) => void;
  isLoading: boolean;
  title: string;
}) {
  const form = useForm<BusFormValues>({
    resolver: zodResolver(busSchema),
    defaultValues: {
      plateNumber: "",
      model: "",
      capacity: 14,
      isActive: true,
      ...defaultValues,
    },
  });

  React.useEffect(() => {
    if (open) form.reset({ plateNumber: "", model: "", capacity: 14, isActive: true, ...defaultValues });
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="plateNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Plate Number</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. ABC-1234" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="model"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Model</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Hyundai H350" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="capacity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Seat Capacity</FormLabel>
                  <FormControl>
                    <Input type="number" min={1} max={100} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex items-center gap-3">
                  <FormLabel className="mt-0">Active</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function Buses() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editBus, setEditBus] = useState<BusType | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const LIMIT = 15;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useListBuses({ page, limit: LIMIT });
  const buses: BusType[] = (data?.data as BusType[] | undefined) ?? [];
  const total: number = data?.total ?? 0;
  const totalPages = Math.ceil(total / LIMIT);

  const createMutation = useCreateBus({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListBusesQueryKey() });
        setIsCreateOpen(false);
        toast({ title: "Bus added successfully" });
      },
      onError: (e: any) => toast({ title: "Error", description: e?.message ?? "Failed to add bus", variant: "destructive" }),
    },
  });

  const updateMutation = useUpdateBus({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListBusesQueryKey() });
        setEditBus(null);
        toast({ title: "Bus updated successfully" });
      },
      onError: (e: any) => toast({ title: "Error", description: e?.message ?? "Failed to update bus", variant: "destructive" }),
    },
  });

  const deleteMutation = useDeleteBus({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListBusesQueryKey() });
        setDeleteId(null);
        toast({ title: "Bus deleted" });
      },
      onError: (e: any) => toast({ title: "Error", description: e?.message ?? "Failed to delete bus", variant: "destructive" }),
    },
  });

  const filteredBuses = search
    ? buses.filter(
        (b) =>
          b.plateNumber.toLowerCase().includes(search.toLowerCase()) ||
          b.model.toLowerCase().includes(search.toLowerCase()),
      )
    : buses;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/10">
            <Bus className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Buses</h1>
            <p className="text-sm text-muted-foreground">Manage shuttle fleet</p>
          </div>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Add Bus
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-2xl font-bold">{total}</p>
            <p className="text-sm text-muted-foreground">Total Buses</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-2xl font-bold text-green-600">
              {isLoading ? "—" : buses.filter((b) => b.isActive).length}
            </p>
            <p className="text-sm text-muted-foreground">Active</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-2xl font-bold text-slate-500">
              {isLoading ? "—" : buses.filter((b) => !b.isActive).length}
            </p>
            <p className="text-sm text-muted-foreground">Inactive</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search by plate or model..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { setSearch(searchInput); setPage(1); }
            }}
          />
        </div>
        {search && (
          <Button variant="ghost" onClick={() => { setSearch(""); setSearchInput(""); }}>Clear</Button>
        )}
      </div>

      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Plate Number</TableHead>
              <TableHead>Model</TableHead>
              <TableHead className="text-center">Capacity</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead>Added</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : filteredBuses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  <Bus className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  No buses found
                </TableCell>
              </TableRow>
            ) : (
              filteredBuses.map((bus, idx) => (
                <TableRow key={bus.id}>
                  <TableCell className="text-muted-foreground text-sm">{(page - 1) * LIMIT + idx + 1}</TableCell>
                  <TableCell className="font-mono font-medium">{bus.plateNumber}</TableCell>
                  <TableCell>{bus.model}</TableCell>
                  <TableCell className="text-center">
                    <span className="font-medium">{bus.capacity}</span>
                    <span className="text-xs text-muted-foreground ml-1">seats</span>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className={bus.isActive
                      ? "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300"
                      : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900"}>
                      {bus.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(bus.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => setEditBus(bus)}
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setDeleteId(bus.id)}
                      >
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
              <span className="text-sm px-3 py-1 text-muted-foreground">
                Page {page} of {totalPages}
              </span>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext onClick={() => setPage((p) => Math.min(totalPages, p + 1))} aria-disabled={page === totalPages} />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      <BusFormDialog
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Add New Bus"
        isLoading={createMutation.isPending}
        onSubmit={(values) => createMutation.mutate({ data: values })}
      />

      {editBus && (
        <BusFormDialog
          open={!!editBus}
          onClose={() => setEditBus(null)}
          title="Edit Bus"
          defaultValues={{
            plateNumber: editBus.plateNumber,
            model: editBus.model,
            capacity: editBus.capacity,
            isActive: editBus.isActive,
          }}
          isLoading={updateMutation.isPending}
          onSubmit={(values) => updateMutation.mutate({ id: editBus.id, data: values })}
        />
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Bus?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the bus from the system. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId !== null && deleteMutation.mutate({ id: deleteId })}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
