import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  DEFAULT_SETTINGS,
  IOrganizationSettings,
  ISidebarConfig,
  IFeatureFlags,
  IPreferences,
  OrganizationSettingsPatch,
} from "../types/organization-settings.types";
import { normalizeMrcOrThrow } from "../utils/mrc";

/** Shallow-merges a possibly-partial/legacy JSON blob onto its typed default. */
function withDefaults<T extends object>(defaults: T, stored: unknown): T {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return defaults;
  }
  return { ...defaults, ...(stored as Partial<T>) };
}

/**
 * Fetches an organization's settings, applying DEFAULT_SETTINGS for any missing record or missing
 * key.
 */
export async function getOrganizationSettings(
  organizationId: number
): Promise<IOrganizationSettings> {
  const [row, org, branch] = await Promise.all([
    prisma.organizationSetting.findUnique({
      where: { organizationId },
      select: { sidebarConfig: true, featureFlags: true, preferences: true },
    }),
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { vatRegistered: true, TIN: true, ebmDeviceId: true },
    }),
    prisma.branch.findFirst({
      where: { organizationId, isDefault: true },
      select: { bhfId: true, ebmSerialNo: true, mrcNo: true },
    }),
  ]);

  const settings = toTypedSettings(row, org?.vatRegistered ?? false, org ?? undefined, branch ?? undefined);
  return enforceFiscalFlags(settings, await hasVsdcDevice(organizationId));
}

/** Whether a VSDC device is configured on the org or any branch. */
async function hasVsdcDevice(organizationId: number): Promise<boolean> {
  const [org, branchCount] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { ebmDeviceId: true, ebmSerialNo: true },
    }),
    prisma.branch.count({ where: { organizationId, ebmSerialNo: { not: null } } }),
  ]);
  return Boolean(org?.ebmDeviceId || org?.ebmSerialNo || branchCount > 0);
}

/** Forces EBM on and negative stock off for a fiscalised org (CIS Art. 7.8 / 7.30). */
export function enforceFiscalFlags(
  settings: IOrganizationSettings,
  fiscalised: boolean
): IOrganizationSettings {
  if (!fiscalised) return settings;
  return {
    ...settings,
    fiscalFlagsLocked: true,
    featureFlags: {
      ...settings.featureFlags,
      ebmIntegrationEnabled: true,
      allowNegativeStock: false,
    },
  };
}

