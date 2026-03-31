export const queryKeys = {
  dashboard: ["dashboard"] as const,
  branches: (params?: unknown) => ["branches", params] as const,
  products: (params?: unknown) => ["products", params] as const,
  categories: (params?: unknown) => ["categories", params] as const,
  suppliers: (params?: unknown) => ["suppliers", params] as const,
  customers: (params?: unknown) => ["customers", params] as const,
  purchases: (params?: unknown) => ["purchases", params] as const,
  sales: (params?: unknown) => ["sales", params] as const,
  balances: (params?: unknown) => ["balances", params] as const,
  movements: (params?: unknown) => ["movements", params] as const,
  posCatalog: (params?: unknown) => ["posCatalog", params] as const,
  reports: (name: string, params?: unknown) => ["reports", name, params] as const,
};
