import React from 'react';
import type { OrdersTableProps } from '../types/orderTypes';
import { OrderRow } from './OrderRow';

export const OrdersTable: React.FC<OrdersTableProps> = ({
  orders,
  onStatusChange,
  onView,
}) => {
  if (orders.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No purchase orders found
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            <th className="py-3 px-4 text-left text-sm font-medium text-gray-700">Order #</th>
            <th className="py-3 px-4 text-left text-sm font-medium text-gray-700">Supplier</th>
            <th className="py-3 px-4 text-left text-sm font-medium text-gray-700">Date</th>
            <th className="py-3 px-4 text-left text-sm font-medium text-gray-700">Total Amount</th>
            <th className="py-3 px-4 text-left text-sm font-medium text-gray-700">Status</th>
            <th className="py-3 px-4 text-left text-sm font-medium text-gray-700">Expected Delivery</th>
            <th className="py-3 px-4 text-right text-sm font-medium text-gray-700">Actions</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <OrderRow
              key={order.id}
              order={order}
              onStatusChange={onStatusChange}
              onView={onView}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
};
