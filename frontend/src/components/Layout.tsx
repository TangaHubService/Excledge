import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Boxes,
  ClipboardList,
  Cog,
  CreditCard,
  LayoutDashboard,
  LogOut,
  MoonStar,
  PackageSearch,
  ShoppingBag,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  AlertTriangle,
  Trophy,
} from "lucide-react";
import { api } from "../api/client";
import { useI18n } from "../i18n";
import { useTheme } from "../theme";

const links = [
  ["dashboard", "/", LayoutDashboard],
  ["products", "/products", Boxes],
  ["inventory", "/inventory", PackageSearch],
  ["purchases", "/purchases", ShoppingBag],
  ["sales", "/sales", Wallet],
  ["POS", "/pos", CreditCard],
  ["suppliers", "/suppliers", Truck],
  ["customers", "/customers", Users],
  ["reports", "/reports/sales-trend", ClipboardList],
  ["settings", "/settings", Cog],
] as const;

const reportLinks = [
  ["Sales Trend", "/reports/sales-trend", TrendingUp],
  ["Inventory Value", "/reports/inventory-value", BarChart3],
  ["Top Products", "/reports/top-products", Trophy],
  ["Low Stock", "/reports/low-stock", AlertTriangle],
  ["Payment Methods", "/reports/payment-methods", CreditCard],
] as const;

export function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, lang, setLang } = useI18n();
  const { theme, toggleTheme } = useTheme();
  return (
    <div className="dashboard-layout">
      <aside className="dashboard-sidebar">
        <h2 className="brand-title">Inventory System</h2>
        <p className="brand-subtitle">Business operations</p>
        <nav>
          {links.map(([key, to, Icon]) => {
            const isReports = key === "reports";
            const isActive = isReports ? location.pathname.startsWith("/reports") : location.pathname === to;
            return (
              <div key={to}>
                <Link to={to} className={isActive ? "active" : ""}>
                  <span className="nav-icon"><Icon size={17} /></span>
                  <span>{t(key)}</span>
                </Link>
                {isReports ? (
                  <div className="report-submenu">
                    {reportLinks.map(([label, path, ReportIcon]) => (
                      <Link key={path} to={path} className={location.pathname === path ? "active" : ""}>
                        <span className="nav-icon"><ReportIcon size={15} /></span> {label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-user">
          <div className="avatar">JD</div>
          <div>
            <div>John Doe</div>
            <small>Admin</small>
          </div>
        </div>
        <button
          onClick={async () => {
            try {
              await api.post("/auth/logout");
            } catch {
              // no-op for logout
            }
            localStorage.removeItem("token");
            navigate("/login");
          }}
        >
          <LogOut size={16} />
          {t("logout")}
        </button>
      </aside>
      <section className="dashboard-main">
        <header className="topbar">
          <select defaultValue="Kigali Branch" className="topbar-control">
            <option>Kigali Branch</option>
          </select>
          <select className="topbar-control" value={lang} onChange={(e) => setLang(e.target.value as typeof lang)}>
            <option value="en">English</option>
            <option value="rw">Kinyarwanda</option>
            <option value="fr">Francais</option>
          </select>
          <button className="theme-toggle" onClick={toggleTheme}>
            <MoonStar size={16} />
            {theme === "light" ? "Dark" : "Light"} mode
          </button>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </section>
    </div>
  );
}
