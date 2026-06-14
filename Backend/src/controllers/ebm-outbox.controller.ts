import type { Response } from 'express';
import type { BranchAuthRequest } from '../middleware/branchAuth.middleware';
import { prisma } from '../lib/prisma';
import { success, error as apiError } from '../utils/apiResponse';

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
