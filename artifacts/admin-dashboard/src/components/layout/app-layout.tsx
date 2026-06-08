import React, { useState, useEffect, useMemo } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme-toggle";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard, Users, UserCircle, Navigation, Radio, Ticket,
  Layers, Car, Bus, Bike, PackageOpen, Tag, Zap, MapPin, Map,
  Tags, Wallet, CreditCard, ArrowUpRight, Percent, MessageSquare,
  Bell, BarChart3, DollarSign, Settings, LogOut, Menu, Clock,
  ChevronDown, ChevronRight, Shield, Star, CalendarClock,
} from "lucide-react";
import logoUrl from "/logo.png";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { NotificationBell } from "@/components/NotificationBell";

interface NavItem {
  title: string;
  href?: string;
  icon: React.ElementType;
  comingSoon?: boolean;
  subItems?: NavItem[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

function isExactActive(href: string, location: string): boolean {
  return location === href;
}

function isAncestorOf(href: string, location: string): boolean {
  if (href === "/" || href === "") return false;
  const base = "/" + href.split("/").filter(Boolean)[0];
  return location.startsWith(base + "/") || location === base;
}

function anySubItemActive(subItems: NavItem[], location: string): boolean {
  return subItems.some(
    (sub) => sub.href && (isExactActive(sub.href, location) || isAncestorOf(sub.href, location)),
  );
}

function NavItemRow({
  item,
  location,
  collapsed,
  isSubItem = false,
}: {
  item: NavItem;
  location: string;
  collapsed: boolean;
  isSubItem?: boolean;
}) {
  const { t } = useTranslation();
  const Icon = item.icon;
  const hasSubItems = !!(item.subItems && item.subItems.length > 0);

  const exactActive = item.href ? isExactActive(item.href, location) : false;
  const childActive = hasSubItems ? anySubItemActive(item.subItems!, location) : false;
  const highlighted = exactActive || childActive;

  const [isOpen, setIsOpen] = useState(childActive);

  useEffect(() => {
    if (childActive) setIsOpen(true);
  }, [childActive]);

  const rowInner = (
    <div
      className={cn(
        "flex h-8 items-center justify-between rounded-md px-2.5 text-sm transition-colors cursor-pointer select-none",
        isSubItem ? "pl-7 text-xs" : "font-medium",
        highlighted
          ? "bg-primary/10 text-primary font-semibold"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100",
      )}
      onClick={() => hasSubItems && setIsOpen((o) => !o)}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <Icon
          className={cn(
            "shrink-0",
            isSubItem ? "h-3.5 w-3.5" : "h-4 w-4",
            highlighted ? "text-primary" : "text-slate-400",
          )}
        />
        {!collapsed && (
          <span className="truncate">{item.title}</span>
        )}
        {!collapsed && item.comingSoon && (
          <span className="ml-1 shrink-0 text-[9px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 px-1.5 py-0.5 rounded-full">
            {t("common.soon")}
          </span>
        )}
      </div>
      {!collapsed && hasSubItems && (
        <span
          className="shrink-0 p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsOpen((o) => !o); }}
        >
          {isOpen
            ? <ChevronDown className="h-3 w-3 text-slate-400" />
            : <ChevronRight className="h-3 w-3 text-slate-400" />}
        </span>
      )}
    </div>
  );

  const wrappedRow = item.href ? (
    <Link href={item.href}>{rowInner}</Link>
  ) : (
    rowInner
  );

  const tooltipWrapped = collapsed ? (
    <TooltipProvider>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <div>{wrappedRow}</div>
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          {item.title}
          {item.comingSoon && ` (${t("common.comingSoon")})`}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ) : wrappedRow;

  return (
    <div>
      {tooltipWrapped}
      {hasSubItems && isOpen && !collapsed && (
        <div className="mt-0.5 border-l border-slate-200 dark:border-slate-700 ml-[18px]">
          {item.subItems!.map((sub, i) => (
            <NavItemRow
              key={sub.href ?? sub.title ?? i}
              item={sub}
              location={location}
              collapsed={false}
              isSubItem
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SidebarGroup({
  group,
  location,
  collapsed,
}: {
  group: NavGroup;
  location: string;
  collapsed: boolean;
}) {
  return (
    <div className="py-1.5 px-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
      {!collapsed && group.label && (
        <p className="px-2.5 mb-1.5 mt-1 text-[10px] font-bold tracking-widest text-slate-400 dark:text-slate-500 uppercase">
          {group.label}
        </p>
      )}
      <div className="space-y-0.5">
        {group.items.map((item, idx) => (
          <NavItemRow
            key={item.href ?? idx}
            item={item}
            location={location}
            collapsed={collapsed}
          />
        ))}
      </div>
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const { t } = useTranslation();

  const navGroups = useMemo((): NavGroup[] => [
    {
      label: "",
      items: [
        { title: t("nav.dashboard"), href: "/dashboard", icon: LayoutDashboard },
      ],
    },
    {
      label: t("nav.groupManagement"),
      items: [
        { title: t("nav.customers"), href: "/users", icon: Users },
        {
          title: t("nav.drivers"), href: "/drivers", icon: UserCircle,
          subItems: [
            { title: t("nav.pendingVerification"), href: "/driver-verification", icon: Clock },
          ],
        },
        { title: t("nav.vehicles"), href: "/vehicles", icon: Car },
        { title: t("nav.live"), href: "/live-tracking", icon: Radio },
        { title: t("nav.bookings"), href: "/bookings", icon: Ticket },
      ],
    },
    {
      label: t("nav.groupService"),
      items: [
        {
          title: t("nav.cars"), href: "/services/car", icon: Car,
          subItems: [
            { title: t("nav.pricing"), href: "/pricing/car", icon: Tag },
          ],
        },
        {
          title: t("nav.shuttle"), href: "/services/shuttle", icon: Bus,
          subItems: [
            { title: t("nav.routes"), href: "/routes", icon: Map },
            { title: t("nav.buses"), href: "/buses", icon: Bus },
            { title: t("nav.schedules"), href: "/schedules", icon: CalendarClock },
            { title: t("nav.shuttleTrips"), href: "/shuttle-trips", icon: Navigation },
          ],
        },
        {
          title: t("nav.motorcycles"), href: "/services/motorcycle", icon: Bike,
          subItems: [
            { title: t("nav.pricing"), href: "/pricing/bike", icon: Tag },
          ],
        },
        {
          title: t("nav.delivery"), href: "/services/delivery", icon: PackageOpen,
          subItems: [
            { title: t("nav.pricing"), href: "/pricing/delivery", icon: Tag },
          ],
        },
        { title: t("nav.surge"), href: "/pricing/surge", icon: Zap },
      ],
    },
    {
      label: t("nav.groupNetwork"),
      items: [
        { title: t("nav.zones"), href: "/zones", icon: MapPin },
        { title: t("nav.promoCodes"), href: "/promo", icon: Tags },
      ],
    },
    {
      label: t("nav.groupFinance"),
      items: [
        {
          title: t("nav.payments"), href: "/payments", icon: CreditCard,
          subItems: [
            { title: t("nav.transactions"), href: "/payments", icon: CreditCard },
            { title: t("nav.wallets"), href: "/wallet", icon: Wallet },
            { title: t("nav.payouts"), icon: ArrowUpRight, comingSoon: true },
            { title: t("nav.commission"), icon: Percent, comingSoon: true },
          ],
        },
      ],
    },
    {
      label: t("nav.groupOperations"),
      items: [
        { title: t("nav.support"), href: "/support", icon: MessageSquare },
        { title: t("nav.notifications"), href: "/notifications", icon: Bell },
        {
          title: t("nav.reports"), href: "/reports", icon: BarChart3,
          subItems: [
            { title: t("nav.revenue"),    href: "/reports/revenue",    icon: DollarSign },
            { title: t("nav.trips"),      href: "/reports/trips",      icon: Navigation },
            { title: t("nav.drivers"),    href: "/reports/drivers",    icon: UserCircle },
            { title: t("nav.passengers"), href: "/reports/passengers", icon: Users },
            { title: t("nav.zones"),      href: "/reports/zones",      icon: MapPin },
            { title: t("nav.services"),   href: "/reports/services",   icon: Layers },
            { title: t("nav.promoCodes"), href: "/reports/promo",      icon: Tags },
            { title: t("nav.complaints"), href: "/reports/complaints", icon: MessageSquare },
          ],
        },
      ],
    },
    {
      label: t("nav.groupSystem"),
      items: [
        { title: t("nav.chatInbox"), href: "/chat-inbox", icon: MessageSquare },
        { title: t("nav.ratings"), href: "/ratings", icon: Star },
        { title: t("nav.auditLogs"), href: "/audit-logs", icon: Shield },
        { title: t("nav.settings"), href: "/settings", icon: Settings },
      ],
    },
  ], [t]);

  if (!isAuthenticated) return <>{children}</>;

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950">
      <aside
        className={cn(
          "flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 h-full transition-all duration-200 shrink-0",
          collapsed ? "w-14" : "w-56",
        )}
      >
        {/* Logo / Header */}
        <div className="flex items-center justify-between px-3 py-3 border-b border-slate-100 dark:border-slate-800 min-h-[56px]">
          {!collapsed && (
            <img src={logoUrl} alt="logo" className="h-8 w-auto object-contain" />
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed((c) => !c)}
            className={cn("h-7 w-7 shrink-0", collapsed && "mx-auto")}
          >
            <Menu className="h-4 w-4" />
          </Button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto scrollbar-thin py-1">
          {navGroups.map((g, i) => (
            <SidebarGroup key={i} group={g} location={location} collapsed={collapsed} />
          ))}
        </nav>

        {/* Footer */}
        {!collapsed && user && (
          <div className="border-t border-slate-100 dark:border-slate-800 px-3 py-3 flex items-center gap-2">
            <Avatar className="h-7 w-7 shrink-0">
              <AvatarFallback className="text-xs bg-primary/10 text-primary">
                {(user as any).name?.charAt(0)?.toUpperCase() ?? "A"}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium truncate">{(user as any).name ?? "Admin"}</p>
              <p className="text-[10px] text-muted-foreground truncate">{(user as any).email ?? ""}</p>
            </div>
            <ThemeToggle />
          </div>
        )}
        {collapsed && (
          <div className="border-t border-slate-100 dark:border-slate-800 py-2 flex flex-col items-center gap-1.5">
            <ThemeToggle />
          </div>
        )}
      </aside>

      <main className="flex-1 flex flex-col min-h-0">
        {isAuthenticated && (
          <header className="sticky top-0 z-20 flex h-11 shrink-0 items-center justify-end border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm px-4 gap-2">
            <NotificationBell />
          </header>
        )}
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
