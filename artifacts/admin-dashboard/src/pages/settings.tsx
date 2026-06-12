import React, { useState, useEffect, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "next-themes";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminFetch } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Globe, Moon, Sun, Monitor, LogOut, Bell, UsersRound, Info, Save, Cpu, Wallet as WalletIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { setStoredLanguage, applyDirection } from "@/lib/i18n";
import i18n from "@/lib/i18n";

const StaffPage = React.lazy(() => import("@/pages/staff"));

const NOTIF_KEY = "veego_notif_prefs";
type NotifPrefs = {
  newBookings: boolean;
  tripStatus: boolean;
  driverActivity: boolean;
  supportTickets: boolean;
  driverVerification: boolean;
};

function loadNotifPrefs(): NotifPrefs {
  try {
    const stored = localStorage.getItem(NOTIF_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return { newBookings: true, tripStatus: true, driverActivity: false, supportTickets: true, driverVerification: true };
}

type AppSettings = {
  appName: string;
  supportEmail: string;
  supportPhone: string;
  facebookUrl: string;
  twitterUrl: string;
  instagramUrl: string;
  privacyPolicyUrl: string;
  termsUrl: string;
};

export default function Settings() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const { logout } = useAuth();
  const queryClient = useQueryClient();
  const TABS = [
    { id: "general", label: t("settings.tabGeneral"), icon: Globe },
    { id: "app", label: t("settings.tabAppInfo"), icon: Info },
    { id: "staff", label: t("settings.tabStaff"), icon: UsersRound },
    { id: "system", label: "System Engine", icon: Cpu },
  ];

  const [activeTab, setActiveTab] = useState("general");
  const [currentLang, setCurrentLang] = useState<string>(() => i18n.language ?? "en");
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>(loadNotifPrefs);
  const [appForm, setAppForm] = useState<AppSettings | null>(null);

  const { data: appSettings, isLoading: appLoading } = useQuery<AppSettings>({
    queryKey: ["admin-app-settings"],
    queryFn: () => adminFetch<AppSettings>("/admin/settings/app"),
    enabled: activeTab === "app",
  });

  useEffect(() => {
    if (appSettings && !appForm) setAppForm({ ...appSettings });
  }, [appSettings]);

  const saveAppMutation = useMutation({
    mutationFn: (body: AppSettings) =>
      adminFetch<AppSettings>("/admin/settings/app", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["admin-app-settings"], updated);
      toast({ title: t("settings.appInfoSaved") });
    },
    onError: (err: Error) => toast({ title: t("settings.appInfoFailed"), description: err.message, variant: "destructive" }),
  });

  useEffect(() => {
    const handler = (lang: string) => setCurrentLang(lang);
    i18n.on("languageChanged", handler);
    return () => i18n.off("languageChanged", handler);
  }, []);

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    setStoredLanguage(lang);
    applyDirection(lang);
    setCurrentLang(lang);
  };

  const handleNotifToggle = (key: keyof NotifPrefs, value: boolean) => {
    const updated = { ...notifPrefs, [key]: value };
    setNotifPrefs(updated);
    localStorage.setItem(NOTIF_KEY, JSON.stringify(updated));
    toast({ title: t("settings.notifSaved") });
  };

  const notifRows: [keyof NotifPrefs, string, string][] = [
    ["newBookings", "notifyNewBookings", "notifyNewBookingsDesc"],
    ["tripStatus", "notifyNewTrips", "notifyNewTripsDesc"],
    ["driverActivity", "notifyDriverLogin", "notifyDriverLoginDesc"],
    ["supportTickets", "notifySupport", "notifySupportDesc"],
    ["driverVerification", "notifyVerification", "notifyVerificationDesc"],
  ];

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("settings.title")}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t("settings.subtitle")}</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* General Tab */}
      {activeTab === "general" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Globe className="h-4 w-4" />
                {t("settings.appearance")}
              </CardTitle>
              <CardDescription>{t("settings.appearanceDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <div>
                  <Label className="text-sm font-medium">{t("settings.language")}</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">{t("settings.languageDesc")}</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button variant={currentLang === "en" ? "default" : "outline"} size="sm" onClick={() => handleLanguageChange("en")} className="min-w-[110px]">
                    🇬🇧 {t("settings.english")}
                  </Button>
                  <Button variant={currentLang === "ar" ? "default" : "outline"} size="sm" onClick={() => handleLanguageChange("ar")} className="min-w-[110px]">
                    🇸🇦 {t("settings.arabic")}
                  </Button>
                </div>
              </div>
              <Separator />
              <div className="space-y-3">
                <div>
                  <Label className="text-sm font-medium">{t("settings.theme")}</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">{t("settings.themeDesc")}</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button variant={theme === "light" ? "default" : "outline"} size="sm" onClick={() => setTheme("light")} className="gap-1.5">
                    <Sun className="h-3.5 w-3.5" /> {t("settings.themeLight")}
                  </Button>
                  <Button variant={theme === "dark" ? "default" : "outline"} size="sm" onClick={() => setTheme("dark")} className="gap-1.5">
                    <Moon className="h-3.5 w-3.5" /> {t("settings.themeDark")}
                  </Button>
                  <Button variant={theme === "system" ? "default" : "outline"} size="sm" onClick={() => setTheme("system")} className="gap-1.5">
                    <Monitor className="h-3.5 w-3.5" /> {t("settings.themeSystem")}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bell className="h-4 w-4" />
                {t("settings.notifications")}
              </CardTitle>
              <CardDescription>{t("settings.notificationsDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {notifRows.map(([key, labelKey, descKey], i) => (
                <React.Fragment key={key}>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">{t(`settings.${labelKey}`)}</Label>
                      <p className="text-xs text-muted-foreground">{t(`settings.${descKey}`)}</p>
                    </div>
                    <Switch checked={notifPrefs[key]} onCheckedChange={(v) => handleNotifToggle(key, v)} />
                  </div>
                  {i < notifRows.length - 1 && <Separator />}
                </React.Fragment>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <LogOut className="h-4 w-4" />
                {t("settings.session")}
              </CardTitle>
              <CardDescription>{t("settings.sessionDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
                <div>
                  <p className="text-sm font-medium">{t("settings.signOutBtn")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t("settings.signOutDesc")}</p>
                </div>
                <Button variant="destructive" size="sm" onClick={logout} className="gap-1.5">
                  <LogOut className="h-3.5 w-3.5" />
                  {t("settings.signOutBtn")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* App Info Tab */}
      {activeTab === "app" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Info className="h-4 w-4" /> {t("settings.tabAppInfo")}
              </CardTitle>
              <CardDescription>{t("settings.appInfoSaved") === "App info saved" ? "Configure your app's public name, contact info, and links" : "إعدادات اسم التطبيق ومعلومات الاتصال والروابط"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {appLoading || !appForm ? (
                <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>{t("settings.appName")}</Label>
                      <Input value={appForm.appName} onChange={(e) => setAppForm((f) => f ? { ...f, appName: e.target.value } : f)} placeholder="e.g. VeeGo" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t("settings.supportEmail")}</Label>
                      <Input type="email" value={appForm.supportEmail} onChange={(e) => setAppForm((f) => f ? { ...f, supportEmail: e.target.value } : f)} placeholder="support@example.com" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t("settings.supportPhone")}</Label>
                      <Input value={appForm.supportPhone} onChange={(e) => setAppForm((f) => f ? { ...f, supportPhone: e.target.value } : f)} placeholder="+20-100-000-0000" />
                    </div>
                  </div>

                  <Separator />
                  <p className="text-sm font-medium">{t("settings.socialMedia")}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {[
                      { key: "facebookUrl" as keyof AppSettings, label: "Facebook URL" },
                      { key: "twitterUrl" as keyof AppSettings, label: "Twitter/X URL" },
                      { key: "instagramUrl" as keyof AppSettings, label: "Instagram URL" },
                    ].map(({ key, label }) => (
                      <div key={key} className="space-y-1.5">
                        <Label>{label}</Label>
                        <Input value={appForm[key] as string} onChange={(e) => setAppForm((f) => f ? { ...f, [key]: e.target.value } : f)} placeholder="https://..." />
                      </div>
                    ))}
                  </div>

                  <Separator />
                  <p className="text-sm font-medium">{t("settings.legalLinks")}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>{t("settings.privacyPolicyUrl")}</Label>
                      <Input value={appForm.privacyPolicyUrl} onChange={(e) => setAppForm((f) => f ? { ...f, privacyPolicyUrl: e.target.value } : f)} placeholder="https://..." />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t("settings.termsUrl")}</Label>
                      <Input value={appForm.termsUrl} onChange={(e) => setAppForm((f) => f ? { ...f, termsUrl: e.target.value } : f)} placeholder="https://..." />
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button onClick={() => appForm && saveAppMutation.mutate(appForm)} disabled={saveAppMutation.isPending}>
                      <Save className="h-3.5 w-3.5 mr-1.5" />
                      {saveAppMutation.isPending ? t("common.saving") : t("settings.saveAppInfo")}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Staff Tab */}
      {activeTab === "staff" && (
        <Suspense fallback={
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        }>
          <StaffPage />
        </Suspense>
      )}

      {activeTab === "system" && (
        <SystemEngineTab />
      )}
    </div>
  );
}

function SystemSettingRow({
  label,
  description,
  settingKey,
}: {
  label: string;
  description: string;
  settingKey: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [inputValue, setInputValue] = React.useState<string>("");
  const [isEditing, setIsEditing] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["system-setting", settingKey],
    queryFn: () => adminFetch<{ key: string; value: string }>(`/admin/settings/${settingKey}`),
  });

  React.useEffect(() => {
    if (data?.value !== undefined && !isEditing) {
      setInputValue(data.value);
    }
  }, [data?.value]);

  const saveMutation = useMutation({
    mutationFn: () =>
      adminFetch("/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({ key: settingKey, value: inputValue }),
      }),
    onSuccess: () => {
      toast({ title: `${label} updated` });
      queryClient.invalidateQueries({ queryKey: ["system-setting", settingKey] });
      setIsEditing(false);
    },
    onError: (e: Error) => toast({ title: "Failed to save", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div className="flex-1 min-w-0 pr-6">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        <p className="text-[10px] font-mono text-muted-foreground/60 mt-0.5">{settingKey}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {isLoading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <>
            <Input
              type="number"
              value={inputValue}
              onChange={(e) => { setInputValue(e.target.value); setIsEditing(true); }}
              className="w-24 h-8 text-sm text-right"
              step="any"
            />
            {isEditing && (
              <Button
                size="sm"
                className="h-8 text-xs"
                disabled={saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
              >
                <Save className="h-3 w-3 mr-1" />
                {saveMutation.isPending ? "…" : "Save"}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function WalletLimitsRow() {
  const { toast } = useToast();
  const [maxTopup, setMaxTopup] = React.useState("");
  const [dailyLimit, setDailyLimit] = React.useState("");
  const [editing, setEditing] = React.useState(false);

  const { data: maxData } = useQuery({
    queryKey: ["system-setting", "wallet_max_topup"],
    queryFn: () => adminFetch<{ key: string; value: string }>("/admin/settings/wallet_max_topup"),
  });
  const { data: dailyData } = useQuery({
    queryKey: ["system-setting", "wallet_daily_topup_limit"],
    queryFn: () => adminFetch<{ key: string; value: string }>("/admin/settings/wallet_daily_topup_limit"),
  });

  React.useEffect(() => { if (maxData?.value && !editing) setMaxTopup(maxData.value); }, [maxData?.value]);
  React.useEffect(() => { if (dailyData?.value && !editing) setDailyLimit(dailyData.value); }, [dailyData?.value]);

  const saveMutation = useMutation({
    mutationFn: () =>
      adminFetch("/admin/settings/wallet-limits", {
        method: "PATCH",
        body: JSON.stringify({ wallet_max_topup: Number(maxTopup), wallet_daily_topup_limit: Number(dailyLimit) }),
      }),
    onSuccess: () => {
      toast({ title: "Wallet limits updated" });
      setEditing(false);
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-sm">Max Top-Up per Request (EGP)</Label>
          <Input
            type="number" min={0} step={1}
            value={maxTopup}
            onChange={(e) => { setMaxTopup(e.target.value); setEditing(true); }}
            placeholder="e.g. 1000"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm">Daily Top-Up Limit (EGP)</Label>
          <Input
            type="number" min={0} step={1}
            value={dailyLimit}
            onChange={(e) => { setDailyLimit(e.target.value); setEditing(true); }}
            placeholder="e.g. 2000"
          />
        </div>
      </div>
      {editing && (
        <div className="flex justify-end">
          <Button size="sm" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saveMutation.isPending ? "Saving…" : "Save Wallet Limits"}
          </Button>
        </div>
      )}
    </div>
  );
}

function SystemEngineTab() {
  const SYSTEM_KEYS = [
    { key: "dispatch_radius_km",            label: "Initial Search Radius (km)",       description: "Starting radius used to find nearby drivers when a booking is placed." },
    { key: "dispatch_max_radius_km",         label: "Max Search Radius (km)",           description: "Maximum expansion radius before the dispatch engine gives up finding a driver." },
    { key: "dispatch_offer_timeout_seconds", label: "Driver Offer Timeout (seconds)",   description: "How long a driver has to accept a trip offer before it expires and moves on." },
    { key: "no_show_fee_egp",               label: "Shuttle No-Show Fee (EGP)",         description: "Penalty charged to passengers who book a shuttle seat but do not board." },
    { key: "cancellation_grace_hours",       label: "Free Cancellation Window (hours)", description: "Bookings cancelled within this window before departure are refunded without a fee." },
    { key: "criminal_record_trip_threshold", label: "Criminal Record Suspension Limit", description: "Drivers who exceed this completed-trip count without an approved criminal record are auto-suspended." },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Cpu className="h-4 w-4" /> Dispatch &amp; Operational Parameters
          </CardTitle>
          <CardDescription>
            Core system settings that control dispatch radius, timing, fees, and compliance thresholds.
            Changes take effect immediately — no restart required.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {SYSTEM_KEYS.map((k) => (
            <SystemSettingRow key={k.key} settingKey={k.key} label={k.label} description={k.description} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <WalletIcon className="h-4 w-4" /> Wallet Financial Limits
          </CardTitle>
          <CardDescription>
            Control how much passengers can top up their wallet per transaction and per day.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WalletLimitsRow />
        </CardContent>
      </Card>
    </div>
  );
}
