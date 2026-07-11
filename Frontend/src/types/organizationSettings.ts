/** Mirrors Backend/src/types/organization-settings.types.ts — keep in sync. */

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
    organizations: boolean;
}

export interface IFeatureFlags {
    allowNegativeStock: boolean;
    ebmIntegrationEnabled: boolean;
    requireStockAdjustmentApproval: boolean;
    allowManualDiscounts: boolean;
    stockTransfersEnabled: boolean;
}

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

export const DEFAULT_ORGANIZATION_SETTINGS: IOrganizationSettings = {
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
        organizations: true,
    },
    featureFlags: {
        allowNegativeStock: false,
        ebmIntegrationEnabled: true,
        requireStockAdjustmentApproval: false,
        allowManualDiscounts: true,
        stockTransfersEnabled: true,
    },
    preferences: {
        language: 'en',
        timezone: 'Africa/Kigali',
        dateFormat: 'DD/MM/YYYY',
        defaultLandingPage: 'dashboard',
        lowStockThresholdOverride: null,
    },
};

/** Maps a sidebar module key to the route it lands on, for defaultLandingPage. */
export const MODULE_ROUTES: Record<keyof ISidebarConfig, string> = {
    dashboard: '/dashboard',
    pos: '/dashboard/pos',
    inventory: '/dashboard/inventory-all',
    purchaseOrders: '/dashboard/orders',
    suppliers: '/dashboard/suppliers',
    customers: '/dashboard/customers',
    hr: '/dashboard',
    accounting: '/dashboard',
    expenses: '/dashboard/expenses',
    reports: '/dashboard/sales-reports',
    users: '/dashboard/users',
    activityLogs: '/dashboard/activity-logs',
    billing: '/dashboard/subscription',
    organizations: '/dashboard/organizations',
};
