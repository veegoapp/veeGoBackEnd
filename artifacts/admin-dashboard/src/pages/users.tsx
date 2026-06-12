import React, { useState } from "react";
import { useListAdminUsers, useToggleBlockUser } from "@workspace/api-client-react";
import { getListAdminUsersQueryKey } from "@workspace/api-client-react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, MoreHorizontal, Ban, UserCheck, Eye, Wallet } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Link, useLocation } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { useTranslation } from "react-i18next";
import { adminFetch } from "@/lib/api";

type WalletDialogState = { open: false } | { open: true; userId: number; userName: string };

export default function Customers() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const role = "user";
  const [walletDialog, setWalletDialog] = useState<WalletDialogState>({ open: false });
  const [walletAmount, setWalletAmount] = useState("");
  const [walletType, setWalletType] = useState<"credit" | "debit">("credit");
  const [walletReason, setWalletReason] = useState("");
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [, navigate] = useLocation();

  const { data, isLoading } = useListAdminUsers({
    page,
    limit: 10,
    search: search || undefined,
    role: role
  });

  const toggleBlockMutation = useToggleBlockUser();

  const walletMutation = useMutation({
    mutationFn: async ({ userId, amount, description }: { userId: number; amount: number; description: string }) => {
      return adminFetch("/admin/wallet/refund", {
        method: "POST",
        body: JSON.stringify({ userId, amount, description }),
      });
    },
    onSuccess: () => {
      toast({ title: t("users.walletAdjusted", "Wallet adjusted successfully") });
      setWalletDialog({ open: false });
      setWalletAmount("");
      setWalletReason("");
    },
    onError: (err: Error) => {
      toast({ title: t("users.walletFailed", "Failed to adjust wallet"), description: err.message, variant: "destructive" });
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const handleToggleBlock = (id: number) => {
    toggleBlockMutation.mutate({ id }, {
      onSuccess: () => {
        toast({ title: t("users.statusUpdated", "User status updated") });
        queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
      }
    });
  };

  const handleWalletSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletDialog.open) return;
    const amt = parseFloat(walletAmount);
    if (isNaN(amt) || amt <= 0) {
      toast({ title: t("users.validAmount", "Enter a valid positive amount"), variant: "destructive" });
      return;
    }
    const signedAmount = walletType === "debit" ? -amt : amt;
    const description = walletReason || (walletType === "credit" ? "Manual credit by admin" : "Manual debit by admin");
    walletMutation.mutate({ userId: walletDialog.userId, amount: signedAmount, description });
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("users.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("users.subtitle")}</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-card p-4 rounded-xl border border-border">
        <form onSubmit={handleSearch} className="flex-1 flex gap-2 w-full max-w-sm">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder={t("users.searchUsers")} 
              className="ps-9"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <Button type="submit" variant="secondary">{t("common.search")}</Button>
        </form>
        
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("users.title")}</TableHead>
              <TableHead>{t("staff.role")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead>{t("users.joined", "Joined")}</TableHead>
              <TableHead className="text-end">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-10 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                  <TableCell className="text-end"><Skeleton className="h-8 w-8 ms-auto" /></TableCell>
                </TableRow>
              ))
            ) : data?.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                  {t("users.noUsers")}
                </TableCell>
              </TableRow>
            ) : (
              data?.data.map((user) => (
                <TableRow
                  key={user.id}
                  className="cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() => navigate(`/users/${user.id}`)}
                >
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{user.name}</span>
                      <span className="text-xs text-muted-foreground">{user.email}</span>
                      <span className="text-xs text-muted-foreground">{user.phone}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {user.isBlocked ? (
                      <Badge variant="destructive">{t("users.blocked")}</Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100 hover:bg-green-100 dark:hover:bg-green-900">{t("common.active")}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {format(new Date(user.createdAt), "MMM d, yyyy")}
                    </span>
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
                          <Link href={`/users/${user.id}`} className="flex w-full items-center cursor-pointer">
                            <Eye className="me-2 h-4 w-4" />
                            {t("common.details")}
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            setWalletAmount("");
                            setWalletReason("");
                            setWalletType("credit");
                            setWalletDialog({ open: true, userId: user.id, userName: user.name });
                          }}
                        >
                          <Wallet className="me-2 h-4 w-4" /> {t("users.adjustWallet")}
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => handleToggleBlock(user.id)}
                          className={user.isBlocked ? "text-green-600" : "text-destructive"}
                        >
                          {user.isBlocked ? (
                            <><UserCheck className="me-2 h-4 w-4" /> {t("users.unblockUser", "Unblock User")}</>
                          ) : (
                            <><Ban className="me-2 h-4 w-4" /> {t("users.blockUser", "Block User")}</>
                          )}
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

      <Dialog
        open={walletDialog.open}
        onOpenChange={(open) => { if (!open) setWalletDialog({ open: false }); }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("users.adjustWallet")} — {walletDialog.open ? walletDialog.userName : ""}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleWalletSubmit} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>{t("common.type", "Type")}</Label>
              <Select value={walletType} onValueChange={(v) => setWalletType(v as "credit" | "debit")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="credit">{t("users.walletCredit", "Credit (add funds)")}</SelectItem>
                  <SelectItem value="debit">{t("users.walletDebit", "Debit (remove funds)")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wallet-amount">{t("common.amount", "Amount")}</Label>
              <Input
                id="wallet-amount"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={walletAmount}
                onChange={(e) => setWalletAmount(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wallet-reason">{t("users.walletReason", "Reason (optional)")}</Label>
              <Input
                id="wallet-reason"
                placeholder="e.g. Compensation for cancelled trip"
                value={walletReason}
                onChange={(e) => setWalletReason(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setWalletDialog({ open: false })}>
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={walletMutation.isPending}
                variant={walletType === "debit" ? "destructive" : "default"}
              >
                {walletMutation.isPending ? t("common.processing", "Processing...") : walletType === "credit" ? t("users.walletCreditBtn", "Credit Wallet") : t("users.walletDebitBtn", "Debit Wallet")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
