import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  X,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  BarChart3,
  TrendingUp,
  Receipt,
  User,
  Activity,
  CreditCard,
  PanelLeftClose,
  PanelLeftOpen,
  History,
  GitBranch,
  Building2,
  Plus,
  LogOut,
} from "lucide-react";
import { apiClient } from "../lib/api-client";
import { useOrganization } from "../context/OrganizationContext";
import { useAuth } from "../context/AuthContext";
type NavigationItem = {
  id: string;
  name: string;
  href: string;
  icon?: React.ComponentType<{ className?: string }>;
  type?: "header";
  submenu?: Array<{
    id: string;
    name: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
  }>;
};

const baseNavigation: NavigationItem[] = [
  {
    name: "nav.dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    id: "dashboard",
  },

  // Sales Section
  {
    type: "header",
    name: "nav.salesHeader",
    id: "sales-header",
    href: "",
  },
  {
    name: "nav.pos",
    href: "pos",
    icon: ShoppingCart,
    id: "pos",
  },
  {
    name: "nav.sales",
    href: "sales",
    icon: Receipt,
    id: "sales",
  },
  {
    name: "nav.customers",
    href: "customers",
    icon: User,
    id: "customers",
  },
  {
    name: "nav.debtManagement",
    href: "debt",
    icon: Receipt,
    id: "debt-management",
  },

  // Inventory Section
  {
    type: "header",
    name: "nav.inventoryHeader",
    id: "inventory-header",
    href: "",
  },
  {
    name: "nav.allInventory",
    href: "inventory-all",
    icon: Package,
    id: "inventory-all",
  },
  {
    name: "nav.lowStock",
    href: "low-stock",
    icon: AlertTriangle,
    id: "low-stock",
  },
  {
    name: "nav.expiredProducts",
    href: "expired",
    icon: AlertTriangle,
    id: "expired",
  },
  {
    name: "nav.ledgerHistory",
    href: "ledger-history",
    icon: History,
    id: "ledger-history",
  },
  {
    name: "nav.inventorySummary",
    href: "inventory-summary",
    icon: BarChart3,
    id: "inventory-summary",
  },
  {
    name: "nav.stockTransfers",
    href: "stock-transfers",
    icon: GitBranch,
    id: "stock-transfers",
  },
  {
    name: "nav.warehouses",
    href: "warehouses",
    icon: Building2,
    id: "warehouses",
  },


  // Orders Section
  {
    type: "header",
    name: "nav.ordersHeader",
    id: "orders-header",
    href: "",
  },
  {
    name: "nav.orders",
    href: "orders",
    icon: ShoppingCart,
    id: "orders",
  },
  {
    name: "nav.suppliers",
    href: "suppliers",
    icon: Users,
    id: "suppliers",
  },
];

const adminNavigation: NavigationItem[] = [
  {
    name: "nav.users",
    href: "users",
    icon: Users,
    id: "users",
  },
  {
    name: "nav.activityLogs",
    href: "activity-logs",
    icon: Activity,
    id: "activity-logs",
  },
  // Billing Section
  {
    type: "header",
    name: "nav.billing",
    id: "billing-header",
    href: "",
  },
  {
    name: "nav.subscription",
    href: "subscription",
    icon: CreditCard,
    id: "subscription",
  },
  {
    name: "nav.billingHistory",
    href: "history",
    icon: Receipt,
    id: "billing-history",
  },
  // Reports Section
  {
    type: "header",
    name: "nav.reportsHeader",
    id: "reports-header",
    href: "",
  },
  {
    name: "nav.salesReports",
    href: "sales-reports",
    icon: TrendingUp,
    id: "sales-report",
  },
  {
    name: "nav.inventoryReports",
    href: "inventory-reports",
    icon: BarChart3,
    id: "inventory-report",
  },
  {
    name: "nav.stockReports",
    href: "stock-reports",
    icon: Package,
    id: "stock-reports",
  },
  {
    name: "nav.debtPayments",
    href: "debt-payments-report",
    icon: Receipt,
    id: "debt-payments-report",
  },
  {
    name: "nav.cashFlow",
    href: "cash-flow-report",
    icon: TrendingUp,
    id: "cash-flow-report",
  },
];

