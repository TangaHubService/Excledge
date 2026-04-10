import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { systemOwnerService } from '../services/systemOwnerService';
import Overview from '../components/system-owner/Overview';
import Organizations from '../components/system-owner/Organizations';
import Subscriptions from '../components/system-owner/Subscriptions';
import Payments from '../components/system-owner/Payments';
import Analytics from '../components/system-owner/Analytics';
import type { DashboardStats, Organization, Subscription, Payment } from '../services/systemOwnerService';

export const SystemOwnerDashboard: React.FC = () => {
    const location = useLocation();

    // Dashboard Stats
    const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [payments, setPayments] = useState<Payment[]>([]);
    const [revenueData, setRevenueData] = useState<Array<{ period: string; total: number; count: number }>>([]);
    const [growthData, setGrowthData] = useState<Array<{ month: string; organizations: number; users: number }>>([]);

    // Loading and error states
    const [isLoading, setIsLoading] = useState({
        dashboard: false,
        organizations: false,
        subscriptions: false,
        payments: false,
        analytics: false,
    });

    const [error, setError] = useState({
        dashboard: '',
        organizations: '',
        subscriptions: '',
        payments: '',
        analytics: '',
    });


    // Fetch dashboard stats
    const fetchDashboardStats = async () => {
        setIsLoading(prev => ({ ...prev, dashboard: true }));
        try {
            const data = await systemOwnerService.getDashboardStats();
            setDashboardStats(data);
        } catch (err) {
            setError(prev => ({ ...prev, dashboard: 'Failed to load dashboard data' }));
            console.error('Error fetching dashboard stats:', err);
        } finally {
            setIsLoading(prev => ({ ...prev, dashboard: false }));
        }
    };

    // Fetch organizations
    const fetchOrganizations = async () => {
        setIsLoading(prev => ({ ...prev, organizations: true }));
        try {
            const data = await systemOwnerService.getOrganizations();
            setOrganizations(data.organizations || []);
        } catch (err) {
            setError(prev => ({ ...prev, organizations: 'Failed to load organizations' }));
            console.error('Error fetching organizations:', err);
        } finally {
            setIsLoading(prev => ({ ...prev, organizations: false }));
        }
    };

    // Fetch subscriptions
    const fetchSubscriptions = async () => {
        setIsLoading(prev => ({ ...prev, subscriptions: true }));
        try {
            const data = await systemOwnerService.getSubscriptions();
            setSubscriptions(data.subscriptions || []);
        } catch (err) {
            setError(prev => ({ ...prev, subscriptions: 'Failed to load subscriptions' }));
            console.error('Error fetching subscriptions:', err);
        } finally {
            setIsLoading(prev => ({ ...prev, subscriptions: false }));
        }
    };

    // Fetch payments
    const fetchPayments = async () => {
        setIsLoading(prev => ({ ...prev, payments: true }));
        try {
            const data = await systemOwnerService.getPayments();
            setPayments(data.payments || []);
        } catch (err) {
            setError(prev => ({ ...prev, payments: 'Failed to load payments' }));
            console.error('Error fetching payments:', err);
        } finally {
            setIsLoading(prev => ({ ...prev, payments: false }));
        }
    };

    // Update organization status
    const handleOrganizationStatusChange = async (id: string | number, isActive: boolean) => {
        try {
            await systemOwnerService.updateOrganizationStatus(id, isActive);
            // Refresh organizations after status change
            await fetchOrganizations();
        } catch (err) {
            console.error('Error updating organization status:', err);
        }
    };

    // Calculate analytics from existing data
    const calculateAnalytics = () => {
        // Calculate revenue by month from payments
        const revenueByMonth: { [key: string]: { total: number; count: number } } = {};
        payments.forEach(payment => {
            if (payment.status === 'COMPLETED') {
                const date = new Date(payment.createdAt);
                const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                if (!revenueByMonth[monthKey]) {
                    revenueByMonth[monthKey] = { total: 0, count: 0 };
                }
                revenueByMonth[monthKey].total += payment.amount;
                revenueByMonth[monthKey].count += 1;
            }
        });

        const calculatedRevenue = Object.entries(revenueByMonth)
            .map(([period, data]) => ({
                period,
                total: data.total,
                count: data.count
            }))
            .sort((a, b) => a.period.localeCompare(b.period));

        // Calculate growth by month from organizations
        const growthByMonth: { [key: string]: { organizations: number; users: number } } = {};
        if (dashboardStats?.recentOrganizations) {
            dashboardStats.recentOrganizations.forEach(org => {
                const date = new Date(org.createdAt);
                const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                if (!growthByMonth[monthKey]) {
                    growthByMonth[monthKey] = { organizations: 0, users: 0 };
                }
                growthByMonth[monthKey].organizations += 1;
                growthByMonth[monthKey].users += 1; // Assuming 1 user per org for now
            });
        }

        const calculatedGrowth = Object.entries(growthByMonth)
            .map(([month, data]) => ({
                month,
                organizations: data.organizations,
                users: data.users
            }))
            .sort((a, b) => a.month.localeCompare(b.month));

        setRevenueData(calculatedRevenue);
        setGrowthData(calculatedGrowth);
    };


    // Calculate analytics when payments or organizations change
    useEffect(() => {
        if (payments.length > 0 || dashboardStats?.recentOrganizations) {
            calculateAnalytics();
        }
    }, [payments, dashboardStats]);

    // Load data based on current route
    useEffect(() => {
        const path = location.pathname;

        // Always load dashboard stats for overview
        fetchDashboardStats();

        // Load data based on current route
        if (path.includes('/organizations') && organizations.length === 0) {
            fetchOrganizations();
        }
        if (path.includes('/subscriptions') && subscriptions.length === 0) {
            fetchSubscriptions();
        }
        if ((path.includes('/payments') || path.includes('/analytics')) && payments.length === 0) {
            fetchPayments();
        }
    }, [location.pathname]);

    // Prepare stats for Overview
    const stats = {
        totalOrganizations: dashboardStats?.stats.totalOrganizations || 0,
        activeSubscriptions: dashboardStats?.stats.activeSubscriptions || 0,
        totalRevenue: dashboardStats?.stats.totalRevenue || 0,
        pendingPayments: dashboardStats?.stats.pendingPayments || 0,
        totalUsers: dashboardStats?.stats.totalUsers || 0,
    };

    return (
        <Routes>
            <Route
                path="/overview"
                element={
                    <Overview
                        stats={stats}
                        recentOrganizations={dashboardStats?.recentOrganizations || []}
                        isLoading={isLoading.dashboard}
                        error={error.dashboard}
                    />
                }
            />
            <Route
                path="/organizations"
                element={
                    <Organizations
                        organizations={organizations}
                        isLoading={isLoading.organizations}
                        error={error.organizations}
                        onStatusChange={handleOrganizationStatusChange}
                    />
                }
            />
            <Route
                path="/subscriptions"
                element={
                    <Subscriptions
                        subscriptions={subscriptions}
                        isLoading={isLoading.subscriptions}
                        error={error.subscriptions}
                    />
                }
            />
            <Route
                path="/payments"
                element={
                    <Payments
                        payments={payments}
                        isLoading={isLoading.payments}
                        error={error.payments}
                    />
                }
            />
            <Route
                path="/analytics"
                element={
                    <Analytics
                        revenueData={revenueData}
                        growthData={growthData}
                        isLoading={isLoading.analytics}
                        error={error.analytics}
                    />
                }
            />
            <Route path="/" element={<Navigate to="overview" replace />} />
        </Routes>
    );
};

