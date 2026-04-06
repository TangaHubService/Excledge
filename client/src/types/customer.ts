export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  type: string;
  balance: number;
  insuranceProvider?: string;
  countryCode?: string;
}

export interface CustomerFormData {
  id?: string;
  name: string;
  email?: string | null;
  phone: string;
  countryCode?: string;
  type: string;
  balance: number;
}

export interface CustomerFilters {
  searchTerm: string;
  page: number;
  limit: number;
}
