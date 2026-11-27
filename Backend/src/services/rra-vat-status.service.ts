import { RraTaxCode } from '@prisma/client';
import { prisma } from '../lib/prisma';
import logger from '../utils/logger';
import { auditLogger } from '../utils/auditLogger';
import { TaxService } from './tax.service';
import { syncProductToRraAsync } from './product-sync.service';
import { isEbmEnabled } from './rra-ebm.service';
import { buildVsdcEnvelope, listActiveVsdcDevices, selectInitInfo } from './vsdc-api.service';

/**
 * Keeps `Organization.vatRegistered` in line with what RRA has on record for the TIN.
 *
 * The VSDC decides VAT status itself (WAR `TaxpayerInfoAccessService.isVatRegistered`: VAT-registered
 * only when `vat_ty_cd` is "1") and refuses any sale with tax type A/B/C for a non-VAT taxpayer
 * (resultCd 910, "VAT is not enabled"). When our flag says VAT-registered but RRA says not, every
 * sale gets B lines and is rejected. Since `TaxService` already forces tax type D for non-VAT
 * organizations, correcting the flag is what stops the rejections.
 */

/** RRA's VAT status from `/initializer/selectInitInfo`'s `vatTyCd`; null when RRA did not say. */
export function rraVatRegisteredFromInit(vatTyCd: unknown): boolean | null {
  if (vatTyCd === undefined || vatTyCd === null || String(vatTyCd).trim() === '') return null;
  return String(vatTyCd).trim() === '1';
}

/** True when a VSDC error is the "VAT is not enabled" refusal of a VAT tax type. */
export function isVatNotEnabledError(message: string | null | undefined): boolean {
  return !!message && /VSDC error 910:/.test(message) && /VAT is not enabled/i.test(message);
}

export interface RraVatLookup {
  /** RRA's answer: true/false, or null when no device could tell (EBM off, no device, VSDC down). */
  vatRegistered: boolean | null;
  /** The device that answered, or why none did. */
  detail: string;
}

/**
 * Ask RRA (through the VSDC's `/initializer/selectInitInfo`) whether this TIN is VAT-registered.
 *
 * The CIS cannot register a taxpayer for VAT: the VSDC refreshes `vat_ty_cd` from RRA's own
 * taxpayer record (WAR `TaxpayerInfoCheckJob`, hourly) and refuses VAT sales until it is "1". So a
 * switch to VAT in our settings only works once RRA already has the TIN as VAT-registered.
 */
export async function lookupRraVatStatus(organizationId: number): Promise<RraVatLookup> {
  if (!isEbmEnabled()) return { vatRegistered: null, detail: 'EBM is not enabled' };
  const devices = (await listActiveVsdcDevices({ includeTrainingMode: true })).filter(
    (d) => d.organizationId === organizationId,
  );
  if (devices.length === 0) return { vatRegistered: null, detail: 'no VSDC device is configured' };

  const failures: string[] = [];
  for (const device of devices) {
    try {
      const envelope = await buildVsdcEnvelope(organizationId, device.branchId);
      const res = await selectInitInfo(envelope);
      if (!res.success) {
        failures.push(`${device.label}: ${res.resultCd} ${res.resultMsg}`);
        continue;
      }
      const vat = rraVatRegisteredFromInit(res.data?.info?.vatTyCd);
      if (vat === null) {
        failures.push(`${device.label}: RRA did not report a VAT type`);
        continue;
      }
      return { vatRegistered: vat, detail: device.label };
    } catch (e: unknown) {
      failures.push(`${device.label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { vatRegistered: null, detail: failures.join('; ') };
}

export interface VatStatusChange {
  changed: boolean;
  vatRegistered: boolean;
  productsConverted: number;
}

/**
 * Apply RRA's VAT status to the organization. Moving to non-VAT turns every A/B/C item into D (the
 * only type RRA accepts from a non-VAT taxpayer); moving to VAT turns D items into B and flags them
 * for review, as the manual settings switch does. Changed items are re-sent to RRA.
 */
export async function applyRraVatStatus(
  organizationId: number,
  vatRegistered: boolean,
  source: string,
): Promise<VatStatusChange> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { vatRegistered: true },
  });
  if (!org || org.vatRegistered === vatRegistered) {
    return { changed: false, vatRegistered, productsConverted: 0 };
  }

  const productIds = await prisma.$transaction(async (tx) => {
    const fromCodes = vatRegistered ? [RraTaxCode.D] : [RraTaxCode.A, RraTaxCode.B, RraTaxCode.C];
    const toCode = vatRegistered ? RraTaxCode.B : RraTaxCode.D;
    const items = await tx.product.findMany({
      where: {
        organizationId,
        deletedAt: null,
        OR: vatRegistered ? [{ taxCode: { in: fromCodes } }, { taxCode: null }] : [{ taxCode: { in: fromCodes } }],
      },
      select: { id: true },
    });
    const ids = items.map((p) => p.id);
    if (ids.length > 0) {
      await tx.product.updateMany({
        where: { id: { in: ids } },
        data: {
          taxCode: toCode,
          taxCategory: TaxService.getTaxCategory(toCode),
          // Moving to B needs a human check of each item (some may be exempt or zero-rated); D does not.
          taxCodeReviewPending: vatRegistered,
          taxCodeReviewedAt: null,
          ebmSyncStatus: 'PENDING',
        },
      });
    }
    await tx.organization.update({ where: { id: organizationId }, data: { vatRegistered } });
    return ids;
  });

  for (const id of productIds) syncProductToRraAsync(id);

  const description = vatRegistered
    ? `RRA reports this TIN as VAT-registered (${source}): VAT enabled, ${productIds.length} item(s) moved from tax type D to B for review`
    : `RRA reports this TIN as not VAT-registered (${source}): VAT disabled, ${productIds.length} item(s) moved to tax type D`;
  logger.warn(`[RRA-VAT] org ${organizationId}: ${description}`);
  await auditLogger
    .system({ params: { organizationId: String(organizationId) } }, {
      type: 'SETTINGS_UPDATE',
      description,
      entityType: 'Organization',
      entityId: organizationId,
      metadata: { setting: 'vatRegistered', from: org.vatRegistered, to: vatRegistered, source, productsConverted: productIds.length },
    })
    .catch((e: unknown) => logger.warn(`[RRA-VAT] org ${organizationId}: audit log failed: ${String(e)}`));

  return { changed: true, vatRegistered, productsConverted: productIds.length };
}
