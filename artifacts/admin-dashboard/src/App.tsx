import React, { useEffect, useRef } from "react";
import { ThemeProvider } from "next-themes";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/app-layout";

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
import Buses from "@/pages/buses";
import Services from "@/pages/services";
import Pricing from "@/pages/pricing";
import Zones from "@/pages/zones";
import Payments from "@/pages/payments";
import Reports from "@/pages/reports";
import DriverDetail from "@/pages/driver-detail";
import TripDetail from "@/pages/trip-detail";

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
  useEffect(() => { logoutFn.current = logout; }, [logout]);
  useEffect(() => { logoutRef.current = () => logoutFn.current(); }, []);
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

        {/* Dashboard */}
        <Route path="/dashboard" component={() => <ProtectedRoute component={Dashboard} />} />

        {/* Customers (renamed from /users, old routes kept as aliases) */}
        <Route path="/customers" component={() => <ProtectedRoute component={Users} />} />
        <Route path="/customers/:id" component={() => <ProtectedRoute component={UserDetail} />} />
        <Route path="/users" component={() => <ProtectedRoute component={Users} />} />
        <Route path="/users/:id" component={() => <ProtectedRoute component={UserDetail} />} />

        {/* Drivers */}
        <Route path="/drivers/pending" component={() => <ProtectedRoute component={DriverVerification} />} />
        <Route path="/drivers/:id" component={() => <ProtectedRoute component={DriverDetail} />} />
        <Route path="/drivers" component={() => <ProtectedRoute component={Drivers} />} />
        <Route path="/driver-verification" component={() => <ProtectedRoute component={DriverVerification} />} />

        {/* Trips */}
        <Route path="/trips/live" component={() => <ProtectedRoute component={LiveTracking} />} />
        <Route path="/trips/bookings" component={() => <ProtectedRoute component={Bookings} />} />
        <Route path="/trips/:id" component={() => <ProtectedRoute component={TripDetail} />} />
        <Route path="/trips" component={() => <ProtectedRoute component={Trips} />} />
        <Route path="/live-tracking" component={() => <ProtectedRoute component={LiveTracking} />} />
        <Route path="/bookings" component={() => <ProtectedRoute component={Bookings} />} />

        {/* Services */}
        <Route path="/services/:type" component={() => <ProtectedRoute component={Services} />} />
        <Route path="/services" component={() => <Redirect to="/services/car" />} />

        {/* Pricing */}
        <Route path="/pricing/:type" component={() => <ProtectedRoute component={Pricing} />} />
        <Route path="/pricing" component={() => <Redirect to="/pricing/car" />} />

        {/* Zones */}
        <Route path="/zones/:id" component={() => <ProtectedRoute component={Zones} />} />
        <Route path="/zones" component={() => <ProtectedRoute component={Zones} />} />

        {/* Buses (not in sidebar, kept for backward compat) */}
        <Route path="/buses" component={() => <ProtectedRoute component={Buses} />} />

        {/* Routes */}
        <Route path="/routes/:id" component={() => <ProtectedRoute component={RouteDetail} />} />
        <Route path="/routes" component={() => <ProtectedRoute component={RoutesList} />} />

        {/* Promo */}
        <Route path="/promo" component={() => <ProtectedRoute component={Promo} />} />

        {/* Payments */}
        <Route path="/payments/transactions" component={() => <ProtectedRoute component={Wallet} />} />
        <Route path="/payments/:section" component={() => <ProtectedRoute component={Payments} />} />
        <Route path="/payments" component={() => <Redirect to="/payments/transactions" />} />
        <Route path="/wallet" component={() => <ProtectedRoute component={Wallet} />} />

        {/* Complaints (renamed from /support) */}
        <Route path="/complaints" component={() => <ProtectedRoute component={Support} />} />
        <Route path="/support" component={() => <ProtectedRoute component={Support} />} />

        {/* Notifications */}
        <Route path="/notifications" component={() => <ProtectedRoute component={Notifications} />} />

        {/* Reports */}
        <Route path="/reports/:type" component={() => <ProtectedRoute component={Reports} />} />
        <Route path="/reports" component={() => <Redirect to="/reports/revenue" />} />

        {/* Settings (includes Staff tab) */}
        <Route path="/settings" component={() => <ProtectedRoute component={Settings} />} />
        <Route path="/staff" component={() => <ProtectedRoute component={Staff} />} />

        {/* Root → Dashboard */}
        <Route path="/" component={() => <ProtectedRoute component={Dashboard} />} />

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
