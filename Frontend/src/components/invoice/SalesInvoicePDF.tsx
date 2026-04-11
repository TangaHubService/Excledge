import {
    Document,
    Image,
    Page,
    StyleSheet,
    Text,
    View,
} from '@react-pdf/renderer';
import { format } from 'date-fns';
import logo from "../../assets/vdlogo.fd0748ee6ccf6d81d171.png";

interface SaleItem {
    id: string;
    product: {
        name: string;
        batchNumber?: string;
    };
    quantity: number;
    unitPrice: string;
    totalPrice: string;
    costPrice?: string;
    profit?: string;
    taxRate?: string | number;
    taxAmount?: string | number;
    taxCode?: string | null;
}

type FiscalRequestPayload = {
    rcptTyCd?: string | null;
    salesTyCd?: string | null;
    salesSttsCd?: string | null;
    pmtTyCd?: string | null;
    orgInvcNo?: string | number | null;
    taxblAmtA?: string | number | null;
    taxblAmtB?: string | number | null;
    taxblAmtC?: string | number | null;
    taxblAmtD?: string | number | null;
    taxRtA?: string | number | null;
    taxRtB?: string | number | null;
    taxRtC?: string | number | null;
    taxRtD?: string | number | null;
    taxAmtA?: string | number | null;
    taxAmtB?: string | number | null;
    taxAmtC?: string | number | null;
    taxAmtD?: string | number | null;
    totTaxblAmt?: string | number | null;
    totTaxAmt?: string | number | null;
    totAmt?: string | number | null;
    receipt?: {
        custTin?: string | null;
        topMsg?: string | null;
        btmMsg?: string | null;
        trdeNm?: string | null;
        adrs?: string | null;
        rptNo?: string | number | null;
    } | null;
};

export interface SaleEbmTransaction {
    id?: string | number;
    operation?: string | null;
    submissionStatus?: string;
    ebmInvoiceNumber?: string | null;
    errorMessage?: string | null;
    responseData?: {
        normalized?: {
            ebmInvoiceNumber?: string;
            receiptNumber?: string;
            totalReceiptNumber?: string;
            receiptQrPayload?: string;
            verificationCode?: string;
            sdcDateTime?: string;
            internalData?: string;
            receiptSignature?: string;
            sdcId?: string;
            mrcNo?: string;
        };
        requestPayload?: FiscalRequestPayload;
    } | null;
}

export interface PrintableSale {
    id: string;
    saleNumber: string;
    invoiceNumber?: string | null;
    purchaseOrderCode?: string | null;
    customer: {
        name: string;
        email?: string;
        phone?: string;
        TIN?: string | null;
        customerType?: string | null;
        address?: string | null;
    };
    branch?: {
        id?: string | number;
        name: string;
        code: string;
        bhfId?: string | null;
        address?: string | null;
    } | null;
    user: {
        name: string;
    };
    paymentType: string;
    cashAmount: string;
    insuranceAmount: string;
    debtAmount: string;
    totalAmount: string;
    taxableAmount?: string;
    vatAmount?: string;
    reprintCount?: number;
    createdAt: string;
    status: string;
    saleItems: SaleItem[];
    ebmTransactions?: SaleEbmTransaction[];
}

