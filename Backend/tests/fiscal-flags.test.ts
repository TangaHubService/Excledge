import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/prisma", () => ({ prisma: {} }));

import { enforceFiscalFlags } from "../src/services/organization-settings.service";
import { DEFAULT_SETTINGS } from "../src/types/organization-settings.types";

const loose = {
  ...DEFAULT_SETTINGS,
  featureFlags: { ...DEFAULT_SETTINGS.featureFlags, ebmIntegrationEnabled: false, allowNegativeStock: true },
};

describe("enforceFiscalFlags — CIS Art. 7.8 / 7.30", () => {
  it("forces VSDC on and negative stock off when a device is configured", () => {
    const s = enforceFiscalFlags(loose, true);
    expect(s.featureFlags.ebmIntegrationEnabled).toBe(true);
    expect(s.featureFlags.allowNegativeStock).toBe(false);
    expect(s.fiscalFlagsLocked).toBe(true);
  });

  it("leaves stored flags untouched when no device is configured", () => {
    const s = enforceFiscalFlags(loose, false);
    expect(s.featureFlags.ebmIntegrationEnabled).toBe(false);
    expect(s.featureFlags.allowNegativeStock).toBe(true);
    expect(s.fiscalFlagsLocked).toBeUndefined();
  });
});
