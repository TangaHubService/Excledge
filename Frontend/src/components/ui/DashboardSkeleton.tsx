import { Skeleton } from './skeleton';

const TableRowSkeleton = () => (
    <tr className="animate-pulse">
        <td className="px-6 py-4 whitespace-nowrap">
            <Skeleton className="h-4 w-24 bg-muted" />
            <Skeleton className="h-3 w-16 mt-1 bg-muted" />
        </td>
        <td className="px-6 py-4">
            <Skeleton className="h-4 w-32 bg-muted" />
            <Skeleton className="h-3 w-24 mt-1 bg-muted" />
        </td>
        <td className="px-6 py-4 text-right">
            <Skeleton className="h-4 w-12 ml-auto bg-muted" />
        </td>
        <td className="px-6 py-4 text-right">
            <Skeleton className="h-4 w-20 ml-auto bg-muted" />
        </td>
        <td className="px-6 py-4 text-right">
            <Skeleton className="h-4 w-24 ml-auto bg-muted" />
        </td>
    </tr>
);

const BarGraphSkeleton = () => (
    <div className="h-64 w-full flex items-end space-x-1 px-2">
        {[30, 50, 70, 40, 60, 45, 80].map((height, i) => (
            <div key={i} className="flex-1 flex flex-col items-center">
                <div 
                    className="w-8 bg-primary/20 rounded-t animate-pulse"
                    style={{ height: `${height}%` }}
                />
                <Skeleton className="h-3 w-6 mt-2 bg-muted" />
            </div>
        ))}
    </div>
);

const LineGraphSkeleton = () => (
    <div className="h-64 w-full relative">
        <div className="absolute bottom-0 left-0 right-0 h-px bg-muted"></div>
        <div className="absolute left-0 top-0 bottom-0 w-px bg-muted"></div>
        <div className="h-full w-full relative overflow-hidden">
            <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-blue-50 to-transparent dark:from-blue-900/30 dark:to-transparent"></div>
            <div className="absolute bottom-0 left-0 w-full h-1/2">
                {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                    <div 
                        key={i}
                        className="absolute bottom-0 w-1 h-4 bg-blue-400 rounded-full animate-pulse"
                        style={{
                            left: `${(i / 6) * 100}%`,
                            height: `${30 + (Math.random() * 70)}%`,
                            animationDelay: `${i * 0.1}s`,
                            animationDuration: '1.5s'
                        }}
                    />
                ))}
            </div>
        </div>
    </div>
);

export const DashboardSkeleton = () => {
    return (
        <div className="min-h-screen bg-surface-subtle p-4 sm:p-6">
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header */}
                <div className="bg-card rounded-xl shadow-sm p-6 border border-border">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="flex items-center space-x-4">
                            <Skeleton className="h-12 w-12 rounded-xl bg-primary/15" />
                            <div className="space-y-2">
                                <Skeleton className="h-6 w-48 bg-muted" />
                                <Skeleton className="h-4 w-64 bg-muted" />
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <Skeleton className="h-10 w-32 bg-muted" />
                            <Skeleton className="h-10 w-24 bg-primary/15" />
                        </div>
                    </div>
                </div>
                
                {/* KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
                    {[
                        { color: 'bg-primary/15', icon: 'bg-primary' },
                        { color: 'bg-success/15 dark:bg-success/50', icon: 'bg-success' },
                        { color: 'bg-warning/15 dark:bg-warning/50', icon: 'bg-warning' }
                    ].map((item, i) => (
                        <div key={i} className={`${item.color} rounded-xl p-5 shadow-sm border border-border`}>
                            <div className="flex items-center justify-between mb-4">
                                <Skeleton className={`h-10 w-10 rounded-lg ${item.icon} opacity-80`} />
                                <Skeleton className="h-6 w-20 bg-card/50" />
                            </div>
                            <Skeleton className="h-8 w-32 bg-muted mb-2" />
                            <div className="mt-4 pt-4 border-t border-white/20">
                                <Skeleton className="h-3 w-3/4 bg-card/50" />
                            </div>
                        </div>
                    ))}
                </div>

                {/* Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                    <div className="bg-card rounded-xl shadow-sm p-6 border border-border">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-3">
                            <Skeleton className="h-6 w-48 bg-muted" />
                            <Skeleton className="h-8 w-24 bg-muted" />
                        </div>
                        <div className="h-64 relative">
                            <BarGraphSkeleton />
                            <div className="absolute inset-0 flex items-center justify-center">
                                <Skeleton className="h-4 w-24 bg-primary/15 text-primary text-sm font-medium px-2 py-1 rounded" />
                            </div>
                        </div>
                    </div>
                    <div className="bg-card rounded-xl shadow-sm p-6 border border-border">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-3">
                            <Skeleton className="h-6 w-48 bg-muted" />
                            <Skeleton className="h-8 w-24 bg-muted" />
                        </div>
                        <div className="h-64 relative">
                            <LineGraphSkeleton />
                            <div className="absolute inset-0 flex items-center justify-center">
                                <Skeleton className="h-4 w-24 bg-primary/15 text-primary text-sm font-medium px-2 py-1 rounded" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Recent Transactions */}
                <div className="bg-card rounded-xl shadow-sm overflow-hidden border border-border">
                    <div className="p-6">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-3">
                            <Skeleton className="h-7 w-48 bg-muted" />
                            <Skeleton className="h-9 w-32 bg-muted rounded-lg" />
                        </div>
                        
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-border">
                                <thead className="bg-surface-subtle">
                                    <tr>
                                        {['Date & Time', 'Product', 'Qty', 'Unit Price', 'Total'].map((header, i) => (
                                            <th key={i} className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                                {header}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="bg-card divide-y divide-border">
                                    {[1, 2, 3, 4, 5].map((row) => (
                                        <TableRowSkeleton key={row} />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        
                        {/* Table Pagination */}
                        <div className="flex items-center justify-between mt-4 px-1">
                            <Skeleton className="h-4 w-24 bg-muted" />
                            <div className="flex space-x-2">
                                <Skeleton className="h-8 w-8 rounded bg-muted" />
                                <Skeleton className="h-8 w-8 rounded bg-primary/15" />
                                <Skeleton className="h-8 w-8 rounded bg-muted" />
                                <Skeleton className="h-8 w-8 rounded bg-muted" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DashboardSkeleton;
