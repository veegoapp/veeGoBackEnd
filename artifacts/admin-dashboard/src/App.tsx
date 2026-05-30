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
        <Route path="/dashboard" component={() => <ProtectedRoute component={Dashboard} />} />
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