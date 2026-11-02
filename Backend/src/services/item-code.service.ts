import { Prisma } from '@prisma/client';
import type { ItemType } from '@prisma/client';
import { prisma } from '../lib/prisma';

/** Any Prisma client capable of running queries — the top-level client or a $transaction callback's `tx`. */
type PrismaClientOrTx = typeof prisma | Prisma.TransactionClient;

/**
 * Generates and validates the RRA `itemCd` (VSDC API Documentation v1.0.5, §4.17) and derives the
 * `qtyUnitCd` companion field from the product's measurement unit, since the UI only ever asks for
 * `measurementUnit` and `pkgUnitCd` — never the raw RRA codes.
 */

/** Gets the origin nation code for an organization's product registration. */
export async function getOriginNationCode(
  organizationId: number,
  client: PrismaClientOrTx = prisma,
): Promise<string | null> {
  const settings = await client.organizationSetting.findUnique({
    where: { organizationId },
    select: { preferences: true },
  });
  const prefs = (settings?.preferences as Record<string, any>) ?? {};
  const configured = typeof prefs.originCountryCode === 'string' ? prefs.originCountryCode.trim().toUpperCase() : '';
  return configured || null;
}

/** Fallback RRA item-classification code (§3.3.2.2) used when a product has none set. */
export const DEFAULT_ITEM_CLASSIFICATION_CD = '5059690800';

// Fallback only for building itemCd when an older row lacks pkgUnitCd.
// New creates require an explicit packaging unit; product-sync refuses to invent one.
export const DEFAULT_PKG_UNIT_CD = 'CT';

/** VSDC §4.3 Product Type: 1=Raw Material, 2=Finished Product, 3=Service. */
export function itemTypeCodeDigit(itemType: ItemType): '1' | '2' | '3' {
  if (itemType === 'SERVICE') return '3';
  if (itemType === 'RAW_MATERIAL') return '1';
  return '2';
}

/** Maps the app's MeasurementUnit enum to an RRA quantity-unit code (§4.6). */
const QTY_UNIT_CD_BY_MEASUREMENT_UNIT: Record<string, string> = {
  PCS: 'U',
  KG: 'KG',
  LTR: 'LTR',
  MTR: 'MTR',
  BOX: 'BX',
  PAIR: 'PR',
  DOZEN: 'DZ',
  GRAM: 'GRM',
  ML: 'U',
  OTHER: 'U',
};

export function deriveQtyUnitCd(measurementUnit: string | null | undefined): string {
  return QTY_UNIT_CD_BY_MEASUREMENT_UNIT[measurementUnit ?? 'OTHER'] ?? 'U';
}

/**
 * Builds the itemCd candidate string per §4.17: <origin> + productTypeDigit + pkgUnitCd + qtyUnitCd
 * + 7-digit sequence e.g.
 */
export function buildItemCd(itemType: ItemType, pkgUnitCd: string | null | undefined, qtyUnitCd: string, seq: number, origin: string): string {
  const typeDigit = itemTypeCodeDigit(itemType);
  const pkg = pkgUnitCd || DEFAULT_PKG_UNIT_CD;
  return `${origin}${typeDigit}${pkg}${qtyUnitCd}${String(seq).padStart(7, '0')}`;
}

/**
 * Atomically reserves `increment` more sequence numbers for this org's itemCd counter and returns
 * the *last* one in the newly reserved block (so a single allocation's number is the return value
 * itself, and an N-sized block is [returned-N+1 .. returned]).
 */
async function nextItemCdSequence(
  organizationId: number,
  increment: number,
  client: PrismaClientOrTx = prisma,
): Promise<number> {
  const seed = await client.product.count({
    where: { organizationId, itemCd: { not: null } },
  });
  const rows = await client.$queryRaw<Array<{ nextSequence: number }>>`
    INSERT INTO "product_itemcd_counters" ("organizationId", "nextSequence", "updatedAt")
    VALUES (${organizationId}, ${seed + increment}, NOW())
    ON CONFLICT ("organizationId") DO UPDATE
    SET "nextSequence" = "product_itemcd_counters"."nextSequence" + ${increment},
        "updatedAt" = NOW()
    RETURNING "nextSequence"
  `;
  return Number(rows[0]?.nextSequence ?? 0);
}

/** Allocates a fresh, unique itemCd for a product about to be created. */
export async function allocateItemCd(
  organizationId: number,
  itemType: ItemType,
  pkgUnitCd: string | null | undefined,
  qtyUnitCd: string,
  origin: string,
  client: PrismaClientOrTx = prisma,
): Promise<string> {
  const seq = await nextItemCdSequence(organizationId, 1, client);
  return buildItemCd(itemType, pkgUnitCd, qtyUnitCd, seq, origin);
}

/**
 * Atomically reserves a contiguous block of `count` sequence numbers for a bulk create — returns
 * the base such that item `i` (0-indexed) uses `base + i + 1`, matching `allocateItemCd`'s
 * single-item numbering.
 */
export async function allocateItemCdBlock(
  organizationId: number,
  count: number,
  client: PrismaClientOrTx = prisma,
): Promise<number> {
  const last = await nextItemCdSequence(organizationId, count, client);
  return last - count;
}

/** True if `err` is a P2002 conflict on the (organizationId, itemCd) unique index. */
export function isItemCdConflict(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') {
    return false;
  }
  const target = err.meta?.target;
  const targetStr = Array.isArray(target) ? target.join(',') : String(target ?? '');
  return targetStr.includes('itemCd');
}
