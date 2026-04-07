import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Suspense } from "react";
import { DashboardLayout } from "./layouts/DashboardLayout";
import { Loading } from "./components/Loading";
import { Dashboard } from "./pages/Dashboard";
import Login from "./pages/auth/login";
import Signup from "./pages/auth/SignUp";
import CreateOrganization from "./pages/CreateOrganization";
import { InventoryManagement } from "./pages/dashboard/InventoryManagement";
import { ThemeProvider } from "./context/ThemeContext";
import { OrganizationProvider } from "./context/OrganizationContext";
import { BranchProvider } from "./context/BranchContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import SelectOrganization from "./pages/auth/SelectOrganization";
import { ToastProvider, ToastViewport } from "./components/ui/toast";
import LowStock from "./pages/dashboard/inventory/LowStock";
import ExpiringProducts from "./pages/dashboard/inventory/ExpiringProducts";
import ExpiredProduct from "./pages/dashboard/inventory/ExpiredProduct";
import { SalesReport } from "./pages/dashboard/reports/sells";
import { InventoryReport } from "./pages/dashboard/reports/Inventory";
import { PaidDebtReport } from "./pages/dashboard/reports/PaidDebtReport";
import { CashFlowReport } from "./pages/dashboard/reports/CashFlowReport";
import { StockReports } from "./pages/dashboard/reports/StockReports";
import { OrganizationConfig } from "./pages/dashboard/organization/OrganizationConfig";
import { CustomerManagement } from "./pages/dashboard/CustomerManagement";
import { UserManagement } from "./pages/dashboard/users/UserManagement";
import LedgerHistoryPage from "./pages/dashboard/inventory/LedgerHistoryPage";
import InventorySummaryDashboard from "./pages/dashboard/inventory/InventorySummaryDashboard";
import StockTransfersPage from "./pages/dashboard/inventory/StockTransfersPage";
import WarehouseManagement from "./pages/dashboard/inventory/WarehouseManagement";

import SaleDetailsPage from "./pages/dashboard/sales/SaleDetailsPage";
import { AcceptInvitationPage } from "./pages/auth/AcceptInvitation";
import { SuppliersPage } from "./pages/dashboard/suppliers/SuppliersPage";
import { OrdersPage } from "./pages/dashboard/orders/OrdersPage";
import { CreateOrderPage } from "./pages/dashboard/orders/CreateOrderPage";
import { ChangePasswordPage } from "./pages/auth/ChangePassword";
import LandingPage from "./pages/LandingPage";
import SalesPage from "./pages/dashboard/sales/sales";
import { SubscriptionProvider } from "./context/SubscriptionContext";
import SubscriptionPage from "./pages/SubscriptionPage";
import SubscriptionSuccess from "./pages/PaymentCompleted";

import ActivityLogs from "./pages/dashboard/ActivityLogs";
import { Profile } from "./pages/dashboard/Profile";
import { SystemOwnerDashboard } from "./pages/SystemOwner";
import VerificationPage from "./pages/auth/VerificationPage";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "./pages/auth/ResetPasswordPage";
import SalesForm from "./pages/dashboard/sales/pos";
import DebtManagement from "./pages/dashboard/dept";
import SubscriptionManagementPage from "./pages/billing/SubscriptionManagementPage";
import BillingHistoryPage from "./pages/billing/BillingHistoryPage";
import OrganizationsPage from "./pages/dashboard/organizations/OrganizationsPage";
import { PesapalCallback } from "./pages/PesapalCallback";

// Protected Route for System Owners
const ProtectedSystemOwnerRoute = ({ children }: { children: React.ReactNode }) => {
  const { isSystemOwner, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!isSystemOwner()) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};


