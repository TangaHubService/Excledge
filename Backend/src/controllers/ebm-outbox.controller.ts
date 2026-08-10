import type { Response } from 'express';
import type { BranchAuthRequest } from '../middleware/branchAuth.middleware';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { isEbmEnabled } from '../services/rra-ebm.service';
import { buildVsdcEnvelope, saveZReport, checkZReport } from '../services/vsdc-api.service';
import { success, error as apiError } from '../utils/apiResponse';

const OFFLINE_BLOCK_MS = Number(process.env.VSDC_OFFLINE_BLOCK_MS ?? 2 * 60 * 60 * 1000);

/**
 * Lightweight reachability probe of the configured EBM/VSDC gateway. Any HTTP
 * response (even 4xx/redirect) means the server is present; only a network
 * error / timeout means it's offline.
 */
async function probeGatewayReachable(): Promise<boolean> {
  const base = (config.ebm.osdcApiUrl || config.ebm.apiUrl || '').replace(/\/$/, '');
  if (!base) return false;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 3000);
  try {
    await fetch(`${base}/`, {
      method: 'GET',
      signal: controller.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

export async function getEbmOutbox(req: BranchAuthRequest, res: Response) {
  try {
    const organizationId = parseInt(req.params.organizationId);

    const entries = await prisma.ebmOutbox.findMany({
      where: { organizationId },
      include: {
        sale: {
          select: {
            saleNumber: true,
            invoiceNumber: true,
            totalAmount: true,
            createdAt: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 200,
    });

    res.json(success(entries));
  } catch (error) {
    console.error('[EbmOutbox] Failed to fetch:', error);
    res.status(500).json(apiError('Failed to fetch EBM outbox entries'));
  }
}

/**
 * GET /:organizationId/ebm-status — VSDC presence indicator payload.
 * Combines a live reachability probe with the persisted last-contact guard state
 * so the UI can show whether the gateway is present and within the online window.
 */
export async function getEbmStatus(req: BranchAuthRequest, res: Response) {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { lastSuccessfulVdsContact: true },
    });
    if (!org) {
      return res.status(404).json(apiError('Organization not found'));
    }

    const lastContact = org.lastSuccessfulVdsContact;
    const elapsedMs = lastContact ? Date.now() - lastContact.getTime() : null;
    const enabled = isEbmEnabled();
    const reachable = enabled ? await probeGatewayReachable() : false;
    const online = reachable && elapsedMs !== null && elapsedMs < OFFLINE_BLOCK_MS;

    res.json(success({
      enabled,
      reachable,
      online,
      lastContact: lastContact ? lastContact.toISOString() : null,
      offlineLimitMs: OFFLINE_BLOCK_MS,
    }));
  } catch (error) {
    console.error('[EbmStatus] Failed to read VSDC status:', error);
    res.status(500).json(apiError('Failed to read VSDC status'));
  }
}

export async function checkEbmOutboxStatus(req: BranchAuthRequest, res: Response) {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const id = parseInt(req.params.id);
    const { idempotencyKey } = req.body;

    const entry = await prisma.ebmOutbox.findFirst({
      where: { id, organizationId },
    });

    if (!entry) {
      return res.status(404).json(apiError('Outbox entry not found'));
    }

    // If there's a status check path configured, query VSDC
    // For now, verify against EbmTransaction table
    const tx = await prisma.ebmTransaction.findFirst({
      where: {
        idempotencyKey,
        submissionStatus: 'SUCCESS',
        ebmInvoiceNumber: { not: null },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (tx?.ebmInvoiceNumber) {
      await prisma.ebmOutbox.update({
        where: { id },
        data: {
          status: 'SUCCEEDED',
          sdcDateTime: tx.sdcDateTime,
          lastError: null,
        },
      });
      return res.json(success({ resolved: true, ebmInvoiceNumber: tx.ebmInvoiceNumber }));
    }

    res.json(success({ resolved: false }));
  } catch (error) {
    console.error('[EbmOutbox] Status check failed:', error);
    res.status(500).json(apiError('Failed to check outbox status'));
  }
}

const pad2 = (n: number) => String(n).padStart(2, '0');
/** `yyyyMMddHHmmss` — the report-generation timestamp `saveZReports` expects. */
function toRptDeTimestamp(d: Date): string {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
}
/** `yyyyMMdd` — the report-date `checkZReport` expects. */
function toRptDeDate(d: Date): string {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

/**
 * POST /:organizationId/z-report — trigger the daily Z (closing) report for
 * a branch's VSDC device. Manually triggered for now; day-end cutoff timing
 * is an operational policy decision (per-branch closing hour) that isn't
 * automated yet.
 */
export async function submitZReport(req: BranchAuthRequest, res: Response) {
  try {
    if (!isEbmEnabled()) {
      return res.status(400).json(apiError('EBM is not enabled for this organization'));
    }
    const organizationId = parseInt(req.params.organizationId);
    const branchId = req.body?.branchId != null ? parseInt(req.body.branchId) : undefined;

    const envelope = await buildVsdcEnvelope(organizationId, branchId);
    const rptDe = toRptDeTimestamp(new Date());
    const result = await saveZReport(envelope, rptDe);

    if (!result.success) {
      return res.status(502).json(apiError(result.error ?? 'Z-report submission failed'));
    }
    res.json(success({ rptDe, response: result.rawBody }));
  } catch (error) {
    console.error('[EbmZReport] Submission failed:', error);
    res.status(500).json(apiError('Failed to submit Z-report'));
  }
}

/**
 * GET /:organizationId/z-report?branchId=&date=yyyyMMdd — look up a
 * previously saved Z report for a given day (defaults to today).
 */
export async function getZReportStatus(req: BranchAuthRequest, res: Response) {
  try {
    if (!isEbmEnabled()) {
      return res.status(400).json(apiError('EBM is not enabled for this organization'));
    }
    const organizationId = parseInt(req.params.organizationId);
    const branchId = req.query.branchId != null ? parseInt(req.query.branchId as string) : undefined;
    const rptDe = (req.query.date as string) || toRptDeDate(new Date());

    const envelope = await buildVsdcEnvelope(organizationId, branchId);
    const result = await checkZReport(envelope, rptDe);

    if (!result.success) {
      return res.status(502).json(apiError(result.error ?? 'Z-report lookup failed'));
    }
    res.json(success({ rptDe, response: result.rawBody }));
  } catch (error) {
    console.error('[EbmZReport] Lookup failed:', error);
    res.status(500).json(apiError('Failed to check Z-report status'));
  }
}
