export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

export interface Product {
  id: string;
  name: string;
  unitPrice?: number;
}

export interface Supplier {
  id: string;
  name: string;
  email: string;
  // Add other supplier fields as needed
}

export interface FormData {
  supplierId: string;
  expectedDeliveryDate: string;
  notes: string;
}

export interface OrderDetailsCardProps {
  formData: FormData;
  setFormData: React.Dispatch<React.SetStateAction<FormData>>;
  suppliers: Supplier[];
}

export interface OrderItemRowProps {
  item: OrderItem;
  index: number;
  products: Product[];
  onUpdate: (index: number, field: keyof OrderItem, value: any) => void;
  onRemove: (index: number) => void;
  canRemove: boolean;
}

export interface OrderItemsCardProps {
  orderItems: OrderItem[];
  setOrderItems: React.Dispatch<React.SetStateAction<OrderItem[]>>;
  products: Product[];
}

export interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  onClose: () => void;
}

export type ToastType = {
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
};