function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <OrganizationProvider>
          <BranchProvider>
            <SubscriptionProvider>
              <BrowserRouter>
                <Suspense fallback={<Loading />}>
                  <Routes>
                    {/* Public / Unprotected routes */}
                    <Route path="/" element={<LandingPage />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/signup" element={<Signup />} />
                    <Route path="/verify" element={<VerificationPage />} />
                    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                    <Route path="/reset-password" element={<ResetPasswordPage />} />
                    <Route path="/change-password" element={<ChangePasswordPage />} />
                    <Route
                      path="/create-organization"
                      element={<CreateOrganization />}
                    />
                    <Route
                      path="/select-organization"
                      element={<SelectOrganization />}
                    />
                    <Route path="/subscription" element={<SubscriptionPage />} />
                    <Route path="/accept-invite" element={<AcceptInvitationPage />} />
                    <Route path="/subscription/success" element={<SubscriptionSuccess />} />
                    <Route path="/subscription/callback" element={<PesapalCallback />} />

                    {/* Redirect old system owner routes to new dashboard routes */}
                    <Route path="/my-system" element={<Navigate to="/dashboard/system-owner" replace />} />
                    <Route path="/my-system/overview" element={<Navigate to="/dashboard/system-owner/overview" replace />} />
                    <Route path="/my-system/organizations" element={<Navigate to="/dashboard/system-owner/organizations" replace />} />
                    <Route path="/my-system/subscriptions" element={<Navigate to="/dashboard/system-owner/subscriptions" replace />} />
                    <Route path="/my-system/payments" element={<Navigate to="/dashboard/system-owner/payments" replace />} />
                    <Route path="/my-system/analytics" element={<Navigate to="/dashboard/system-owner/analytics" replace />} />

                    {/* Protected / Dashboard routes */}
                    <Route path="dashboard" element={<DashboardLayout />}>
                      <Route index element={<Dashboard />} />
                      <Route path="customers" element={<CustomerManagement />} />
                      <Route path="inventory-all" element={<InventoryManagement />} />
                      <Route path="low-stock" element={<LowStock />} />
                      <Route path="expiring-products" element={<ExpiringProducts />} />
                      <Route path="expired" element={<ExpiredProduct />} />
                      <Route path="sales-reports" element={<SalesReport />} />
                      <Route path="inventory-reports" element={<InventoryReport />} />
                      <Route path="debt-payments-report" element={<PaidDebtReport />} />
                      <Route path="cash-flow-report" element={<CashFlowReport />} />
                      <Route path="stock-reports" element={<StockReports />} />
                      <Route path="purchases-report" element={<Navigate to="/dashboard/orders" replace />} />
                      <Route path="ledger-history" element={<LedgerHistoryPage />} />
                      <Route path="inventory-summary" element={<InventorySummaryDashboard />} />
                      <Route path="stock-transfers" element={<StockTransfersPage />} />
                      <Route path="warehouses" element={<WarehouseManagement />} />
                      <Route path="sales" element={<SalesPage />} />
                      <Route path="sales/:id" element={<SaleDetailsPage />} />
                      <Route path="organization-config" element={<OrganizationConfig />} />

                      {/* Redirect legacy routes */}
                      <Route path="branches" element={<Navigate to="../organization-config" replace />} />
                      <Route path="settings" element={<Navigate to="../organization-config" replace />} />
                      <Route path="pos" element={<SalesForm />} />
                      <Route path="users" element={<UserManagement />} />
                      <Route path="activity-logs" element={<ActivityLogs />} />
                      <Route path="profile" element={<Profile />} />
                      <Route path="suppliers" element={<SuppliersPage />} />
                      <Route path="orders">
                        <Route index element={<OrdersPage />} />
                        <Route path="new" element={<CreateOrderPage />} />
                      </Route>
                      <Route path="debt" element={<DebtManagement />} />
                      <Route path="organizations" element={<OrganizationsPage />} />

                      <Route path="subscription" element={<SubscriptionManagementPage />} />
                      <Route path="history" element={<BillingHistoryPage />} />

                      {/* System Owner Routes - Only accessible to system owners */}
                      <Route path="system-owner/*" element={
                        <ProtectedSystemOwnerRoute>
                          <Suspense fallback={<Loading />}>
                            <SystemOwnerDashboard />
                          </Suspense>
                        </ProtectedSystemOwnerRoute>
                      } />
                    </Route>
                  </Routes>
                  <ToastProvider>
                    <ToastViewport />
                  </ToastProvider>
                </Suspense>
              </BrowserRouter>
            </SubscriptionProvider>
          </BranchProvider>
        </OrganizationProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
