import React, { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Bell, Send, Users, UserCircle, User, CheckCircle2, Megaphone, ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { useTranslation } from "react-i18next";

type Target = "all" | "users" | "drivers" | "specific";

type HistoryEntry = {
  id: number;
  userId: number;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  user: { id: number; name: string; email: string; role: string } | null;
};

export default function Notifications() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const [target, setTarget] = useState<Target>("all");
  const [specificUserId, setSpecificUserId] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [selectedUserName, setSelectedUserName] = useState("");
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const userSearchRef = useRef<HTMLDivElement>(null);
  const [includeBlocked, setIncludeBlocked] = useState(false);
  const [minRating, setMinRating] = useState("");
  const [minTripCount, setMinTripCount] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ["notifications-history", historyPage],
    queryFn: () =>
      adminFetch<{ data: HistoryEntry[]; total: number; page: number; limit: number }>(
        `/admin/notifications/history?page=${historyPage}&limit=20`
      ),
  });

  const { data: userSearchResults } = useQuery<{ id: number; name: string; email: string; phone: string; role: string }[]>({
    queryKey: ["user-search-notif", userSearch],
    queryFn: () => adminFetch(`/admin/users/search?q=${encodeURIComponent(userSearch)}`),
    enabled: target === "specific" && userSearch.trim().length >= 2,
  });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userSearchRef.current && !userSearchRef.current.contains(e.target as Node)) {
        setShowUserDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const broadcastMutation = useMutation({
    mutationFn: (payload: object) =>
      adminFetch<{ sent: number; message?: string }>("/admin/notifications/broadcast", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (result) => {
      toast({
        title: result.sent > 0
          ? t("notifications.sentSuccess", { count: result.sent })
          : t("notifications.noUsersMatched"),
        description: result.message,
      });
      setTitle("");
      setBody("");
      setSpecificUserId("");
      setHistoryPage(1);
      queryClient.invalidateQueries({ queryKey: ["notifications-history"] });
    },
    onError: (err: Error) =>
      toast({ title: t("notifications.sendFailed"), description: err.message, variant: "destructive" }),
  });

  const handleSend = () => {
    if (!title.trim()) { toast({ title: t("notifications.titleRequired"), variant: "destructive" }); return; }
    if (!body.trim()) { toast({ title: t("notifications.bodyRequired"), variant: "destructive" }); return; }
    if (target === "specific" && !specificUserId) {
      toast({ title: t("notifications.userRequired"), variant: "destructive" }); return;
    }
    broadcastMutation.mutate({
      title: title.trim(),
      body: body.trim(),
      target,
      ...(target === "specific" ? { userId: parseInt(specificUserId) } : {}),
      includeBlocked,
      ...(minRating ? { minRating: parseFloat(minRating) } : {}),
      ...(minTripCount ? { minTripCount: parseInt(minTripCount) } : {}),
    });
  };

  const totalPages = historyData ? Math.ceil(historyData.total / historyData.limit) : 1;

  const sendButtonLabel = broadcastMutation.isPending
    ? t("notifications.sending")
    : target === "all" ? t("notifications.sendAll")
    : target === "users" ? t("notifications.sendCustomers")
    : target === "drivers" ? t("notifications.sendDrivers")
    : t("notifications.sendUser");

  return (
    <div className="p-8 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("notifications.pageTitle")}</h1>
        <p className="text-muted-foreground text-sm">{t("notifications.pageSubtitle")}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Send Panel */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Megaphone className="h-4 w-4 text-primary" /> {t("notifications.composeTitle")}
              </CardTitle>
              <CardDescription>{t("notifications.composeDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Target audience */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">{t("notifications.targetLabel")}</label>
                <Select value={target} onValueChange={(v) => setTarget(v as Target)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      <div className="flex items-center gap-2"><Users className="h-3.5 w-3.5" /> {t("notifications.targetAll")}</div>
                    </SelectItem>
                    <SelectItem value="users">
                      <div className="flex items-center gap-2"><User className="h-3.5 w-3.5" /> {t("notifications.targetUsers")}</div>
                    </SelectItem>
                    <SelectItem value="drivers">
                      <div className="flex items-center gap-2"><UserCircle className="h-3.5 w-3.5" /> {t("notifications.targetDrivers")}</div>
                    </SelectItem>
                    <SelectItem value="specific">
                      <div className="flex items-center gap-2"><User className="h-3.5 w-3.5" /> {t("notifications.targetSpecific")}</div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Specific user search */}
              {target === "specific" && (
                <div ref={userSearchRef} className="relative">
                  <label className="text-sm font-medium mb-1.5 block">{t("notifications.searchUser")}</label>
                  {selectedUserName ? (
                    <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2">
                      <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm flex-1 truncate">{selectedUserName}</span>
                      <span className="text-xs text-muted-foreground">#{specificUserId}</span>
                      <button
                        type="button"
                        className="ml-1 text-muted-foreground hover:text-foreground"
                        onClick={() => { setSelectedUserName(""); setSpecificUserId(""); setUserSearch(""); }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          className="pl-8"
                          placeholder={t("notifications.searchUserPlaceholder")}
                          value={userSearch}
                          onChange={(e) => { setUserSearch(e.target.value); setShowUserDropdown(true); }}
                          onFocus={() => setShowUserDropdown(true)}
                        />
                      </div>
                      {showUserDropdown && (userSearchResults ?? []).length > 0 && (
                        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-background shadow-lg overflow-hidden">
                          {(userSearchResults ?? []).slice(0, 6).map((u) => (
                            <button
                              key={u.id}
                              type="button"
                              className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-muted transition-colors"
                              onClick={() => {
                                setSpecificUserId(String(u.id));
                                setSelectedUserName(u.name);
                                setUserSearch("");
                                setShowUserDropdown(false);
                              }}
                            >
                              <User className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                              <div className="min-w-0">
                                <p className="font-medium truncate">{u.name}</p>
                                <p className="text-xs text-muted-foreground truncate">{u.email} · {u.phone}</p>
                              </div>
                              <span className="ml-auto text-xs text-muted-foreground shrink-0">#{u.id}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {showUserDropdown && userSearch.trim().length >= 2 && (userSearchResults ?? []).length === 0 && (
                        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-background shadow-sm px-3 py-2 text-sm text-muted-foreground">
                          {t("notifications.noUsersFound")}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Driver rating filter */}
              {target === "drivers" && (
                <div>
                  <label className="text-sm font-medium mb-1.5 block">{t("notifications.minRating")}</label>
                  <Input
                    type="number"
                    min={0} max={5} step={0.1}
                    placeholder={t("notifications.minRatingPlaceholder")}
                    value={minRating}
                    onChange={(e) => setMinRating(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">{t("notifications.minRatingHint")}</p>
                </div>
              )}

              {/* Trip count filter */}
              {target === "users" && (
                <div>
                  <label className="text-sm font-medium mb-1.5 block">{t("notifications.minTripCount")}</label>
                  <Input
                    type="number"
                    min={0}
                    placeholder={t("notifications.minTripCountPlaceholder")}
                    value={minTripCount}
                    onChange={(e) => setMinTripCount(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">{t("notifications.minTripCountHint")}</p>
                </div>
              )}

              {/* Include blocked */}
              {target !== "specific" && (
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeBlocked}
                    onChange={(e) => setIncludeBlocked(e.target.checked)}
                    className="h-4 w-4 rounded border-input"
                  />
                  {t("notifications.includeBlocked")}
                </label>
              )}

              {/* Message */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">{t("notifications.msgTitle")}</label>
                <Input
                  placeholder={t("notifications.msgTitlePlaceholder")}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">{t("notifications.msgBody")}</label>
                <Textarea
                  placeholder={t("notifications.msgBodyPlaceholder")}
                  className="resize-none min-h-[100px]"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </div>

              {/* Preview */}
              {(title || body) && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                  <p className="text-xs font-semibold text-primary mb-1">{t("notifications.preview")}</p>
                  <p className="text-sm font-semibold">{title || "—"}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{body || "—"}</p>
                </div>
              )}

              <Button
                className="w-full"
                onClick={handleSend}
                disabled={broadcastMutation.isPending}
              >
                <Send className="mr-2 h-4 w-4" />
                {sendButtonLabel}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* History Panel */}
        <div className="lg:col-span-3">
          <Card className="h-full flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Bell className="h-4 w-4" /> {t("notifications.historyTitle")}
              </CardTitle>
              <CardDescription>
                {historyData
                  ? t("notifications.sentSuccess", { count: historyData.total })
                  : t("notifications.historyDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 p-0">
              {historyLoading ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : !historyData?.data.length ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Bell className="h-12 w-12 mb-3 opacity-20" />
                  <p>{t("notifications.noNotificationsYet")}</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {historyData.data.map((n) => (
                    <div
                      key={n.id}
                      className="px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => setExpandedId(expandedId === n.id ? null : n.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <div className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${n.isRead ? "bg-muted-foreground/30" : "bg-primary"}`} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold truncate">{n.title}</p>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                                {n.user?.role ?? t("common.unknown")}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              → {n.user?.name ?? `User #${n.userId}`}
                              {n.user?.email ? ` · ${n.user.email}` : ""}
                            </p>
                            {expandedId === n.id && (
                              <p className="text-xs text-foreground/80 mt-1.5 whitespace-pre-wrap">{n.body}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {format(new Date(n.createdAt), "MMM d, HH:mm")}
                          </span>
                          {expandedId === n.id ? (
                            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
            {totalPages > 1 && (
              <div className="border-t border-border p-3">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                        className={historyPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                    <PaginationItem className="text-sm text-muted-foreground px-4">
                      {historyPage} / {totalPages}
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationNext
                        onClick={() => setHistoryPage((p) => Math.min(totalPages, p + 1))}
                        className={historyPage >= totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
