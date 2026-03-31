import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type Language = "en" | "rw" | "fr";

const dictionaries: Record<Language, Record<string, string>> = {
  en: {
    dashboard: "Dashboard",
    products: "Products",
    inventory: "Inventory",
    purchases: "Purchases",
    sales: "Sales",
    POS: "POS",
    suppliers: "Suppliers",
    customers: "Customers",
    reports: "Reports",
    settings: "Settings",
    welcome: "Welcome to your business overview.",
    totalProducts: "Total Products",
    totalStockValue: "Total Stock Value",
    lowStockItems: "Low Stock Items",
    todaysSales: "Today's Sales",
    salesTrend: "Sales Trend (Last 30 Days)",
    stockMovements: "Stock Movements",
    recentSales: "Recent Sales",
    lowStockAlerts: "Low Stock Alerts",
    pendingPurchaseOrders: "Pending Purchase Orders",
    monthlyReports: "Monthly Reports",
    logout: "Logout",
  },
  rw: {
    dashboard: "Ikibaho",
    products: "Ibicuruzwa",
    inventory: "Ububiko",
    purchases: "Ibyaguzwe",
    sales: "Ibyagurishijwe",
    POS: "POS",
    suppliers: "Abatanga ibicuruzwa",
    customers: "Abakiriya",
    reports: "Raporo",
    settings: "Igenamiterere",
    welcome: "Murakaza neza ku ncamake y'ubucuruzi bwawe.",
    totalProducts: "Umubare w'ibicuruzwa",
    totalStockValue: "Agaciro kose k'ububiko",
    lowStockItems: "Ibiri hafi kurangira",
    todaysSales: "Ibyagurishijwe uyu munsi",
    salesTrend: "Icyerekezo cy'igurisha (iminsi 30)",
    stockMovements: "Imigendekere y'ububiko",
    recentSales: "Ibyagurishijwe vuba",
    lowStockAlerts: "Amatangazo y'ibibura",
    pendingPurchaseOrders: "Ibisabwe kugurwa bitararangira",
    monthlyReports: "Raporo za buri kwezi",
    logout: "Sohoka",
  },
  fr: {
    dashboard: "Tableau de bord",
    products: "Produits",
    inventory: "Stock",
    purchases: "Achats",
    sales: "Ventes",
    POS: "POS",
    suppliers: "Fournisseurs",
    customers: "Clients",
    reports: "Rapports",
    settings: "Parametres",
    welcome: "Bienvenue dans la vue d'ensemble de votre entreprise.",
    totalProducts: "Total Produits",
    totalStockValue: "Valeur totale du stock",
    lowStockItems: "Produits en rupture",
    todaysSales: "Ventes du jour",
    salesTrend: "Tendance des ventes (30 jours)",
    stockMovements: "Mouvements de stock",
    recentSales: "Ventes recentes",
    lowStockAlerts: "Alertes stock bas",
    pendingPurchaseOrders: "Commandes d'achat en attente",
    monthlyReports: "Rapports mensuels",
    logout: "Se deconnecter",
  },
};

type I18nState = {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: string) => string;
};

const I18nContext = createContext<I18nState | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Language>((localStorage.getItem("lang") as Language) || "en");
  const value = useMemo<I18nState>(
    () => ({
      lang,
      setLang: (next) => {
        localStorage.setItem("lang", next);
        setLang(next);
      },
      t: (key) => dictionaries[lang][key] ?? key,
    }),
    [lang],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
