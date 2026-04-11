import { useState, useEffect, useMemo, useCallback, memo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { ShoppingCart, Loader2, UserPlus, Search, X } from 'lucide-react';
import PhoneInputWithCountryCode from '../../../components/PhoneInputWithCountryCode';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { toast } from "react-toastify";
import { apiClient } from '../../../lib/api-client';
import { parseInventoryGetProductsResponse } from '../../../lib/inventory-response';
import { offlineQueue } from '../../../utils/offlineQueue';
import { WifiOff } from 'lucide-react';



import { PaymentModal } from '../../../components/pos/PaymentModal';
import { useTheme } from '../../../context/ThemeContext';
import { useBranch } from '../../../context/BranchContext';

// Types
interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  quantity: number;
  unitPrice?: number;
  batchNumber: string;
  expiryDate: string;
}

interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  type: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
  unitPrice: number;
}

function productsFromInventoryResponse(res: unknown): Product[] {
  return parseInventoryGetProductsResponse(res).items as Product[];
}

// Product Card Component
const ProductCard = memo(({ product, onAddToCart }: any) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const getProductInitial = (name: string) => {
    return name.charAt(0).toUpperCase();
  };

  return (
    <div
      className={`rounded-lg border-2 flex flex-col items-center justify-between p-3 hover:shadow-lg transition-all cursor-pointer ${theme === 'dark'
        ? 'bg-gray-800 border-gray-700 hover:border-blue-500'
        : 'bg-white border-gray-200 hover:border-blue-400'
        }`}
      onClick={() => onAddToCart(product)}
    >
      <div className={`w-full h-24 rounded-lg flex items-center justify-center mb-2 ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'
        }`}>
        <span className={`text-4xl font-bold ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'
          }`}>
          {getProductInitial(product.name)}
        </span>
      </div>
      <div className="w-full text-center">
        <h3 className={`font-semibold text-sm mb-1 line-clamp-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'
          }`}>
          {product.name}
        </h3>
        <p className={`text-lg font-bold mb-1 ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'
          }`}>
          {product.unitPrice} RWF
        </p>
        <p className={`text-xs font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
          }`}>
          {t('pos.stock')}: {product.quantity}
        </p>
      </div>
    </div>
  );
});

// Order Item Component
const OrderItem = memo(({ item, onRemove, onUpdateQuantity, onUpdatePrice }: any) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [quantityInput, setQuantityInput] = useState(item.quantity.toString());
  const [isEditingQuantity, setIsEditingQuantity] = useState(false);


  const getProductInitial = (name: string) => {
    return name.charAt(0).toUpperCase();
  };
  const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuantityInput(e.target.value);
  };

  const handleQuantityBlur = () => {
    const newQuantity = parseInt(quantityInput, 10);
    if (!isNaN(newQuantity) && newQuantity > 0) {
      onUpdateQuantity(item.product.id, newQuantity);
    } else {
      setQuantityInput(item.quantity.toString());
    }
    setIsEditingQuantity(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleQuantityBlur();
    }
  };

  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border ${theme === 'dark'
      ? 'bg-gray-700 border-gray-600'
      : 'bg-gray-50 border-gray-200'
      }`}>
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${theme === 'dark' ? 'bg-gray-600' : 'bg-gray-200'
        }`}>
        <span className={`text-lg font-bold ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'
          }`}>
          {getProductInitial(item.product.name)}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <h4 className={`font-medium text-sm truncate ${theme === 'dark' ? 'text-white' : 'text-gray-900'
          }`}>
          {item.product.name}
        </h4>
        <div className="flex items-center gap-1 mt-1">
          <button
            onClick={() => onUpdateQuantity(item.product.id, Math.max(1, item.quantity - 1))}
            className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold transition-colors ${theme === 'dark'
              ? 'bg-gray-600 text-white hover:bg-gray-500'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
          >
            -
          </button>
          {isEditingQuantity ? (
            <input
              min="1"
              max={item.product.quantity}
              value={quantityInput}
              onChange={handleQuantityChange}
              onBlur={handleQuantityBlur}
              onKeyDown={handleKeyDown}
              className={`w-12 px-1 py-0.5 text-xs border rounded text-center ${theme === 'dark'
                ? 'bg-gray-800 border-gray-600 text-white'
                : 'bg-white border-gray-300 text-gray-900'
                }`}
              autoFocus
            />
          ) : (
            <div
              className={`w-12 px-1 py-0.5 text-xs border rounded text-center cursor-text ${theme === 'dark'
                ? 'border-gray-600 text-white'
                : 'border-gray-300 text-gray-900'
                }`}
              onClick={() => setIsEditingQuantity(true)}
            >
              {item.quantity}
            </div>
          )}
          <button
            onClick={() => onUpdateQuantity(item.product.id, item.quantity + 1)}
            className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold transition-colors ${theme === 'dark'
              ? 'bg-gray-600 text-white hover:bg-gray-500'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
          >
            +
          </button>
        </div>
      </div>
      <div className="text-right">
        <input
          value={item.unitPrice === null ? "" : item.unitPrice}
          onChange={(e) => {
            const value = e.target.value;
            if (value === "") {
              onUpdatePrice(item.product.id, "");
              return;
            }
            const newPrice = parseFloat(value);
            if (!isNaN(newPrice) && newPrice >= 0) {
              onUpdatePrice(item.product.id, newPrice);
            }
          }}
          className={`w-20 text-right text-xs border rounded px-1 py-0.5 ${theme === 'dark'
            ? 'bg-gray-800 border-gray-600 text-white'
            : 'bg-white border-gray-300 text-gray-900'
            }`}
        />
        <p className={`font-semibold text-sm mt-1 ${theme === 'dark' ? 'text-white' : 'text-gray-900'
          }`}>
          {(item.unitPrice * item.quantity).toFixed(2)} RWF
        </p>
        <button
          onClick={() => onRemove(item.product.id)}
          className={`text-xs mt-1 ${theme === 'dark' ? 'text-red-400 hover:text-red-300' : 'text-red-600 hover:text-red-700'
            }`}
        >
          {t('pos.remove')}
        </button>
      </div>
    </div>
  );
});

