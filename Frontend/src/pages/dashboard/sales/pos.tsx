import {
  useState, useEffect, useMemo, useCallback, memo, useRef,
} from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../../components/ui/select'
import {
  ShoppingCart, Loader2, UserPlus, Search, X, WifiOff,
  Package, Minus, Plus, Trash2,
} from 'lucide-react'
import PhoneInputWithCountryCode from '../../../components/PhoneInputWithCountryCode'
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle,
} from '../../../components/ui/drawer'
import { toast } from 'react-toastify'
import { apiClient } from '../../../lib/api-client'
import { parseInventoryGetProductsResponse } from '../../../lib/inventory-response'
import { offlineQueue } from '../../../utils/offlineQueue'
import { PaymentModal } from '../../../components/pos/PaymentModal'
import { useVsdcOnlineStatus } from '../../../hooks/useVsdcOnlineStatus'
import { useBranch } from '../../../context/BranchContext'
import { cn } from '../../../lib/utils'

// ── Types ────────────────────────────────────────────────────────────────────

interface Product {
  id: string
  name: string
  price: number
  stock: number
  quantity: number
  unitPrice?: number
  batchNumber: string
  expiryDate: string
  imageUrl?: string
  category?: string
  taxCode?: string
}

interface Customer {
  id: string
  name: string
  email?: string
  phone?: string
  type: string
}

export interface CartItem {
  product: Product
  quantity: number
  unitPrice: number
}

function productsFromInventoryResponse(res: unknown): Product[] {
  return parseInventoryGetProductsResponse(res).items as Product[]
}

// ── ProductCard ───────────────────────────────────────────────────────────────

