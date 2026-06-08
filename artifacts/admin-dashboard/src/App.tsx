import React, { useEffect, useRef } from "react";
import { ThemeProvider } from "next-themes";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/app-layout";

import { setAuthTokenGetter } from "@/api/client"; // 🔥 مهم جدًا

import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import NotFound from "@/pages/not-found";
import Users from "@/pages/users";
import UserDetail from "@/pages/user-detail";
import RoutesList from "@/pages/routes";
import RouteDetail from "@/pages/route-detail";
import Trips from "@/pages/trips";
import Drivers from "@/pages/drivers";
import Bookings from "@/pages/bookings";
import Wallet from "@/pages/wallet";
import Promo from "@/pages/promo";
import Notifications from "@/pages/notifications";
import Settings from "@/pages/settings";
import LiveTracking from "@/pages/live-tracking";
import Support from "@/pages/support";
import DriverVerification from "@/pages/driver-verification";
import Staff from "@/pages/staff";
import Vehicles from "@/pages/vehicles";
import Services from "@/pages/services";
import Pricing from "@/pages/pricing";
import Zones from "@/pages/zones";
import Payments from "@/pages/payments";
import Reports from "@/pages/reports";
import DriverDetail from "@/pages/driver-detail";
import TripDetail from "@/pages/trip-detail";
import AuditLogs from "@/pages/audit-logs";
import Ratings from "@/pages/ratings";
import ChatInbox from "@/pages/chat-inbox";
import Schedules from "@/pages/schedules";
import ShuttleTrips from "@/pages/shuttle-trips";
import ShuttleTripDetail from "@/pages/shuttle-trip-detail";

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

  // 🔥 ده أهم سطر في المشروع كله
  useEffect(() => {
    setAuthTokenGetter(() => localStorage.getItem("accessToken"));
  }, []);

  return null;
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Redirect to="/login" />;
  return <Component />;
}

function Router() {
  return (
    <AppLayout>
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
        <Route path="/vehicles" component={() => <ProtectedRoute component={Vehicles} />} />
        <Route path="/bookings" component={() => <ProtectedRoute component={Bookings} />} />
        <Route path="/wallet" component={() => <ProtectedRoute component={Wallet} />} />
        <Route path="/payments" component={() => <ProtectedRoute component={Payments} />} />
        <Route path="/promo" component={() => <ProtectedRoute component={Promo} />} />
        <Route path="/pricing/:type" component={() => <ProtectedRoute component={Pricing} />} />
        <Route path="/pricing" component={() => <ProtectedRoute component={Pricing} />} />
        <Route path="/zones" component={() => <ProtectedRoute component={Zones} />} />
        <Route path="/services" component={() => <ProtectedRoute component={Services} />} />
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
        <Route path="/shuttle-trips" component={() => <ProtectedRoute component={ShuttleTrips} />} />
        <Route path="/shuttle-trips/:id" component={() => <ProtectedRoute component={ShuttleTripDetail} />} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

export default function App() {
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