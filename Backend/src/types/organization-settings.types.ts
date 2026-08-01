/**
 * Strict shapes for the JSON blobs stored on OrganizationSetting. The database
 * only guarantees `Json`, so every read must be cast through these interfaces
 * and defensively merged with DEFAULT_SETTINGS — never trust a raw row.
 */

/** Controls which individual sidebar links a workspace can see — one key per
 *  nav item (not per section), so an org can hide e.g. just "Scan Invoice"
 *  without losing the rest of Orders. Keying by nav id keeps this extensible:
 *  a new nav item ships with a new optional key and no migration, and any org
 *  missing the key falls back to `visible`. */
export interface ISidebarConfig {
  home: boolean;
  dashboard: boolean;
  pos: boolean;
  sales: boolean;
  customers: boolean;
  debtManagement: boolean;
  inventoryAll: boolean;
  lowStock: boolean;
  expiredProducts: boolean;
  stockMovementHistory: boolean;
  inventorySummary: boolean;
  stockTransfers: boolean;
  warehouses: boolean;
  orders: boolean;
  suppliers: boolean;
  supplierInvoices: boolean;
  scanInvoice: boolean;
  expenses: boolean;
  organizations: boolean;
  users: boolean;
  activityLogs: boolean;
  ebmOutbox: boolean;
  subscription: boolean;
  billingHistory: boolean;
  salesReports: boolean;
  inventoryReports: boolean;
  stockReports: boolean;
  debtPaymentsReport: boolean;
  cashFlowReport: boolean;
}

/** Global operational switches that change business logic, not just UI. */
export interface IFeatureFlags {
  /** Allow sales to push product quantity below zero instead of blocking checkout. */
  allowNegativeStock: boolean;
  /** Push completed sales to the RRA EBM/VSDC electronic-invoicing integration. */
  ebmIntegrationEnabled: boolean;
  /** Require manager approval before a stock adjustment is applied. */
  requireStockAdjustmentApproval: boolean;
  /** Let sellers grant ad-hoc discounts at the POS without manager override. */
  allowManualDiscounts: boolean;
  /** Enable multi-branch stock transfer workflows. */
  stockTransfersEnabled: boolean;
}

/** Cosmetic / UX preferences that don't affect business logic or data access. */
export interface IPreferences {
  language: string;
  timezone: string;
  dateFormat: string;
  defaultLandingPage: string;
  lowStockThresholdOverride: number | null;
}

export interface IOrganizationSettings {
  sidebarConfig: ISidebarConfig;
  featureFlags: IFeatureFlags;
  preferences: IPreferences;
}

/** Fallback applied to any record — including rows created before a given key
 *  existed — so the rest of the app can treat settings as fully populated. */
export const DEFAULT_SETTINGS: IOrganizationSettings = {
  sidebarConfig: {
    home: true,
    dashboard: true,
    pos: true,
    sales: true,
    customers: true,
    debtManagement: true,
    inventoryAll: true,
    lowStock: true,
    expiredProducts: true,
    stockMovementHistory: true,
    inventorySummary: true,
    stockTransfers: true,
    warehouses: true,
    orders: true,
    suppliers: true,
    supplierInvoices: true,
    scanInvoice: true,
    expenses: true,
    organizations: true,
    users: true,
    activityLogs: true,
    ebmOutbox: true,
    subscription: true,
    billingHistory: true,
    salesReports: true,
    inventoryReports: true,
    stockReports: true,
    debtPaymentsReport: true,
    cashFlowReport: true,
  },
  featureFlags: {
    allowNegativeStock: false,
    // Defaults to true: this must match the pre-existing always-on behavior
    // (gated only by the global config.ebm.enabled flag) for every org that
    // hasn't explicitly visited Settings, or EBM/RRA submission would silently
    // stop for organizations that never touched this toggle.
    ebmIntegrationEnabled: true,
    requireStockAdjustmentApproval: false,
    allowManualDiscounts: true,
    stockTransfersEnabled: true,
  },
  preferences: {
    language: "en",
    timezone: "Africa/Kigali",
    dateFormat: "DD/MM/YYYY",
    defaultLandingPage: "dashboard",
    lowStockThresholdOverride: null,
  },
};

/** Partial update payloads: every leaf is optional so callers can patch a
 *  single flag without knowing (or overwriting) the rest of the document. */
export type SidebarConfigPatch = Partial<ISidebarConfig>;
export type FeatureFlagsPatch = Partial<IFeatureFlags>;
export type PreferencesPatch = Partial<IPreferences>;

export interface OrganizationSettingsPatch {
  sidebarConfig?: SidebarConfigPatch;
  featureFlags?: FeatureFlagsPatch;
  preferences?: PreferencesPatch;
}