// Function to get navigation items based on user role and subscription status
const getNavigationItems = (
  userRole?: string,
  hasActiveSubscription?: boolean,
  isSystemOwner?: boolean,
  hasOrganization?: boolean
): NavigationItem[] => {
  // If user is system owner, only show system owner navigation
  if (isSystemOwner) {
    return [
      {
        type: "header",
        name: "nav.systemOwner",
        id: "system-owner-header",
        href: "",
      },
      {
        name: "nav.overview",
        href: "/dashboard/system-owner/overview",
        icon: LayoutDashboard,
        id: "system-overview",
      },
      {
        name: "nav.organizations",
        href: "/dashboard/system-owner/organizations",
        icon: Users,
        id: "system-organizations",
      },
      {
        name: "nav.subscriptions",
        href: "/dashboard/system-owner/subscriptions",
        icon: CreditCard,
        id: "system-subscriptions",
      },
      {
        name: "nav.payments",
        href: "/dashboard/system-owner/payments",
        icon: Receipt,
        id: "system-payments",
      },
      {
        name: "nav.analytics",
        href: "/dashboard/system-owner/analytics",
        icon: BarChart3,
        id: "system-analytics",
      },
      ...(hasOrganization ? [
        {
          name: "nav.branches",
          href: "branches",
          icon: GitBranch,
          id: "branches-so",
        }
      ] : [])
    ] as NavigationItem[];
  }

  // If user has no organization, show ONLY Organizations and Create option
  if (hasOrganization === false) {
    return [
      {
        name: "nav.organizations",
        href: "organizations",
        icon: Building2,
        id: "organizations",
      },
    ] as NavigationItem[];
  }

  // If no active subscription, only show billing-related items
  if (hasActiveSubscription === false) {
    return [
      {
        type: "header",
        name: "nav.billing",
        id: "billing-header",
        href: "",
      },
      {
        name: "nav.subscription",
        href: "subscription",
        icon: CreditCard,
        id: "subscription",
      },
      {
        name: "nav.billingHistory",
        href: "history",
        icon: Receipt,
        id: "billing-history",
      },
    ] as NavigationItem[];
  }

  const navItems = [...baseNavigation];

  // Add admin section ONLY if user has ADMIN role
  if (userRole === "ADMIN") {
    navItems.push(
      {
        type: "header",
        name: "nav.admin",
        id: "admin-header",
        href: "",
      },
      {
        name: "nav.organizations",
        href: "organizations",
        icon: Building2,
        id: "organizations",
      },
      ...adminNavigation
    );
  }

  return navItems;
};

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onCollapsedChange?: (collapsed: boolean) => void;
}


