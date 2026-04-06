import { useState, useEffect } from 'react';
import { apiClient } from '../lib/api-client';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, AlertTriangle, DollarSign, Calendar, ArrowUpRight, ArrowDownRight, Shield, Users, ExternalLink, Package, ShoppingCart, Building } from 'lucide-react';
import { format } from 'date-fns';
import { DashboardSkeleton } from '../components/ui/DashboardSkeleton';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';


interface Transaction {
    id: string;
    date: string;
    product: string;
    quantity: number;
    unitPrice: number;
    total: number;
    customer?: string;
    paymentType: string;
}

interface DashboardStats {
    stockAlerts: any[];
    expiringProducts: Array<{
        id: string;
        name: string;
        expiryDate: string;
        remainingDays: number;
    }>;
    totalProducts: number;
    totalStock: number;
    totalCategory: number;
    totalInventoryValue: number;
    totalRevenue: number;
}

export const Dashboard = () => {
    const { t } = useTranslation();
    const { isSystemOwner } = useAuth();
    const navigate = useNavigate();

    const [dateRange, setDateRange] = useState('all');
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [transactionsError, setTransactionsError] = useState<string | null>(null);

    // System Owner Stats
    const [systemOwnerStats, setSystemOwnerStats] = useState<{
        totalOrganizations: number;
        activeSubscriptions: number;
        totalRevenue: number;
        pendingPayments: number;
        totalUsers: number;
    } | null>(null);

    const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
    const [transactionsLoading, setTransactionsLoading] = useState(true);

    useEffect(() => {
        const organizationId = localStorage.getItem('current_organization_id');
        if (!organizationId) return;

        const fetchRecentTransactions = async () => {
            try {
                setTransactionsLoading(true);
                const endDate = new Date().toISOString().split('T')[0];
                let startDateString = '';

                if (dateRange !== 'all') {
                    const startDate = new Date();
                    const days = Number.parseInt(dateRange) || 7;
                    startDate.setDate(startDate.getDate() - days);
                    startDateString = startDate.toISOString().split('T')[0];
                }

                const data = await apiClient.getSalesReport({
                    startDate: startDateString,
                    endDate: endDate
                });
                // Get the 10 most recent transactions
                const transactions = (data.transactions || [])
                    .sort((a: Transaction, b: Transaction) =>
                        new Date(b.date).getTime() - new Date(a.date).getTime()
                    )
                    .slice(0, 10);
                setRecentTransactions(transactions);
            } catch (err) {
                console.error('Error fetching recent transactions:', err);
                setTransactionsError(t('messages.errorLoadingData'));
                setRecentTransactions([]);

            } finally {
                setTransactionsLoading(false);
            }
        };

        fetchRecentTransactions();
    }, [dateRange]); // Re-fetch when date range changes

    const [salesTrendData, setSalesTrendData] = useState<Array<{ date: string; totalAmount: number }>>([]);
    const [salesLoading, setSalesLoading] = useState(true);

    useEffect(() => {
        const organizationId = localStorage.getItem('current_organization_id');
        if (!organizationId) return;

        const fetchSalesTrend = async () => {
            try {
                setSalesLoading(true);
                const data = await apiClient.getSalesTrend(dateRange);
                setSalesTrendData(data);
            } catch (err) {
                console.error('Error fetching sales trend:', err);
            } finally {
                setSalesLoading(false);
            }
        };

        fetchSalesTrend();
    }, [dateRange]); // Re-fetch when date range changes



    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-RW', {
            style: 'currency',
            currency: 'RWF',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount);
    };



    const [topSellingData, setTopSellingData] = useState<Array<{
        id: string;
        name: string;
        sold: number;
        revenue: number;
    }>>([]);
    const [topSellingLoading, setTopSellingLoading] = useState(true);
    useEffect(() => {
        const organizationId = localStorage.getItem('current_organization_id');
        if (!organizationId) return;

        const fetchTopSelling = async () => {
            try {
                setTopSellingLoading(true);
                const response = await apiClient.getTopSellingProducts();
                setTopSellingData(response.data || []);
            } catch (err) {
                console.error('Error fetching top selling products:', err);
                setTopSellingData([]);
            } finally {
                setTopSellingLoading(false);
            }
        };

        fetchTopSelling();
    }, []);

    useEffect(() => {
        const organizationId = localStorage.getItem('current_organization_id');
        if (!organizationId) return;

        const fetchStats = async () => {
            try {
                setLoading(true);
                const data = await apiClient.getDashboardStats(dateRange);
                setStats(data);
            } catch (err) {
                console.error('Error fetching dashboard stats:', err);
                setError(t('messages.errorLoadingData'));

            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, [dateRange]);

    // Fetch system owner stats if user is system owner
    useEffect(() => {
        if (isSystemOwner()) {
            const fetchSystemOwnerStats = async () => {
                try {
                    const data = await apiClient.getSystemOwnerDashboardStats();
                    setSystemOwnerStats(data);
                } catch (err) {
                    console.error('Error fetching system owner stats:', err);
                }
            };

            fetchSystemOwnerStats();
        }
    }, [isSystemOwner]);

    if (loading) {
        return <DashboardSkeleton />;
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-red-500 text-lg">{error}</div>
            </div>

        );
    }

    if (!stats) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-gray-500">{t('messages.noData')}</div>
            </div>

        );
    }

    return (
        <div className="min-h-screen bg-gray-50/50 dark:bg-gray-900 p-6">
            <div className="max-w-7xl mx-auto space-y-8">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
                            {isSystemOwner() ? t('dashboard.systemOwnerDashboard') : t('dashboard.overview')}
                        </h1>

                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            {format(new Date(), 'EEEE, MMMM do, yyyy')}
                        </p>
                    </div>
                    {isSystemOwner() && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg border border-blue-200/50 dark:border-blue-700/50">
                            <Shield className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">{t('users.role')}</span>
                        </div>

                    )}
                </div>

                {/* System Owner Stats */}
                {isSystemOwner() && systemOwnerStats && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                        <div className="relative overflow-hidden bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm hover:shadow-md transition-all duration-300 border border-gray-100 dark:border-gray-700 group">
                            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                                <Building size={52} />
                            </div>
                            <div className="relative z-10">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 group-hover:scale-105 transition-transform duration-300">
                                        <Building size={18} />
                                    </div>
                                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('dashboard.totalOrganizations')}</span>
                                </div>

                                <div className="flex items-end gap-2">
                                    <h3 className="text-xl font-bold tabular-nums text-gray-900 dark:text-white">
                                        {systemOwnerStats.totalOrganizations}
                                    </h3>
                                </div>
                            </div>
                        </div>

                        <div className="relative overflow-hidden bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm hover:shadow-md transition-all duration-300 border border-gray-100 dark:border-gray-700 group">
                            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                                <Users size={52} />
                            </div>
                            <div className="relative z-10">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 group-hover:scale-105 transition-transform duration-300">
                                        <Users size={18} />
                                    </div>
                                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('dashboard.totalUsers')}</span>
                                </div>

                                <div className="flex items-end gap-2">
                                    <h3 className="text-xl font-bold tabular-nums text-gray-900 dark:text-white">
                                        {systemOwnerStats.totalUsers}
                                    </h3>
                                </div>
                            </div>
                        </div>

                        <div className="relative overflow-hidden bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm hover:shadow-md transition-all duration-300 border border-gray-100 dark:border-gray-700 group">
                            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                                <TrendingUp size={52} />
                            </div>
                            <div className="relative z-10">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="p-2 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 group-hover:scale-105 transition-transform duration-300">
                                        <TrendingUp size={18} />
                                    </div>
                                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('dashboard.activeSubscriptions')}</span>
                                </div>

                                <div className="flex items-end gap-2">
                                    <h3 className="text-xl font-bold tabular-nums text-gray-900 dark:text-white">
                                        {systemOwnerStats.activeSubscriptions}
                                    </h3>
                                </div>
                            </div>
                        </div>

                        <div className="relative overflow-hidden bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm hover:shadow-md transition-all duration-300 border border-gray-100 dark:border-gray-700 group">
                            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                                <DollarSign size={52} />
                            </div>
                            <div className="relative z-10">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 group-hover:scale-105 transition-transform duration-300">
                                        <DollarSign size={18} />
                                    </div>
                                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('dashboard.totalRevenue')}</span>
                                </div>

                                <div className="flex items-end gap-2">
                                    <h3 className="text-xl font-bold tabular-nums text-gray-900 dark:text-white">
                                        RWF {Math.floor(systemOwnerStats.totalRevenue / 1000)}k
                                    </h3>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Organization KPI Cards */}
                {!isSystemOwner() && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* Total Sales Card */}
                        <div className="relative overflow-hidden bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm hover:shadow-md transition-all duration-300 border border-gray-100 dark:border-gray-700 group">
                            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                                <TrendingUp size={52} />
                            </div>
                            <div className="relative z-10">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 group-hover:scale-105 transition-transform duration-300">
                                        <TrendingUp size={18} />
                                    </div>
                                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('dashboard.totalSales')}</span>
                                </div>

                                <div className="flex items-end gap-2">
                                    <h3 className="text-xl font-bold tabular-nums text-gray-900 dark:text-white">
                                        {formatCurrency(stats.totalRevenue)}
                                    </h3>
                                </div>
                                <div className="mt-2 flex items-center gap-1.5 text-xs">
                                    <span className="text-blue-600 dark:text-blue-400 font-medium italic">
                                        {dateRange === '7' ? t('reports.weekly') : dateRange === '30' ? t('reports.monthly') : dateRange === '90' ? t('reports.yearly') : t('common.all')}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Inventory Value Card */}
                        <div className="relative overflow-hidden bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm hover:shadow-md transition-all duration-300 border border-gray-100 dark:border-gray-700 group">
                            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                                <DollarSign size={52} />
                            </div>
                            <div className="relative z-10">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 group-hover:scale-105 transition-transform duration-300">
                                        <DollarSign size={18} />
                                    </div>
                                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('dashboard.totalInventoryValue')}</span>
                                </div>

                                <div className="flex items-end gap-2">
                                    <h3 className="text-xl font-bold tabular-nums text-gray-900 dark:text-white">
                                        RWF {Math.floor(stats.totalInventoryValue / 1000)}k
                                    </h3>
                                </div>
                                <div className="mt-2 flex items-center gap-1.5 text-xs">
                                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full font-medium">
                                        <ArrowUpRight size={14} />
                                        {stats.totalCategory} {t('dashboard.categories')}
                                    </span>

                                </div>
                            </div>
                        </div>

                        {/* Total Products Card */}
                        <div className="relative overflow-hidden bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm hover:shadow-md transition-all duration-300 border border-gray-100 dark:border-gray-700 group">
                            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                                <Package size={52} />
                            </div>
                            <div className="relative z-10">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 group-hover:scale-105 transition-transform duration-300">
                                        <Package size={18} />
                                    </div>
                                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('dashboard.totalProducts')}</span>
                                </div>

                                <div className="flex items-end gap-2">
                                    <h3 className="text-xl font-bold tabular-nums text-gray-900 dark:text-white">
                                        {stats.totalProducts}
                                    </h3>
                                </div>
                                <div className="mt-2 flex items-center gap-1.5 text-xs">
                                    <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded-full font-medium">
                                        <Package size={14} />
                                        {stats.totalStock.toLocaleString()} {t('dashboard.unitsInStock')}
                                    </span>

                                </div>
                            </div>
                        </div>

                        {/* Expiring Products Card */}
                        <div className="relative overflow-hidden bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm hover:shadow-md transition-all duration-300 border border-gray-100 dark:border-gray-700 group">
                            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                                <AlertTriangle size={52} />
                            </div>
                            <div className="relative z-10">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="p-2 rounded-lg bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 group-hover:scale-105 transition-transform duration-300">
                                        <AlertTriangle size={18} />
                                    </div>
                                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('dashboard.expiringSoon')}</span>
                                </div>

                                <div className="flex items-end gap-2">
                                    <h3 className="text-xl font-bold tabular-nums text-gray-900 dark:text-white">
                                        {stats.expiringProducts.length}
                                    </h3>
                                </div>
                                <div className="mt-2 flex items-center gap-1.5 text-xs">
                                    {stats.expiringProducts.length > 0 ? (
                                        <span className="flex items-center gap-1 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-full font-medium">
                                            <ArrowDownRight size={14} />
                                            {stats.expiringProducts.filter(p => p.remainingDays <= 10).length} {t('dashboard.critical')}
                                        </span>

                                    ) : (
                                        <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full font-medium">
                                            {t('dashboard.allGood')}
                                        </span>

                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Charts Row 1 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    {/* Sales Trend Chart */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                    <TrendingUp className="text-blue-600 dark:text-blue-400" size={20} />
                                    {t('dashboard.salesTrend')}
                                </h2>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('dashboard.revenueOverTime')}</p>

                            </div>
                            <select
                                value={dateRange}
                                onChange={(e) => setDateRange(e.target.value)}
                                className="bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            >
                                <option value="all">{t('common.all')}</option>
                                <option value="7">{t('inventory.daysCount', { count: 7 }) || `Last 7 Days`}</option>
                                <option value="30">{t('inventory.daysCount', { count: 30 }) || `Last 30 Days`}</option>
                                <option value="90">{t('inventory.daysCount', { count: 90 }) || `Last 90 Days`}</option>

                            </select>
                        </div>
                        {salesLoading ? (
                            <div className="h-[300px] flex items-center justify-center">
                                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
                            </div>
                        ) : salesTrendData.length > 0 ? (
                            <ResponsiveContainer width="100%" height={300}>
                                <AreaChart data={salesTrendData}>
                                    <defs>
                                        <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                                    <XAxis
                                        dataKey="date"
                                        tick={{ fill: '#9ca3af', fontSize: 12 }}
                                        tickLine={false}
                                        axisLine={false}
                                        dy={10}
                                    />
                                    <YAxis
                                        tick={{ fill: '#9ca3af', fontSize: 12 }}
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={(value) => `${value}`}
                                        dx={-10}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: 'rgba(255, 255, 255, 0.9)',
                                            borderRadius: '12px',
                                            border: 'none',
                                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                                            padding: '12px'
                                        }}
                                        formatter={(value: number) => [`RWF ${value.toLocaleString()}`, t('sales.amount')]}

                                        cursor={{ stroke: '#3b82f6', strokeWidth: 1, strokeDasharray: '5 5' }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="totalAmount"
                                        stroke="#3b82f6"
                                        strokeWidth={3}
                                        fillOpacity={1}
                                        fill="url(#colorSales)"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-[300px] flex flex-col items-center justify-center text-gray-500 dark:text-gray-400">
                                <TrendingUp className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-2" />
                                <p>{t('dashboard.noSalesData')}</p>
                            </div>

                        )}
                    </div>

                    {/* Top Selling Products */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                    <ShoppingCart className="text-purple-600 dark:text-purple-400" size={20} />
                                    {t('dashboard.topProducts')}
                                </h2>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('dashboard.bestPerformingItems')}</p>

                            </div>
                        </div>

                        {topSellingLoading ? (
                            <div className="h-[300px] flex items-center justify-center">
                                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500"></div>
                            </div>
                        ) : topSellingData.length > 0 ? (
                            <div className="space-y-6">
                                <ResponsiveContainer width="100%" height={220}>
                                    <BarChart
                                        data={topSellingData}
                                        margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                                        barSize={40}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                                        <XAxis
                                            dataKey="name"
                                            tick={false}
                                            axisLine={false}
                                            height={0}
                                        />
                                        <Tooltip
                                            cursor={{ fill: 'transparent' }}
                                            contentStyle={{
                                                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                                                borderRadius: '12px',
                                                border: 'none',
                                                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                                                padding: '12px'
                                            }}
                                            formatter={(value: number, name: string) => {
                                                if (name === 'revenue') return [value, t('sales.amount')];
                                                return [`${value.toLocaleString()}`, t('sales.items')];

                                            }}
                                        />
                                        <Bar
                                            dataKey="sold"
                                            radius={[8, 8, 8, 8]}
                                        >
                                            {topSellingData.map((_, index) => (
                                                <Cell
                                                    key={`cell-${index}`}
                                                    fill={[
                                                        '#8b5cf6',
                                                        '#a78bfa',
                                                        '#c4b5fd',
                                                        '#ddd6fe',
                                                        '#ede9fe'
                                                    ][index % 5]}
                                                />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>

                                {/* Legend/Summary */}
                                <div className="grid grid-cols-2 gap-4">
                                    {topSellingData.slice(0, 4).map((item, index) => (
                                        <div key={item.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                            <div
                                                className="w-3 h-3 rounded-full flex-shrink-0"
                                                style={{
                                                    backgroundColor: [
                                                        '#8b5cf6',
                                                        '#a78bfa',
                                                        '#c4b5fd',
                                                        '#ddd6fe',
                                                        '#ede9fe'
                                                    ][index % 5]
                                                }}
                                            />
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-gray-900 dark:text-white truncate" title={item.name}>
                                                    {item.name}
                                                </p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                                    {item.sold} {t('sales.items')}
                                                </p>

                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="h-[300px] flex flex-col items-center justify-center text-gray-500 dark:text-gray-400">
                                <ShoppingCart className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-2" />
                                <p>{t('dashboard.noPopularProducts')}</p>
                            </div>

                        )}
                    </div>
                </div>
                {/* Recent Transactions */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
                        <div>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t('dashboard.recentActivity')}</h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('dashboard.latestSalesActivity')}</p>
                        </div>
                        <button
                            onClick={() => navigate('/sales')}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-all duration-200 border border-transparent hover:border-blue-100 dark:hover:border-blue-800"
                        >
                            {t('dashboard.viewAllTransactions')}
                            <ExternalLink size={14} />
                        </button>

                    </div>

                    <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-700/50">
                        <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-700/50">
                            <thead className="bg-gray-50/50 dark:bg-gray-800/50">
                                <tr>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider dark:text-gray-400">{t('dashboard.dateTime')}</th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider dark:text-gray-400">{t('dashboard.productDetails')}</th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider dark:text-gray-400">{t('sales.customer')}</th>
                                    <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider dark:text-gray-400">{t('dashboard.qty')}</th>
                                    <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider dark:text-gray-400">{t('common.amount')}</th>
                                    <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider dark:text-gray-400">{t('common.total')}</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-50 dark:bg-gray-800 dark:divide-gray-700/50">
                                {transactionsError ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-8 text-center text-red-500 dark:text-red-400">
                                            {transactionsError}
                                        </td>
                                    </tr>
                                ) : transactionsLoading ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                                            {t('common.loadingTransactions')}
                                        </td>

                                    </tr>
                                ) : recentTransactions.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400 flex flex-col items-center justify-center gap-2">
                                            <Package className="h-8 w-8 text-gray-300 dark:text-gray-600" />
                                            <p>{t('dashboard.noRecentTransactions')}</p>
                                        </td>

                                    </tr>
                                ) : (
                                    recentTransactions.map((tx) => (
                                        <tr key={tx.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-700/30 transition-colors group">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                                                        {format(new Date(tx.date), 'MMM d, yyyy')}
                                                    </span>
                                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                                        {format(new Date(tx.date), 'h:mm a')}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-sm font-medium text-gray-900 dark:text-white">{tx.product}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                {tx.customer ? (
                                                    <div className="flex items-center gap-2">
                                                        <div className="h-6 w-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs font-medium">
                                                            {tx.customer.charAt(0)}
                                                        </div>
                                                        <span className="text-sm text-gray-600 dark:text-gray-300">{tx.customer}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-gray-400 italic">{t('dashboard.walkIn')}</span>

                                                )}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right">
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                                                    {tx.quantity}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right">
                                                <div className="text-sm text-gray-500 dark:text-gray-400">
                                                    {formatCurrency(tx.unitPrice)}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right">
                                                <div className="text-sm font-black text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                                    {formatCurrency(tx.total)}
                                                </div>
                                            </td>
                                        </tr>
                                    )))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};
