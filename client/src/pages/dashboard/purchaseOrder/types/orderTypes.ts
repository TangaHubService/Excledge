export interface Order {
  id: number;
  orderNumber: string;
  orderDate: string;
  status: OrderStatus;
  supplier: {
    id: number;
    name: string;
  };
  totalAmount: number;
  expectedDeliveryDate?: string;
}

export type OrderStatus = 
  | 'PENDING'
  | 'APPROVED'
  | 'ORDERED'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED';

export interface StatusBadgeProps {
  status: OrderStatus;
}

export interface StatusSelectProps {
  value: OrderStatus;
  onChange: (orderId: number, status: OrderStatus) => void;
  orderId: number;
}

export interface OrderRowProps {
  order: Order;
  onStatusChange: (orderId: number, status: OrderStatus) => void;
  onView: (orderId: number) => void;
}

export interface OrdersTableProps {
  orders: Order[];
  onStatusChange: (orderId: number, status: OrderStatus) => void;
  onView: (orderId: number) => void;
}

export interface OrdersCardProps {
  loading: boolean;
  orders: Order[];
  onStatusChange: (orderId: number, status: OrderStatus) => void;
  onView: (orderId: number) => void;
}

export interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  onClose: () => void;
}

export interface PurchaseOrdersPageProps {
  apiClient: any; // Replace with your API client type
  router: any; // Replace with your router type
  organizationId: number;
}
