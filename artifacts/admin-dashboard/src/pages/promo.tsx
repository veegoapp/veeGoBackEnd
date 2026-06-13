import React, { useState } from "react";
import { 
  useListPromoCodes, 
  useCreatePromoCode, 
  useUpdatePromoCode, 
  useDeletePromoCode,
  getListPromoCodesQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tags, Plus, Edit, Trash2, CalendarIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { format, isPast } from "date-fns";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { useTranslation } from "react-i18next";

const promoSchema = z.object({
  code: z.string().min(3, "Code must be at least 3 characters").toUpperCase(),
  discountType: z.enum(["percentage", "fixed"]),
  discountValue: z.coerce.number().min(0.01, "Discount must be greater than 0"),
  expiryDate: z.string().optional().nullable(),
  maxUsage: z.coerce.number().min(1, "Max usage must be at least 1").optional().nullable(),
  isActive: z.boolean().default(true),
});

type PromoFormValues = z.infer<typeof promoSchema>;

export default function Promo() {
  const [page, setPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();

  const { data, isLoading } = useListPromoCodes({
    page,
    limit: 10,
  });

  const createMutation = useCreatePromoCode();
  const updateMutation = useUpdatePromoCode();
  const deleteMutation = useDeletePromoCode();

  const form = useForm<PromoFormValues>({
    resolver: zodResolver(promoSchema),
    defaultValues: {
      code: "",
      discountType: "percentage",
      discountValue: 10,
      expiryDate: null,
      maxUsage: null,
      isActive: true,
    },
  });

  const onSubmitCreate = (data: PromoFormValues) => {
    createMutation.mutate({ data: {
      ...data,
      expiryDate: data.expiryDate || undefined,
      maxUsage: data.maxUsage || undefined
    } }, {
      onSuccess: () => {
        toast({ title: t("promo.promoCreated", "Promo code created") });
        setIsCreateOpen(false);
        form.reset();
        queryClient.invalidateQueries({ queryKey: getListPromoCodesQueryKey() });
      }
    });
  };

  const onSubmitEdit = (data: PromoFormValues) => {
    if (!editId) return;
    updateMutation.mutate({ id: editId, data: {
      ...data,
      expiryDate: data.expiryDate || undefined,
      maxUsage: data.maxUsage || undefined
    } }, {
      onSuccess: () => {
        toast({ title: t("promo.promoUpdated", "Promo code updated") });
        setEditId(null);
        form.reset();
        queryClient.invalidateQueries({ queryKey: getListPromoCodesQueryKey() });
      }
    });
  };

  const handleDelete = (id: number) => {
    if (confirm(t("promo.deleteConfirm", "Are you sure you want to delete this promo code?"))) {
      deleteMutation.mutate({ id }, {
        onSuccess: () => {
          toast({ title: t("promo.promoDeleted", "Promo code deleted") });
          queryClient.invalidateQueries({ queryKey: getListPromoCodesQueryKey() });
        }
      });
    }
  };

  const handleOpenEdit = (promo: any) => {
    form.reset({
      code: promo.code,
      discountType: promo.discountType,
      discountValue: promo.discountValue,
      expiryDate: promo.expiryDate ? new Date(promo.expiryDate).toISOString().slice(0, 16) : null,
      maxUsage: promo.maxUsage,
      isActive: promo.isActive,
    });
    setEditId(promo.id);
  };

  const PromoFormContent = ({ isEdit }: { isEdit?: boolean }) => (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(isEdit ? onSubmitEdit : onSubmitCreate)} className="space-y-4">
        <FormField
          control={form.control}
          name="code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("promo.code")}</FormLabel>
              <FormControl><Input placeholder={t("promo.codePlaceholder", "SUMMER24")} className="uppercase" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="discountType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("promo.discountType", "Discount Type")}</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="percentage">{t("promo.percentage", "Percentage (%)")}</SelectItem>
                    <SelectItem value="fixed">{t("promo.fixedAmount", "Fixed Amount")}</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="discountValue"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("promo.discount")}</FormLabel>
                <FormControl><Input type="number" step="any" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="expiryDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("promo.expiryDateOptional", "Expiry Date (Optional)")}</FormLabel>
              <FormControl><Input type="datetime-local" {...field} value={field.value || ""} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="maxUsage"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("promo.usageLimit", "Usage Limit (Optional)")}</FormLabel>
              <FormControl><Input type="number" placeholder={t("promo.unlimited", "Leave empty for unlimited")} {...field} value={field.value || ""} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {isEdit && (
          <FormField
            control={form.control}
            name="isActive"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">{t("promo.activeStatus", "Active Status")}</FormLabel>
                </div>
                <FormControl>
                  <Select onValueChange={(val) => field.onChange(val === "true")} value={field.value ? "true" : "false"}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">{t("common.active")}</SelectItem>
                      <SelectItem value="false">{t("common.disabled")}</SelectItem>
                    </SelectContent>
                  </Select>
                </FormControl>
              </FormItem>
            )}
          />
        )}
        <DialogFooter>
          <Button type="submit" disabled={isEdit ? updateMutation.isPending : createMutation.isPending}>
            {isEdit ? t("promo.updatePromo", "Update Promo") : t("promo.createPromo", "Create Promo")}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("promo.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("promo.subtitle")}</p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="me-2 h-4 w-4" /> {t("promo.addPromo")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("promo.createPromoCode", "Create Promo Code")}</DialogTitle>
            </DialogHeader>
            <PromoFormContent />
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={!!editId} onOpenChange={(open) => !open && setEditId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("promo.editPromoCode", "Edit Promo Code")}</DialogTitle>
          </DialogHeader>
          <PromoFormContent isEdit />
        </DialogContent>
      </Dialog>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("promo.code")}</TableHead>
              <TableHead>{t("promo.discount")}</TableHead>
              <TableHead>{t("promo.usage", "Usage")}</TableHead>
              <TableHead>{t("promo.expiry")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead className="text-end">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                  <TableCell className="text-end"><Skeleton className="h-8 w-16 ms-auto" /></TableCell>
                </TableRow>
              ))
            ) : data?.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                  {t("promo.noPromoCodes", "No promo codes found.")}
                </TableCell>
              </TableRow>
            ) : (
              data?.data.map((promo: any) => {
                const isExpired = promo.expiryDate && isPast(new Date(promo.expiryDate));
                const isMaxedOut = promo.maxUsage && promo.usedCount >= promo.maxUsage;
                const isUsable = promo.isActive && !isExpired && !isMaxedOut;

                return (
                  <TableRow key={promo.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Tags className="h-4 w-4 text-primary" />
                        <span className="font-mono font-bold tracking-wider">{promo.code}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {promo.discountType === 'percentage' ? `${promo.discountValue}%` : `${promo.discountValue} ${t("common.egp", "EGP")}`}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <span className="font-medium">{promo.usedCount}</span>
                        {promo.maxUsage && <span className="text-muted-foreground"> / {promo.maxUsage}</span>}
                      </div>
                      {promo.maxUsage && (
                        <div className="w-24 bg-secondary h-1.5 mt-1 rounded-full overflow-hidden">
                          <div 
                            className="bg-primary h-full" 
                            style={{ width: `${Math.min(100, (promo.usedCount / promo.maxUsage) * 100)}%` }}
                          />
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {promo.expiryDate ? (
                        <div className="flex items-center gap-1.5 text-sm">
                          <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className={isExpired ? "text-destructive" : ""}>
                            {format(new Date(promo.expiryDate), "MMM d, yyyy HH:mm")}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground italic">{t("promo.neverExpires", "Never expires")}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isUsable ? (
                        <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">{t("common.active")}</Badge>
                      ) : isExpired ? (
                        <Badge variant="destructive">{t("promo.expired", "Expired")}</Badge>
                      ) : isMaxedOut ? (
                        <Badge variant="outline">{t("promo.depleted", "Depleted")}</Badge>
                      ) : (
                        <Badge variant="outline">{t("common.disabled")}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(promo)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => handleDelete(promo.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
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
