/**
 * Strict shapes for the JSON blobs stored on OrganizationSetting. The database
 * only guarantees `Json`, so every read must be cast through these interfaces
 * and defensively merged with DEFAULT_SETTINGS — never trust a raw row.
 */

/** Controls which sections of the app shell a workspace can see. Keying by
 *  module id keeps this extensible: a new module ships with a new optional
 *  key and no migration, and any org missing the key falls back to `visible`. */
export interface ISidebarConfig {
  dashboard: boolean;
  pos: boolean;
  inventory: boolean;
  purchaseOrders: boolean;
  suppliers: boolean;
  customers: boolean;
  hr: boolean;
  accounting: boolean;
  expenses: boolean;
  reports: boolean;
  users: boolean;
  activityLogs: boolean;
  billing: boolean;
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
    dashboard: true,
    pos: true,
    inventory: true,
    purchaseOrders: true,
    suppliers: true,
    customers: true,
    hr: false,
    accounting: false,
    expenses: true,
    reports: true,
    users: true,
    activityLogs: true,
    billing: true,
  },
  featureFlags: {
    allowNegativeStock: false,
    ebmIntegrationEnabled: false,
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
