import React from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import type { SupplierRowProps } from '../types/supplierTypes';

export const SupplierRow: React.FC<SupplierRowProps> = ({ supplier, onEdit, onDelete }) => {
  return (
    <tr className="border-b hover:bg-muted dark:text-white transition-colors">
      <td className="py-3 px-4 font-mono text-xs text-muted-foreground">#{supplier.id}</td>
      <td className="py-3 px-4 font-medium">
        <div>{supplier.name}</div>
        {supplier.TIN && (
          <div className="mt-0.5 flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
            <span className="font-mono">TIN {supplier.TIN}</span>
            <span className="rounded bg-teal-600/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-teal-700 dark:text-teal-300">RRA</span>
          </div>
        )}
      </td>
      <td className="py-3 px-4 text-sm">{supplier.email || "-"}</td>
      <td className="py-3 px-4 text-sm font-mono">{supplier.phone || "-"}</td>
      <td className="py-3 px-4 text-sm">{supplier.contactPerson || "-"}</td>
      <td className="py-3 px-4 text-sm">{supplier.address || "-"}</td>
      <td className="py-3 px-4 text-right">
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onEdit(supplier)}
            className="p-2 hover:bg-muted rounded-md transition-colors"
            aria-label="Edit supplier"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(supplier.id)}
            className="p-2 text-danger hover:bg-danger/10 rounded-md transition-colors"
            aria-label="Delete supplier"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
};