/** Atomically applies a partial settings patch. */
export async function upsertOrganizationSettings(
  organizationId: number,
  patch: OrganizationSettingsPatch
): Promise<IOrganizationSettings> {
  const sidebarPatch = patch.sidebarConfig ?? {};
  const featureFlagsPatch = patch.featureFlags ?? {};
  const preferencesPatch = patch.preferences ?? {};
  const ebmConfigPatch = patch.ebmConfig ?? {};
  let mrc: string | null | undefined;
  if (ebmConfigPatch.mrcNo !== undefined) {
    const [currentOrg, currentBranch] = await Promise.all([
      prisma.organization.findUnique({ where: { id: organizationId }, select: { mrcNo: true } }),
      prisma.branch.findFirst({ where: { organizationId, isDefault: true }, select: { mrcNo: true } }),
    ]);
    mrc = normalizeMrcOrThrow(ebmConfigPatch.mrcNo, {
      current: [currentOrg?.mrcNo, currentBranch?.mrcNo],
    });
  }
  const dvcSrlNo =
    ebmConfigPatch.dvcSrlNo === undefined ? undefined : ebmConfigPatch.dvcSrlNo.trim() || null;

  const updateData: Record<string, unknown> = {};
  if (ebmConfigPatch.tin !== undefined) updateData.TIN = ebmConfigPatch.tin === "" ? null : ebmConfigPatch.tin;
  if (ebmConfigPatch.ebmDeviceId !== undefined) updateData.ebmDeviceId = ebmConfigPatch.ebmDeviceId === "" ? null : ebmConfigPatch.ebmDeviceId;
  if (dvcSrlNo !== undefined) updateData.ebmSerialNo = dvcSrlNo;
  if (mrc !== undefined) updateData.mrcNo = mrc;

  if (Object.keys(updateData).length > 0) {
    await prisma.organization.update({ where: { id: organizationId }, data: updateData });
  }

  const branchUpdateData: Record<string, unknown> = {};
  if (ebmConfigPatch.bhfId !== undefined) branchUpdateData.bhfId = ebmConfigPatch.bhfId === "" ? null : ebmConfigPatch.bhfId;
  if (dvcSrlNo !== undefined) branchUpdateData.ebmSerialNo = dvcSrlNo;
  if (mrc !== undefined) branchUpdateData.mrcNo = mrc;

  if (Object.keys(branchUpdateData).length > 0) {
    await prisma.branch.updateMany({
      where: { organizationId, isDefault: true },
      data: branchUpdateData,
    });
  }

  const rows = await prisma.$queryRaw<
    {
      sidebarConfig: Prisma.JsonValue;
      featureFlags: Prisma.JsonValue;
      preferences: Prisma.JsonValue;
    }[]
  >(Prisma.sql`
    INSERT INTO "organization_settings" ("organizationId", "sidebarConfig", "featureFlags", "preferences", "createdAt", "updatedAt")
    VALUES (
      ${organizationId},
      ${JSON.stringify(sidebarPatch)}::jsonb,
      ${JSON.stringify(featureFlagsPatch)}::jsonb,
      ${JSON.stringify(preferencesPatch)}::jsonb,
      now(),
      now()
    )
    ON CONFLICT ("organizationId") DO UPDATE SET
      "sidebarConfig" = "organization_settings"."sidebarConfig" || EXCLUDED."sidebarConfig",
      "featureFlags"  = "organization_settings"."featureFlags"  || EXCLUDED."featureFlags",
      "preferences"   = "organization_settings"."preferences"   || EXCLUDED."preferences",
      "updatedAt" = now()
    RETURNING "sidebarConfig", "featureFlags", "preferences"
  `);

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { vatRegistered: true, TIN: true, ebmDeviceId: true },
  });

  const branch = await prisma.branch.findFirst({
    where: { organizationId, isDefault: true },
    select: { bhfId: true, ebmSerialNo: true, mrcNo: true },
  });

  const settings = toTypedSettings(
    rows[0] ?? null,
    org?.vatRegistered ?? false,
    org ?? undefined,
    branch ?? undefined
  );
  return enforceFiscalFlags(settings, await hasVsdcDevice(organizationId));
}

function toTypedSettings(row: {
  sidebarConfig: Prisma.JsonValue;
  featureFlags: Prisma.JsonValue;
  preferences: Prisma.JsonValue;
} | null, vatRegistered: boolean, org?: { TIN?: string | null; ebmDeviceId?: string | null }, branch?: { bhfId?: string | null; ebmSerialNo?: string | null; mrcNo?: string | null }): IOrganizationSettings {
  if (!row) return { ...DEFAULT_SETTINGS, vatRegistered, ebmConfig: { tin: org?.TIN ?? "", bhfId: branch?.bhfId ?? "", dvcSrlNo: branch?.ebmSerialNo ?? "", mrcNo: branch?.mrcNo ?? "", ebmDeviceId: org?.ebmDeviceId ?? "" } };

  return {
    sidebarConfig: withDefaults<ISidebarConfig>(DEFAULT_SETTINGS.sidebarConfig, row.sidebarConfig),
    featureFlags: withDefaults<IFeatureFlags>(DEFAULT_SETTINGS.featureFlags, row.featureFlags),
    preferences: withDefaults<IPreferences>(DEFAULT_SETTINGS.preferences, row.preferences),
    vatRegistered,
    ebmConfig: {
      tin: org?.TIN ?? "",
      bhfId: branch?.bhfId ?? "",
      dvcSrlNo: branch?.ebmSerialNo ?? "",
      mrcNo: branch?.mrcNo ?? "",
      ebmDeviceId: org?.ebmDeviceId ?? "",
    },
  };
}
