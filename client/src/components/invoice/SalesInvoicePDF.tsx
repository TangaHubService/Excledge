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
    product: {
        name: string;
        batchNumber?: string;
    };
    quantity: number;
    unitPrice: string;
    totalPrice: string;
}

interface Sale {
    id: string;
    saleNumber: string;
    customer: {
        name: string;
        email?: string;
        phone?: string;
    };
    user: {
        name: string;
    };
    paymentType: string;
    cashAmount: string;
    insuranceAmount: string;
    debtAmount: string;
    totalAmount: string;
    createdAt: string;
    status: string;
    saleItems: SaleItem[];
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
});

interface SalesInvoicePDFProps {
    sale: Sale;
    organizationName?: string;
    organizationLogo?: string;
}

const SalesInvoicePDF: React.FC<SalesInvoicePDFProps> = ({
    sale,
    organizationName = "Your Organization",
    organizationLogo
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
                        <Text>Kigali, Rwanda</Text>
                        <Text>+250 788 701 837</Text>
                        <Text>info@company.com</Text>
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
                            }}>Product</Text>
                            <Text style={{
                                fontWeight: "bold",
                                fontSize: 10,
                                color: "#333",
                                flex: 1,
                                textAlign: "center"
                            }}>Qty</Text>
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
                        {sale.saleItems.map((item) => (
                            <View key={item.id} style={styles.tableRow}>
                                <View style={styles.productCell}>
                                    <View style={{ flexDirection: 'column', justifyContent: 'center', width: '100%' }}>
                                        <Text style={{
                                            fontSize: 10,
                                            color: "#333",
                                            fontWeight: 'bold',
                                            lineHeight: 1.2
                                        }}>
                                            {item.product.name}
                                        </Text>
                                        {item.product.batchNumber && (
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
                        ))}
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