const styles = StyleSheet.create({
    page: {
        paddingTop: 28,
        paddingBottom: 28,
        paddingHorizontal: 24,
        fontSize: 10,
        fontFamily: 'Helvetica',
        color: '#0f172a',
        backgroundColor: '#ffffff',
    },
    receiptShell: {
        border: '1 solid #cbd5e1',
        borderRadius: 6,
        padding: 18,
    },
    copyBanner: {
        marginBottom: 12,
        paddingVertical: 6,
        paddingHorizontal: 10,
        backgroundColor: '#fef3c7',
        border: '1 solid #f59e0b',
        borderRadius: 4,
    },
    copyBannerText: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#92400e',
        textAlign: 'center',
        letterSpacing: 0.4,
        textTransform: 'uppercase',
    },
    topHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 14,
    },
    sellerBlock: {
        flex: 1,
        paddingRight: 16,
    },
    logo: {
        width: 44,
        height: 44,
        marginBottom: 6,
    },
    receiptTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        letterSpacing: 0.6,
        textTransform: 'uppercase',
        marginBottom: 4,
    },
    sellerName: {
        fontSize: 13,
        fontWeight: 'bold',
        marginBottom: 3,
    },
    sellerMeta: {
        fontSize: 9,
        color: '#334155',
        marginBottom: 2,
        lineHeight: 1.3,
    },
    badgeColumn: {
        width: 176,
        alignItems: 'flex-end',
    },
    badge: {
        width: '100%',
        paddingVertical: 7,
        paddingHorizontal: 10,
        borderRadius: 4,
        marginBottom: 8,
    },
    badgeLabel: {
        fontSize: 8,
        color: '#475569',
        marginBottom: 2,
        textTransform: 'uppercase',
    },
    badgeCode: {
        fontSize: 13,
        fontWeight: 'bold',
        marginBottom: 1,
    },
    badgeText: {
        fontSize: 9,
        color: '#334155',
    },
    section: {
        marginTop: 12,
    },
    sectionTitle: {
        fontSize: 9,
        fontWeight: 'bold',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        color: '#1e3a8a',
        marginBottom: 6,
    },
    infoGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    infoColumn: {
        width: '48%',
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 4,
        borderBottom: '1 solid #e2e8f0',
    },
    infoLabel: {
        width: '45%',
        fontSize: 9,
        color: '#475569',
    },
    infoValue: {
        width: '55%',
        fontSize: 9,
        color: '#0f172a',
        textAlign: 'right',
    },
    mono: {
        fontFamily: 'Courier',
        fontSize: 8.7,
    },
    table: {
        marginTop: 6,
        border: '1 solid #cbd5e1',
        borderRadius: 4,
    },
    tableHeader: {
        flexDirection: 'row',
        backgroundColor: '#e2e8f0',
        paddingVertical: 8,
        paddingHorizontal: 8,
        borderBottom: '1 solid #cbd5e1',
    },
    tableRow: {
        flexDirection: 'row',
        paddingVertical: 8,
        paddingHorizontal: 8,
        borderBottom: '1 solid #e2e8f0',
    },
    itemCell: {
        flex: 2.5,
        paddingRight: 8,
    },
    itemName: {
        fontSize: 9.5,
        fontWeight: 'bold',
        marginBottom: 2,
    },
    itemMeta: {
        fontSize: 8,
        color: '#475569',
        marginBottom: 1,
    },
    centerCell: {
        flex: 0.8,
        textAlign: 'center',
        fontSize: 9,
    },
    amountCell: {
        flex: 1,
        textAlign: 'right',
        fontSize: 9,
    },
    taxCell: {
        flex: 1.1,
        textAlign: 'center',
        fontSize: 8.5,
    },
    taxSummaryShell: {
        marginTop: 10,
        border: '1 solid #bfdbfe',
        borderRadius: 4,
        backgroundColor: '#eff6ff',
        padding: 10,
    },
    taxSummaryHeader: {
        flexDirection: 'row',
        borderBottom: '1 solid #bfdbfe',
        paddingBottom: 5,
        marginBottom: 5,
    },
    taxSummaryRow: {
        flexDirection: 'row',
        paddingVertical: 3,
    },
    taxSummaryCode: {
        width: '16%',
        fontSize: 8.5,
    },
    taxSummaryRate: {
        width: '18%',
        fontSize: 8.5,
    },
    taxSummaryValue: {
        width: '33%',
        fontSize: 8.5,
        textAlign: 'right',
    },
    totalsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 3,
    },
    totalsLabel: {
        fontSize: 9,
        color: '#334155',
    },
    totalsValue: {
        fontSize: 9,
        fontWeight: 'bold',
    },
    grandTotalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        borderTop: '1 solid #94a3b8',
        paddingTop: 8,
        marginTop: 6,
    },
    grandTotalLabel: {
        fontSize: 11,
        fontWeight: 'bold',
    },
    grandTotalValue: {
        fontSize: 11,
        fontWeight: 'bold',
        color: '#1d4ed8',
    },
    fiscalPanel: {
        marginTop: 12,
        border: '1 solid #1d4ed8',
        borderRadius: 4,
        padding: 10,
        backgroundColor: '#eff6ff',
    },
    fiscalTitle: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#1e3a8a',
        marginBottom: 6,
        textTransform: 'uppercase',
    },
    statusNotice: {
        marginTop: 8,
        paddingVertical: 5,
        paddingHorizontal: 8,
        borderRadius: 4,
    },
    statusNoticeText: {
        fontSize: 8.5,
        textAlign: 'center',
        fontWeight: 'bold',
    },
    messageBlock: {
        marginTop: 10,
        paddingTop: 8,
        borderTop: '1 solid #e2e8f0',
    },
    messageText: {
        fontSize: 8.5,
        color: '#334155',
        marginBottom: 3,
    },
    footer: {
        marginTop: 12,
        borderTop: '1 solid #e2e8f0',
        paddingTop: 8,
    },
    footerText: {
        fontSize: 8.5,
        color: '#475569',
        marginBottom: 2,
        textAlign: 'center',
    },
});

