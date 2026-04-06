import React from 'react';
import { Plus } from 'lucide-react';
import { OrderItemRow } from './OrderItemRow';
import type { OrderItemsCardProps } from '../types';

export const OrderItemsCard: React.FC<OrderItemsCardProps> = ({
  orderItems,
  setOrderItems,
  products,
}) => {
  const addNewItem = () => {
    setOrderItems([
      ...orderItems,
      {
        productId: '',
        productName: '',
        quantity: 1,
        unitPrice: 0,
      },
    ]);
  };

  const updateItem = (index: number, field: keyof typeof orderItems[0], value: any) => {
    const updatedItems = [...orderItems];
    updatedItems[index] = {
      ...updatedItems[index],
      [field]: value,
    };
    setOrderItems(updatedItems);
  };

  const removeItem = (index: number) => {
    setOrderItems(orderItems.filter((_, i) => i !== index));
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Order Items</h2>
          <p className="text-sm text-gray-500">Add products to this purchase order</p>
        </div>
        <button
          type="button"
          onClick={addNewItem}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <Plus className="-ml-1 mr-2 h-5 w-5" />
          Add Item
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Product
              </th>
              <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Quantity
              </th>
              <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Unit Price
              </th>
              <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Total
              </th>
              <th className="px-2 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {orderItems.map((item, index) => (
              <OrderItemRow
                key={index}
                item={item}
                index={index}
                products={products}
                onUpdate={updateItem}
                onRemove={removeItem}
                canRemove={orderItems.length > 1}
              />
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="text-right font-medium">
                Subtotal:
              </td>
              <td className="text-right font-medium">
                {orderItems
                  .reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
                  .toFixed(2)}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};
