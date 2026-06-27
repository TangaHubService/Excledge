import {
    Document,
    Page,
    Text,
    View,
    StyleSheet,
    Image
} from '@react-pdf/renderer';
import { format } from 'date-fns';
import logo from "../../assets/vdlogo.fd0748ee6ccf6d81d171.png";

interface SaleItem {
    id: string;
    product?: {
        name: string;
        batchNumber?: string;
    } | null;
    quantity: number;
    unitPrice: string;
    totalPrice: string;
    itemType?: string;
    serviceName?: string | null;
    serviceDescription?: string | null;
}

/** EBM/VSDC rows returned with sale detail (from API). */
export interface SaleEbmTransaction {
    id?: string | number;
    operation?: string | null;
    submissionStatus?: string;
    ebmInvoiceNumber?: string | null;
    errorMessage?: string | null;
    // D3: dedicated SDC columns (B1)
    sdcRcptNo?: number | null;
    internalData?: string | null;
    receiptSignature?: string | null;
    qrPayload?: string | null;
    rcptLabel?: string | null;
    sdcDateTime?: string | null;
    responseData?: {
        normalized?: {
            ebmInvoiceNumber?: string;
            receiptQrPayload?: string;
            verificationCode?: string;
            sdcDateTime?: string;
            intrlData?: string;
            vsdcSignature?: string;
        };
    } | null;
}

interface Sale {
    id: string;
    saleNumber: string;
    invoiceNumber?: string | null;
    rcptLabel?: string | null;
    reprintCount?: number;
    customer: {
        name: string;
        email?: string;
        phone?: string;
        TIN?: string | null;
    };
    user: {
        name: string;
    };
    paymentType: string;
    cashAmount: string;
    insuranceAmount: string;
    debtAmount: string;
    totalAmount: string;
    vatAmount?: string;
    taxableAmount?: string;
    createdAt: string;
    status: string;
    saleItems: SaleItem[];
    ebmTransactions?: SaleEbmTransaction[];
}

// ⭐ Improved Styling for Sales Invoice
const styles = StyleSheet.create({
    page: {
        padding: 40,
        fontSize: 11,
        fontFamily: 'Helvetica',
        position: "relative"
    },
    watermark: {
        position: "absolute",
        top: "25%",
        left: "15%",
        width: "100%",
        opacity: 0.08,
    },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginBottom: 30,
        borderBottom: "1 solid #ddd",
        paddingBottom: 15,
    },
    leftHeader: {
        flexDirection: "column",
        gap: 4,
    },
    invoiceTitle: {
        fontSize: 26,
        fontWeight: "bold",
        letterSpacing: 1,
        color: "#333",
        marginBottom: 5,
    },
    companyInfo: {
        textAlign: "right",
        lineHeight: 1,
    },
    logo: {
        width: 55,
        height: 55,
        marginBottom: 5,
        alignSelf: "flex-start",
    },
    section: {
        marginBottom: 25,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: "bold",
        marginBottom: 10,
        borderBottom: "1 solid #e6e6e6",
        paddingBottom: 4,
        color: "#333",
    },
    row: {
        flexDirection: "row",
        marginBottom: 6,
    },
    label: {
        fontWeight: "bold",
        width: 130,
        color: "#444",
    },
    value: {
        color: "#333",
    },
    statusBox: {
        padding: "3px 8px",
        borderRadius: 5,
        fontSize: 9,
        fontWeight: "bold",
        textTransform: "uppercase",
    },
    table: {
        marginTop: 10,
        border: "1 solid #e6e6e6",
        borderRadius: 4,
    },
    tableHeader: {
        flexDirection: "row",
        backgroundColor: "#f8f9fa",
        borderBottom: "1 solid #e6e6e6",
        padding: "8px 12px",
    },
    tableRow: {
        flexDirection: "row",
        borderBottom: "1 solid #f0f0f0",
        padding: "8px 12px",
    },
    productCell: {
        flex: 2,
    },
    totalSection: {
        marginTop: 20,
        paddingTop: 10,
        borderTop: "1 solid #ccc",
        flexDirection: "row",
        justifyContent: "flex-end",
    },
    summarySection: {
        marginTop: 10,
        borderTop: "1 solid #e6e6e6",
        paddingTop: 10,
    },
    summaryRow: {
        flexDirection: "row",
        justifyContent: "flex-end",
        marginBottom: 5,
    },
    summaryLabel: {
        fontWeight: "bold",
        marginRight: 20,
        minWidth: 80,
    },
    summaryValue: {
        textAlign: "right",
        minWidth: 100,
    },
    footer: {
        position: "absolute",
        bottom: 25,
        left: 0,
        right: 0,
        textAlign: "center",
        fontSize: 9,
        color: "#777",
    },
    fiscalBox: {
        marginTop: 16,
        padding: 10,
        border: "1 solid #1e40af",
        borderRadius: 4,
        backgroundColor: "#eff6ff",
    },
    fiscalTitle: {
        fontSize: 11,
        fontWeight: "bold",
        color: "#1e3a8a",
        marginBottom: 6,
    },
    fiscalMuted: {
        fontSize: 9,
        color: "#64748b",
        marginTop: 4,
    },
});