export function Sidebar({ isOpen, onClose, onCollapsedChange }: SidebarProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const { organization, setOrganization } = useOrganization();
  const { user, isSystemOwner, logout } = useAuth();
  const [expandedMenus, setExpandedMenus] = useState<string[]>([
    "sales",
    "inventory",
  ]);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch organization
        const organizationId = localStorage.getItem("current_organization_id");
        if (organizationId) {
          const organizationData = await apiClient.getOrganization(
            organizationId
          );
          setOrganization(organizationData?.organization || null);
        }

        // Fetch user profile
        await apiClient.profile();
      } catch (error) {
        console.error("Failed to fetch data:", error);
      }
    };

    fetchData();
  }, []);

  const toggleSubmenu = (menuId: string) => {
    setExpandedMenus((prev) =>
      prev.includes(menuId)
        ? prev.filter((id) => id !== menuId)
        : [...prev, menuId]
    );
  };

  const toggleCollapsed = () => {
    setIsCollapsed((prev) => {
      const newCollapsed = !prev;
      onCollapsedChange?.(newCollapsed);
      return newCollapsed;
    });
  };

  const isActiveRoute = (path: string) => {
    // Handle dashboard path - only match exactly
    if (path === "/dashboard") {
      return location.pathname === "/dashboard";
    }

    // Skip header items
    if (path === "") {
      return false;
    }

    // Handle submenu items (which have full paths)
    if (path.startsWith("/")) {
      return (
        location.pathname === path ||
        location.pathname === `${path}/` ||
        location.pathname.startsWith(`${path}/`)
      );
    }

    const pathSegments = location.pathname.split("/").filter(Boolean);

    return pathSegments[pathSegments.length - 1] === path;
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`dashboard-chrome fixed inset-y-0 left-0 z-50 flex transform flex-col border-r shadow-xl transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        } ${isCollapsed ? "w-16" : "w-64"}`}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/15 px-3 lg:px-4">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-800/90 ring-1 ring-white/15">
                <Package className="h-5 w-5 text-white" />
              </div>
              {!isCollapsed && (
                <span className="truncate text-base font-semibold tracking-tight text-white">
                  {t('common.appName')}
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                className="hidden rounded-lg p-2 text-blue-100 transition-colors hover:bg-white/10 lg:flex"
                onClick={toggleCollapsed}
                title={isCollapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
              >
                {isCollapsed ? (
                  <PanelLeftOpen className="h-4 w-4" />
                ) : (
                  <PanelLeftClose className="h-4 w-4" />
                )}
              </button>
              <button
                type="button"
                className="rounded-lg p-2 text-slate-300 transition-colors hover:bg-white/10 hover:text-white lg:hidden"
                onClick={onClose}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {organization && (
            <div className={`border-b border-white/15 px-3 py-3 ${isCollapsed ? "px-2" : ""}`}>
              <div
                className={`flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 py-2 ${
                  isCollapsed ? "justify-center px-1" : "px-3"
                }`}
              >
                <img
                  src={organization.avatar}
                  alt={organization.name}
                  className={`rounded-full object-cover ring-2 ring-white/25 ${isCollapsed ? "h-8 w-8" : "h-11 w-11"}`}
                />
                {!isCollapsed && (
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{organization.name}</p>
                    <p className="truncate text-xs text-slate-400">{organization.address}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Navigation */}
          <nav className={`flex-1 space-y-0.5 overflow-y-auto py-3 ${isCollapsed ? "px-2" : "px-3"}`}>
            {getNavigationItems(
              user?.role,
              organization?.hasActiveSubscription,
              isSystemOwner(),
              organization !== null || localStorage.getItem('current_organization_id') !== null
            ).map((item) => {
              // Handle section headers
              if (item.type === "header") {
                return (
                  <div key={`header-${item.id}`} className={`${isCollapsed ? "px-2" : "px-3"} pb-1.5 pt-4 first:pt-2`}>
                    {!isCollapsed && (
                      <span className="dashboard-nav-section-label block">{t(item.name)}</span>
                    )}
                  </div>
                );
              }

              const isActive = isActiveRoute(item.href);
              const hasSubmenu = item.submenu && item.submenu.length > 0;
              const isExpanded = expandedMenus.includes(item.id);

              return (
                <div key={item.id || item.name}>
                  {hasSubmenu ? (
                    <button
                      type="button"
                      onClick={() => item.id && toggleSubmenu(item.id)}
                      className={`dashboard-nav-item w-full ${isCollapsed ? "justify-center px-2" : "justify-between"} ${
                        isActive
                          ? "bg-white text-slate-900 shadow-sm"
                          : "text-slate-200 hover:bg-white/10 hover:text-white"
                      }`}
                      title={isCollapsed ? t(item.name) : undefined}
                    >
                      <span className={`flex min-w-0 items-center gap-3 ${isCollapsed ? "" : "flex-1"}`}>
                        {item.icon && <item.icon className="h-5 w-5 shrink-0" />}
                        {!isCollapsed && <span className="truncate text-left">{t(item.name)}</span>}
                      </span>
                      {!isCollapsed &&
                        (isExpanded ? (
                          <ChevronDown className="h-4 w-4 shrink-0 opacity-80" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 opacity-80" />
                        ))}
                    </button>
                  ) : (
                    <Link
                      to={item.href || "#"}
                      className={`dashboard-nav-item ${isCollapsed ? "justify-center px-2" : "px-3"} ${
                        isActive
                          ? "bg-white text-slate-900 shadow-sm"
                          : "text-slate-200 hover:bg-white/10 hover:text-white"
                      }`}
                      onClick={onClose}
                      title={isCollapsed ? t(item.name) : undefined}
                    >
                      {item.icon && (
                        <item.icon className={`shrink-0 ${isCollapsed ? "h-5 w-5" : "h-5 w-5"}`} />
                      )}
                      {!isCollapsed && t(item.name)}
                    </Link>
                  )}

                  {/* Submenu - Hidden when collapsed */}
                  {hasSubmenu && isExpanded && !isCollapsed && item.submenu && (
                    <div className="ml-3 mt-0.5 space-y-0.5 border-l border-white/20 pl-2">
                      {item.submenu.map((subItem) => {
                        const isSubActive = isActiveRoute(subItem.href);
                        return (
                          <Link
                            key={subItem.id}
                            to={subItem.href}
                            className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                              isSubActive
                                ? "bg-white/15 font-medium text-white"
                                : "text-slate-300 hover:bg-white/10 hover:text-white"
                            }`}
                            onClick={onClose}
                          >
                            <div className="flex items-center gap-2">
                              {subItem.icon && (
                                <subItem.icon className="h-4 w-4 shrink-0" />
                              )}
                              <span>{t(subItem.name)}</span>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
          {organization === null && localStorage.getItem('current_organization_id') === null && (
            <div className="border-t border-white/15 p-3">
              <Link
                to="/dashboard/organizations"
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-white p-3 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-100"
                onClick={onClose}
              >
                <div className="rounded-md bg-[#0f2744] p-1 ring-1 ring-slate-600/50">
                  <Plus className="h-4 w-4 text-white" />
                </div>
                {!isCollapsed && <span>{t('organizations.createNew')}</span>}
              </Link>
            </div>
          )}
          {/* Logout Button */}
          <div className={`border-t border-white/15 ${isCollapsed ? "p-2" : "p-3"}`}>
            <button
              type="button"
              onClick={logout}
              className={`dashboard-nav-item w-full text-red-200 hover:bg-red-600/25 hover:text-white ${
                isCollapsed ? "justify-center px-2" : "gap-3 px-3"
              }`}
              title={isCollapsed ? t("auth.logout") : undefined}
            >
              <LogOut className="h-5 w-5 shrink-0" />
              {!isCollapsed && t("auth.logout")}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
