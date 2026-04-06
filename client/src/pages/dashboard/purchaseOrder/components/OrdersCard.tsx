import React from 'react';
import type { OrdersCardProps } from '../types/orderTypes';
import { TableSkeleton } from '../../../../components/ui/TableSkeleton';
import { OrdersTable } from './OrdersTable';

export const OrdersCard: React.FC<OrdersCardProps> = ({
  loading,
  orders,
  onStatusChange,
  onView,
}) => {
  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b">
        <h2 className="text-xl font-semibold text-gray-900">All Purchase Orders</h2>
        <p className="text-sm text-gray-500">Track and manage all your purchase orders</p>
      </div>
      <div className="p-6">
        {loading ? (
          <TableSkeleton rows={5} columns={7} />
        ) : (
          <OrdersTable
            orders={orders}
            onStatusChange={onStatusChange}
            onView={onView}
          />
        )}
      </div>
    </div>
  );
};
