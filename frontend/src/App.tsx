import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { DashboardPage } from "./pages/DashboardPage";
import { CrudPage } from "./pages/CrudPage";
import { InventoryPage } from "./pages/InventoryPage";
import { PurchasesPage } from "./pages/PurchasesPage";
import { SalesPage } from "./pages/SalesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { POSPage } from "./pages/POSPage";
import { SalesTrendReportPage } from "./pages/reports/SalesTrendReportPage";
import { InventoryValueReportPage } from "./pages/reports/InventoryValueReportPage";
import { TopProductsReportPage } from "./pages/reports/TopProductsReportPage";
import { LowStockReportPage } from "./pages/reports/LowStockReportPage";
import { PaymentMethodsReportPage } from "./pages/reports/PaymentMethodsReportPage";

import { BranchProvider } from "./context/BranchContext";

const Protected = () => (localStorage.getItem("token") ? <Outlet /> : <Navigate to="/login" />);

export default function App() {
  return (
    <BranchProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route element={<Protected />}>
          <Route element={<Layout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route
              path="/products"
              element={
                <CrudPage
                  title="Products"
                  endpoint="products"
                  fields={["name", "sku", "categoryId", "unitPrice", "taxCategory", "reorderLevel"]}
                  selectFields={{
                    categoryId: { endpoint: "categories", labelKey: "name", placeholder: "Select category" },
                  }}
                />
              }
            />
            <Route path="/suppliers" element={<CrudPage title="Suppliers" endpoint="suppliers" fields={["name", "tin", "phone"]} />} />
            <Route path="/customers" element={<CrudPage title="Customers" endpoint="customers" fields={["name", "tin", "phone"]} />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/purchases" element={<PurchasesPage />} />
            <Route path="/sales" element={<SalesPage />} />
            <Route path="/pos" element={<POSPage />} />
            <Route path="/reports" element={<Navigate to="/reports/sales-trend" replace />} />
            <Route path="/reports/sales-trend" element={<SalesTrendReportPage />} />
            <Route path="/reports/inventory-value" element={<InventoryValueReportPage />} />
            <Route path="/reports/top-products" element={<TopProductsReportPage />} />
            <Route path="/reports/low-stock" element={<LowStockReportPage />} />
            <Route path="/reports/payment-methods" element={<PaymentMethodsReportPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>
      </Routes>
    </BranchProvider>
  );
}
