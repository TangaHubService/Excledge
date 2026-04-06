import React from 'react';
import { Trash2 } from 'lucide-react';
import type { OrderItemRowProps } from '../types';

export const OrderItemRow: React.FC<OrderItemRowProps> = ({
  item,
  index,
  products,
  onUpdate,
  onRemove,
  canRemove,
}) => {
  return (
    <tr className="border-b">
      <td className="py-3 px-2">
        <select
          value={item.productId}
          onChange={(e) => onUpdate(index, 'productId', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Select product</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>
      </td>
      <td className="py-3 px-2">
        <input
          min="1"
          value={item.quantity}
          onChange={(e) => onUpdate(index, 'quantity', parseInt(e.target.value) || 0)}
          className="w-20 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </td>
      <td className="py-3 px-2">
        <input
          min="0"
          step="0.01"
          value={item.unitPrice}
          onChange={(e) => onUpdate(index, 'unitPrice', parseFloat(e.target.value) || 0)}
          className="w-24 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </td>
      <td className="py-3 px-2 text-right">
        {(item.quantity * item.unitPrice).toFixed(2)}
      </td>
      <td className="py-3 px-2 text-right">
        {canRemove && (
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="text-red-500 hover:text-red-700"
          >
            <Trash2 size={18} />
          </button>
        )}
      </td>
    </tr>
  );
};
