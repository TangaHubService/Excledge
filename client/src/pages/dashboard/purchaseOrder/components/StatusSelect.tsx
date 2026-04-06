import React from 'react';
import type { StatusSelectProps } from '../types/orderTypes';

export const StatusSelect: React.FC<StatusSelectProps> = ({
  value,
  onChange,
  orderId,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(orderId, e.target.value as any);
  };

  return (
    <select
      value={value}
      onChange={handleChange}
      className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <option value="PENDING">Pending</option>
      <option value="APPROVED">Approved</option>
      <option value="ORDERED">Ordered</option>
      <option value="SHIPPED">Shipped</option>
      <option value="DELIVERED">Delivered</option>
      <option value="CANCELLED">Cancelled</option>
    </select>
  );
};