interface SalesInvoicePDFProps {
    sale: Sale;
    organizationName?: string;
    organizationLogo?: string;
    organizationTin?: string | null;
    organizationAddress?: string | null;
    organizationPhone?: string | null;
    organizationEmail?: string | null;
    organizationVrn?: string | null;
    /** D3: pre-computed QR data URL (pass from parent after qrToDataUrl()) */
    qrDataUrl?: string | null;
}

function dashEvery4(str: string): string {
    return str.replace(/(.{4})(?!$)/g, '$1-');
}

const RCPT_LABEL_DISPLAY: Record<string, string> = {
    NS: 'Normal Sale', NR: 'Normal Refund',
    CS: 'Copy Sale',   CR: 'Copy Refund',
    TS: 'Training',    TR: 'Training Refund',
    PS: 'Proforma',
};

function fiscalBlockFromSale(sale: Sale) {
    const txs = sale.ebmTransactions ?? [];
    const saleTxs = txs.filter((t) => !t.operation || t.operation === 'SALE');
    const success = saleTxs.find((t) => t.submissionStatus === 'SUCCESS');
    const pending = saleTxs.find((t) =>
        ['PENDING', 'SUBMITTED', 'RETRYING'].includes(t.submissionStatus ?? ''),
    );
    const failed = saleTxs.find((t) => t.submissionStatus === 'FAILED');
    const norm = success?.responseData?.normalized;

    // Prefer dedicated columns (B1), fall back to responseData JSON blob
    return {
        success,
        pending,
        failed,
        ebmInvoiceNumber: success?.ebmInvoiceNumber ?? norm?.ebmInvoiceNumber,
        sdcRcptNo:        success?.sdcRcptNo ?? null,
        internalData:     success?.internalData ?? norm?.intrlData ?? null,
        receiptSignature: success?.receiptSignature ?? norm?.vsdcSignature ?? norm?.verificationCode ?? null,
        qrPayload:        success?.qrPayload ?? norm?.receiptQrPayload ?? null,
        sdcDateTime:      success?.sdcDateTime ?? norm?.sdcDateTime ?? null,
        rcptLabel:        success?.rcptLabel ?? sale.rcptLabel ?? null,
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
    organizationVrn,
    qrDataUrl,
}) => {
    const formatCurrency = (amount: string) => {
        return new Intl.NumberFormat('en-RW', {
            style: 'currency',
            currency: 'RWF',
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
        }).format(parseFloat(amount));
    };

    const statusColor =
        sale.status === 'COMPLETED' ? '#10B981' :
            sale.status === 'PENDING' ? '#F59E0B' :
                sale.status === 'CANCELLED' ? '#EF4444' :
                    sale.status === 'REFUNDED' ? '#8B5CF6' :
                        sale.status === 'PARTIALLY_REFUNDED' ? '#8B5CF6' : '#6B7280';

    return (
        <Document>
            <Page size="A4" style={styles.page}>

                {/* HEADER */}
                <View style={styles.header}>
                    {/* Left */}
                    <View style={styles.leftHeader}>
                        <Text style={styles.invoiceTitle}>SALES INVOICE</Text>

                        <View style={styles.row}>
                            <Text style={styles.label}>Invoice ID:</Text>
                            <Text style={styles.value}>
                                {sale.saleNumber}
                            </Text>
                        </View>

                        {sale.invoiceNumber ? (
                            <View style={styles.row}>
                                <Text style={styles.label}>Internal invoice #:</Text>
                                <Text style={styles.value}>{sale.invoiceNumber}</Text>
                            </View>
                        ) : null}

                        <View style={styles.row}>
                            <Text style={styles.label}>Invoice Date:</Text>
                            <Text style={styles.value}>
                                {format(new Date(sale.createdAt), "PPP")}
                            </Text>
                        </View>

                        <View style={styles.row}>
                            <Text style={styles.label}>Status:</Text>
                            <Text
                                style={{
                                    ...styles.statusBox,
                                    backgroundColor: `${statusColor}22`,
                                    color: statusColor,
                                }}
                            >
                                {sale.status}
                            </Text>
                        </View>
                    </View>

                    {/* Right */}
                    <View style={styles.companyInfo}>
                        <Image
                            src={organizationLogo && (organizationLogo.startsWith('http') || organizationLogo.startsWith('data:'))
                                ? organizationLogo
                                : logo}
                            style={styles.logo}
                        />

                        <Text style={{ fontSize: 14, fontWeight: "bold" }}>
                            {organizationName}
                        </Text>
                        {organizationAddress ? <Text>{organizationAddress}</Text> : null}
                        {organizationPhone ? <Text>{organizationPhone}</Text> : null}
                        {organizationEmail ? <Text>{organizationEmail}</Text> : null}
                        {organizationTin ? <Text>TIN: {organizationTin}</Text> : null}
                        {organizationVrn ? <Text>VRN: {organizationVrn}</Text> : null}
                    </View>
                </View>

                {/* CUSTOMER INFO */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>CUSTOMER INFORMATION</Text>
                    <View style={styles.row}>
                        <Text style={styles.label}>Name:</Text>
                        <Text style={styles.value}>
                            {sale.customer.name}
                        </Text>
                    </View>
                    {sale.customer.phone && (
                        <View style={styles.row}>
                            <Text style={styles.label}>Phone Number:</Text>
                            <Text style={styles.value}>{sale.customer.phone}</Text>
                        </View>
                    )}
                    {sale.customer.email && (
                        <View style={styles.row}>
                            <Text style={styles.label}>Email:</Text>
                            <Text style={styles.value}>{sale.customer.email}</Text>
                        </View>
                    )}
                </View>

                {/* SALES PERSON INFO */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>SALES INFORMATION</Text>
                    <View style={styles.row}>
                        <Text style={styles.label}>Sales Person:</Text>
                        <Text style={styles.value}>
                            {sale.user.name}
                        </Text>
                    </View>
                    <View style={styles.row}>
                        <Text style={styles.label}>Payment Type:</Text>
                        <Text style={styles.value}>
                            {sale.paymentType.replace('_', ' ').toUpperCase()}
                        </Text>
                    </View>
                </View>

                {/* ITEMS TABLE */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>ITEMS PURCHASED</Text>
                    <View style={styles.table}>
                        {/* Table Header */}
                        <View style={styles.tableHeader}>
                            <Text style={{
                                fontWeight: "bold",
                                fontSize: 10,
                                color: "#333",
                                flex: 2,
                                textAlign: "left"
                            }}>Item</Text>
                            <Text style={{
                                fontWeight: "bold",
                                fontSize: 10,
                                color: "#333",
                                flex: 1,
                                textAlign: "center"
                            }}>Type</Text>
                            <Text style={{
                                fontWeight: "bold",
                                fontSize: 10,
                                color: "#333",
                                flex: 1,
                                textAlign: "center"
                            }}>Qty / Hrs</Text>
                            <Text style={{
                                fontWeight: "bold",
                                fontSize: 10,
                                color: "#333",
                                flex: 1,
                                textAlign: "right"
                            }}>Unit Price</Text>
                            <Text style={{
                                fontWeight: "bold",
                                fontSize: 10,
                                color: "#333",
                                flex: 1,
                                textAlign: "right"
                            }}>Total</Text>
                        </View>

                        {/* Table Rows */}
                        {sale.saleItems.map((item) => {
                            const isService = item.itemType === 'SERVICE';
                            const itemName = isService
                                ? (item.serviceName || item.product?.name || 'Service')
                                : (item.product?.name || 'Item');
                            return (
                                <View key={item.id} style={styles.tableRow}>
                                    <View style={styles.productCell}>
                                        <View style={{ flexDirection: 'column', justifyContent: 'center', width: '100%' }}>
                                            <Text style={{
                                                fontSize: 10,
                                                color: "#333",
                                                fontWeight: 'bold',
                                                lineHeight: 1.2
                                            }}>
                                                {itemName}
                                            </Text>
                                            {item.serviceDescription && isService && (
                                                <Text style={{
                                                    fontSize: 8,
                                                    color: "#666",
                                                    fontStyle: 'italic',
                                                    fontWeight: 'normal',
                                                    lineHeight: 1.1,
                                                    marginTop: 1
                                                }}>
                                                    {item.serviceDescription}
                                                </Text>
                                            )}
                                            {!isService && item.product?.batchNumber && (
                                                <Text style={{
                                                    fontSize: 8,
                                                    color: "#666",
                                                    fontStyle: 'italic',
                                                    fontWeight: 'normal',
                                                    lineHeight: 1.1,
                                                    marginTop: 1
                                                }}>
                                                    Batch: {item.product.batchNumber}
                                                </Text>
                                            )}
                                        </View>
                                    </View>
                                    <Text style={{
                                        fontSize: 10,
                                        color: "#333",
                                        textAlign: "center",
                                        flex: 1
                                    }}>
                                        {isService ? 'SVC' : 'GOOD'}
                                    </Text>
                                    <Text style={{
                                        fontSize: 10,
                                        color: "#333",
                                        textAlign: "center",
                                        flex: 1
                                    }}>
                                        {item.quantity}
                                    </Text>
                                    <Text style={{
                                        fontSize: 10,
                                        color: "#333",
                                        textAlign: "right",
                                        flex: 1
                                    }}>
                                        {formatCurrency(item.unitPrice)}
                                    </Text>
                                    <Text style={{
                                        fontSize: 10,
                                        color: "#333",
                                        textAlign: "right",
                                        flex: 1
                                    }}>
                                        {formatCurrency(item.totalPrice)}
                                    </Text>
                                </View>
                            );
                        })}
                    </View>
                </View>

                {/* SUMMARY */}
                <View style={styles.summarySection}>
                    <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Subtotal:</Text>
                        <Text style={styles.summaryValue}>
                            {formatCurrency(sale.totalAmount)}
                        </Text>
                    </View>

                    {parseFloat(sale.cashAmount) > 0 && (
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Cash Paid:</Text>
                            <Text style={styles.summaryValue}>
                                {formatCurrency(sale.cashAmount)}
                            </Text>
                        </View>
                    )}

                    {parseFloat(sale.insuranceAmount) > 0 && (
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Insurance:</Text>
                            <Text style={styles.summaryValue}>
                                {formatCurrency(sale.insuranceAmount)}
                            </Text>
                        </View>
                    )}

                    {parseFloat(sale.debtAmount) > 0 && (
                        <View style={styles.summaryRow}>
                            <Text style={[styles.summaryLabel, { color: '#EF4444' }]}>Debt:</Text>
                            <Text style={[styles.summaryValue, { color: '#EF4444' }]}>
                                {formatCurrency(sale.debtAmount)}
                            </Text>
                        </View>
                    )}

                    <View style={[styles.summaryRow, { borderTop: '1 solid #ccc', paddingTop: 8, marginTop: 8 }]}>
                        <Text style={[styles.summaryLabel, { fontWeight: 'bold', fontSize: 12 }]}>Total Amount:</Text>
                        <Text style={[styles.summaryValue, { fontWeight: 'bold', fontSize: 12 }]}>
                            {formatCurrency(sale.totalAmount)}
                        </Text>
                    </View>
                </View>

                {/* RRA EBM / VSDC fiscal data (when present) */}
                {(() => {
                    const f = fiscalBlockFromSale(sale);
                    if (!f.success && !f.pending && !f.failed && !sale.ebmTransactions?.length) {
                        return null;
                    }
                    return (
                        <View style={styles.fiscalBox}>
                            <Text style={styles.fiscalTitle}>RRA EBM FISCAL RECEIPT</Text>

                            {/* Receipt type label (D3) */}
                            {f.rcptLabel ? (
                                <View style={styles.row}>
                                    <Text style={styles.label}>Receipt Type:</Text>
                                    <Text style={styles.value}>
                                        {f.rcptLabel} — {RCPT_LABEL_DISPLAY[f.rcptLabel] ?? f.rcptLabel}
                                    </Text>
                                </View>
                            ) : null}

                            {organizationTin ? (
                                <View style={styles.row}>
                                    <Text style={styles.label}>Seller TIN:</Text>
                                    <Text style={styles.value}>{organizationTin}</Text>
                                </View>
                            ) : null}

                            {f.ebmInvoiceNumber ? (
                                <View style={styles.row}>
                                    <Text style={styles.label}>EBM Invoice #:</Text>
                                    <Text style={styles.value}>{f.ebmInvoiceNumber}</Text>
                                </View>
                            ) : null}

                            {f.sdcRcptNo != null ? (
                                <View style={styles.row}>
                                    <Text style={styles.label}>SDC Receipt No:</Text>
                                    <Text style={styles.value}>{f.sdcRcptNo}</Text>
                                </View>
                            ) : null}

                            {f.sdcDateTime ? (
                                <View style={styles.row}>
                                    <Text style={styles.label}>SDC Date/Time:</Text>
                                    <Text style={styles.value}>{f.sdcDateTime}</Text>
                                </View>
                            ) : null}

                            {f.internalData ? (
                                <View style={styles.row}>
                                    <Text style={styles.label}>Internal Data:</Text>
                                    <Text style={[styles.value, { fontSize: 7 }]}>{dashEvery4(f.internalData)}</Text>
                                </View>
                            ) : null}

                            {f.receiptSignature ? (
                                <View style={styles.row}>
                                    <Text style={styles.label}>Signature:</Text>
                                    <Text style={[styles.value, { fontSize: 7 }]}>{dashEvery4(f.receiptSignature)}</Text>
                                </View>
                            ) : null}

                            {/* QR code image if pre-computed, else QR string */}
                            {qrDataUrl ? (
                                <View style={{ alignItems: 'center', marginTop: 6 }}>
                                    <Image src={qrDataUrl} style={{ width: 100, height: 100 }} />
                                    <Text style={{ fontSize: 7, color: '#555', marginTop: 2 }}>
                                        Scan to verify on RRA portal
                                    </Text>
                                </View>
                            ) : f.qrPayload ? (
                                <Text style={[styles.fiscalMuted, { fontSize: 6 }]}>
                                    QR: {f.qrPayload.length > 120 ? `${f.qrPayload.slice(0, 120)}…` : f.qrPayload}
                                </Text>
                            ) : null}

                            {f.pending && !f.success ? (
                                <Text style={styles.fiscalMuted}>Fiscal submission pending or retrying.</Text>
                            ) : null}
                            {f.failed && !f.success ? (
                                <Text style={styles.fiscalMuted}>
                                    Last fiscal error: {f.failed.errorMessage ?? 'Unknown'}
                                </Text>
                            ) : null}
                        </View>
                    );
                })()}

                {/* FOOTER */}
                <View style={styles.footer}>
                    <Text>Thank you for your business!</Text>
                    <Text>For inquiries: support@company.com</Text>
                </View>
            </Page>
        </Document>
    );
};

export default SalesInvoicePDF;
