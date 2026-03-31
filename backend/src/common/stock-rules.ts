export const nextStockQuantity = (current: number, delta: number): number => current + delta;

export const isNegativeStock = (next: number): boolean => next < 0;
