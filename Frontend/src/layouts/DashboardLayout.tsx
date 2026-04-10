import { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { Sidebar } from "../components/Sidebar";
import { Header } from "../components/Header";
import { SubscriptionAlert } from "../components/SubscriptionAlert";
import { useOrganization } from "../context/OrganizationContext";
import { useAuth } from "../context/AuthContext";
import { ToastContainer } from "react-toastify";
import 'react-toastify/dist/ReactToastify.css';

export function DashboardLayout() {
    const navigate = useNavigate();
    const location = useLocation();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const { organization } = useOrganization();
    const { isSystemOwner, isAuthenticated } = useAuth();

    const hasOrganization = organization !== null || localStorage.getItem('current_organization_id') !== null;

    useEffect(() => {
        // Only redirect if authenticated, not system owner, and has no organization
        if (isAuthenticated && !isSystemOwner() && !hasOrganization) {
            if (location.pathname !== '/create-organization') {
                navigate('/create-organization', { replace: true });
            }
        }
    }, [isAuthenticated, isSystemOwner, hasOrganization, location.pathname, navigate]);

    return (
        <div className="min-h-screen bg-slate-100 dark:bg-zinc-900">
            <Sidebar
                isOpen={sidebarOpen}
                onClose={() => setSidebarOpen(false)}
                onCollapsedChange={setSidebarCollapsed}
            />

            <div
                className={`flex min-h-screen flex-col ${sidebarCollapsed ? "lg:pl-16" : "lg:pl-64"}`}
            >
                <Header onMenuClick={() => setSidebarOpen(true)} />
                <main className="dashboard-main dashboard-main-padding min-h-0">
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
                    />
                    <SubscriptionAlert
                        hasActiveSubscription={organization?.hasActiveSubscription}
                        subscriptionStatus={organization?.subscriptionStatus}
                        subscriptionEndDate={organization?.subscriptionEndDate}
                    />
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
