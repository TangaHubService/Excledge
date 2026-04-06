import { prisma } from '../lib/prisma';
import { config } from '../config';
/**
 * Basic RRA EBM Service
 * 
 * This is a minimal structure for future EBM integration.
 * Full implementation will be added as an enhancement.
 * 
 * To enable EBM, set ENABLE_EBM=true in environment variables.
 */

export interface EbmInvoiceData {
  saleId: number;
  invoiceNumber: string;
  organizationId: number;
  customerTIN?: string;
  items: Array<{
    productName: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }>;
  totalAmount: number;
  taxAmount?: number;
  date: Date;
}

/**
 * Check if EBM is enabled
 */
export function isEbmEnabled(): boolean {
  return config.ebm.enabled === true;
}

/**
 * Submit invoice to RRA EBM (Basic structure - to be enhanced)
 * 
 * This is a placeholder for future implementation.
 * When EBM is enabled, this will submit invoices to RRA.
 * When disabled, it will just log the submission.
 */
export async function submitInvoiceToEbm(data: EbmInvoiceData): Promise<{
  success: boolean;
  ebmInvoiceNumber?: string;
  error?: string;
}> {
  if (!isEbmEnabled()) {
    // EBM disabled - just log and return success
    console.log('[EBM] EBM is disabled. Invoice would be submitted:', data.invoiceNumber);
    return {
      success: true,
    };
  }

  try {
    // TODO: Implement actual RRA EBM API integration
    // This is a placeholder structure

    // For now, create a queue entry if submission fails
    // In future, this will make actual API calls to RRA

    console.log('[EBM] Invoice submission (placeholder):', data.invoiceNumber);

    // Create transaction record
    const transaction = await prisma.ebmTransaction.create({
      data: {
        organizationId: data.organizationId,
        saleId: data.saleId,
        invoiceNumber: data.invoiceNumber,
        submissionStatus: 'PENDING',
        responseData: {
          note: 'EBM integration pending - placeholder implementation',
        },
      },
    });

    return {
      success: true,
      ebmInvoiceNumber: `EBM-${transaction.id}`, // Placeholder
    };
  } catch (error: any) {
    console.error('[EBM] Error submitting invoice:', error);

    // Queue for retry
    await prisma.ebmQueue.create({
      data: {
        organizationId: data.organizationId,
        saleId: data.saleId,
        invoiceNumber: data.invoiceNumber,
        payload: data as any,
        lastError: error.message,
        nextRetryAt: new Date(Date.now() + 5 * 60 * 1000), // Retry in 5 minutes
      },
    });

    return {
      success: false,
      error: error.message || 'Failed to submit to EBM',
    };
  }
}

/**
 * Generate RRA-compliant invoice number atomically using database sequence
 * Format: INV-{ORG_CODE}-{YEAR}-{SEQUENCE}
 * 
 * Throws error if sequence fails - no fallback to ensure atomicity
 */
export async function generateInvoiceNumber(organizationId: number): Promise<string> {
  // Get next sequence value - guarantees uniqueness under concurrency
  const result = await prisma.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('invoice_seq') as nextval`;
  const sequence = Number(result[0].nextval).toString().padStart(6, '0');

  // Fetch organization TIN for invoice code
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { TIN: true },
  });

  const orgCode = organization?.TIN?.slice(-4) || 'ORG';
  const year = new Date().getFullYear();

  return `INV-${orgCode}-${year}-${sequence}`;
}

/**
 * Queue invoice for EBM submission (for offline/retry scenarios)
 */
export async function queueInvoiceForEbm(data: EbmInvoiceData, priority: number = 0): Promise<void> {
  await prisma.ebmQueue.create({
    data: {
      organizationId: data.organizationId,
      saleId: data.saleId,
      invoiceNumber: data.invoiceNumber,
      payload: data as any,
      priority,
      nextRetryAt: new Date(),
    },
  });
}