interface SalesInvoicePDFProps {
    sale: PrintableSale;
    organizationName?: string;
    organizationLogo?: string;
    organizationTin?: string | null;
    organizationAddress?: string;
    organizationPhone?: string;
    organizationEmail?: string;
    organizationDeviceId?: string | null;
    organizationSerialNo?: string | null;
}

function toNumber(value: unknown): number {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
    }

    const parsed = Number.parseFloat(String(value ?? '0'));
    return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: unknown): string {
    return new Intl.NumberFormat('en-RW', {
        style: 'currency',
        currency: 'RWF',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    }).format(toNumber(value));
}

function formatPaymentType(value?: string | null): string {
    return String(value ?? '')
        .split('_')
        .filter(Boolean)
        .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
        .join(' ');
}

function formatVsdcDateTime(value?: string | null): string {
    if (!value) {
        return 'N/A';
    }

    const raw = String(value).trim();
    if (/^\d{14}$/.test(raw)) {
        return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)} ${raw.slice(8, 10)}:${raw.slice(10, 12)}:${raw.slice(12, 14)}`;
    }

    return raw;
}

function compactValue(value?: string | number | null): string {
    if (value == null || value === '') {
        return 'N/A';
    }

    return String(value);
}

function buildTaxRowsFromRequestPayload(requestPayload?: FiscalRequestPayload | null) {
    if (!requestPayload) {
        return [];
    }

    return [
        {
            code: 'A',
            rate: toNumber(requestPayload.taxRtA),
            taxableAmount: toNumber(requestPayload.taxblAmtA),
            taxAmount: toNumber(requestPayload.taxAmtA),
        },
        {
            code: 'B',
            rate: toNumber(requestPayload.taxRtB),
            taxableAmount: toNumber(requestPayload.taxblAmtB),
            taxAmount: toNumber(requestPayload.taxAmtB),
        },
        {
            code: 'C',
            rate: toNumber(requestPayload.taxRtC),
            taxableAmount: toNumber(requestPayload.taxblAmtC),
            taxAmount: toNumber(requestPayload.taxAmtC),
        },
        {
            code: 'D',
            rate: toNumber(requestPayload.taxRtD),
            taxableAmount: toNumber(requestPayload.taxblAmtD),
            taxAmount: toNumber(requestPayload.taxAmtD),
        },
    ];
}

function buildTaxRowsFromSaleItems(sale: PrintableSale) {
    const buckets = new Map<string, { code: string; rate: number; taxableAmount: number; taxAmount: number }>();

    for (const item of sale.saleItems) {
        const rate = toNumber(item.taxRate);
        const taxAmount = toNumber(item.taxAmount);
        const total = toNumber(item.totalPrice);
        const taxableAmount = total - taxAmount;
        const code = rate > 0 ? 'B' : 'A';
        const current = buckets.get(code) ?? {
            code,
            rate,
            taxableAmount: 0,
            taxAmount: 0,
        };

        current.taxableAmount += taxableAmount;
        current.taxAmount += taxAmount;
        buckets.set(code, current);
    }

    return ['A', 'B', 'C', 'D'].map((code) => buckets.get(code) ?? {
        code,
        rate: 0,
        taxableAmount: 0,
        taxAmount: 0,
    });
}

function resolveTransactionType(
    sale: PrintableSale,
    requestPayload?: FiscalRequestPayload | null,
    operation?: string | null
) {
    if (
        requestPayload?.salesSttsCd === '05' ||
        operation === 'REFUND' ||
        sale.status === 'REFUNDED' ||
        sale.status === 'PARTIALLY_REFUNDED' ||
        toNumber(sale.totalAmount) < 0
    ) {
        return 'REFUND';
    }

    if (
        requestPayload?.salesSttsCd === '04' ||
        operation === 'VOID' ||
        sale.status === 'CANCELLED'
    ) {
        return 'CANCEL';
    }

    return 'SALE';
}

function resolveReceiptType(transactionType: string, reprintCount?: number) {
    const isCopy = (reprintCount ?? 0) > 0;
    const baseCode = transactionType === 'REFUND' ? 'NR' : 'NS';
    const code = isCopy
        ? transactionType === 'REFUND'
            ? 'CR'
            : 'CS'
        : baseCode;

    const labels: Record<string, string> = {
        NS: 'Normal Sale Receipt',
        NR: 'Normal Refund Receipt',
        CS: 'Copy Sale Receipt',
        CR: 'Copy Refund Receipt',
    };

    return {
        code,
        label: labels[code] ?? 'Fiscal Receipt',
        isCopy,
    };
}

function fiscalContextFromSale(sale: PrintableSale) {
    const txs = sale.ebmTransactions ?? [];
    const success = txs.find((t) => t.submissionStatus === 'SUCCESS');
    const pending = txs.find((t) =>
        ['PENDING', 'SUBMITTED', 'RETRYING'].includes(t.submissionStatus ?? '')
    );
    const failed = txs.find((t) => t.submissionStatus === 'FAILED');
    const normalized = success?.responseData?.normalized;
    const requestPayload = success?.responseData?.requestPayload;
    const transactionType = resolveTransactionType(sale, requestPayload, success?.operation ?? pending?.operation);
    const receiptType = resolveReceiptType(transactionType, sale.reprintCount);
    const officialTaxRows = buildTaxRowsFromRequestPayload(requestPayload);
    const hasOfficialTaxRows = officialTaxRows.some(
        (row) => Math.abs(row.taxableAmount) > 0 || Math.abs(row.taxAmount) > 0
    );

    return {
        success,
        pending,
        failed,
        normalized,
        requestPayload,
        transactionType,
        receiptType,
        receiptNumber:
            success?.ebmInvoiceNumber ??
            normalized?.receiptNumber ??
            normalized?.ebmInvoiceNumber,
        totalReceiptNumber: normalized?.totalReceiptNumber,
        verificationCode: normalized?.verificationCode,
        sdcDateTime: normalized?.sdcDateTime,
        internalData: normalized?.internalData,
        receiptSignature: normalized?.receiptSignature,
        sdcId: normalized?.sdcId,
        mrcNo: normalized?.mrcNo,
        receiptQrPayload: normalized?.receiptQrPayload,
        taxRows: hasOfficialTaxRows ? officialTaxRows : buildTaxRowsFromSaleItems(sale),
    };
}

const SalesInvoicePDF: React.FC<SalesInvoicePDFProps> = ({
    sale,
    organizationName = "Your Organization",
    organizationLogo,
    organizationTin,
    organizationAddress,
    organizationPhone,
    organizationEmail,
    organizationDeviceId,
    organizationSerialNo,
}) => {
    const fiscal = fiscalContextFromSale(sale);
    const sellerAddress =
        sale.branch?.address ||
        fiscal.requestPayload?.receipt?.adrs ||
        organizationAddress ||
        'Address not configured';
    const sellerName =
        fiscal.requestPayload?.receipt?.trdeNm ||
        organizationName;
    const customerTin =
        sale.customer.TIN ||
        fiscal.requestPayload?.receipt?.custTin ||
        'N/A';
    const cisReceiptNumber = sale.invoiceNumber || sale.saleNumber;
    const cisDateTime = format(new Date(sale.createdAt), 'PPP p');
    const paymentRows = [
        { label: 'Cash', amount: toNumber(sale.cashAmount) },
        { label: 'Insurance', amount: toNumber(sale.insuranceAmount) },
        { label: 'Debt', amount: toNumber(sale.debtAmount) },
    ].filter((row) => row.amount !== 0);
    const totalTaxable = fiscal.requestPayload?.totTaxblAmt ?? sale.taxableAmount ?? 0;
    const totalTax = fiscal.requestPayload?.totTaxAmt ?? sale.vatAmount ?? 0;
    const totalAmount = fiscal.requestPayload?.totAmt ?? sale.totalAmount;
    const noticeStyle = fiscal.pending
        ? {
            backgroundColor: '#fef3c7',
            border: '1 solid #f59e0b',
            color: '#92400e',
        }
        : {
            backgroundColor: '#fee2e2',
            border: '1 solid #ef4444',
            color: '#991b1b',
        };

    return (
        <Document>
            <Page size="A4" style={styles.page}>
                <View style={styles.receiptShell}>
                    {fiscal.receiptType.isCopy ? (
                        <View style={styles.copyBanner}>
                            <Text style={styles.copyBannerText}>
                                Copy Receipt #{sale.reprintCount ?? 0}
                            </Text>
                        </View>
                    ) : null}

                    <View style={styles.topHeader}>
                        <View style={styles.sellerBlock}>
                            <Image
                                src={
                                    organizationLogo &&
                                    (organizationLogo.startsWith('http') || organizationLogo.startsWith('data:'))
                                        ? organizationLogo
                                        : logo
                                }
                                style={styles.logo}
                            />
                            <Text style={styles.receiptTitle}>Fiscal Receipt</Text>
                            <Text style={styles.sellerName}>{sellerName}</Text>
                            <Text style={styles.sellerMeta}>{sellerAddress}</Text>
                            {organizationPhone ? (
                                <Text style={styles.sellerMeta}>Phone: {organizationPhone}</Text>
                            ) : null}
                            {organizationEmail ? (
                                <Text style={styles.sellerMeta}>Email: {organizationEmail}</Text>
                            ) : null}
                            {organizationTin ? (
                                <Text style={styles.sellerMeta}>Seller TIN: {organizationTin}</Text>
                            ) : null}
                            {sale.branch?.bhfId ? (
                                <Text style={styles.sellerMeta}>Branch BHF ID: {sale.branch.bhfId}</Text>
                            ) : null}
                        </View>

                        <View style={styles.badgeColumn}>
                            <View style={{ ...styles.badge, backgroundColor: '#dbeafe', border: '1 solid #60a5fa' }}>
                                <Text style={styles.badgeLabel}>Receipt Type</Text>
                                <Text style={{ ...styles.badgeCode, ...styles.mono }}>{fiscal.receiptType.code}</Text>
                                <Text style={styles.badgeText}>{fiscal.receiptType.label}</Text>
                            </View>
                            <View style={{ ...styles.badge, backgroundColor: '#dcfce7', border: '1 solid #4ade80' }}>
                                <Text style={styles.badgeLabel}>Transaction Type</Text>
                                <Text style={{ ...styles.badgeCode, ...styles.mono }}>{fiscal.transactionType}</Text>
                                <Text style={styles.badgeText}>
                                    {sale.status === 'CANCELLED' ? 'Cancelled transaction' : 'Certified receipt flow'}
                                </Text>
                            </View>
                        </View>
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Receipt Identity</Text>
                        <View style={styles.infoGrid}>
                            <View style={styles.infoColumn}>
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>CIS receipt no.</Text>
                                    <Text style={{ ...styles.infoValue, ...styles.mono }}>{compactValue(cisReceiptNumber)}</Text>
                                </View>
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>CIS date & time</Text>
                                    <Text style={styles.infoValue}>{cisDateTime}</Text>
                                </View>
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>Sale reference</Text>
                                    <Text style={{ ...styles.infoValue, ...styles.mono }}>{sale.saleNumber}</Text>
                                </View>
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>Original invoice no.</Text>
                                    <Text style={{ ...styles.infoValue, ...styles.mono }}>
                                        {compactValue(fiscal.requestPayload?.orgInvcNo)}
                                    </Text>
                                </View>
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>Purchase order code</Text>
                                    <Text style={{ ...styles.infoValue, ...styles.mono }}>
                                        {compactValue(sale.purchaseOrderCode)}
                                    </Text>
                                </View>
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>Payment type</Text>
                                    <Text style={styles.infoValue}>{formatPaymentType(sale.paymentType)}</Text>
                                </View>
                            </View>

                            <View style={styles.infoColumn}>
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>VSDC receipt no.</Text>
                                    <Text style={{ ...styles.infoValue, ...styles.mono }}>
                                        {compactValue(fiscal.receiptNumber)}
                                    </Text>
                                </View>
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>Total receipt counter</Text>
                                    <Text style={{ ...styles.infoValue, ...styles.mono }}>
                                        {compactValue(fiscal.totalReceiptNumber)}
                                    </Text>
                                </View>
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>VSDC date & time</Text>
                                    <Text style={styles.infoValue}>{formatVsdcDateTime(fiscal.sdcDateTime)}</Text>
                                </View>
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>VSDC ID</Text>
                                    <Text style={{ ...styles.infoValue, ...styles.mono }}>{compactValue(fiscal.sdcId)}</Text>
                                </View>
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>MRC number</Text>
                                    <Text style={{ ...styles.infoValue, ...styles.mono }}>{compactValue(fiscal.mrcNo)}</Text>
                                </View>
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>Cashier</Text>
                                    <Text style={styles.infoValue}>{sale.user.name}</Text>
                                </View>
                            </View>
                        </View>
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Customer & Branch</Text>
                        <View style={styles.infoGrid}>
                            <View style={styles.infoColumn}>
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>Customer</Text>
                                    <Text style={styles.infoValue}>{sale.customer.name}</Text>
                                </View>
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>Customer TIN</Text>
                                    <Text style={{ ...styles.infoValue, ...styles.mono }}>{compactValue(customerTin)}</Text>
                                </View>
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>Customer type</Text>
                                    <Text style={styles.infoValue}>{compactValue(sale.customer.customerType)}</Text>
                                </View>
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>Phone</Text>
                                    <Text style={styles.infoValue}>{compactValue(sale.customer.phone)}</Text>
                                </View>
                            </View>

                            <View style={styles.infoColumn}>
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>Branch</Text>
                                    <Text style={styles.infoValue}>{compactValue(sale.branch?.name)}</Text>
                                </View>
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>Branch code</Text>
                                    <Text style={{ ...styles.infoValue, ...styles.mono }}>{compactValue(sale.branch?.code)}</Text>
                                </View>
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>Branch BHF ID</Text>
                                    <Text style={{ ...styles.infoValue, ...styles.mono }}>{compactValue(sale.branch?.bhfId)}</Text>
                                </View>
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>Device ID</Text>
                                    <Text style={{ ...styles.infoValue, ...styles.mono }}>{compactValue(organizationDeviceId)}</Text>
                                </View>
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>Serial no.</Text>
                                    <Text style={{ ...styles.infoValue, ...styles.mono }}>{compactValue(organizationSerialNo)}</Text>
                                </View>
                            </View>
                        </View>
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Items & Tax Designation</Text>
                        <View style={styles.table}>
                            <View style={styles.tableHeader}>
                                <Text style={styles.itemCell}>Item</Text>
                                <Text style={styles.taxCell}>Tax</Text>
                                <Text style={styles.centerCell}>Qty</Text>
                                <Text style={styles.amountCell}>Unit</Text>
                                <Text style={styles.amountCell}>Amount</Text>
                            </View>

                            {sale.saleItems.map((item, index) => (
                                <View
                                    key={item.id || `${item.product.name}-${index}`}
                                    style={{
                                        ...styles.tableRow,
                                        borderBottom:
                                            index === sale.saleItems.length - 1 ? '0 solid transparent' : '1 solid #e2e8f0',
                                    }}
                                >
                                    <View style={styles.itemCell}>
                                        <Text style={styles.itemName}>{item.product.name}</Text>
                                        {item.product.batchNumber ? (
                                            <Text style={styles.itemMeta}>Batch: {item.product.batchNumber}</Text>
                                        ) : null}
                                    </View>
                                    <Text style={styles.taxCell}>
                                        {`${toNumber(item.taxRate)}% / ${item.taxCode ?? 'N/A'}`}
                                    </Text>
                                    <Text style={styles.centerCell}>{item.quantity}</Text>
                                    <Text style={styles.amountCell}>{formatCurrency(item.unitPrice)}</Text>
                                    <Text style={styles.amountCell}>{formatCurrency(item.totalPrice)}</Text>
                                </View>
                            ))}
                        </View>
                    </View>

                    <View style={styles.taxSummaryShell}>
                        <Text style={styles.sectionTitle}>Official Tax Summary</Text>
                        <View style={styles.taxSummaryHeader}>
                            <Text style={styles.taxSummaryCode}>Type</Text>
                            <Text style={styles.taxSummaryRate}>Rate</Text>
                            <Text style={styles.taxSummaryValue}>Taxable Amount</Text>
                            <Text style={styles.taxSummaryValue}>Tax Amount</Text>
                        </View>

                        {fiscal.taxRows.map((row) => (
                            <View key={row.code} style={styles.taxSummaryRow}>
                                <Text style={{ ...styles.taxSummaryCode, ...styles.mono }}>{row.code}</Text>
                                <Text style={styles.taxSummaryRate}>{row.rate.toFixed(2)}%</Text>
                                <Text style={styles.taxSummaryValue}>{formatCurrency(row.taxableAmount)}</Text>
                                <Text style={styles.taxSummaryValue}>{formatCurrency(row.taxAmount)}</Text>
                            </View>
                        ))}

                        <View style={{ ...styles.totalsRow, marginTop: 6 }}>
                            <Text style={styles.totalsLabel}>Total taxable amount</Text>
                            <Text style={styles.totalsValue}>{formatCurrency(totalTaxable)}</Text>
                        </View>
                        <View style={styles.totalsRow}>
                            <Text style={styles.totalsLabel}>Total tax amount</Text>
                            <Text style={styles.totalsValue}>{formatCurrency(totalTax)}</Text>
                        </View>

                        {paymentRows.map((payment) => (
                            <View key={payment.label} style={styles.totalsRow}>
                                <Text style={styles.totalsLabel}>{payment.label}</Text>
                                <Text style={styles.totalsValue}>{formatCurrency(payment.amount)}</Text>
                            </View>
                        ))}

                        <View style={styles.grandTotalRow}>
                            <Text style={styles.grandTotalLabel}>Total Amount</Text>
                            <Text style={styles.grandTotalValue}>{formatCurrency(totalAmount)}</Text>
                        </View>
                    </View>

                    <View style={styles.fiscalPanel}>
                        <Text style={styles.fiscalTitle}>VSDC Authentication</Text>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Internal data</Text>
                            <Text style={{ ...styles.infoValue, ...styles.mono }}>{compactValue(fiscal.internalData)}</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Receipt signature</Text>
                            <Text style={{ ...styles.infoValue, ...styles.mono }}>
                                {compactValue(fiscal.receiptSignature ?? fiscal.verificationCode)}
                            </Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>QR payload</Text>
                            <Text style={{ ...styles.infoValue, ...styles.mono }}>
                                {compactValue(fiscal.receiptQrPayload)}
                            </Text>
                        </View>

                        {fiscal.pending && !fiscal.success ? (
                            <View style={{ ...styles.statusNotice, ...noticeStyle }}>
                                <Text style={{ ...styles.statusNoticeText, color: '#92400e' }}>
                                    Fiscal submission is pending. This printout is not yet a completed certified receipt.
                                </Text>
                            </View>
                        ) : null}

                        {fiscal.failed && !fiscal.success ? (
                            <View style={{ ...styles.statusNotice, ...noticeStyle }}>
                                <Text style={{ ...styles.statusNoticeText, color: '#991b1b' }}>
                                    Last fiscal error: {fiscal.failed.errorMessage ?? 'Unknown gateway error'}
                                </Text>
                            </View>
                        ) : null}
                    </View>

                    <View style={styles.messageBlock}>
                        {fiscal.requestPayload?.receipt?.topMsg ? (
                            <Text style={styles.messageText}>
                                Commercial message: {fiscal.requestPayload.receipt.topMsg}
                            </Text>
                        ) : null}
                        {fiscal.requestPayload?.receipt?.btmMsg ? (
                            <Text style={styles.messageText}>
                                Footer message: {fiscal.requestPayload.receipt.btmMsg}
                            </Text>
                        ) : null}
                    </View>

                    <View style={styles.footer}>
                        <Text style={styles.footerText}>
                            {fiscal.receiptType.isCopy
                                ? `This is a copy of a previously generated fiscal receipt. Copy count: ${sale.reprintCount ?? 0}.`
                                : 'Certified receipt generated from the current CIS/VSDC integration flow.'}
                        </Text>
                        <Text style={styles.footerText}>
                            Keep this receipt for audit, refund, cancellation, or verification reference.
                        </Text>
                    </View>
                </View>
            </Page>
        </Document>
    );
};

export default SalesInvoicePDF;
