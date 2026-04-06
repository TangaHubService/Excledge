import React from 'react';
import type { StatusBadgeProps } from '../types/orderTypes';

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const getStatusColor = (status: string) => {
    const colors = {
      PENDING: 'bg-yellow-100 text-yellow-700 border-yellow-300',
      APPROVED: 'bg-blue-100 text-blue-700 border-blue-300',
      ORDERED: 'bg-purple-100 text-purple-700 border-purple-300',
      SHIPPED: 'bg-orange-100 text-orange-700 border-orange-300',
      DELIVERED: 'bg-green-100 text-green-700 border-green-300',
      CANCELLED: 'bg-red-100 text-red-700 border-red-300',
    };
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-700 border-gray-300';
  };

  return (
    <span className={`px-2 py-1 rounded-md text-xs font-medium border ${getStatusColor(status)}`}>
      {status}
    </span>
  );
};
