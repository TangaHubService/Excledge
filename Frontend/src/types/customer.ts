export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone: string;
  customerType?: 'INDIVIDUAL' | 'CORPORATE' | 'INSURANCE';
  TIN?: string;
  address?: string;
  balance: string;
  totalPurchases?: number;
  createdAt?: string;
  updatedAt?: string;
  type?: 'INDIVIDUAL' | 'CORPORATE' | 'INSURANCE';
}

export interface CustomerFormData {
  name: string;
  email?: string;
  phone: string;
  customerType?: 'INDIVIDUAL' | 'CORPORATE' | 'INSURANCE';
}

export interface CustomerFilters {
  searchTerm: string;
  hasDebt?: boolean;
  showInactive?: boolean;
  page: number;
  limit: number;
}