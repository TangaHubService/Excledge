import { Search, Plus, Upload, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';

interface CustomerFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  onAddCustomer: () => void;
  onImport?: () => void;
  isLoading: boolean;
}

export function CustomerFilters({
  searchTerm,
  onSearchChange,
  onAddCustomer,
  onImport,
  isLoading,
}: CustomerFiltersProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
      <div className="relative w-full sm:w-96 group">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className={`h-5 w-5 transition-colors ${
            searchTerm ? 'text-primary' : 'text-muted-foreground group-focus-within:text-primary'
          }`} />
        </div>
        <input
          type="text"
          placeholder={t('customers.searchPlaceholder')}
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className={`block w-full pl-10 pr-10 py-2.5 border rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary ${
            theme === "dark"
              ? "bg-gray-800 border-gray-700 text-white placeholder-gray-500"
              : "bg-card border-border text-foreground placeholder-gray-400 hover:border-border shadow-sm"
          }`}
          disabled={isLoading}
        />
        {searchTerm && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute inset-y-0 right-0 pr-3 flex items-center hover:text-danger transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground hover:text-inherit" />
          </button>
        )}
      </div>
      <div className="flex gap-3 w-full sm:w-auto">
        {onImport && (
          <button
            type="button"
            onClick={onImport}
            className="inline-flex items-center px-4 py-2 border border-border rounded-lg shadow-sm text-sm font-medium text-foreground bg-card hover:bg-muted focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isLoading}
          >
            <Upload className="-ml-1 mr-2 h-4 w-4" />
            {t('customers.import') || 'Import'}
          </button>
        )}
        <button
          type="button"
          onClick={onAddCustomer}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isLoading}
        >
          <Plus className="-ml-1 mr-2 h-4 w-4" />
          {t('customers.addCustomer')}
        </button>
      </div>
    </div>
  );
}
