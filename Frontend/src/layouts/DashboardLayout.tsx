import { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation, Navigate } from "react-router-dom";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { Sidebar } from "../components/Sidebar";
import { Header } from "../components/Header";
import { SubscriptionAlert } from "../components/SubscriptionAlert";
import { VsdcStatusBanner } from "../components/VsdcStatusBanner";
import { AppShellSkeleton } from "../components/ui/app-shell-skeleton";
import { useOrganization } from "../context/OrganizationContext";
import { useAuth } from "../context/AuthContext";
import { ToastContainer } from "react-toastify";
import 'react-toastify/dist/ReactToastify.css';
import { cn } from "../lib/utils";

export function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const { organization } = useOrganization();
  const { isSystemOwner, isAuthenticated, isLoading } = useAuth();

  const hasOrganization =
    organization !== null || localStorage.getItem('current_organization_id') !== null;

  /* Wait for auth to settle before rendering the shell or redirecting */
  useEffect(() => {
    if (!isAuthenticated) return;
    /* Give the auth context a tick to hydrate */
    const timer = setTimeout(() => setAuthReady(true), 100);
    return () => clearTimeout(timer);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!authReady) return;
    if (isAuthenticated && !isSystemOwner() && !hasOrganization) {
      if (location.pathname !== '/create-organization') {
        navigate('/create-organization', { replace: true });
      }
    }
  }, [authReady, isAuthenticated, isSystemOwner, hasOrganization, location.pathname, navigate]);

  /* ── Auth is still initializing — show skeleton ────── */
  if (isLoading) {
    return <AppShellSkeleton sidebarCollapsed={sidebarCollapsed} />;
  }

  /* ── Not authenticated — redirect ─────────────────── */
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  /* ── Auth settled but layout not yet ready — show skeleton ── */
  if (!authReady) {
    return <AppShellSkeleton sidebarCollapsed={sidebarCollapsed} />;
  }

  /* ── Full shell ────────────────────────────────────── */
  return (
    <div className="flex h-screen overflow-hidden bg-slate-100 dark:bg-zinc-900">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onCollapsedChange={setSidebarCollapsed}
      />

      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col transition-all duration-300",
          sidebarCollapsed ? "lg:pl-16" : "lg:pl-64",
        )}
      >
        <Header onMenuClick={() => setSidebarOpen(true)} />

        {/* Toast container — rendered above the scrollable content */}
        <ToastContainer
          position="top-right"
          autoClose={3000}
          hideProgressBar={false}
          newestOnTop={false}
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme="colored"
          className="mt-14"
        />

        {/* Subscription & status banners */}
        <SubscriptionAlert
          hasActiveSubscription={organization?.hasActiveSubscription}
          subscriptionStatus={organization?.subscriptionStatus}
          subscriptionEndDate={organization?.subscriptionEndDate}
        />
        <VsdcStatusBanner />

        {/* ── Scrollable content area ─────────────────── */}
        <main
          className="flex-1 overflow-y-auto"
          id="dashboard-main-content"
        >
          <div className="dashboard-main-padding min-h-full">
            <Breadcrumbs />
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
