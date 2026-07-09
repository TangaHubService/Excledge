"use strict";
/**
 * Strict shapes for the JSON blobs stored on OrganizationSetting. The database
 * only guarantees `Json`, so every read must be cast through these interfaces
 * and defensively merged with DEFAULT_SETTINGS — never trust a raw row.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SETTINGS = void 0;
/** Fallback applied to any record — including rows created before a given key
 *  existed — so the rest of the app can treat settings as fully populated. */
exports.DEFAULT_SETTINGS = {
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
