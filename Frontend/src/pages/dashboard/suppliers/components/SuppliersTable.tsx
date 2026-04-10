import React from 'react';
import type { SuppliersTableProps } from '../types/supplierTypes';
import { SupplierRow } from './SupplierRow';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../../context/ThemeContext';

export const SuppliersTable: React.FC<SuppliersTableProps> = ({ suppliers, onEdit, onDelete }) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  
  if (suppliers.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No suppliers found
      </div>
    );
  }

  return (
    <div className="overflow-x-auto dark:bg-gray-800 rounded-lg">
      <table className="w-full">
        <thead className={theme === "dark" ? "bg-gray-700" : "bg-gray-50"}>
          <tr>
            <th className="py-3 px-4 text-left text-sm font-medium text-gray-700 dark:text-white">{t('common.id')}</th>
            <th className="py-3 px-4 text-left text-sm font-medium text-gray-700 dark:text-white">{t('common.name')}</th>
            <th className="py-3 px-4 text-left text-sm font-medium text-gray-700 dark:text-white">{t('common.email')}</th>
            <th className="py-3 px-4 text-left text-sm font-medium text-gray-700 dark:text-white">{t('common.phone')}</th>
            <th className="py-3 px-4 text-left text-sm font-medium text-gray-700 dark:text-white">{t('suppliers.contactPerson')}</th>
            <th className="py-3 px-4 text-left text-sm font-medium text-gray-700 dark:text-white">{t('common.address')}</th>
            <th className="py-3 px-4 text-right text-sm font-medium text-gray-700 dark:text-white">{t('common.actions')}</th>
          </tr>
        </thead>
        <tbody className="bg-white dark:bg-gray-800 rounded-lg">
          {suppliers.map((supplier) => (
            <SupplierRow
              key={supplier.id}
              supplier={supplier}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
};
