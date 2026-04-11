export interface Profile {
    id: string;
    name: string;
    email: string;
    // Add other profile properties as needed
    role?: string;
    pharmacy_id?: string;
    created_at?: string;
    updated_at?: string;
    phone?:string;
}

export interface Product {
    id: number;
    name: string;
    sku?: string;
    itemCode?: string;
    itemClassCode?: string;
    packageUnitCode?: string;
    quantityUnitCode?: string;
    batchNumber?: string;
    quantity: number;
    unitPrice: number;
    expiryDate?: string;
    category?: string;
    description?: string;
    minStock: number;
    organizationId: number;
    supplierId?: number;
    imageUrl?: string;
    createdAt: string;
    updatedAt: string;
}

export interface StockChange {
    date: string;
    type: string;
    quantity: number;
    newStock: number;
    note: string;
}

export interface ProductsReport {
    id: number;
    product: string;
    sku: string;
    category: string;
    currentStock: number;
    previousStock: number;
    minStock: number;
    maxStock: number;
    unitPrice: number;
    supplier: string;
    lastRestocked: string;
    changes: StockChange[];
    status: string;
    stockValue: number;
}