// Add Customer Dialog
const AddCustomerDialog = memo(({ onCustomerAdded, isOpen, onOpenChange }: any) => {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    countryCode: '+250',
    type: 'CASH'
  });

  const handlePhoneChange = (phone: string, countryCode: string) => {
    setFormData(prev => ({
      ...prev,
      phone,
      countryCode
    }));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = t('validation.required');
    }

    if (!formData.phone) {
      newErrors.phone = t('validation.required');
    } else if (formData.phone.length < 10) {
      newErrors.phone = t('validation.invalidPhone');
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = t('validation.invalidEmail');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    try {
      // Combine country code with phone number if not already included
      const phoneNumber = formData.phone.startsWith('+')
        ? formData.phone
        : `${formData.countryCode}${formData.phone}`;

      // Create a new object without countryCode and with the formatted phone number
      const { countryCode, ...customerData } = {
        ...formData,
        phone: phoneNumber
      };

      const newCustomer = await apiClient.createCustomer(customerData);
      toast.success(t('messages.customerCreated'));
      onCustomerAdded(newCustomer);
      onOpenChange(false);
      // Reset form
      setFormData({
        name: '',
        email: '',
        phone: '',
        countryCode: '+250',
        type: 'CASH'
      });
      setErrors({});
    } catch (error) {
      console.error('Error adding customer:', error);
      toast.error(t('messages.saveError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md dark:bg-gray-800 dark:text-white bg-white dark:border-gray-700">
        <DialogHeader>
          <DialogTitle>{t('pos.addNewCustomer')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t('pos.customerName')}</Label>
            <Input
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              placeholder={t('pos.customerNamePlaceholder')}
            />
            {errors.name && <p className="text-sm text-red-500 mt-1">{errors.name}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">{t('pos.phoneNumber')}</Label>
            <PhoneInputWithCountryCode
              value={formData.phone}
              countryCode={formData.countryCode}
              onChange={handlePhoneChange}
              placeholder={t('pos.phoneNumberPlaceholder')}
              error={errors.phone || ''}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">{t('pos.emailOptional')}</Label>
            <Input
              id="email"
              type="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              placeholder={t('pos.emailPlaceholder')}
            />
          </div>

          <div className="space-y-2 dark:bg-gray-800 dark:text-white">
            <Label htmlFor="type">{t('pos.customerType')}</Label>
            <Select
              value={formData.type}
              onValueChange={(value) => setFormData(prev => ({ ...prev, type: value }))}
            >
              <SelectTrigger className="dark:bg-gray-800 dark:text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-gray-800 dark:text-white">
                <SelectItem value="INSURANCE">{t('pos.insurance')}</SelectItem>
                <SelectItem value="CORPORATE">{t('pos.corporate')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              {isSubmitting ? t('pos.adding') : t('pos.addCustomer')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
});
// Main Component
export default function SalesForm() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { selectedBranchId } = useBranch();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [purchaseOrderCode, setPurchaseOrderCode] = useState('');
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const productsContainerRef = useRef<HTMLDivElement | null>(null);
  const isLoadingMoreRef = useRef(false);
  const [displayedProductsCount, setDisplayedProductsCount] = useState(30); // Show 30 products initially (10 rows of 3)
  const ITEMS_PER_LOAD = 15; // Load 15 more items each time (5 rows of 3)
  const selectedCustomerRecord = useMemo(
    () => customers.find((customer) => customer.id === selectedCustomer) ?? null,
    [customers, selectedCustomer]
  );
  const showPurchaseOrderField = selectedCustomerRecord?.type === 'CORPORATE';


  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (isCustomerDropdownOpen && !target.closest('.customer-dropdown-container')) {
        setIsCustomerDropdownOpen(false);
        setCustomerSearchTerm('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isCustomerDropdownOpen]);


  const fetchRecentSales = useCallback(async () => {
    try {
      await apiClient.getSales({
        page: 1,
        limit: 10,
        search: '',
        branchId: selectedBranchId
      });
    } catch (error) {
      console.error('Failed to fetch recent sales:', error);
    }
  }, [selectedBranchId]);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);

      if (!isOnline) {
        setProducts(offlineQueue.getProducts());
        setCustomers(offlineQueue.getCustomers());
        return;
      }

      const [productsData, customersData] = await Promise.all([
        apiClient.getProducts({ page: 1, limit: 10000, search: '', branchId: selectedBranchId }),
        apiClient.getCustomers({ page: 1, limit: 100, search: '' })
      ]);

      const allProducts = productsFromInventoryResponse(productsData);
      const filteredProducts = allProducts.filter((p: Product) => p.quantity > 0);
      setProducts(filteredProducts);
      setDisplayedProductsCount(30);

      const allCustomers = customersData.customers || [];
      setCustomers(allCustomers);

      // Cache data for offline use
      offlineQueue.saveProducts(filteredProducts);
      offlineQueue.saveCustomers(allCustomers);

      // Set default customer if available
      if (allCustomers.length > 0) {
        setSelectedCustomer(allCustomers[0].id);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error(t('pos.loadError'));
      // Fallback to cache on error
      setProducts(offlineQueue.getProducts());
      setCustomers(offlineQueue.getCustomers());
    } finally {
      setIsLoading(false);
    }
  }, [isOnline, selectedBranchId, t]);

  // Fetch products and customers on mount and when branch or online status changes
  useEffect(() => {
    fetchData();
    fetchRecentSales();
  }, [fetchData, fetchRecentSales]);

  // Handle online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    setPurchaseOrderCode('');
  }, [selectedCustomer]);

  // Synchronize offline sales
  useEffect(() => {
    if (isOnline && offlineQueue.hasItems() && !isSyncing) {
      const syncSales = async () => {
        setIsSyncing(true);
        const queue = offlineQueue.getQueue();
        toast.info(t('pos.syncingSales', { count: queue.length }) || `Syncing ${queue.length} offline sales...`);

        for (const item of queue) {
          try {
            await apiClient.createSale(item.payload);
            offlineQueue.dequeue(item.id);
          } catch (error) {
            console.error('Failed to sync sale:', error);
          }
        }

        setIsSyncing(false);
        if (!offlineQueue.hasItems()) {
          toast.success(t('pos.syncComplete') || 'Offline sales synchronized.');
          fetchRecentSales();
        }
      };

      syncSales();
    }
  }, [isOnline, isSyncing, t, fetchRecentSales]);

  // Search products with debouncing
  useEffect(() => {
    if (searchTerm) {
      const timeoutId = setTimeout(async () => {
        try {
          setIsLoading(true);

          if (!isOnline) {
            const cached = offlineQueue.getProducts();
            const filtered = cached.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));
            setProducts(filtered);
            return;
          }

          const response = await apiClient.getProducts({
            page: 1,
            limit: 10000,
            search: searchTerm,
            branchId: selectedBranchId
          });
          const searchedProducts = productsFromInventoryResponse(response);
          setProducts(searchedProducts.filter((p: Product) => p.quantity > 0));
          setDisplayedProductsCount(30); // Reset count when searching
        } catch (error) {
          console.error('Failed to search products:', error);
          toast.error(t('pos.searchError'));
        } finally {
          setIsLoading(false);
        }
      }, 500);

      return () => clearTimeout(timeoutId);
    } else {
      // Reload all products when search is cleared
      const fetchAllProducts = async () => {
        try {
          setIsLoading(true);
          const response = await apiClient.getProducts({
            page: 1,
            limit: 10000,
            search: '',
            branchId: selectedBranchId
          });
          const reloadedProducts = productsFromInventoryResponse(response);
          setProducts(reloadedProducts.filter((p: Product) => p.quantity > 0));
          setDisplayedProductsCount(30); // Reset count when clearing search
        } catch (error) {
          console.error('Failed to fetch products:', error);
        } finally {
          setIsLoading(false);
        }
      };
      fetchAllProducts();
    }
  }, [searchTerm, selectedBranchId]);

  // Infinite scroll handler
  useEffect(() => {
    const productsContainer = productsContainerRef.current;
    if (!productsContainer) return;

    const filteredProducts = products.filter((p: Product) => p.quantity > 0);

    const handleScroll = () => {
      // If already loading or all products displayed, return early
      if (isLoadingMoreRef.current || displayedProductsCount >= filteredProducts.length) {
        return;
      }

      const { scrollTop, scrollHeight, clientHeight } = productsContainer;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

      // Load more when user scrolls to within 300px of the bottom
      if (distanceFromBottom < 300) {
        isLoadingMoreRef.current = true;
        setDisplayedProductsCount(prev => {
          const newCount = Math.min(prev + ITEMS_PER_LOAD, filteredProducts.length);
          // Reset loading flag after a short delay
          setTimeout(() => {
            isLoadingMoreRef.current = false;
          }, 300);
          return newCount;
        });
      }
    };

    // Throttle scroll events for better performance
    let ticking = false;
    const throttledHandleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          handleScroll();
          ticking = false;
        });
        ticking = true;
      }
    };

    productsContainer.addEventListener('scroll', throttledHandleScroll, { passive: true });

    // Check on mount if we need to load more immediately (if content doesn't fill the container)
    // Use a small delay to ensure DOM is fully rendered
    const checkInitialLoad = setTimeout(() => {
      handleScroll();
    }, 100);

    return () => {
      clearTimeout(checkInitialLoad);
      productsContainer.removeEventListener('scroll', throttledHandleScroll);
    };
  }, [products, displayedProductsCount]);

  const addToCart = useCallback((product: Product) => {
    if (!product.quantity || product.quantity < 1) {
      toast.error(t('pos.outOfStock'));
      return;
    }

    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        const newQuantity = existing.quantity + 1;
        if (newQuantity > product.quantity) {
          toast.error(t('pos.lowStockWarning', { count: product.quantity }));
          return prev;
        }
        return prev.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: newQuantity }
            : item
        );
      }
      return [...prev, {
        product,
        quantity: 1,
        unitPrice: product.unitPrice || product.price || 0
      }];
    });

    toast.success(t('messages.productAdded'));
  }, [t]);

  const removeFromCart = useCallback((productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
    toast.info(t('pos.itemRemoved'));
  }, [t]);

  const updateQuantity = useCallback((productId: string, newQuantity: number) => {
    if (newQuantity < 1) return;

    setCart(prev =>
      prev.map(item => {
        if (item.product.id === productId) {
          if (newQuantity > item.product.quantity) {
            toast.error(t('pos.lowStockWarning', { count: item.product.quantity }));
            return item;
          }
          return { ...item, quantity: newQuantity };
        }
        return item;
      })
    );
  }, [t]);

  const updatePrice = useCallback((productId: string, newPrice: number) => {
    setCart(prev =>
      prev.map(item =>
        item.product.id === productId
          ? { ...item, unitPrice: newPrice }
          : item
      )
    );
    toast.success(t('pos.priceUpdated'));
  }, [t]);

  const handleCustomerAdded = useCallback((newCustomer: Customer) => {
    setCustomers(prev => [...prev, newCustomer]);
    setSelectedCustomer(newCustomer.id);
  }, []);

  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  }, [cart]);

  const serviceFees = 0;
  const salesTax = 0;
  const total = subtotal + serviceFees + salesTax;

  const handleOpenPaymentModal = useCallback(() => {
    if (cart.length === 0) {
      toast.error(t('pos.noItemsInCart'));
      return;
    }

    if (!selectedCustomer) {
      toast.error(t('pos.selectCustomer'));
      return;
    }

    setIsPaymentModalOpen(true);
  }, [cart, selectedCustomer, t]);

  const handleProcessPayment = useCallback(async (paymentEntries: Array<{ id: string; method: string; amount: number; reference?: string }>) => {
    try {
      setIsSubmitting(true);

      // Calculate totals by payment method
      let cashAmount = 0;
      let insuranceAmount = 0;
      let debtAmount = 0;

      paymentEntries.forEach((payment) => {
        switch (payment.method) {
          case 'CASH':
            cashAmount += payment.amount;
            break;
          case 'INSURANCE':
            insuranceAmount += payment.amount;
            break;
          case 'DEBT':
            // Debt payments are recorded as debt
            debtAmount += payment.amount;
            break;
          case 'MOBILE_MONEY':
            // Mobile money is treated as cash payment
            cashAmount += payment.amount;
            break;
          case 'CREDIT_CARD':
            // Card payments are treated as cash payment
            cashAmount += payment.amount;
            break;
        }
      });

      // Calculate total paid
      const totalPaid = paymentEntries.reduce((sum, p) => sum + p.amount, 0);
      const remainingDebt = Math.max(0, total - totalPaid);

      // If there's remaining balance, add it to debtAmount (credit/debt)
      if (remainingDebt > 0) {
        debtAmount += remainingDebt;
      }

      // Determine payment type based on methods used and amounts
      let paymentType: 'CASH' | 'DEBT' | 'MIXED' | 'INSURANCE' | 'CREDIT_CARD' | 'MOBILE_MONEY' = 'CASH';

      // Get unique payment methods that have amounts > 0
      const activeMethods = paymentEntries.filter(p => p.amount > 0).map(p => p.method);
      const uniqueActiveMethods = [...new Set(activeMethods)];

      // Count how many payment method types have amounts > 0
      const hasCashAmount = cashAmount > 0;
      const hasInsuranceAmount = insuranceAmount > 0;
      const hasDebtAmount = debtAmount > 0;

      // Determine payment type
      if (uniqueActiveMethods.length > 1) {
        // Multiple payment methods
        paymentType = 'MIXED';
      } else if (uniqueActiveMethods.length === 1) {
        // Single payment method
        const singleMethod = uniqueActiveMethods[0];

        // If there's also debt (remaining balance), it's MIXED unless the method is DEBT
        if (hasDebtAmount && singleMethod !== 'DEBT') {
          paymentType = 'MIXED';
        } else {
          // Use the actual payment method type
          paymentType = singleMethod as any;
        }
      } else if (hasDebtAmount && !hasCashAmount && !hasInsuranceAmount) {
        // Only debt, no other payments
        paymentType = 'DEBT';
      } else if (hasCashAmount && !hasInsuranceAmount && !hasDebtAmount) {
        // Only cash (could be from CASH, MOBILE_MONEY, or CREDIT_CARD)
        // Check which method was actually used
        const cashMethod = paymentEntries.find(p => p.amount > 0 && (p.method === 'CASH' || p.method === 'MOBILE_MONEY' || p.method === 'CREDIT_CARD'));
        if (cashMethod) {
          paymentType = cashMethod.method as any;
        } else {
          paymentType = 'CASH';
        }
      } else if (hasInsuranceAmount && !hasCashAmount && !hasDebtAmount) {
        // Only insurance
        paymentType = 'INSURANCE';
      }

      const payload = {
        customerId: selectedCustomer,
        items: cart.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
          unitPrice: item.unitPrice
        })),
        paymentType,
        cashAmount,
        insuranceAmount,
        debtAmount,
        branchId: selectedBranchId,
        paymentStatus: remainingDebt > 0 ? 'MIXED' : 'PAID',
        purchaseOrderCode: purchaseOrderCode.trim() || undefined,
      };

      if (!isOnline) {
        offlineQueue.enqueue(payload);
        toast.warning(t('pos.offlineQueued') || 'Offline: Sale has been queued and will sync when online.');
        setCart([]);
        setPurchaseOrderCode('');
        setIsPaymentModalOpen(false);
        return;
      }

      const saleResponse = await apiClient.createSale(payload);
      await fetchRecentSales();

      if (saleResponse?.data?.status === 'PENDING') {
        toast.warning(
          saleResponse?.message || 'Sale created, but fiscal submission is pending.'
        );
      } else if (remainingDebt > 0) {
        toast.success(t('pos.paymentDebtSuccess', { paid: totalPaid, debt: remainingDebt }));
      } else {
        toast.success(t('pos.paymentSuccess'));
      }

      setCart([]);
      setPurchaseOrderCode('');
      setIsPaymentModalOpen(false);
      // Refresh products to get updated stock
      const response = await apiClient.getProducts({
        page: 1,
        limit: 10000,
        search: '',
        branchId: selectedBranchId
      });
      const refreshedProducts = productsFromInventoryResponse(response);
      setProducts(refreshedProducts.filter((p: Product) => p.quantity > 0));
    } catch (error: any) {
      console.error('Failed to process payment:', error);
      // Extract error message - handle both string and object errors
      let errorMessage = t('pos.paymentError');
      if (error?.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error?.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error?.message) {
        errorMessage = error.message;
      }
      toast.error(errorMessage);

      // If it's a stock error, refresh products to get updated stock
      if (errorMessage.includes('Insufficient stock') || errorMessage.includes('stock')) {
        try {
          const response = await apiClient.getProducts({
            page: 1,
            limit: 10000,
            search: '',
            branchId: selectedBranchId
          });
          const errorRefreshProducts = productsFromInventoryResponse(response);
          setProducts(errorRefreshProducts.filter((p: Product) => p.quantity > 0));
        } catch (refreshError) {
          console.error('Failed to refresh products:', refreshError);
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [
    cart,
    selectedCustomer,
    total,
    t,
    fetchRecentSales,
    purchaseOrderCode,
    isOnline,
    selectedBranchId,
  ]);


  return (
    <>
      <div className={`min-h-screen ${theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'}`}>
        {!isOnline && (
          <div className="bg-amber-500 text-white px-6 py-2 flex items-center justify-center gap-2 animate-in slide-in-from-top duration-300">
            <WifiOff className="h-4 w-4" />
            <span className="text-sm font-medium">
              {t('pos.offlineMode') || 'You are currently offline. Sales will be queued and synced when connection is restored.'}
            </span>
          </div>
        )}
        {/* Header */}
        <div className={`border-b ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} px-6 py-4`}>
          <div className="flex items-center justify-between">
            <h1 className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              {t('pos.pointOfSale') || 'POS'}
            </h1>
            <div className="flex-1 max-w-3xl ml-6 group">
              <div className="relative">
                <Search className={`absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 transition-all duration-200 ${searchTerm ? 'text-blue-500 scale-110' : 'text-gray-400 group-focus-within:text-blue-500 group-focus-within:scale-110'
                  }`} />
                <Input
                  type="text"
                  placeholder={t('pos.searchPlaceholder')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={`pl-12 pr-12 h-12 text-base transition-all duration-300 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 rounded-2xl shadow-sm ${theme === 'dark'
                    ? 'bg-gray-700/50 border-gray-600 text-white placeholder-gray-500 hover:bg-gray-700'
                    : 'bg-gray-50 border-gray-200 hover:border-gray-300 hover:bg-white'
                    }`}
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-red-500 transition-colors bg-gray-200/50 dark:bg-gray-600/50 p-1 rounded-full"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row h-[calc(100vh-80px)] overflow-hidden">
          {/* Products Grid - Left Side */}
          <div
            ref={productsContainerRef}
            className="flex-1 overflow-y-auto p-4 lg:p-6 lg:border-r"
            style={{ borderColor: theme === 'dark' ? '#374151' : '#e5e7eb' }}
          >
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              </div>
            ) : products.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                <p className="text-lg">{t('pos.noProductsFound')}</p>
                <p className="text-sm mt-2">{t('pos.adjustSearch')}</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  {products
                    .filter((product) => product.quantity > 0) // Filter out products with 0 stock
                    .slice(0, displayedProductsCount)
                    .map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        onAddToCart={addToCart}
                      />
                    ))}
                </div>
                {products.filter((p: Product) => p.quantity > 0).length > displayedProductsCount && (
                  <div className="flex justify-center mt-4 pb-4">
                    <div className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                      Showing {displayedProductsCount} of {products.filter((p: Product) => p.quantity > 0).length} products
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Order Summary Sidebar - Right Side */}
          <div className={`w-full lg:w-96 border-t lg:border-t-0 lg:border-l flex flex-col overflow-hidden ${theme === 'dark'
            ? 'bg-gray-800 border-gray-700'
            : 'bg-white border-gray-200'
            }`}>
            <div className={`px-4 py-4 border-b flex-shrink-0 ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
              <h2 className={`text-xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                {t('pos.currentOrder') || 'Current Order'}
              </h2>

              {/* Customer Selection */}
              <div className="">
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-sm">{t('pos.customer')}</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsAddCustomerOpen(true)}
                    className="text-xs dark:text-white border border-gray-200 dark:border-gray-700 rounded-md"
                  >
                    <UserPlus className="h-3 w-3 mr-1" />
                    {t('pos.addNew')}
                  </Button>
                </div>
                <div className="flex flex-col gap-2">
                  {/* Customer Search/Select Dropdown */}
                  <div className="relative w-full customer-dropdown-container group">
                    <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 z-10 pointer-events-none transition-all duration-200 ${customerSearchTerm ? 'text-blue-500 scale-110' : 'text-gray-400 group-focus-within:text-blue-500 group-focus-within:scale-110'
                      }`} />
                    <div
                      onClick={() => setIsCustomerDropdownOpen(!isCustomerDropdownOpen)}
                      className={`pl-10 pr-10 py-2.5 border rounded-xl cursor-pointer transition-all duration-300 shadow-sm ${theme === 'dark'
                        ? 'bg-gray-800/50 border-gray-700 hover:border-gray-600 hover:bg-gray-800'
                        : 'bg-gray-50 border-gray-200 hover:border-gray-300 hover:bg-white'
                        } ${isCustomerDropdownOpen ? 'ring-4 ring-blue-500/10 border-blue-500 bg-white dark:bg-gray-800' : ''}`}
                    >
                      {isCustomerDropdownOpen ? (
                        <div className="relative flex items-center w-full">
                          <Input
                            type="text"
                            placeholder={t('pos.searchCustomer')}
                            value={customerSearchTerm}
                            onChange={(e) => setCustomerSearchTerm(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            autoFocus
                            className="border-0 p-0 h-auto bg-transparent focus:ring-0 dark:text-white w-full pr-5 text-sm font-medium placeholder:text-gray-400"
                          />
                          {customerSearchTerm && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setCustomerSearchTerm('');
                              }}
                              className="absolute right-0 text-gray-400 hover:text-red-500 transition-colors bg-gray-200/50 dark:bg-gray-600/50 p-0.5 rounded-full"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="text-sm dark:text-white truncate font-medium">
                          {selectedCustomer
                            ? customers.find(c => c.id === selectedCustomer)?.name
                            : t('pos.selectCustomer')}
                        </div>
                      )}
                    </div>
                    {/* Dropdown chevron icon */}
                    {!customerSearchTerm && (
                      <svg
                        className={`absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 transition-transform pointer-events-none ${isCustomerDropdownOpen ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                    {/* Dropdown List */}
                    {isCustomerDropdownOpen && (
                      <div className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg max-h-60 overflow-y-auto">
                        {customers
                          .filter(c =>
                            !customerSearchTerm.trim() ||
                            c.name.toLowerCase().includes(customerSearchTerm.toLowerCase()) ||
                            c.phone?.includes(customerSearchTerm) ||
                            c.email?.toLowerCase().includes(customerSearchTerm.toLowerCase())
                          )
                          .map(customer => (
                            <div
                              key={customer.id}
                              onClick={() => {
                                setSelectedCustomer(customer.id);
                                setCustomerSearchTerm('');
                                setIsCustomerDropdownOpen(false);
                              }}
                              className={`px-3 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${selectedCustomer === customer.id ? 'bg-blue-50 dark:bg-blue-900/30 border-l-2 border-blue-500' : ''
                                }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-sm truncate">{customer.name}</div>
                                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                    {customer.phone}
                                    {customer.email && ` • ${customer.email}`}
                                  </div>
                                </div>
                                {selectedCustomer === customer.id && (
                                  <div className="ml-2 text-blue-600 dark:text-blue-400">
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        {customers.filter(c =>
                          !customerSearchTerm.trim() ||
                          c.name.toLowerCase().includes(customerSearchTerm.toLowerCase()) ||
                          c.phone?.includes(customerSearchTerm) ||
                          c.email?.toLowerCase().includes(customerSearchTerm.toLowerCase())
                        ).length === 0 && (
                            <div className="px-3 py-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                              {t('pos.noCustomersFound')}
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                  {showPurchaseOrderField && (
                    <div className="space-y-1">
                      <Label className="text-sm">Purchase Order Code</Label>
                      <Input
                        value={purchaseOrderCode}
                        onChange={(e) => setPurchaseOrderCode(e.target.value)}
                        placeholder="e.g., PO-2026-001"
                        className={theme === 'dark' ? 'bg-gray-800 border-gray-700 text-white' : ''}
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Recommended for corporate VSDC sales so the fiscal payload uses the customer&apos;s real purchase code.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Cart Items */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {cart.length === 0 ? (
                <div className={`flex flex-col items-center justify-center h-full ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
                  }`}>
                  <ShoppingCart className="w-16 h-16 mb-2" />
                  <p className="text-sm">{t('pos.noItemsInCart')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {cart.map((item) => (
                    <OrderItem
                      key={item.product.id}
                      item={item}
                      onRemove={removeFromCart}
                      onUpdateQuantity={updateQuantity}
                      onUpdatePrice={updatePrice}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Totals */}
            <div className={`p-3 border-t flex-shrink-0 ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'} space-y-2`}>
              <div className={`flex justify-between text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                <span>{t('common.subtotal')}</span>
                <span className="font-medium">{subtotal.toFixed(2)} RWF</span>
              </div>
              {serviceFees > 0 && (
                <div className={`flex justify-between text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                  <span>{t('pos.serviceFees')}</span>
                  <span className="font-medium">{serviceFees.toFixed(2)} RWF</span>
                </div>
              )}
              {salesTax > 0 && (
                <div className={`flex justify-between text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                  <span>{t('pos.totalSalesTax')}</span>
                  <span className="font-medium">{salesTax.toFixed(2)} RWF</span>
                </div>
              )}
              <div className={`flex justify-between text-xl font-bold pt-2 border-t ${theme === 'dark' ? 'border-gray-700' : 'border-gray-300'}`}>
                <span className={theme === 'dark' ? 'text-white' : 'text-gray-900'}>{t('common.total')}</span>
                <span className="text-blue-600 dark:text-blue-400">{total.toFixed(2)} RWF</span>
              </div>

              <Button
                onClick={handleOpenPaymentModal}
                disabled={cart.length === 0 || isSubmitting || !selectedCustomer}
                className={`w-full bg-blue-600 hover:bg-blue-700 py-4 text-base text-white font-semibold mt-3 ${theme === 'dark' ? 'dark:bg-blue-700 dark:hover:bg-blue-600' : ''
                  } ${cart.length === 0 || !selectedCustomer ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('pos.processing')}
                  </>
                ) : (
                  t('pos.processPayment') || 'Process Payment'
                )}
              </Button>

            </div>
          </div>
        </div>
      </div>

      <AddCustomerDialog
        isOpen={isAddCustomerOpen}
        onOpenChange={setIsAddCustomerOpen}
        onCustomerAdded={handleCustomerAdded}
      />

      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        totalAmount={total}
        onProcessPayment={handleProcessPayment}
        isProcessing={isSubmitting}
      />
    </>
  );
}
