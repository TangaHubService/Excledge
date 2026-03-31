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
  Sun,
  ChevronDown,
} from "lucide-react";
import { api } from "../api/client";
import { useI18n } from "../i18n";
import { useTheme } from "../theme";

const navigationGroups: { label: string; links: { key: string; to: string; icon: any; subLinks?: boolean }[] }[] = [
  {
    label: "Main",
    links: [
      { key: "dashboard", to: "/", icon: LayoutDashboard },
    ]
  },
  {
    label: "Inventory",
    links: [
      { key: "products", to: "/products", icon: Boxes },
      { key: "inventory", to: "/inventory", icon: PackageSearch },
      { key: "purchases", to: "/purchases", icon: ShoppingBag },
    ]
  },
  {
    label: "Operations",
    links: [
      { key: "sales", to: "/sales", icon: Wallet },
      { key: "POS", to: "/pos", icon: CreditCard },
      { key: "suppliers", to: "/suppliers", icon: Truck },
      { key: "customers", to: "/customers", icon: Users },
    ]
  },
  {
    label: "Analytics",
    links: [
      { key: "reports", to: "/reports/sales-trend", icon: ClipboardList, subLinks: true },
    ]
  },
  {
    label: "Preference",
    links: [
      { key: "settings", to: "/settings", icon: Cog },
    ]
  }
];

const reportLinks = [
  { label: "Sales Trend", path: "/reports/sales-trend", icon: TrendingUp },
  { label: "Inventory Value", path: "/reports/inventory-value", icon: BarChart3 },
  { label: "Top Products", path: "/reports/top-products", icon: Trophy },
  { label: "Low Stock", path: "/reports/low-stock", icon: AlertTriangle },
  { label: "Payment Methods", path: "/reports/payment-methods", icon: CreditCard },
] as const;

import { useBranch } from "../context/BranchContext";

import { Select } from "./ui/Select";

export function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, lang, setLang } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const { branchId, setBranchId, branches } = useBranch();

  const branchOptions = branches.map(b => ({ value: b.id, label: b.name }));
  const langOptions = [
    { value: "en", label: "English" },
    { value: "rw", label: "Kinyarwanda" },
    { value: "fr", label: "Français" },
  ];

  return (
    <div className="dashboard-layout">
      <aside className="dashboard-sidebar">
        <div style={{ marginBottom: "24px", padding: "0 4px" }}>
          <Select
            value={branchId}
            onChange={setBranchId}
            options={branchOptions}
            icon={Truck}
            className="sidebar-select"
            placeholder="Select Branch"
          />
        </div>

        <nav>
          {navigationGroups.map((group) => (
            <div key={group.label} style={{ marginBottom: "16px" }}>
              <div
                style={{
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "#64748b",
                  fontWeight: 700,
                  padding: "0 12px 8px",
                }}
              >
                {t(group.label.toLowerCase())}
              </div>
              <div style={{ display: "grid", gap: "2px" }}>
                {group.links.map((link) => {
                  const Icon = link.icon;
                  const isReports = link.subLinks;
                  const isActive = isReports
                    ? location.pathname.startsWith("/reports")
                    : location.pathname === link.to;
                  return (
                    <div key={link.to}>
                      <Link to={link.to} className={isActive ? "active" : ""}>
                        <Icon size={18} className="nav-icon" />
                        <span className="sidebar-link-text">{t(link.key)}</span>
                      </Link>
                      {isReports && location.pathname.startsWith("/reports") && (
                        <div className="report-submenu">
                          {reportLinks.map((sub) => (
                            <Link
                              key={sub.path}
                              to={sub.path}
                              className={
                                location.pathname === sub.path ? "active" : ""
                              }
                            >
                              <sub.icon size={14} className="nav-icon" /> {sub.label}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="sidebar-user">
          <div className="avatar">JD</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontWeight: 600,
                fontSize: "13px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              John Doe
            </div>
            <div style={{ color: "#94a3b8", fontSize: "11px" }}>Administrator</div>
          </div>
        </div>

        <button
          onClick={async () => {
            try {
              await api.post("/auth/logout");
            } catch {}
            localStorage.removeItem("token");
            navigate("/login");
          }}
        >
          <LogOut size={16} />
          <span className="sidebar-link-text">{t("logout")}</span>
        </button>
      </aside>

      <section className="dashboard-main">
        <header className="topbar">
          <div
            style={{
              marginRight: "auto",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            {/* Breadcrumb or search could go here */}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "160px" }}>
              <Select
                value={lang}
                onChange={(val) => setLang(val as any)}
                options={langOptions}
              />
            </div>

            <button className="btn ghost theme-toggle" onClick={toggleTheme}>
              {theme === "light" ? <MoonStar size={18} /> : <Sun size={18} />}
              <span className="sidebar-link-text">
                {theme === "light" ? "Dark" : "Light"}
              </span>
            </button>
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </section>
    </div>
  );
}
