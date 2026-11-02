import React from 'react';
import { Search, X } from 'lucide-react';
import type { SearchBarProps } from '../types/supplierTypes';
import { useTheme } from '../../../../context/ThemeContext';
import { useTranslation } from 'react-i18next';

export const SearchBar: React.FC<SearchBarProps> = ({ value, onChange }) => {
  const { theme } = useTheme();
  const { t } = useTranslation();

  return (
    <div className="relative w-full group">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <Search className={`h-4 w-4 transition-colors ${
          value ? 'text-primary' : 'text-muted-foreground group-focus-within:text-primary'
        }`} />
      </div>
      <input
        type="text"
        placeholder={t('customers.searchPlaceholder') || "Search..."}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`block w-full pl-9 pr-9 py-2 border rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary ${
          theme === "dark"
            ? "bg-gray-900 border-gray-700 text-white placeholder-gray-500"
            : "bg-card border-border text-foreground placeholder-gray-400 hover:border-border shadow-sm"
        }`}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute inset-y-0 right-0 pr-3 flex items-center hover:text-danger transition-colors text-muted-foreground"
        >
          <X className="h-4 w-4 hover:text-inherit" />
        </button>
      )}
    </div>
  );
};
