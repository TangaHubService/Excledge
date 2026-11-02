import React from 'react';
import { cn } from '../../lib/utils';

interface TableSkeletonProps {
  /** Number of rows to display in the skeleton */
  rows?: number;
  /** Number of columns to display in the skeleton */
  columns?: number;
  /** Whether to show the header row */
  showHeader?: boolean;
  /** Additional class names to apply to the table */
  className?: string;
  /** Custom height for table rows */
  rowHeight?: string;
  /** Custom width for the header skeleton */
  headerWidth?: string;
}

/** A reusable table skeleton loader component that can be used while data is loading. */
export const TableSkeleton: React.FC<TableSkeletonProps> = ({
  rows = 5,
  columns = 5,
  showHeader = true,
  className = '',
  rowHeight = 'h-4',
  headerWidth = 'w-3/4',
}) => {
  return (
    <div className={cn('w-full overflow-hidden rounded-lg', className)}>
      <div className="w-full overflow-x-auto">
        <table className="min-w-full divide-y divide-border">
          {showHeader && (
            <thead className="bg-surface-subtle">
              <tr>
                {[...Array(columns)].map((_, colIndex) => (
                  <th
                    key={`header-${colIndex}`}
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                  >
                    <div 
                      className={cn(
                        'h-4 rounded animate-pulse',
                        'bg-muted',
                        headerWidth
                      )}
                    />
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody className="bg-card divide-y divide-border">
            {[...Array(rows)].map((_, rowIndex) => (
              <tr 
                key={`row-${rowIndex}`} 
                className="hover:bg-muted"
              >
                {[...Array(columns)].map((_, colIndex) => (
                  <td 
                    key={`cell-${rowIndex}-${colIndex}`} 
                    className="px-6 py-4 whitespace-nowrap"
                  >
                    <div 
                      className={cn(
                        'rounded animate-pulse',
                        'bg-muted',
                        rowHeight,
                        colIndex % 3 === 0 ? 'w-full' : colIndex % 2 === 0 ? 'w-4/5' : 'w-2/3'
                      )}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TableSkeleton;
