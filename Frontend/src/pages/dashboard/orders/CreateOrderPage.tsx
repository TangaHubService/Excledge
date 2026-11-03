import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { 
  ChevronLeft, 
  Plus, 
  Trash2, 
  ShoppingCart, 
  Calendar as CalendarIcon, 
  User, 
  Package, 
  DollarSign, 
  Info,
  CheckCircle2,
  
  Loader2,
  Edit2,
  X
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../components/ui/card';
import { SearchableSelect } from '../../../components/ui/SearchableSelect';
import { apiClient } from '../../../lib/api-client';
import { parseInventoryGetProductsResponse } from '../../../lib/inventory-response';
import { useTheme } from '../../../context/ThemeContext';
import { Badge } from '../../../components/ui/badge';
import { toast } from 'react-toastify';
import { toastError } from "../../../lib/friendly-error";

type Supplier = {
    id: string;
    name: string;
    email?: string;
    phone?: string;
};

type Product = {
    id: string;
    name: string;
    unitPrice: number;
    quantity: number;
};

type OrderItem = {
    productId?: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
};

export const CreateOrderPage: React.FC = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { theme } = useTheme();
    const organizationId = apiClient.getOrganizationId();
    
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    
    // Form state
    const [orderNumber, setOrderNumber] = useState('');
    const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
    const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
    const [items, setItems] = useState<OrderItem[]>([]);
    
    // Item entry state
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [productName, setProductName] = useState('');
    const [quantity, setQuantity] = useState(1);
    const [unitPrice, setUnitPrice] = useState(0);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);

    // Fetch initial data
    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                const [suppliersData, productsData] = await Promise.all([
                    apiClient.getSuppliers(organizationId),
                    apiClient.getProducts({ organizationId, limit: 1000 })
                ]);
                
                setSuppliers(Array.isArray(suppliersData) ? suppliersData : (suppliersData?.suppliers || []));
                setProducts(parseInventoryGetProductsResponse(productsData).items as Product[]);
                
                // Generate a temporary order number
                setOrderNumber(`PO-${Math.floor(1000 + Math.random() * 9000)}-${new Date().getTime().toString().slice(-4)}`);
            } catch (error) {
                console.error('Error fetching data:', error);
                toast.error(t('suppliers.fetchError'));
            } finally {
                setLoading(false);
            }
        };

        if (organizationId) {
            fetchData();
        }
    }, [organizationId, t]);

    const handleProductSelect = (productId: string) => {
        const product = products.find(p => p.id === productId);
        if (product) {
            setSelectedProduct(product);
            setProductName(product.name);
            setUnitPrice(product.unitPrice);
        } else {
            setSelectedProduct(null);
            setProductName('');
            setUnitPrice(0);
        }
    };

    const addOrUpdateItem = () => {
        if (!productName.trim()) {
            toast.warning(t('purchaseOrders.productNameRequired'));
            return;
        }
        if (quantity < 1) {
            toast.warning(t('purchaseOrders.quantityMin'));
            return;
        }
        if (unitPrice < 0) {
            toast.warning(t('purchaseOrders.unitPriceNegative'));
            return;
        }

        const newItem: OrderItem = {
            productId: selectedProduct?.id,
            productName: productName.trim(),
            quantity: quantity,
            unitPrice: unitPrice,
            totalPrice: quantity * unitPrice
        };

        if (editingIndex !== null) {
            const updatedItems = [...items];
            updatedItems[editingIndex] = newItem;
            setItems(updatedItems);
            setEditingIndex(null);
            toast.success(t('common.updated'));
        } else {
            // Check if product already exists
            const existingIndex = items.findIndex(item => 
                (item.productId && item.productId === newItem.productId) || 
                (item.productName.toLowerCase() === newItem.productName.toLowerCase())
            );

            if (existingIndex >= 0) {
                const updatedItems = [...items];
                updatedItems[existingIndex].quantity += newItem.quantity;
                updatedItems[existingIndex].totalPrice = updatedItems[existingIndex].quantity * updatedItems[existingIndex].unitPrice;
                setItems(updatedItems);
            } else {
                setItems([...items, newItem]);
            }
            toast.success(t('purchaseOrders.addItem'));
        }

        // Reset item entry form
        resetItemForm();
    };

    const resetItemForm = () => {
        setSelectedProduct(null);
        setProductName('');
        setQuantity(1);
        setUnitPrice(0);
        setEditingIndex(null);
    };

    const editItem = (index: number) => {
        const item = items[index];
        setProductName(item.productName);
        setQuantity(item.quantity);
        setUnitPrice(item.unitPrice);
        setEditingIndex(index);
        
        const product = products.find(p => p.id === item.productId || p.name === item.productName);
        if (product) setSelectedProduct(product);
        
        // Scroll to top of entry form
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const removeItem = (index: number) => {
        setItems(items.filter((_, i) => i !== index));
        if (editingIndex === index) resetItemForm();
    };

    const calculateTotal = () => {
        return items.reduce((sum, item) => sum + item.totalPrice, 0);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!selectedSupplier) {
            toast.error(t('purchaseOrders.selectSupplier'));
            return;
        }

        if (items.length === 0) {
            toast.error(t('purchaseOrders.noItemsAdded'));
            return;
        }

        try {
            setSubmitting(true);
            const orderData = {
                supplierId: selectedSupplier.id,
                items: items.map(item => ({
                    productId: item.productId,
                    productName: item.productName,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice
                })),
                expectedDeliveryDate: expectedDeliveryDate || undefined
            };

            await apiClient.createPurchaseOrder(organizationId, orderData);
            toast.success(t('purchaseOrders.statusUpdated'));
            navigate('/dashboard/orders');
        } catch (error: any) {
            console.error('Error creating order:', error);
            toastError(error, t('purchaseOrders.updateError'));
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-lg font-medium text-muted-foreground">{t('common.loading')}</p>
            </div>
        );
    }

    return (
        <div className="pb-12">
            <div className="max-w-6xl mx-auto px-4 py-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                    <div className="flex items-center gap-3">
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => navigate(-1)}
                            className="rounded-md h-8 w-8 hover:bg-card shadow-sm border border-transparent hover:border-border transition-all"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <div>
                            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                                {t('purchaseOrders.createOrder')}
                            </h1>
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                <Info className="h-3 w-3" />
                                {t('purchaseOrders.createDescription')}
                            </p>
                        </div>
                    </div>
                    <Badge variant="outline" className="px-3 py-1 text-xs font-semibold bg-card border-primary/30 text-primary shadow-sm rounded-md">
                        {orderNumber}
                    </Badge>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Left Column: Form Entry */}
                    <div className="lg:col-span-8 space-y-6">
                        {/* Order Info Card */}
                        <Card className={`border border-border shadow-sm rounded-md ${theme === 'dark' ? 'bg-gray-800' : 'bg-card'}`}>
                            <CardHeader className="border-b border-border py-3 px-4">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 bg-primary/10 rounded-md">
                                        <ShoppingCart className="h-4 w-4 text-primary" />
                                    </div>
                                    <CardTitle className="text-base font-semibold">{t('purchaseOrders.orderInformation')}</CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent className="p-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground">
                                            <User className="h-3 w-3" />
                                            {t('purchaseOrders.supplier')} <span className="text-danger">*</span>
                                        </Label>
                                        <SearchableSelect
                                            value={selectedSupplier?.id || ''}
                                            onChange={(val) => setSelectedSupplier(suppliers.find(s => s.id === val) || null)}
                                            placeholder={t('purchaseOrders.selectSupplier')}
                                            searchPlaceholder={t('purchaseOrders.searchSupplier') || 'Search suppliers...'}
                                            emptyText={t('purchaseOrders.noSuppliersFound') || 'No suppliers found.'}
                                            className="h-9 rounded-md focus:ring-ring/20 border-border text-sm"
                                            options={suppliers.map(s => ({ value: s.id, label: s.name, sublabel: s.phone }))}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground">
                                            <CalendarIcon className="h-3 w-3" />
                                            {t('purchaseOrders.expectedDeliveryDate')}
                                        </Label>
                                        <Input
                                            type="date"
                                            value={expectedDeliveryDate}
                                            onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                                            min={new Date().toISOString().split('T')[0]}
                                            className="h-9 rounded-md focus:ring-ring/20 border-border text-sm"
                                        />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Item Entry Card */}
                        <Card className={`border border-border shadow-sm rounded-md ${theme === 'dark' ? 'bg-gray-800' : 'bg-card'}`}>
                            <CardHeader className="border-b border-border py-3 px-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="p-1.5 bg-success/10 dark:bg-success/20 rounded-md">
                                            <Package className="h-4 w-4 text-success dark:text-green-400" />
                                        </div>
                                        <CardTitle className="text-base font-semibold">
                                            {editingIndex !== null ? t('common.edit') : t('purchaseOrders.addItem')}
                                        </CardTitle>
                                    </div>
                                    {editingIndex !== null && (
                                        <Button variant="ghost" size="sm" onClick={resetItemForm} className="h-7 text-xs text-muted-foreground hover:text-danger px-2">
                                            <X className="h-3 w-3 mr-1" /> {t('common.cancel')}
                                        </Button>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent className="p-4">
                                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                                    <div className="md:col-span-5 space-y-1.5">
                                        <Label className="text-xs font-semibold text-muted-foreground">{t('purchaseOrders.productName')} <span className="text-danger">*</span></Label>
                                        <SearchableSelect
                                            value={selectedProduct?.id || 'custom'}
                                            onChange={(val) => val === 'custom' ? setSelectedProduct(null) : handleProductSelect(val)}
                                            placeholder={t('common.select')}
                                            searchPlaceholder={t('purchaseOrders.searchProduct') || 'Search products...'}
                                            emptyText={t('purchaseOrders.noProductsFound') || 'No products found.'}
                                            className="h-9 rounded-md border-border text-sm"
                                            options={[
                                                { value: 'custom', label: `+ ${t('common.add')}`, emphasized: true },
                                                ...products.map(p => ({ value: p.id, label: p.name })),
                                            ]}
                                        />
                                        {!selectedProduct && (
                                            <Input
                                                placeholder={t('purchaseOrders.productNameRequired')}
                                                value={productName}
                                                onChange={(e) => setProductName(e.target.value)}
                                                className="h-9 rounded-md mt-1.5 border-border text-sm"
                                            />
                                        )}
                                    </div>
                                    <div className="md:col-span-3 space-y-1.5">
                                        <Label className="text-xs font-semibold text-muted-foreground">{t('purchaseOrders.quantity')} <span className="text-danger">*</span></Label>
                                        <Input
                                            type="number"
                                            min="1"
                                            value={quantity}
                                            onChange={(e) => setQuantity(Number(e.target.value))}
                                            className="h-9 rounded-md text-center font-semibold border-border text-sm"
                                        />
                                    </div>
                                    <div className="md:col-span-4 space-y-1.5">
                                        <Label className="text-xs font-semibold text-muted-foreground">{t('purchaseOrders.unitPriceRwf')} <span className="text-danger">*</span></Label>
                                        <div className="relative">
                                            <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                            <Input
                                                type="number"
                                                min="0"
                                                value={unitPrice}
                                                onChange={(e) => setUnitPrice(Number(e.target.value))}
                                                className="h-9 pl-8 rounded-md font-semibold border-border text-sm"
                                            />
                                        </div>
                                    </div>
                                    <div className="md:col-span-12 mt-1">
                                        <Button
                                            onClick={addOrUpdateItem}
                                            size="sm"
                                            className={`w-full h-9 rounded-md font-semibold transition-all active:scale-[0.99] ${
                                                editingIndex !== null 
                                                    ? 'bg-warning hover:bg-warning/90' 
                                                    : 'bg-primary hover:bg-primary/90 shadow-sm'
                                            }`}
                                        >
                                            {editingIndex !== null ? (
                                                <><Edit2 className="h-3.5 w-3.5 mr-1.5" /> {t('common.save')}</>
                                            ) : (
                                                <><Plus className="h-3.5 w-3.5 mr-1.5" /> {t('purchaseOrders.addItem')}</>
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Right Column: Summary & Items List */}
                    <div className="lg:col-span-4 space-y-6">
                        {/* Summary Card */}
                        <Card className={`border border-border shadow-sm rounded-md ${theme === 'dark' ? 'bg-gray-800' : 'bg-card'} overflow-hidden`}>
                            <div className="h-1 bg-primary" />
                            <CardHeader className="py-3 px-4">
                                <CardTitle className="text-base font-semibold">{t('purchaseOrders.orderSummary')}</CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 space-y-4">
                                <div className="space-y-3">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-muted-foreground">{t('common.status')}</span>
                                        <Badge variant="outline" className="bg-warning/10 dark:bg-warning/20 text-warning dark:text-amber-400 border-warning/30 dark:border-amber-900 font-bold uppercase text-[9px] px-1.5 py-0 rounded-md">
                                            {t('purchaseOrders.pending') || 'DRAFT'}
                                        </Badge>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-muted-foreground">{t('purchaseOrders.itemsCount', { count: items.length })}</span>
                                        <span className="font-bold dark:text-white">{items.length}</span>
                                    </div>
                                    <div className="pt-3 border-t border-border">
                                        <div className="flex justify-between items-baseline mb-1">
                                            <span className="text-sm font-bold dark:text-white">{t('purchaseOrders.orderTotal')}</span>
                                            <div className="text-right">
                                                <p className="text-xl font-bold text-primary tracking-tight">
                                                    {calculateTotal().toLocaleString()}
                                                </p>
                                                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest leading-none">{t('common.currencyRwf')}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <Button
                                    onClick={handleSubmit}
                                    disabled={submitting || items.length === 0}
                                    className="w-full h-10 rounded-md bg-primary hover:bg-primary/90 text-white font-bold shadow-sm transition-all active:scale-[0.98] disabled:opacity-50"
                                >
                                    {submitting ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <><CheckCircle2 className="h-4 w-4 mr-2" /> {t('purchaseOrders.createOrder')}</>
                                    )}
                                </Button>
                            </CardContent>
                        </Card>

                        {/* Suppliers Info Summary */}
                        {selectedSupplier && (
                            <Card className={`border-none shadow-sm rounded-lg ${theme === 'dark' ? 'bg-primary/10' : 'bg-primary/50'}`}>
                                <CardContent className="p-3">
                                    <div className="flex items-start gap-2.5">
                                        <div className="p-1.5 bg-card rounded-md shadow-sm">
                                            <User className="h-3.5 w-3.5 text-primary" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-bold text-primary/60 uppercase tracking-wider">{t('purchaseOrders.supplier')}</p>
                                            <p className="font-bold text-sm dark:text-white truncate">{selectedSupplier.name}</p>
                                            <p className="text-xs text-muted-foreground truncate">{selectedSupplier.phone || selectedSupplier.email || t('common.na')}</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>

                {/* Items List Section */}
                <div className="mt-6">
                    <Card className={`border border-border shadow-sm rounded-md ${theme === 'dark' ? 'bg-gray-800' : 'bg-card'} overflow-hidden`}>
                        <CardHeader className="border-b border-border flex flex-row items-center justify-between py-3 px-4">
                            <div>
                                <CardTitle className="text-base font-semibold">{t('purchaseOrders.orderItems')}</CardTitle>
                                <CardDescription className="text-xs">{t('purchaseOrders.itemsInOrder', { count: items.length })}</CardDescription>
                            </div>
                            {items.length > 0 && (
                                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 font-bold text-[10px] rounded-md">
                                        {calculateTotal().toLocaleString()} {t('common.currencyRwf')}
                                    </Badge>
                            )}
                        </CardHeader>
                        <CardContent className="p-0">
                            {items.length > 0 ? (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead className={`text-[10px] font-bold uppercase tracking-wider border-b ${theme === 'dark' ? 'bg-gray-800/50 border-gray-700 text-muted-foreground' : 'bg-surface-subtle border-border text-muted-foreground'}`}>
                                            <tr>
                                                <th className="px-4 py-3">{t('purchaseOrders.product')}</th>
                                                <th className="px-4 py-3 text-right">{t('purchaseOrders.unitPriceRwf')}</th>
                                                <th className="px-4 py-3 text-center">{t('purchaseOrders.quantity')}</th>
                                                <th className="px-4 py-3 text-right">{t('common.total')}</th>
                                                <th className="px-4 py-3 text-right">{t('common.actions')}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {items.map((item, index) => (
                                                <tr key={index} className={`group transition-colors ${theme === 'dark' ? 'hover:bg-gray-700/30' : 'hover:bg-primary/20'}`}>
                                                    <td className="px-4 py-2.5">
                                                        <div className="flex items-center gap-2">
                                                            <div className={`p-1.5 rounded-md ${theme === 'dark' ? 'bg-gray-700' : 'bg-muted'} group-hover:bg-primary/15 transition-colors`}>
                                                                <Package className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                                                            </div>
                                                            <span className="font-semibold text-sm dark:text-white">{item.productName}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-2.5 text-right font-mono text-xs">
                                                        {item.unitPrice.toLocaleString()}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-center">
                                                        <span className="font-bold text-xs px-2 py-0.5 rounded bg-muted">
                                                            {item.quantity}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-2.5 text-right">
                                                        <span className="font-bold text-sm text-primary">
                                                            {item.totalPrice.toLocaleString()}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-2.5 text-right">
                                                        <div className="flex justify-end gap-0.5">
                                                            <Button 
                                                                variant="ghost" 
                                                                size="icon" 
                                                                onClick={() => editItem(index)}
                                                                className="h-7 w-7 text-muted-foreground hover:text-amber-500 transition-colors"
                                                            >
                                                                <Edit2 className="h-3 w-3" />
                                                            </Button>
                                                            <Button 
                                                                variant="ghost" 
                                                                size="icon" 
                                                                onClick={() => removeItem(index)}
                                                                className="h-7 w-7 text-muted-foreground hover:text-danger transition-colors"
                                                            >
                                                                <Trash2 className="h-3 w-3" />
                                                            </Button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="py-12 flex flex-col items-center justify-center text-center px-4">
                                    <div className="p-4 bg-surface-subtle rounded-md mb-3 border border-dashed border-border">
                                        <ShoppingCart className="h-8 w-8 text-muted-foreground/60" />
                                    </div>
                                    <h3 className="text-sm font-bold text-foreground">{t('purchaseOrders.noItemsAdded')}</h3>
                                    <p className="text-xs text-muted-foreground max-w-xs mt-1">
                                        {t('purchaseOrders.noItemsAddedDesc')}
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default CreateOrderPage;
