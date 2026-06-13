import React, { useEffect, useRef, Suspense } from "react";
import { useLanguage } from "./hooks/useLanguage";
import { ThemeProvider } from "next-themes";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/app-layout";
import { Skeleton } from "@/components/ui/skeleton";

import { setAuthTokenGetter } from "@/api/client";

const Login = React.lazy(() => import("@/pages/login"));
const Dashboard = React.lazy(() => import("@/pages/dashboard"));
const NotFound = React.lazy(() => import("@/pages/not-found"));
const Users = React.lazy(() => import("@/pages/users"));
const UserDetail = React.lazy(() => import("@/pages/user-detail"));
const RoutesList = React.lazy(() => import("@/pages/routes"));
const RouteDetail = React.lazy(() => import("@/pages/route-detail"));
const Trips = React.lazy(() => import("@/pages/trips"));
const Drivers = React.lazy(() => import("@/pages/drivers"));
const Bookings = React.lazy(() => import("@/pages/bookings"));
const Wallet = React.lazy(() => import("@/pages/wallet"));
const Promo = React.lazy(() => import("@/pages/promo"));
const Notifications = React.lazy(() => import("@/pages/notifications"));
const Settings = React.lazy(() => import("@/pages/settings"));
const LiveTracking = React.lazy(() => import("@/pages/live-tracking"));
const Support = React.lazy(() => import("@/pages/support"));
const DriverVerification = React.lazy(() => import("@/pages/driver-verification"));
const Staff = React.lazy(() => import("@/pages/staff"));
const Vehicles = React.lazy(() => import("@/pages/vehicles"));
const Services = React.lazy(() => import("@/pages/services"));
const ServiceZones = React.lazy(() => import("@/pages/service-zones"));
const Pricing = React.lazy(() => import("@/pages/pricing"));
const Zones = React.lazy(() => import("@/pages/zones"));
const Payments = React.lazy(() => import("@/pages/payments"));
const Reports = React.lazy(() => import("@/pages/reports"));
const DriverDetail = React.lazy(() => import("@/pages/driver-detail"));
const TripDetail = React.lazy(() => import("@/pages/trip-detail"));
const AuditLogs = React.lazy(() => import("@/pages/audit-logs"));
const Ratings = React.lazy(() => import("@/pages/ratings"));
const ChatInbox = React.lazy(() => import("@/pages/chat-inbox"));
const Schedules = React.lazy(() => import("@/pages/schedules"));
const Buses = React.lazy(() => import("@/pages/buses"));
const ShuttleTrips = React.lazy(() => import("@/pages/shuttle-trips"));
const ShuttleTripDetail = React.lazy(() => import("@/pages/shuttle-trip-detail"));
const ShuttleCashDebts = React.lazy(() => import("@/pages/shuttle-cash-debts"));
const ShuttleOffences = React.lazy(() => import("@/pages/shuttle-offences"));
const FinancePayouts = React.lazy(() => import("@/pages/finance-payouts"));
const FinanceCommission = React.lazy(() => import("@/pages/finance-commission"));
const FraudAlerts = React.lazy(() => import("@/pages/fraud-alerts"));
const CommissionExemptions = React.lazy(() => import("@/pages/commission-exemptions"));
const BonusTargets = React.lazy(() => import("@/pages/bonus-targets"));

const logoutRef = { current: () => {} };

function is401(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status: number }).status === 401
  );
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => { if (is401(error)) logoutRef.current(); },
  }),
  mutationCache: new MutationCache({
    onError: (error) => { if (is401(error)) logoutRef.current(); },
  }),
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (is401(error)) return false;
        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
    },
  },
});

function AuthSync() {
  const { logout } = useAuth();
  const logoutFn = useRef(logout);

  useEffect(() => {
    logoutFn.current = logout;
  }, [logout]);

  useEffect(() => {
    logoutRef.current = () => logoutFn.current();
  }, []);

  useEffect(() => {
    setAuthTokenGetter(() => localStorage.getItem("accessToken"));
  }, []);

  return null;
}

