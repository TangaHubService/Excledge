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

/** Shallow-merges a possibly-partial/legacy JSON blob onto its typed default.
 *  Keeps records created before a key existed (or written by an older app
 *  version) fully populated without a backfill migration. */
function withDefaults<T extends object>(defaults: T, stored: unknown): T {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return defaults;
  }
  return { ...defaults, ...(stored as Partial<T>) };
}

function toTypedSettings(row: {
  sidebarConfig: Prisma.JsonValue;
  featureFlags: Prisma.JsonValue;
  preferences: Prisma.JsonValue;
} | null, vatRegistered: boolean): IOrganizationSettings {
  if (!row) return { ...DEFAULT_SETTINGS, vatRegistered };

  return {
    sidebarConfig: withDefaults<ISidebarConfig>(DEFAULT_SETTINGS.sidebarConfig, row.sidebarConfig),
    featureFlags: withDefaults<IFeatureFlags>(DEFAULT_SETTINGS.featureFlags, row.featureFlags),
    preferences: withDefaults<IPreferences>(DEFAULT_SETTINGS.preferences, row.preferences),
    vatRegistered,
  };
}

/** Fetches an organization's settings, applying DEFAULT_SETTINGS for any
 *  missing record or missing key. Never throws for a missing row — a brand
 *  new organization simply gets the platform defaults. */
export async function getOrganizationSettings(
  organizationId: number
): Promise<IOrganizationSettings> {
  const [row, org] = await Promise.all([
    prisma.organizationSetting.findUnique({
      where: { organizationId },
      select: { sidebarConfig: true, featureFlags: true, preferences: true },
    }),
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { vatRegistered: true },
    }),
  ]);

  return toTypedSettings(row, org?.vatRegistered ?? false);
}

/**
 * Atomically applies a partial settings patch. Uses Postgres jsonb `||` to
 * merge at the database level instead of read-modify-write in application
 * code, so two concurrent requests patching different keys (e.g. one toggling
 * `allowNegativeStock`, another toggling `ebmIntegrationEnabled`) can never
 * silently clobber each other's change (classic lost-update race).
 */
export async function upsertOrganizationSettings(
  organizationId: number,
  patch: OrganizationSettingsPatch
): Promise<IOrganizationSettings> {
  const sidebarPatch = patch.sidebarConfig ?? {};
  const featureFlagsPatch = patch.featureFlags ?? {};
  const preferencesPatch = patch.preferences ?? {};

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
    select: { vatRegistered: true },
  });

  return toTypedSettings(rows[0] ?? null, org?.vatRegistered ?? false);
}
