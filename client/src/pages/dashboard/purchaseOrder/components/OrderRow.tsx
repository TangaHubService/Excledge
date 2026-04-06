import React from 'react';
import { Eye } from 'lucide-react';
import type { OrderRowProps } from '../types/orderTypes';
import { StatusSelect } from './StatusSelect';

export const OrderRow: React.FC<OrderRowProps> = ({ order, onStatusChange, onView }) => {
  return (
    <tr className="border-b hover:bg-gray-50">
      <td className="py-3 px-4 font-medium">{order.orderNumber}</td>
      <td className="py-3 px-4">{order.supplier?.name}</td>
      <td className="py-3 px-4">
        {new Date(order.orderDate).toLocaleDateString()}
      </td>
      <td className="py-3 px-4">${order.totalAmount.toFixed(2)}</td>
      <td className="py-3 px-4">
        <StatusSelect
          value={order.status}
          onChange={onStatusChange}
          orderId={order.id}
        />
      </td>
      <td className="py-3 px-4">
        {order.expectedDeliveryDate
          ? new Date(order.expectedDeliveryDate).toLocaleDateString()
          : "-"}
      </td>
      <td className="py-3 px-4 text-right">
        <button
          onClick={() => onView(order.id)}
          className="p-2 hover:bg-gray-200 rounded-md transition-colors"
          aria-label="View order details"
        >
          <Eye className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
};