const ProductCard = memo(({ product, onAddToCart }: { product: Product; onAddToCart: (p: Product) => void }) => {
  const isLowStock = product.quantity > 0 && product.quantity <= 5

  return (
    <button
      type="button"
      onClick={() => onAddToCart(product)}
      className={cn(
        'relative flex flex-col rounded-lg border-2 p-3 text-left transition-all duration-150',
        'bg-white dark:bg-gray-800',
        'border-gray-200 dark:border-gray-700',
        'hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
        'active:scale-[0.98]',
      )}
    >
      {/* Product image / initial */}
      <div className="w-full h-20 rounded-md flex items-center justify-center mb-2 overflow-hidden bg-gray-100 dark:bg-gray-700">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {product.name.charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      {/* Name */}
      <p className="font-semibold text-sm text-gray-900 dark:text-white line-clamp-2 leading-snug mb-1">
        {product.name}
      </p>

      {/* Price */}
      <p className="text-sm font-bold text-blue-600 dark:text-blue-400 tabular-nums">
        {(product.unitPrice ?? product.price ?? 0).toLocaleString()} RWF
      </p>

      {/* Stock */}
      <p className={cn(
        'text-[11px] mt-0.5 font-medium',
        isLowStock ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400 dark:text-gray-500',
      )}>
        {isLowStock ? `Low: ${product.quantity} left` : `${product.quantity} in stock`}
      </p>

      {/* Low stock warning dot */}
      {isLowStock && (
        <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
      )}
    </button>
  )
})

// ── CartItemRow ───────────────────────────────────────────────────────────────

const CartItemRow = memo(({
  item, onRemove, onUpdateQuantity, onUpdatePrice,
}: {
  item: CartItem
  onRemove: (id: string) => void
  onUpdateQuantity: (id: string, qty: number) => void
  onUpdatePrice: (id: string, price: number | string) => void
}) => {
  const [quantityInput, setQuantityInput] = useState(String(item.quantity))
  const [editingQty, setEditingQty] = useState(false)

  const commitQty = () => {
    const n = parseInt(quantityInput, 10)
    if (!isNaN(n) && n > 0) onUpdateQuantity(item.product.id, n)
    else setQuantityInput(String(item.quantity))
    setEditingQty(false)
  }

  const lineTotal = (item.unitPrice * item.quantity).toLocaleString()

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700">
      {/* Thumbnail */}
      <div className="h-10 w-10 rounded-md flex-shrink-0 overflow-hidden flex items-center justify-center bg-gray-200 dark:bg-gray-600">
        {item.product.imageUrl ? (
          <img src={item.product.imageUrl} alt={item.product.name} className="h-full w-full object-cover" />
        ) : (
          <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
            {item.product.name.charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.product.name}</p>

        {/* Qty controls */}
        <div className="flex items-center gap-1.5 mt-1.5">
          <button
            type="button"
            onClick={() => onUpdateQuantity(item.product.id, Math.max(1, item.quantity - 1))}
            className="h-6 w-6 rounded flex items-center justify-center bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
          >
            <Minus className="h-3 w-3" />
          </button>

          {editingQty ? (
            <input
              type="number"
              min={1}
              max={item.product.quantity}
              value={quantityInput}
              onChange={e => setQuantityInput(e.target.value)}
              onBlur={commitQty}
              onKeyDown={e => e.key === 'Enter' && commitQty()}
              className="w-12 px-1 py-0.5 text-xs border rounded text-center bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingQty(true)}
              className="w-12 px-1 py-0.5 text-xs border rounded text-center border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white hover:border-blue-400 transition-colors"
            >
              {item.quantity}
            </button>
          )}

          <button
            type="button"
            onClick={() => onUpdateQuantity(item.product.id, item.quantity + 1)}
            className="h-6 w-6 rounded flex items-center justify-center bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Price + remove */}
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <input
          type="number"
          min={0}
          value={item.unitPrice === null ? '' : item.unitPrice}
          onChange={e => {
            const v = e.target.value
            if (v === '') { onUpdatePrice(item.product.id, ''); return }
            const n = parseFloat(v)
            if (!isNaN(n) && n >= 0) onUpdatePrice(item.product.id, n)
          }}
          className="w-20 text-right text-xs border rounded px-1.5 py-0.5 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <p className="text-sm font-bold tabular-nums text-gray-900 dark:text-white">{lineTotal} RWF</p>
        <button
          type="button"
          onClick={() => onRemove(item.product.id)}
          className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
})

// ── AddCustomerDrawer ─────────────────────────────────────────────────────────

const AddCustomerDrawer = memo(({
  onCustomerAdded, isOpen, onOpenChange,
}: {
  onCustomerAdded: (c: Customer) => void
  isOpen: boolean
  onOpenChange: (v: boolean) => void
}) => {
  const { t } = useTranslation()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formData, setFormData] = useState({
    name: '', email: '', phone: '', countryCode: '+250', type: 'CASH',
  })

  const handlePhoneChange = (phone: string, countryCode: string) => {
    setFormData(prev => ({ ...prev, phone, countryCode }))
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }))
  }

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!formData.name.trim()) errs.name = t('validation.required')
    if (!formData.phone) errs.phone = t('validation.required')
    else if (formData.phone.length < 10) errs.phone = t('validation.invalidPhone')
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) errs.email = t('validation.invalidEmail')
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setIsSubmitting(true)
    try {
      const phone = formData.phone.startsWith('+') ? formData.phone : `${formData.countryCode}${formData.phone}`
      const { countryCode, ...rest } = { ...formData, phone }
      const newCustomer = await apiClient.createCustomer(rest)
      toast.success(t('messages.customerCreated'))
      onCustomerAdded(newCustomer)
      onOpenChange(false)
      setFormData({ name: '', email: '', phone: '', countryCode: '+250', type: 'CASH' })
      setErrors({})
    } catch {
      toast.error(t('messages.saveError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Drawer open={isOpen} onOpenChange={onOpenChange}>
      <DrawerContent className="sm:max-w-md">
        <DrawerHeader>
          <DrawerTitle>{t('pos.addNewCustomer')}</DrawerTitle>
        </DrawerHeader>
        <div className="space-y-4 px-4 pb-6">
          <div className="space-y-1.5">
            <Label>{t('pos.customerName')}</Label>
            <Input name="name" value={formData.name} onChange={handleChange} placeholder={t('pos.customerNamePlaceholder')} />
            {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>{t('pos.phoneNumber')}</Label>
            <PhoneInputWithCountryCode
              value={formData.phone}
              countryCode={formData.countryCode}
              onChange={handlePhoneChange}
              placeholder={t('pos.phoneNumberPlaceholder')}
              error={errors.phone || ''}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('pos.emailOptional')}</Label>
            <Input type="email" name="email" value={formData.email} onChange={handleChange} placeholder={t('pos.emailPlaceholder')} />
            {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>{t('pos.customerType')}</Label>
            <Select value={formData.type} onValueChange={v => setFormData(p => ({ ...p, type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="INSURANCE">{t('pos.insurance')}</SelectItem>
                <SelectItem value="CORPORATE">{t('pos.corporate')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">{t('common.cancel')}</Button>
            <Button onClick={handleSubmit} disabled={isSubmitting} className="flex-1 bg-blue-600 hover:bg-blue-700">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t('pos.addCustomer')}
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  )
})

// ── Main Component ────────────────────────────────────────────────────────────

export default function SalesForm() {
  const { t } = useTranslation()
  const { selectedBranchId } = useBranch()
  useVsdcOnlineStatus() // keeps VSDC status alive in context

  const [cart, setCart] = useState<CartItem[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState('')
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [isSyncing, setIsSyncing] = useState(false)
  const [displayedCount, setDisplayedCount] = useState(30)
  const LOAD_STEP = 15
  const productsRef = useRef<HTMLDivElement | null>(null)
  const isLoadingMoreRef = useRef(false)
  const customerDropdownRef = useRef<HTMLDivElement | null>(null)

  // Online / offline listeners
  useEffect(() => {
    const on = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  // Close customer dropdown on outside click
  useEffect(() => {
    if (!showCustomerDropdown) return
    const handle = (e: MouseEvent) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(e.target as Node)) {
        setShowCustomerDropdown(false)
        setCustomerSearch('')
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [showCustomerDropdown])

  const fetchRecentSales = useCallback(async () => {
    try {
      await apiClient.getSales({ page: 1, limit: 10, search: '', branchId: selectedBranchId })
    } catch { /* silent */ }
  }, [selectedBranchId])

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true)
      if (!isOnline) {
        setProducts(offlineQueue.getProducts())
        setCustomers(offlineQueue.getCustomers())
        return
      }
      const [productsData, customersData] = await Promise.all([
        apiClient.getProducts({ page: 1, limit: 10000, search: '', branchId: selectedBranchId }),
        apiClient.getCustomers({ page: 1, limit: 100, search: '' }),
      ])
      const all = productsFromInventoryResponse(productsData).filter((p: Product) => p.quantity > 0)
      setProducts(all)
      setDisplayedCount(30)
      const allCustomers = customersData.customers || []
      setCustomers(allCustomers)
      offlineQueue.saveProducts(all)
      offlineQueue.saveCustomers(allCustomers)
      if (allCustomers.length > 0) setSelectedCustomer(allCustomers[0].id)
    } catch {
      toast.error(t('pos.loadError'))
      setProducts(offlineQueue.getProducts())
      setCustomers(offlineQueue.getCustomers())
    } finally {
      setIsLoading(false)
    }
  }, [isOnline, selectedBranchId, t])

  useEffect(() => { fetchData(); fetchRecentSales() }, [fetchData, fetchRecentSales])

  // Offline sync
  useEffect(() => {
    if (!isOnline || !offlineQueue.hasItems() || isSyncing) return
    const sync = async () => {
      setIsSyncing(true)
      const queue = offlineQueue.getQueue()
      toast.info(t('pos.syncingSales', { count: queue.length }) || `Syncing ${queue.length} offline sales…`)
      for (const item of queue) {
        try { await apiClient.createSale(item.payload); offlineQueue.dequeue(item.id) }
        catch { /* keep item in queue */ }
      }
      setIsSyncing(false)
      if (!offlineQueue.hasItems()) { toast.success(t('pos.syncComplete') || 'Offline sales synchronized.'); fetchRecentSales() }
    }
    sync()
  }, [isOnline, isSyncing, t, fetchRecentSales])

  // Product search with debounce
  useEffect(() => {
    if (!searchTerm) {
      fetchData()
      return
    }
    const id = setTimeout(async () => {
      try {
        setIsLoading(true)
        if (!isOnline) {
          const cached = offlineQueue.getProducts()
          setProducts(cached.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase())))
          return
        }
        const res = await apiClient.getProducts({ page: 1, limit: 10000, search: searchTerm, branchId: selectedBranchId })
        setProducts(productsFromInventoryResponse(res).filter((p: Product) => p.quantity > 0))
        setDisplayedCount(30)
      } catch { toast.error(t('pos.searchError')) }
      finally { setIsLoading(false) }
    }, 400)
    return () => clearTimeout(id)
  }, [searchTerm, selectedBranchId, isOnline])  // eslint-disable-line react-hooks/exhaustive-deps

  // Infinite scroll
  useEffect(() => {
    const el = productsRef.current
    if (!el) return
    const inStock = products.filter(p => p.quantity > 0)
    const onScroll = () => {
      if (isLoadingMoreRef.current || displayedCount >= inStock.length) return
      const { scrollTop, scrollHeight, clientHeight } = el
      if (scrollHeight - scrollTop - clientHeight < 300) {
        isLoadingMoreRef.current = true
        setDisplayedCount(prev => {
          const next = Math.min(prev + LOAD_STEP, inStock.length)
          setTimeout(() => { isLoadingMoreRef.current = false }, 300)
          return next
        })
      }
    }
    let ticking = false
    const throttled = () => {
      if (!ticking) { requestAnimationFrame(() => { onScroll(); ticking = false }); ticking = true }
    }
    el.addEventListener('scroll', throttled, { passive: true })
    const check = setTimeout(onScroll, 100)
    return () => { clearTimeout(check); el.removeEventListener('scroll', throttled) }
  }, [products, displayedCount])

  // Cart helpers
  const addToCart = useCallback((product: Product) => {
    if (!product.quantity || product.quantity < 1) { toast.error(t('pos.outOfStock')); return }
    setCart(prev => {
      const ex = prev.find(i => i.product.id === product.id)
      if (ex) {
        const nq = ex.quantity + 1
        if (nq > product.quantity) { toast.error(t('pos.lowStockWarning', { count: product.quantity })); return prev }
        return prev.map(i => i.product.id === product.id ? { ...i, quantity: nq } : i)
      }
      return [...prev, { product, quantity: 1, unitPrice: product.unitPrice ?? product.price ?? 0 }]
    })
    toast.success(t('messages.productAdded'))
  }, [t])

  const removeFromCart = useCallback((id: string) => {
    setCart(prev => prev.filter(i => i.product.id !== id))
  }, [])

  const updateQuantity = useCallback((id: string, qty: number) => {
    if (qty < 1) return
    setCart(prev => prev.map(i => {
      if (i.product.id !== id) return i
      if (qty > i.product.quantity) { toast.error(t('pos.lowStockWarning', { count: i.product.quantity })); return i }
      return { ...i, quantity: qty }
    }))
  }, [t])

  const updatePrice = useCallback((id: string, price: number | string) => {
    setCart(prev => prev.map(i => i.product.id === id ? { ...i, unitPrice: price as number } : i))
  }, [])

  const handleCustomerAdded = useCallback((c: Customer) => {
    setCustomers(prev => [...prev, c])
    setSelectedCustomer(c.id)
  }, [])

  const subtotal = useMemo(() => cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0), [cart])
  const total = subtotal

  const selectedCustomerObj = useMemo(
    () => customers.find(c => c.id === selectedCustomer),
    [customers, selectedCustomer],
  )

  const filteredCustomers = useMemo(
    () => customers.filter(c =>
      customerSearch
        ? c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
          c.phone?.includes(customerSearch)
        : true
    ),
    [customers, customerSearch],
  )

  const inStockProducts = useMemo(() => products.filter(p => p.quantity > 0), [products])

  const handleOpenPayment = useCallback(() => {
    if (cart.length === 0) { toast.error(t('pos.noItemsInCart')); return }
    if (!selectedCustomer) { toast.error(t('pos.selectCustomer')); return }
    setIsPaymentModalOpen(true)
  }, [cart, selectedCustomer, t])

  const handleProcessPayment = useCallback(async (
    entries: Array<{ id: string; method: string; amount: number; reference?: string }>,
  ) => {
    try {
      setIsSubmitting(true)
      let cashAmount = 0, insuranceAmount = 0, debtAmount = 0
      entries.forEach(p => {
        if (p.method === 'CASH' || p.method === 'MOBILE_MONEY' || p.method === 'CREDIT_CARD') cashAmount += p.amount
        else if (p.method === 'INSURANCE') insuranceAmount += p.amount
        else if (p.method === 'DEBT') debtAmount += p.amount
      })
      const totalPaid = entries.reduce((s, p) => s + p.amount, 0)
      const remainingDebt = Math.max(0, total - totalPaid)
      if (remainingDebt > 0) debtAmount += remainingDebt

      const activeMethods = [...new Set(entries.filter(p => p.amount > 0).map(p => p.method))]
      let paymentType: string = 'CASH'
      if (activeMethods.length > 1 || (activeMethods.length === 1 && remainingDebt > 0 && activeMethods[0] !== 'DEBT')) {
        paymentType = 'MIXED'
      } else if (activeMethods.length === 1) {
        paymentType = activeMethods[0]
      } else if (debtAmount > 0) {
        paymentType = 'DEBT'
      }

      const payload = {
        customerId: selectedCustomer,
        items: cart.map(i => ({ productId: i.product.id, quantity: i.quantity, unitPrice: i.unitPrice })),
        paymentType,
        cashAmount,
        insuranceAmount,
        debtAmount,
        branchId: selectedBranchId,
      }

      if (!isOnline) {
        offlineQueue.enqueue(payload)
        toast.warning(t('pos.offlineQueued') || 'Sale queued — will sync when online.')
        setCart([])
        setIsPaymentModalOpen(false)
        return
      }

      await apiClient.createSale(payload)
      await fetchRecentSales()

      if (remainingDebt > 0) {
        toast.success(t('pos.paymentDebtSuccess', { paid: totalPaid, debt: remainingDebt }))
      } else {
        toast.success(t('pos.paymentSuccess'))
      }

      setCart([])
      setIsPaymentModalOpen(false)

      const res = await apiClient.getProducts({ page: 1, limit: 10000, search: '', branchId: selectedBranchId })
      setProducts(productsFromInventoryResponse(res).filter((p: Product) => p.quantity > 0))
    } catch (error: any) {
      const msg = error?.response?.data?.error || error?.response?.data?.message || error?.message || t('pos.paymentError')
      toast.error(msg)
      if (msg.includes('stock')) {
        try {
          const res = await apiClient.getProducts({ page: 1, limit: 10000, search: '', branchId: selectedBranchId })
          setProducts(productsFromInventoryResponse(res).filter((p: Product) => p.quantity > 0))
        } catch { /* silent */ }
      }
    } finally {
      setIsSubmitting(false)
    }
  }, [cart, selectedCustomer, total, t, fetchRecentSales, isOnline, selectedBranchId])

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Offline banner */}
      {!isOnline && (
        <div className="fixed top-14 inset-x-0 z-40 flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-sm font-medium text-white">
          <WifiOff className="h-4 w-4 flex-shrink-0" />
          {t('pos.offlineMode') || 'You are offline. Sales will be queued and synced when connection is restored.'}
        </div>
      )}

      {/* Full-height POS shell — sits inside the DashboardLayout main scroll area */}
      <div className="flex h-[calc(100vh-56px)] -mt-6 -mx-4 sm:-mx-6 lg:-mx-8 overflow-hidden bg-gray-50 dark:bg-gray-900">

        {/* ── LEFT: product browser ───────────────────────────────────────── */}
        <div className="flex flex-1 flex-col min-w-0 border-r border-gray-200 dark:border-gray-700">

          {/* Search bar */}
          <div className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder={t('pos.searchPlaceholder') || 'Search products…'}
                className="pl-9 pr-8 h-9 bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums whitespace-nowrap">
              {inStockProducts.length} items
            </span>
          </div>

          {/* Product grid */}
          <div ref={productsRef} className="flex-1 overflow-y-auto p-4">
            {isLoading ? (
              <div className="flex h-48 items-center justify-center">
                <Loader2 className="h-7 w-7 animate-spin text-blue-500" />
              </div>
            ) : inStockProducts.length === 0 ? (
              <div className="flex flex-col h-48 items-center justify-center text-gray-400 dark:text-gray-500 gap-2">
                <Package className="h-10 w-10" />
                <p className="text-sm">{t('pos.noProductsFound')}</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
                  {inStockProducts.slice(0, displayedCount).map(p => (
                    <ProductCard key={p.id} product={p} onAddToCart={addToCart} />
                  ))}
                </div>
                {inStockProducts.length > displayedCount && (
                  <p className="mt-4 text-center text-xs text-gray-400 dark:text-gray-500">
                    Showing {displayedCount} of {inStockProducts.length} — scroll to load more
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── RIGHT: cart & checkout ──────────────────────────────────────── */}
        <div className="w-[340px] xl:w-[380px] flex flex-col flex-shrink-0 bg-white dark:bg-gray-800">

          {/* Cart header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                {t('pos.currentOrder') || 'Order'}
              </h2>
              {cart.length > 0 && (
                <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-blue-600 text-white text-[10px] font-bold">
                  {cart.length}
                </span>
              )}
            </div>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={() => setCart([])}
                className="text-xs text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          {/* Customer selector */}
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-xs font-medium text-gray-600 dark:text-gray-300">
                {t('pos.customer')}
              </Label>
              <button
                type="button"
                onClick={() => setIsAddCustomerOpen(true)}
                className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                <UserPlus className="h-3 w-3" />
                {t('pos.addNew')}
              </button>
            </div>

            <div ref={customerDropdownRef} className="relative">
              <button
                type="button"
                onClick={() => setShowCustomerDropdown(prev => !prev)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-sm text-left transition-colors',
                  'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600',
                  'hover:border-blue-400 dark:hover:border-blue-500',
                  showCustomerDropdown && 'border-blue-500 ring-1 ring-blue-500/30',
                )}
              >
                <Search className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                <span className={cn('flex-1 truncate', selectedCustomerObj ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500')}>
                  {selectedCustomerObj ? selectedCustomerObj.name : t('pos.selectCustomer') || 'Select customer…'}
                </span>
              </button>

              {showCustomerDropdown && (
                <div className="absolute top-full mt-1 inset-x-0 z-50 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-dropdown">
                  <div className="p-2 border-b border-gray-100 dark:border-gray-700">
                    <Input
                      value={customerSearch}
                      onChange={e => setCustomerSearch(e.target.value)}
                      placeholder="Search by name or phone…"
                      className="h-8 text-xs"
                      autoFocus
                    />
                  </div>
                  <ul className="max-h-48 overflow-y-auto py-1">
                    {filteredCustomers.length === 0 ? (
                      <li className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">No customers found</li>
                    ) : filteredCustomers.map(c => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => { setSelectedCustomer(c.id); setShowCustomerDropdown(false); setCustomerSearch('') }}
                          className={cn(
                            'w-full px-3 py-2 text-xs text-left transition-colors',
                            'hover:bg-gray-50 dark:hover:bg-gray-700',
                            c.id === selectedCustomer && 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium',
                          )}
                        >
                          <span className="block font-medium text-gray-900 dark:text-white">{c.name}</span>
                          {c.phone && <span className="text-gray-500 dark:text-gray-400">{c.phone}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-gray-300 dark:text-gray-600 gap-2">
                <ShoppingCart className="h-10 w-10" />
                <p className="text-xs">Cart is empty — click a product to add</p>
              </div>
            ) : cart.map(item => (
              <CartItemRow
                key={item.product.id}
                item={item}
                onRemove={removeFromCart}
                onUpdateQuantity={updateQuantity}
                onUpdatePrice={updatePrice}
              />
            ))}
          </div>

          {/* Order totals + checkout */}
          <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-4 space-y-3 flex-shrink-0 bg-white dark:bg-gray-800">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">Subtotal</span>
              <span className="font-medium tabular-nums text-gray-900 dark:text-white">
                {subtotal.toLocaleString()} RWF
              </span>
            </div>
            <div className="flex items-center justify-between text-base font-bold border-t border-gray-100 dark:border-gray-700 pt-2">
              <span className="text-gray-900 dark:text-white">Total</span>
              <span className="text-blue-600 dark:text-blue-400 tabular-nums text-lg">
                {total.toLocaleString()} RWF
              </span>
            </div>

            <Button
              onClick={handleOpenPayment}
              disabled={cart.length === 0 || !selectedCustomer || isSubmitting}
              className="w-full h-11 text-sm font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Processing…</>
              ) : (
                <>{t('pos.processPayment') || 'Charge'} {total > 0 && `· ${total.toLocaleString()} RWF`}</>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Modals */}
      <AddCustomerDrawer
        isOpen={isAddCustomerOpen}
        onOpenChange={setIsAddCustomerOpen}
        onCustomerAdded={handleCustomerAdded}
      />

      {isPaymentModalOpen && (
        <PaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          totalAmount={total}
          onProcessPayment={handleProcessPayment}
        />
      )}
    </>
  )
}
