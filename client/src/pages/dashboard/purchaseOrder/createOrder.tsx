import React, { useState, useEffect } from 'react';
import { apiClient } from '../../../lib/api-client';
import { parseInventoryGetProductsResponse } from '../../../lib/inventory-response';
import { OrderDetailsCard, OrderItemsCard, Toast } from './components';
import type { FormData, Product, Supplier, ToastType } from './types';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const CreatePurchaseOrder = () => {
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState<ToastType | null>(null);
    const [formData, setFormData] = useState<FormData>({
        supplierId: '',
        expectedDeliveryDate: '',
        notes: ''
    });
    const navigate = useNavigate();
    const [orderItems, setOrderItems] = useState([
        { productId: '', productName: '', quantity: 1, unitPrice: 0 }
    ]);

    useEffect(() => {
        fetchSuppliers();
        fetchProducts();
    }, []);

    const fetchSuppliers = async () => {
        try {
            const data = await apiClient.getSuppliers(apiClient.getOrganizationId());
            setSuppliers(data.suppliers || []);
        } catch (error: any) {
            showToast(error.message || 'Failed to fetch suppliers', 'error');
        }
    };

    const fetchProducts = async () => {
        try {
            const data = await apiClient.getProducts();
            setProducts(parseInventoryGetProductsResponse(data).items as Product[]);
        } catch (error: any) {
            showToast(error.message || 'Failed to fetch products', 'error');
        }
    };

    const showToast = (message: string, type: 'success' | 'error' | 'info' | 'warning') => {
        setToast({ message, type });
    };

    const handleSubmit = async (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();

        if (!formData.supplierId) {
            showToast('Please select a supplier', 'error');
            return;
        }

        if (orderItems.length === 0 || !orderItems[0].productId) {
            showToast('Please add at least one product', 'error');
            return;
        }

        try {
            setLoading(true);
            await apiClient.createPurchaseOrder(apiClient.getOrganizationId(), {
                ...formData,
                items: orderItems.map((item) => ({
                    productId: item.productId,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                })),
            });
            showToast('Purchase order created successfully', 'success');
            navigate('/purchase-orders');
        } catch (error: any) {
            showToast(error.message || 'Failed to create purchase order', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleBack = () => {
        navigate(-1);
    };

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-6xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center gap-4">
                    <button
                        onClick={handleBack}
                        className="p-2 hover:bg-gray-200 rounded-md transition-colors"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </button>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">Create Purchase Order</h1>
                        <p className="text-gray-600">Create a new order to a supplier</p>
                    </div>
                </div>

                {/* Form Container */}
                <div className="space-y-6">
                    <OrderDetailsCard
                        formData={formData}
                        setFormData={setFormData}
                        suppliers={suppliers}
                    />

                    <OrderItemsCard
                        orderItems={orderItems}
                        setOrderItems={setOrderItems}
                        products={products}
                    />

                    {/* Action Buttons */}
                    <div className="flex justify-end gap-4">
                        <button
                            type="button"
                            onClick={handleBack}
                            className="px-6 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={loading}
                            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
                        >
                            {loading ? 'Creating...' : 'Create Purchase Order'}
                        </button>
                    </div>
                </div>

                {/* Toast Notification */}
                {toast && (
                    <Toast
                        message={toast.message}
                        type={toast.type}
                        onClose={() => setToast(null)}
                    />
                )}
            </div>
        </div>
    );
};

export default CreatePurchaseOrder;