import React, { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { OrdersCard } from './components/OrdersCard';
import { Toast } from './components/Toast';
import type { Order, PurchaseOrdersPageProps } from './types/orderTypes';
import { useTranslation } from 'react-i18next';

// Main PurchaseOrdersPage Component

const PurchaseOrdersPage: React.FC<PurchaseOrdersPageProps> = ({ apiClient, organizationId }) => {
    const { t } = useTranslation();
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' | 'warning' } | null>(null);
    const navigate = useNavigate();

    useEffect(() => {
        if (organizationId) {
            fetchOrders();
        }
    }, [organizationId]);

    const fetchOrders = async () => {
        try {
            setLoading(true);
            const data = await apiClient.getPurchaseOrders(organizationId);
            setOrders(data.orders || []);
        } catch (error: any) {
            showToast(error.message || t('purchaseOrders.fetchError'), 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleStatusChange = async (orderId: any, newStatus: any) => {
        try {
            await apiClient.updatePurchaseOrderStatus(orderId, newStatus);
            showToast(t('purchaseOrders.statusUpdated'));
            fetchOrders();
        } catch (error: any) {
            showToast(error.message || t('purchaseOrders.updateError'), 'error');
        }
    };

    const handleViewOrder = (orderId: string | number) => {
        navigate(`/purchase-orders/${orderId}`);
    };

    const handleCreateOrder = () => {
        navigate('/purchase-orders/create');
    };

    const showToast = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'success') => {
        setToast({ message, type });
    };

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">{t('purchaseOrders.title')}</h1>
                        <p className="text-gray-600">{t('purchaseOrders.description')}</p>
                    </div>
                    <button
                        onClick={handleCreateOrder}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                    >
                        <Plus className="h-4 w-4" />
                        {t('purchaseOrders.createOrder')}
                    </button>
                </div>

                {/* Orders Card */}
                <OrdersCard
                    loading={loading}
                    orders={orders}
                    onStatusChange={handleStatusChange}
                    onView={handleViewOrder}
                />

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

export default PurchaseOrdersPage;