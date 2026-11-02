import React from 'react';
import { Link, useLocation } from 'react-router-dom';

interface SystemOwnerLayoutProps {
    children: React.ReactNode;
    userName?: string;
    onTabChange?: (tab: string) => void;
}

const SystemOwnerLayout: React.FC<SystemOwnerLayoutProps> = ({ children, userName = 'System Owner', onTabChange }) => {
    const location = useLocation();
    const activeTab = location.pathname.split('/').pop() || 'overview';

    const tabs = [
        { id: 'overview', label: 'Overview' },
        { id: 'subscriptions', label: 'Subscriptions' },
        { id: 'payments', label: 'Payments' },
        { id: 'analytics', label: 'Analytics' },
    ];

    return (
        <div className="min-h-screen bg-muted">
            {/* Header */}
            <div className="bg-card shadow border-b border-border">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between ">
                        <div className="flex">
                            <nav className="hidden sm:ml-6 sm:flex sm:space-x-8">
                                {tabs.map((tab) => (
                                    <Link
                                        key={tab.id}
                                        to={`/my-system/${tab.id}`}
                                        onClick={() => onTabChange?.(tab.id)}
                                        className={`${activeTab === tab.id
                                            ? ' text-foreground border-b-2 border-primary'
                                            : 'border-transparent text-muted-foreground hover:text-foreground hover:border-primary'
                                            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                                    >
                                        {tab.label}
                                    </Link>
                                ))}
                            </nav>
                        </div>
                        <div className="hidden sm:ml-6 sm:flex sm:items-center">
                            <span className="text-sm text-foreground">Welcome, {userName}</span>
                            <button
                                type="button"
                                className="ml-6 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-danger hover:bg-danger/90 dark:bg-danger dark:hover:bg-danger/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                                onClick={() => {
                                    localStorage.clear();
                                    window.location.href = '/login';
                                }}
                            >
                                Logout
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
                {children}
            </main>
        </div>
    );
};

export default SystemOwnerLayout;