function PageFallback() {
  return (
    <div className="p-6 space-y-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Redirect to="/login" />;
  return <Component />;
}

function Router() {
  return (
    <AppLayout>
      <Suspense fallback={<PageFallback />}>
        <Switch>
          <Route path="/login" component={Login} />
          <Route path="/" component={() => <ProtectedRoute component={Dashboard} />} />
          <Route path="/dashboard" component={() => <ProtectedRoute component={Dashboard} />} />
          <Route path="/users" component={() => <ProtectedRoute component={Users} />} />
          <Route path="/users/:id" component={() => <ProtectedRoute component={UserDetail} />} />
          <Route path="/routes" component={() => <ProtectedRoute component={RoutesList} />} />
          <Route path="/routes/:id" component={() => <ProtectedRoute component={RouteDetail} />} />
          <Route path="/trips" component={() => <ProtectedRoute component={Trips} />} />
          <Route path="/trips/:id" component={() => <ProtectedRoute component={TripDetail} />} />
          <Route path="/drivers" component={() => <ProtectedRoute component={Drivers} />} />
          <Route path="/drivers/:id" component={() => <ProtectedRoute component={DriverDetail} />} />
          <Route path="/driver-verification" component={() => <ProtectedRoute component={DriverVerification} />} />
          <Route path="/vehicles/:serviceType" component={() => <ProtectedRoute component={Vehicles} />} />
          <Route path="/bookings" component={() => <ProtectedRoute component={Bookings} />} />
          <Route path="/wallet" component={() => <ProtectedRoute component={Wallet} />} />
          <Route path="/payments" component={() => <ProtectedRoute component={Payments} />} />
          <Route path="/promo" component={() => <ProtectedRoute component={Promo} />} />
          <Route path="/pricing/:type" component={() => <ProtectedRoute component={Pricing} />} />
          <Route path="/pricing" component={() => <ProtectedRoute component={Pricing} />} />
          <Route path="/zones" component={() => <ProtectedRoute component={Zones} />} />
          <Route path="/services" component={() => <ProtectedRoute component={Services} />} />
          <Route path="/services/:type/zones" component={() => <ProtectedRoute component={ServiceZones} />} />
          <Route path="/services/:type" component={() => <ProtectedRoute component={Services} />} />
          <Route path="/live-tracking" component={() => <ProtectedRoute component={LiveTracking} />} />
          <Route path="/support" component={() => <ProtectedRoute component={Support} />} />
          <Route path="/notifications" component={() => <ProtectedRoute component={Notifications} />} />
          <Route path="/reports/:type" component={() => <ProtectedRoute component={Reports} />} />
          <Route path="/reports" component={() => <ProtectedRoute component={Reports} />} />
          <Route path="/staff" component={() => <ProtectedRoute component={Staff} />} />
          <Route path="/settings" component={() => <ProtectedRoute component={Settings} />} />
          <Route path="/audit-logs" component={() => <ProtectedRoute component={AuditLogs} />} />
          <Route path="/ratings" component={() => <ProtectedRoute component={Ratings} />} />
          <Route path="/chat-inbox" component={() => <ProtectedRoute component={ChatInbox} />} />
          <Route path="/schedules" component={() => <ProtectedRoute component={Schedules} />} />
          <Route path="/buses" component={() => <ProtectedRoute component={Buses} />} />
          <Route path="/vehicles/shuttle" component={() => <ProtectedRoute component={Buses} />} />
          <Route path="/shuttle-trips" component={() => <ProtectedRoute component={ShuttleTrips} />} />
          <Route path="/shuttle-trips/:id" component={() => <ProtectedRoute component={ShuttleTripDetail} />} />
          <Route path="/shuttle/cash-debts" component={() => <ProtectedRoute component={ShuttleCashDebts} />} />
          <Route path="/shuttle/offences" component={() => <ProtectedRoute component={ShuttleOffences} />} />
          <Route path="/finance/wallet" component={() => <ProtectedRoute component={Wallet} />} />
          <Route path="/finance/payouts" component={() => <ProtectedRoute component={FinancePayouts} />} />
          <Route path="/finance/commission" component={() => <ProtectedRoute component={FinanceCommission} />} />
          <Route path="/finance/shuttle-cash-debts" component={() => <ProtectedRoute component={ShuttleCashDebts} />} />
          <Route path="/finance/commission-exemptions" component={() => <ProtectedRoute component={CommissionExemptions} />} />
          <Route path="/finance/bonus-targets" component={() => <ProtectedRoute component={BonusTargets} />} />
          <Route path="/security/fraud-alerts" component={() => <ProtectedRoute component={FraudAlerts} />} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </AppLayout>
  );
}

export default function App() {
  const { initDirection } = useLanguage();
  useEffect(() => {
    initDirection();
  }, []);

  return (
    <ThemeProvider defaultTheme="light" enableSystem={false} attribute="class">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AuthProvider>
              <AuthSync />
              <Router />
            </AuthProvider>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
