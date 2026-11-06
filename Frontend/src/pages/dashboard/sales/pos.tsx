import {
  useState, useEffect, useMemo, useCallback, memo, useRef,
} from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../../components/ui/select'
import {
  ShoppingCart, Loader2, UserPlus, Search, X, WifiOff,
  Package, Minus, Plus, Trash2, Star,
  ChevronRight, FileText, User,
} from 'lucide-react'
import PhoneInputWithCountryCode from '../../../components/PhoneInputWithCountryCode'
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle,
} from '../../../components/ui/drawer'
import { toast } from 'react-toastify'
import { toastError } from "../../../lib/friendly-error";
import { apiClient } from '../../../lib/api-client'
import { parseInventoryGetProductsResponse } from '../../../lib/inventory-response'
import { offlineQueue } from '../../../utils/offlineQueue'
import { PaymentModal } from '../../../components/pos/PaymentModal'
import SaleSuccessModal, { type SaleSuccessData } from '../../../components/pos/SaleSuccessModal'
import { getInvoiceFilename, round2, unwrapInvoice } from '../../../lib/invoice'
import { issueInvoicePdfBlob } from '../../../lib/invoice-pdf'
import { useVsdcOnlineStatus } from '../../../hooks/useVsdcOnlineStatus'
import { useBranch } from '../../../context/BranchContext'
import { useOrganizationSettings } from '../../../context/OrganizationSettingsContext'
import { useAuth } from '../../../context/AuthContext'
import { cn } from '../../../lib/utils'
import { PACKAGING_UNIT_LABELS } from '../../../types/ebm'
import { useRraCodeCatalog } from '../../../lib/useRraCodeCatalog'

// ── Types ────────────────────────────────────────────────────────────────────

interface Product {
  id: string
  name: string
  price: number
  stock: number
  quantity: number
  unitPrice?: number
  discountPercent?: number
  batchNumber: string
  expiryDate: string
  imageUrl?: string
  category?: string
  taxCode?: string
  itemType?: 'PRODUCT' | 'RAW_MATERIAL' | 'SERVICE'
  barcode?: string
  sku?: string
  pkgUnitCd?: string
  packagingQty?: number
}

const isSellable = (p: Product, trainingMode = false) =>
  p.itemType === 'SERVICE' || p.quantity > 0 || trainingMode

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

const DISCOUNT_LIMIT_EXEMPT_ROLES = ['SYSTEM_OWNER', 'ADMIN', 'BRANCH_MANAGER']

function listUnitPrice(item: CartItem): number {
  return Number(item.product.unitPrice ?? item.product.price ?? item.unitPrice)
}

/** The price a product starts at in the cart: its list price less any saved item discount. */
function discountedPrice(product: Product): number {
  return round2(Number(product.unitPrice ?? product.price ?? 0) * (1 - Number(product.discountPercent ?? 0) / 100))
}

/** The line's discount as RRA reports it (dcRt): the gap between list and charged price. */
function lineDiscountPercent(item: CartItem): number {
  const list = listUnitPrice(item)
  const charged = Number(item.unitPrice)
  if (!(list > 0) || !(charged < list)) return 0
  return Math.round(((list - charged) / list) * 10000) / 100
}

function productsFromInventoryResponse(res: unknown): Product[] {
  // Backend Decimal(15,3) quantities serialize as strings — normalize to
  // numbers once here so every comparison and cart computation below is safe.
  return parseInventoryGetProductsResponse(res).items.map((raw) => {
    const p = raw as Record<string, unknown>
    return {
      ...(p as object),
      price: Number(p.price ?? p.unitPrice ?? 0),
      stock: Number(p.stock ?? p.quantity ?? 0),
      quantity: Number(p.quantity ?? 0),
      unitPrice: p.unitPrice != null ? Number(p.unitPrice) : undefined,
      discountPercent: Number(p.discountPercent ?? 0),
    } as Product
  })
}

// ── ProductCard ───────────────────────────────────────────────────────────────

const ProductCard = memo(({
  product, onAddToCart, isFavorite, onToggleFavorite, allowZeroStock = false, cartQty = 0,
}: {
  product: Product
  onAddToCart: (p: Product) => void
  isFavorite: boolean
  onToggleFavorite: (id: string) => void
  allowZeroStock?: boolean
  /** Quantity of this product already in the cart; > 0 highlights the card. */
  cartQty?: number
}) => {
  const inCart = cartQty > 0
  // Weighed goods can be fractional (e.g. 1.5 kg); keep the badge short.
  const qtyLabel = cartQty > 99 ? '99+' : String(Math.round(cartQty * 1000) / 1000)
  const isService = product.itemType === 'SERVICE'
  const isLowStock = !isService && product.quantity > 0 && product.quantity <= 5
  const isOutOfStock = !isService && product.quantity <= 0
  const canAdd = !isOutOfStock || allowZeroStock

  return (
    <div className={cn(
      'group relative flex flex-col overflow-hidden rounded-xl border bg-card shadow-card transition-all duration-150',
      inCart ? 'border-primary ring-2 ring-primary/30' : 'border-border/80',
      canAdd ? cn('hover:-translate-y-0.5 hover:shadow-dropdown', !inCart && 'hover:border-primary/40') : 'opacity-60',
    )}>
      {/* Selected quantity */}
      {inCart && (
        <span
          className="num absolute right-2 top-2 z-20 flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground shadow-md ring-2 ring-card animate-in zoom-in-50 duration-150"
          aria-label={`${qtyLabel} in cart`}
        >
          {qtyLabel}
        </span>
      )}
      {/* Favorite button */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleFavorite(product.id) }}
        className={cn(
          'absolute top-2 z-10 rounded-full bg-card/90 p-1 text-muted-foreground/50 shadow-sm backdrop-blur-sm transition-all hover:text-amber-400',
          inCart ? 'right-10' : 'right-2',
          !isFavorite && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
        )}
      >
        <Star className={cn('h-3.5 w-3.5', isFavorite && 'text-amber-400 fill-amber-400')} />
      </button>

      {/* Image / Initial */}
      <button
        type="button"
        onClick={() => canAdd && onAddToCart(product)}
        disabled={!canAdd}
        className={cn(
          'relative flex h-24 w-full flex-shrink-0 items-center justify-center overflow-hidden disabled:cursor-not-allowed',
          inCart ? 'bg-primary/10' : 'bg-surface-subtle',
        )}
      >
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
        ) : (
          <span className="text-3xl font-semibold text-primary/30">
            {product.name.charAt(0).toUpperCase()}
          </span>
        )}
        {/* Stock state as a corner pill so it reads before the name */}
        <span className={cn(
          'num absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[10px] font-semibold backdrop-blur-sm',
          isService ? 'bg-card/90 text-muted-foreground'
            : isOutOfStock ? (allowZeroStock ? 'bg-warning/15 text-warning' : 'bg-danger/15 text-danger')
            : isLowStock ? 'bg-warning/15 text-warning'
            : 'bg-card/90 text-success',
        )}>
          {isService ? 'Service' : isOutOfStock ? (allowZeroStock ? `${product.quantity} in stock` : 'Out of stock') : isLowStock ? `Low · ${product.quantity}` : `${product.quantity} in stock`}
        </span>
        {canAdd && (
          <span className="absolute bottom-2 right-2 flex h-7 w-7 translate-y-1 items-center justify-center rounded-full bg-primary text-primary-foreground opacity-0 shadow-md transition-all group-hover:translate-y-0 group-hover:opacity-100">
            <Plus className="h-4 w-4" />
          </span>
        )}
      </button>

      {/* Content */}
      <button
        type="button"
        onClick={() => canAdd && onAddToCart(product)}
        disabled={!canAdd}
        className="flex flex-col flex-1 p-3 text-left disabled:cursor-not-allowed"
      >
        <p className="mb-2 line-clamp-2 flex-1 text-[0.8125rem] font-medium leading-snug text-foreground">
          {product.name}
        </p>
        {product.pkgUnitCd && (
          <p className="mb-0.5 text-[10px] text-muted-foreground">
            {PACKAGING_UNIT_LABELS[product.pkgUnitCd] || product.pkgUnitCd}
            {product.packagingQty ? ` × ${product.packagingQty}` : ''}
          </p>
        )}
        <p className="num text-sm font-semibold text-foreground">
          {discountedPrice(product).toLocaleString()} <span className="text-[11px] font-normal text-muted-foreground">RWF</span>
        </p>
        {Number(product.discountPercent) > 0 && (
          <p className="num text-[11px] text-muted-foreground">
            <s>{(product.unitPrice ?? product.price ?? 0).toLocaleString()}</s> -{Number(product.discountPercent)}%
          </p>
        )}
      </button>
    </div>
  )
})

// ── CartItemRow ───────────────────────────────────────────────────────────────

const CartItemRow = memo(({
  item, onRemove, onUpdateQuantity, onUpdatePrice, onUpdateDiscount, priceEditable = true, vatRegistered = true,
}: {
  item: CartItem
  onRemove: (id: string) => void
  onUpdateQuantity: (id: string, qty: number) => void
  onUpdatePrice: (id: string, price: number | string) => void
  onUpdateDiscount: (id: string, percent: number) => void
  priceEditable?: boolean
  vatRegistered?: boolean
}) => {
  const [quantityInput, setQuantityInput] = useState(String(item.quantity))
  const [editingQty, setEditingQty] = useState(false)

  const commitQty = () => {
    // Fractional quantities allowed (weighed goods: kg, litres…).
    const n = Number(quantityInput)
    if (Number.isFinite(n) && n > 0) onUpdateQuantity(item.product.id, Math.round(n * 1000) / 1000)
    else setQuantityInput(String(item.quantity))
    setEditingQty(false)
  }

  const lineTotal = (item.unitPrice * item.quantity).toLocaleString()
  const listPrice = listUnitPrice(item)
  const discountPercent = lineDiscountPercent(item)
  const [discountDraft, setDiscountDraft] = useState<string | null>(null)

  const commitDiscount = () => {
    if (discountDraft === null) return
    const n = discountDraft.trim() === '' ? 0 : Number(discountDraft)
    if (Number.isFinite(n) && n >= 0 && n < 100) onUpdateDiscount(item.product.id, n)
    setDiscountDraft(null)
  }
  const effectiveTaxCode = vatRegistered ? (item.product.taxCode || '—') : 'D'

  return (
    <div className="flex items-center gap-3 border-b border-border/60 py-3 last:border-b-0">
      {/* Thumbnail */}
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-subtle">
        {item.product.imageUrl ? (
          <img src={item.product.imageUrl} alt={item.product.name} className="h-full w-full object-cover" />
        ) : (
          <span className="text-sm font-semibold text-primary/40">
            {item.product.name.charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      {/* Name + Price */}
      <div className="flex-1 min-w-0">
        <p className="truncate text-[0.8125rem] font-medium text-foreground">{item.product.name}</p>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span
            className={cn(
              'rounded px-1 text-[10px] font-semibold leading-4',
              effectiveTaxCode === 'B' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
            )}
            title="Tax code"
          >
            {effectiveTaxCode}
          </span>
          <span className="num text-xs text-muted-foreground">{item.unitPrice.toLocaleString()} each</span>
        </div>
        {priceEditable && (
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <label className="flex items-center gap-1 whitespace-nowrap text-[11px] text-muted-foreground">
              <input
                type="number"
                min={0}
                max={99.99}
                step="any"
                value={discountDraft ?? (discountPercent > 0 ? discountPercent : '')}
                onChange={e => setDiscountDraft(e.target.value)}
                onBlur={commitDiscount}
                onKeyDown={e => e.key === 'Enter' && commitDiscount()}
                placeholder="0"
                aria-label={`Discount percent for ${item.product.name}`}
                className="num w-14 rounded-md border border-input bg-background px-1 py-0.5 text-right text-[11px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
              % off
            </label>
            {discountPercent > 0 && (
              <span className="num whitespace-nowrap text-[11px] text-muted-foreground">
                was <s>{listPrice.toLocaleString()}</s>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Qty Controls */}
      <div className="flex flex-shrink-0 items-center overflow-hidden rounded-lg border border-border">
        <button
          type="button"
          onClick={() => onUpdateQuantity(item.product.id, Math.max(1, item.quantity - 1))}
          className="flex h-7 w-7 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Minus className="h-3 w-3" />
        </button>

        {editingQty ? (
          <input
            type="number"
            min={1}
            max={item.product.itemType === 'SERVICE' ? undefined : item.product.quantity}
            value={quantityInput}
            onChange={e => setQuantityInput(e.target.value)}
            onBlur={commitQty}
            onKeyDown={e => e.key === 'Enter' && commitQty()}
            className="num h-7 w-10 border-x border-border bg-background px-1 text-center text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ring/50"
            autoFocus
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingQty(true)}
            className="num h-7 w-10 border-x border-border text-center text-xs font-semibold text-foreground transition-colors hover:bg-muted"
            title="Edit quantity"
          >
            {item.quantity}
          </button>
        )}

        <button
          type="button"
          onClick={() => onUpdateQuantity(item.product.id, item.quantity + 1)}
          className="flex h-7 w-7 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      {/* Line total + remove */}
      <div className="flex min-w-[64px] flex-shrink-0 flex-col items-end gap-1">
        {priceEditable ? (
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
            className="num w-[4.5rem] rounded-md border border-input bg-background px-1.5 py-0.5 text-right text-[11px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
            title="Unit price"
          />
        ) : (
          <p className="num text-[0.8125rem] font-semibold text-foreground">{lineTotal}</p>
        )}
        <button
          type="button"
          onClick={() => onRemove(item.product.id)}
          className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:bg-danger/10 hover:text-danger"
          aria-label="Remove item"
        >
          <X className="h-3.5 w-3.5" />
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
    name: '', email: '', phone: '', countryCode: '+250', type: 'INDIVIDUAL', tin: '',
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
    if (formData.phone && formData.phone.length < 10) errs.phone = t('validation.invalidPhone')
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) errs.email = t('validation.invalidEmail')
    const tinDigits = formData.tin.trim()
    if (formData.type !== 'INDIVIDUAL' && !/^\d{9}$/.test(tinDigits)) {
      errs.tin = 'TIN is required for corporate and insurance customers'
    } else if (tinDigits && !/^\d{9}$/.test(tinDigits)) {
      // Individuals may also hold a real RRA TIN — optional, but when given
      // it must be a valid 9-digit TIN (it is sent to RRA on the receipt).
      errs.tin = 'TIN must be exactly 9 digits'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setIsSubmitting(true)
    try {
      const phone = formData.phone
        ? (formData.phone.startsWith('+') ? formData.phone : `${formData.countryCode}${formData.phone}`)
        : undefined
      const { countryCode, ...rest } = { ...formData, phone }
      // A TIN may be stored for every customer type (blank stays blank).
      const tin = formData.tin.trim() || undefined
      const newCustomer = await apiClient.createCustomer({ ...rest, tin })
      toast.success(t('messages.customerCreated'))
      onCustomerAdded(newCustomer)
      onOpenChange(false)
      setFormData({ name: '', email: '', phone: '', countryCode: '+250', type: 'INDIVIDUAL', tin: '' })
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
            <Label>{t('pos.customerName')} *</Label>
            <Input name="name" value={formData.name} onChange={handleChange} placeholder={t('pos.customerNamePlaceholder')} />
            {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>{t('pos.phoneNumber')} <span className="text-gray-400 font-normal text-xs">({t('common.optional') || 'optional'})</span></Label>
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
                <SelectItem value="INDIVIDUAL">{t('customers.individual')}</SelectItem>
                <SelectItem value="CORPORATE">{t('pos.corporate')}</SelectItem>
                <SelectItem value="INSURANCE">{t('pos.insurance')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>
              {t('customers.tinNumber')}{' '}
              {formData.type !== 'INDIVIDUAL'
                ? <span className="text-red-500">*</span>
                : <span className="text-gray-400 font-normal text-xs">({t('common.optional') || 'optional'})</span>}
            </Label>
            <Input
              name="tin"
              value={formData.tin}
              onChange={e => setFormData(p => ({ ...p, tin: e.target.value.replace(/\D/g, '').slice(0, 9) }))}
              placeholder="e.g. 123456789"
              maxLength={9}
              inputMode="numeric"
            />
            {errors.tin && <p className="text-xs text-red-500">{errors.tin}</p>}
            {formData.type === 'INDIVIDUAL' && !errors.tin && (
              <p className="text-xs text-gray-500">Optional — sent to RRA on the receipt when the individual has a real TIN.</p>
            )}
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

const CATEGORIES = ['All', 'Medicines', 'Health & Care', 'Baby Care', 'Vitamins', 'Medical Devices', 'Supplements']

export default function SalesForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { selectedBranchId } = useBranch()
  const { settings: orgSettings } = useOrganizationSettings()
  const { user } = useAuth()
  const [cartDiscountInput, setCartDiscountInput] = useState('')
  const { catalog } = useRraCodeCatalog()
  const { trainingMode } = useVsdcOnlineStatus()

  const [cart, setCart] = useState<CartItem[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState('')
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false)
  // Below lg the order panel is a bottom sheet; this controls whether it is raised.
  const [isCartSheetOpen, setIsCartSheetOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
  const [isSuccessOpen, setIsSuccessOpen] = useState(false)
  const [successSale, setSuccessSale] = useState<SaleSuccessData | null>(null)
  const [lastCreatedSale, setLastCreatedSale] = useState<any>(null)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [isSyncing, setIsSyncing] = useState(false)
  const [displayedCount, setDisplayedCount] = useState(30)
  const [activeCategory, setActiveCategory] = useState('All')
  const [productTypeFilter, setProductTypeFilter] = useState<'ALL' | 'PRODUCT' | 'SERVICE'>('ALL')
  const [favorites, setFavorites] = useState<Set<string>>(new Set())

  const LOAD_STEP = 15
  const productsRef = useRef<HTMLDivElement | null>(null)
  const isLoadingMoreRef = useRef(false)
  const customerDropdownRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  // Online / offline listeners
  useEffect(() => {
    const on = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  // CIS §7.28 — after power/paper recovery, offer to reprint the last finalized receipt.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const flag = sessionStorage.getItem('pos-recovery-checked')
        if (flag === '1') return
        sessionStorage.setItem('pos-recovery-checked', '1')
        const res = await apiClient.getLastReceipt()
        const sale = (res as any)?.data?.sale ?? (res as any)?.sale
        if (cancelled || !sale?.id) return
        toast.info(
          `Last receipt ${sale.saleNumber} available for recovery reprint`,
          {
            autoClose: 12_000,
            onClick: async () => {
              try {
                // Printing from the modal registers the issuance itself, so a
                // receipt already issued comes back as its CS/CR copy.
                setSuccessSale({
                  id: sale.id,
                  invoiceNumber: sale.invoiceNumber,
                  receiptNumber: sale.saleNumber,
                  totalAmount: Number(sale.totalAmount),
                  fiscalizationStatus: 'success',
                })
                setIsSuccessOpen(true)
              } catch (e: any) {
                toastError(e, "Could not reprint last receipt")
              }
            },
          },
        )
      } catch {
        /* no recoverable receipt — ignore */
      }
    })()
    return () => { cancelled = true }
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
      const all = productsFromInventoryResponse(productsData).filter(p => isSellable(p, trainingMode))
      setProducts(all)
      setDisplayedCount(30)
      const allCustomers = customersData.customers || []
      setCustomers(allCustomers)
      offlineQueue.saveCustomers(allCustomers)
      if (allCustomers.length > 0) {
        setSelectedCustomer(allCustomers[0].id)
      } else {
        try {
          const walkIn = await apiClient.createCustomer({ name: 'Walk-in Customer', type: 'INDIVIDUAL', balance: 0 })
          setCustomers([walkIn])
          offlineQueue.saveCustomers([walkIn])
          setSelectedCustomer(walkIn.id)
        } catch {}
      }
    } catch {
      toast.error(t('pos.loadError'))
      setProducts(offlineQueue.getProducts())
      setCustomers(offlineQueue.getCustomers())
    } finally {
      setIsLoading(false)
    }
  }, [isOnline, selectedBranchId, t, trainingMode])

  useEffect(() => { fetchData() }, [fetchData])

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
      if (!offlineQueue.hasItems()) { toast.success(t('pos.syncComplete') || 'Offline sales synchronized.') }
    }
    sync()
  }, [isOnline, isSyncing, t])

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
          const term = searchTerm.toLowerCase()
          setProducts(cached.filter(p =>
            p.name.toLowerCase().includes(term)
            || p.barcode?.toLowerCase().includes(term)
            || p.sku?.toLowerCase().includes(term)
          ))
          return
        }
        const res = await apiClient.getProducts({ page: 1, limit: 10000, search: searchTerm, branchId: selectedBranchId })
        setProducts(productsFromInventoryResponse(res).filter(p => isSellable(p, trainingMode)))
        setDisplayedCount(30)
      } catch { toast.error(t('pos.searchError')) }
      finally { setIsLoading(false) }
    }, 400)
    return () => clearTimeout(id)
  }, [searchTerm, selectedBranchId, isOnline, trainingMode])  // eslint-disable-line react-hooks/exhaustive-deps

  // Infinite scroll
  useEffect(() => {
    const el = productsRef.current
    if (!el) return
    const inStock = products.filter(p => isSellable(p, trainingMode))
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
  }, [products, displayedCount, trainingMode])

  // Cart helpers
  const addToCart = useCallback((product: Product) => {
    const isService = product.itemType === 'SERVICE'
    const allowNegativeStock = isService || trainingMode || orgSettings.featureFlags.allowNegativeStock
    if (!allowNegativeStock && (!product.quantity || product.quantity < 1)) { toast.error(t('pos.outOfStock')); return }
    setCart(prev => {
      const ex = prev.find(i => i.product.id === product.id)
      if (ex) {
        const nq = ex.quantity + 1
        if (!allowNegativeStock && nq > product.quantity) { toast.error(t('pos.lowStockWarning', { count: product.quantity })); return prev }
        return prev.map(i => i.product.id === product.id ? { ...i, quantity: nq } : i)
      }
      return [...prev, { product, quantity: 1, unitPrice: discountedPrice(product) }]
    })
    toast.success(t('messages.productAdded'))
  }, [t, orgSettings.featureFlags.allowNegativeStock, trainingMode])

  const removeFromCart = useCallback((id: string) => {
    setCart(prev => prev.filter(i => i.product.id !== id))
  }, [])

  const updateQuantity = useCallback((id: string, qty: number) => {
    if (qty < 1) return
    setCart(prev => prev.map(i => {
      if (i.product.id !== id) return i
      const isService = i.product.itemType === 'SERVICE'
      if (!isService && !trainingMode && !orgSettings.featureFlags.allowNegativeStock && qty > i.product.quantity) {
        toast.error(t('pos.lowStockWarning', { count: i.product.quantity })); return i
      }
      return { ...i, quantity: qty }
    }))
  }, [t, orgSettings.featureFlags.allowNegativeStock, trainingMode])

  const updatePrice = useCallback((id: string, price: number | string) => {
    if (!orgSettings.featureFlags.allowManualDiscounts) return
    setCart(prev => prev.map(i => i.product.id === id ? { ...i, unitPrice: price as number } : i))
  }, [orgSettings.featureFlags.allowManualDiscounts])

  const updateDiscount = useCallback((id: string, percent: number) => {
    if (!orgSettings.featureFlags.allowManualDiscounts) return
    setCart(prev => prev.map(i => i.product.id === id
      ? { ...i, unitPrice: round2(listUnitPrice(i) * (1 - percent / 100)) }
      : i))
  }, [orgSettings.featureFlags.allowManualDiscounts])

  // RRA only takes discounts per item, so a cart-wide discount is the same rate on every line.
  const applyCartDiscount = useCallback(() => {
    const percent = cartDiscountInput.trim() === '' ? 0 : Number(cartDiscountInput)
    if (!Number.isFinite(percent) || percent < 0 || percent >= 100) {
      toast.error('Enter a discount from 0 to 99.99%')
      return
    }
    setCart(prev => prev.map(i => ({ ...i, unitPrice: round2(listUnitPrice(i) * (1 - percent / 100)) })))
    setCartDiscountInput('')
  }, [cartDiscountInput])

  const handleCustomerAdded = useCallback((c: Customer) => {
    setCustomers(prev => [...prev, c])
    setSelectedCustomer(c.id)
  }, [])

  const toggleFavorite = useCallback((id: string) => {
    setFavorites(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const subtotal = useMemo(() => cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0), [cart])
  const totalDiscount = useMemo(() => round2(cart.reduce(
    (s, i) => s + Math.max(0, listUnitPrice(i) - Number(i.unitPrice)) * i.quantity,
    0,
  )), [cart])
  // The server enforces this too; checking here tells the seller before they take payment.
  const discountLimitError = useMemo(() => {
    const limit = orgSettings.preferences.maxDiscountPercent
    if (limit == null || DISCOUNT_LIMIT_EXEMPT_ROLES.includes(user?.role ?? '')) return null
    const over = cart.find(i => lineDiscountPercent(i) > Math.max(limit, Number(i.product.discountPercent ?? 0)) + 0.01)
    return over ? `The discount on "${over.product.name}" is above your ${limit}% limit. Ask a manager to complete this sale.` : null
  }, [cart, orgSettings.preferences.maxDiscountPercent, user?.role])
  // The business's VAT registration decides the treatment: when the taxpayer is not VAT registered
  // every line is tax code D (0%).
  const vatRegistered = orgSettings.vatRegistered
  const taxRateByCode = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of catalog.taxTypes) map.set(t.code.toUpperCase(), t.rate)
    return map
  }, [catalog.taxTypes])
  const taxAmount = useMemo(() => cart.reduce((s, i) => {
    const code = vatRegistered ? (i.product.taxCode ?? '').toUpperCase() : 'D'
    const cached = taxRateByCode.get(code)
    const rate = cached ?? (taxRateByCode.size === 0 && code === 'B' ? 18 : 0)
    if (!rate) return s
    const gross = i.unitPrice * i.quantity
    return s + round2(gross - gross / (1 + rate / 100))
  }, 0), [cart, vatRegistered, taxRateByCode])
  const vatLabelRate = taxRateByCode.get('B') ?? (taxRateByCode.size === 0 ? 18 : 0)
  const total = useMemo(() => subtotal, [subtotal])

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

  const inStockProducts = useMemo(() => {
    // Non-VAT taxpayers only sell tax code D items (also guards a stale offline product cache).
    const base = products.filter(p =>
      isSellable(p, trainingMode) && (vatRegistered || (p.taxCode ?? '').toUpperCase() === 'D'),
    )
    const typed = productTypeFilter === 'ALL'
      ? base
      : base.filter(p => (p.itemType ?? 'PRODUCT') === productTypeFilter)
    if (activeCategory === 'All') return typed
    return typed.filter(p => p.category?.toLowerCase() === activeCategory.toLowerCase())
  }, [products, activeCategory, productTypeFilter, trainingMode, vatRegistered])

  // A USB/Bluetooth barcode scanner behaves like a keyboard: it types the barcode digits into
  // whichever input is focused, then sends Enter.
  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || !searchTerm.trim()) return
    e.preventDefault()
    const term = searchTerm.trim()
    const exactBarcodeMatch = products.find(p =>
      p.barcode && p.barcode === term && (vatRegistered || (p.taxCode ?? '').toUpperCase() === 'D'),
    )
    const candidate = exactBarcodeMatch ?? (inStockProducts.length === 1 ? inStockProducts[0] : null)
    if (!candidate) return
    addToCart(candidate)
    setSearchTerm('')
    requestAnimationFrame(() => searchInputRef.current?.focus())
  }, [searchTerm, products, inStockProducts, addToCart, vatRegistered])

  const handleOpenPayment = useCallback(() => {
    if (cart.length === 0) { toast.error(t('pos.noItemsInCart')); return }
    if (!selectedCustomer) { toast.error(t('pos.selectCustomer')); return }
    setIsPaymentModalOpen(true)
  }, [cart, selectedCustomer, t])

  // Poll GET /invoices/:saleId until VSDC confirms (200) or the wait gives up — the endpoint
  // returns 425 while `composeInvoicePayload` is still blocking on fiscalization (RRA checklist
  // §16/§22).
  const pollFiscalization = useCallback(async (saleId: string | number) => {
    const maxAttempts = 10
    const stepMs = 1500
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, stepMs))
      try {
        await apiClient.getInvoice(saleId)
        setSuccessSale((prev) => (prev && String(prev.id) === String(saleId) ? { ...prev, fiscalizationStatus: 'success' } : prev))
        return
      } catch (e: any) {
        if (e?.response?.status === 425) continue
        break
      }
    }
    setSuccessSale((prev) => (prev && String(prev.id) === String(saleId) ? { ...prev, fiscalizationStatus: 'failed' } : prev))
  }, [])

  const handleProcessPayment = useCallback(async (
    entries: Array<{ id: string; method: string; amount: number; reference?: string }>,
  ) => {
    if (discountLimitError) { toast.error(discountLimitError); return }
    try {
      setIsSubmitting(true)
      const totalPaid = entries.reduce((s, p) => s + p.amount, 0)
      const remainingDebt = Math.max(0, total - totalPaid)

      const activeMethods = [...new Set(entries.filter(p => p.amount > 0).map(p => p.method))]
      let paymentType: string = 'CASH'
      if (activeMethods.length > 1 || (activeMethods.length === 1 && remainingDebt > 0 && activeMethods[0] !== 'DEBT')) {
        paymentType = 'MIXED'
      } else if (activeMethods.length === 1) {
        paymentType = activeMethods[0]
      } else if (remainingDebt > 0) {
        paymentType = 'DEBT'
      }

      let cashAmount = 0, insuranceAmount = 0, debtAmount = 0
      const splitPayments = entries
        .filter(p => p.amount > 0)
        .map(p => {
          let paymentMethod = p.method
          if (p.method === 'MOBILE_MONEY') paymentMethod = 'MTN_MOMO'
          else if (p.method === 'CREDIT_CARD') paymentMethod = 'CARD'
          else if (p.method === 'BANK_CHECK') paymentMethod = 'BANK_CHECK'
          if (paymentMethod === 'CASH' || paymentMethod === 'CARD' || paymentMethod === 'MTN_MOMO' || paymentMethod === 'BANK_CHECK') cashAmount += p.amount
          else if (p.method === 'INSURANCE') insuranceAmount += p.amount
          else if (p.method === 'DEBT') debtAmount += p.amount
          return {
            paymentMethod,
            amount: p.amount,
            reference: p.reference || undefined,
          }
        })
      if (remainingDebt > 0) debtAmount += remainingDebt

      const payload = {
        customerId: selectedCustomer,
        items: cart.map(i => {
          const list = Number(i.product.unitPrice ?? i.product.price ?? i.unitPrice)
          const charged = Number(i.unitPrice)
          return {
            productId: i.product.id,
            quantity: i.quantity,
            unitPrice: charged,
            discount: Math.max(0, round2((list - charged) * i.quantity)),
            itemType: i.product.itemType === 'SERVICE' ? 'SERVICE' : (i.product.itemType === 'RAW_MATERIAL' ? 'RAW_MATERIAL' : 'PRODUCT'),
          }
        }),
        paymentType,
        cashAmount,
        insuranceAmount,
        debtAmount,
        payments: splitPayments,
        branchId: selectedBranchId,
        receiptMode: trainingMode ? 'TRAINING' : 'NORMAL',
      }

      if (!isOnline) {
        offlineQueue.enqueue(payload)
        toast.warning(t('pos.offlineQueued') || 'Sale queued — will sync when online.')
        setCart([])
        setIsPaymentModalOpen(false)
        return
      }

      const created = await apiClient.createSale(payload)
      const createdSale = (created as any)?.data ?? created

      // Success confirmation modal replaces the transient success toast.
      let cashierName: string | undefined
      try {
        const storedUser = localStorage.getItem('user')
        if (storedUser) cashierName = (JSON.parse(storedUser).name as string) || undefined
      } catch { /* ignore */ }

      // RRA VSDC checklist §16/§22: don't let the cashier print before VSDC has confirmed.
      const fiscalizationStatus = (createdSale?.fiscalization?.status as 'success' | 'pending' | 'failed' | undefined) ?? 'success'

      setSuccessSale({
        id: createdSale?.id ?? created?.id ?? '',
        invoiceNumber: createdSale?.invoiceNumber as string | null | undefined,
        receiptNumber: undefined,
        customerName: selectedCustomerObj?.name,
        totalItems: cart.reduce((s, i) => s + i.quantity, 0),
        totalAmount: Number(createdSale?.totalAmount ?? total ?? 0),
        paymentLabel: paymentType,
        amountPaid: cashAmount + insuranceAmount,
        changeReturned: Math.max(0, cashAmount - total),
        date: new Date(),
        cashierName,
        fiscalizationStatus,
      })
      setLastCreatedSale(createdSale)
      setIsSuccessOpen(true)

      if (fiscalizationStatus === 'pending' && createdSale?.id != null) {
        pollFiscalization(createdSale.id)
      }

      setCart([])
      setIsPaymentModalOpen(false)

      const res = await apiClient.getProducts({ page: 1, limit: 10000, search: '', branchId: selectedBranchId })
      setProducts(productsFromInventoryResponse(res).filter(p => isSellable(p, trainingMode)))
    } catch (error: any) {
      const msg = error?.response?.data?.error || error?.response?.data?.message || error?.response?.data?.errors?.[0]?.message || error?.message || ''
      toastError(error?.response?.data?.errors?.[0]?.message ? { ...error, message: msg } : error, t('pos.paymentError'))
      if (msg.includes('stock')) {
        try {
          const res = await apiClient.getProducts({ page: 1, limit: 10000, search: '', branchId: selectedBranchId })
          setProducts(productsFromInventoryResponse(res).filter(p => isSellable(p, trainingMode)))
        } catch { /* silent */ }
      }
    } finally {
      setIsSubmitting(false)
    }
  }, [cart, selectedCustomer, total, t, isOnline, selectedBranchId, pollFiscalization, trainingMode, discountLimitError])

  // A proforma is a quote, not a sale: no payment is collected, no stock moves, and no customer
  // debt is booked (see createSale on the backend — isProforma skips stock deduction and debt
  // entirely).
  const handleCreateProforma = useCallback(async () => {
    if (cart.length === 0) { toast.error(t('pos.noItemsInCart')); return }
    if (!selectedCustomer) { toast.error(t('pos.selectCustomer')); return }
    if (discountLimitError) { toast.error(discountLimitError); return }

    try {
      setIsSubmitting(true)
      const payload = {
        customerId: selectedCustomer,
        items: cart.map(i => {
          const list = Number(i.product.unitPrice ?? i.product.price ?? i.unitPrice)
          const charged = Number(i.unitPrice)
          return {
            productId: i.product.id,
            quantity: i.quantity,
            unitPrice: charged,
            discount: Math.max(0, round2((list - charged) * i.quantity)),
            itemType: i.product.itemType === 'SERVICE' ? 'SERVICE' : (i.product.itemType === 'RAW_MATERIAL' ? 'RAW_MATERIAL' : 'PRODUCT'),
          }
        }),
        cashAmount: 0,
        insuranceAmount: 0,
        debtAmount: total,
        isProforma: true,
        branchId: selectedBranchId,
      }

      const created = await apiClient.createSale(payload)
      const createdSale = (created as any)?.data ?? created

      let cashierName: string | undefined
      try {
        const storedUser = localStorage.getItem('user')
        if (storedUser) cashierName = (JSON.parse(storedUser).name as string) || undefined
      } catch { /* ignore */ }

      setSuccessSale({
        id: createdSale?.id ?? '',
        invoiceNumber: createdSale?.invoiceNumber as string | null | undefined,
        receiptNumber: undefined,
        customerName: selectedCustomerObj?.name,
        totalItems: cart.reduce((s, i) => s + i.quantity, 0),
        totalAmount: Number(createdSale?.totalAmount ?? total ?? 0),
        paymentLabel: 'PROFORMA',
        amountPaid: 0,
        changeReturned: 0,
        date: new Date(),
        cashierName,
        // Proforma is fiscalized through VSDC like any other receipt — report the real submission
        // outcome so the success modal never claims a receipt is print-ready before RRA confirms
        // it.
        fiscalizationStatus: ((createdSale as any)?.fiscalization?.status as 'success' | 'pending' | 'failed' | undefined) ?? 'pending',
      })
      setLastCreatedSale(createdSale)
      setIsSuccessOpen(true)
      setCart([])
    } catch (error: any) {
      const msg = error?.response?.data?.error || error?.response?.data?.message || error?.response?.data?.errors?.[0]?.message || error?.message || ''
      toastError(error?.response?.data?.errors?.[0]?.message ? { ...error, message: msg } : error, t('pos.paymentError'))
    } finally {
      setIsSubmitting(false)
    }
  }, [cart, selectedCustomer, selectedCustomerObj, total, t, selectedBranchId, discountLimitError])

  // ── Success modal actions ──────────────────────────────────────────────────

  const buildInvoicePdfBlob = useCallback(async (base: any): Promise<{ blob: Blob; filename: string } | null> => {
    if (!base?.id) return null
    try {
      const invoice = unwrapInvoice(await apiClient.getInvoice(base.id, { allowPending: true }))
      // The first issuance from the success modal is the original; a second
      // print/download/share of the same sale comes back as its CS/CR copy.
      const blob = await issueInvoicePdfBlob(base.id)
      return {
        blob,
        filename: getInvoiceFilename(invoice, base.invoiceNumber ?? base.saleNumber ?? base.id),
      }
    } catch (e: any) {
      console.error('Failed to build sale invoice:', e)
      if (e?.response?.status === 425) {
        toast.error(t('pos.stillFiscalizing'))
      } else {
        toast.error(t('sales.invoiceGenerationError') || 'Failed to generate invoice')
      }
      return null
    }
  }, [t])

  const handlePrintInvoice = useCallback(async () => {
    const base = lastCreatedSale ?? successSale
    if (!base) return
    const result = await buildInvoicePdfBlob(base)
    if (!result) return
    const url = URL.createObjectURL(result.blob)
    const w = window.open(url, '_blank')
    if (w) {
      w.onload = () => {
        w.print()
        URL.revokeObjectURL(url)
      }
    } else {
      toast.error(t('sales.printWindowError') || 'Failed to open print window')
    }
  }, [lastCreatedSale, successSale, buildInvoicePdfBlob, t])

  const handleDownloadInvoice = useCallback(async () => {
    const base = lastCreatedSale ?? successSale
    if (!base) return
    const result = await buildInvoicePdfBlob(base)
    if (!result) return
    const url = URL.createObjectURL(result.blob)
    const a = document.createElement('a')
    a.href = url
    a.download = result.filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, [lastCreatedSale, successSale, buildInvoicePdfBlob])

  const handleShareInvoice = useCallback(async () => {
    const base = lastCreatedSale ?? successSale
    if (!base) return
    const result = await buildInvoicePdfBlob(base)
    if (!result) return
    const file = new File([result.blob], result.filename, { type: 'application/pdf' })
    const shareable = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean }
    if (typeof shareable.share === 'function' && typeof shareable.canShare === 'function' && shareable.canShare({ files: [file] })) {
      try {
        await shareable.share({ files: [file], title: 'Invoice' })
        return
      } catch (e: any) {
        if (e?.name === 'AbortError') return
        // fall through to download
      }
    }
    await handleDownloadInvoice()
  }, [lastCreatedSale, successSale, buildInvoicePdfBlob, handleDownloadInvoice])

  const handleNewSale = useCallback(() => {
    setIsSuccessOpen(false)
    setSuccessSale(null)
    setLastCreatedSale(null)
    setCart([])
    setSelectedCustomer('')
    setSearchTerm('')
    setIsPaymentModalOpen(false)
    requestAnimationFrame(() => searchInputRef.current?.focus())
  }, [])

  const handleViewInvoice = useCallback(() => {
    setIsSuccessOpen(false)
    navigate('/dashboard/sales')
  }, [navigate])

  useEffect(() => {
    if (cart.length === 0) setIsCartSheetOpen(false)
  }, [cart.length])

  const cartQtyById = useMemo(() => {
    const m = new Map<string, number>()
    for (const item of cart) m.set(item.product.id, (m.get(item.product.id) ?? 0) + Number(item.quantity))
    return m
  }, [cart])

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
      {isOnline && trainingMode && (
        <div className="fixed top-14 inset-x-0 z-40 flex items-center justify-center gap-2 bg-orange-500 px-4 py-2 text-sm font-medium text-white">
          TRAINING MODE — sales print as Training Sale (TS) receipts: not official, no stock, payment or accounting changes.
        </div>
      )}

      {/* POS Shell */}
      <div className="-mx-4 flex h-[calc(100vh-8.5rem)] overflow-hidden border-y border-border/80 bg-background sm:-mx-6 lg:-mx-8">

        {/* ── LEFT: product browser ─────────────────────────────────────── */}
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden">

          {/* Search bar row */}
          <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-border/80 bg-card px-3 pb-3 pt-3 sm:gap-3 sm:px-5 sm:pt-4">
            <div className="relative min-w-[12rem] flex-1">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={searchInputRef}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search or scan barcode..."
                className="h-11 w-full rounded-xl border border-input bg-surface-subtle pl-10 pr-10 text-sm text-foreground transition-all placeholder:text-muted-foreground focus:border-primary/50 focus:bg-background focus:outline-none focus:ring-4 focus:ring-ring/15"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex flex-shrink-0 items-center rounded-lg bg-muted p-0.5">
              {(['ALL', 'PRODUCT', 'SERVICE'] as const).map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setProductTypeFilter(type)}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-150',
                    productTypeFilter === type
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {type === 'ALL' ? 'All' : type === 'PRODUCT' ? 'Products' : 'Services'}
                </button>
              ))}
            </div>
            <span className="num hidden whitespace-nowrap text-xs text-muted-foreground lg:inline">
              {inStockProducts.length} items
            </span>
          </div>

          {/* Category filter tabs */}
          <div className="flex flex-shrink-0 items-center gap-1.5 overflow-x-auto border-b border-border/80 bg-card px-3 pb-3 sm:px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={cn(
                  'flex-shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-150',
                  activeCategory === cat
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground',
                )}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Product grid */}
          <div ref={productsRef} className="flex-1 overflow-y-auto p-3 sm:p-5">
            {isLoading ? (
              <div className="flex h-48 items-center justify-center">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
              </div>
            ) : inStockProducts.length === 0 ? (
              <div className="flex h-56 flex-col items-center justify-center gap-3 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <Package className="h-6 w-6" />
                </span>
                <p className="text-sm text-muted-foreground">{t('pos.noProductsFound')}</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {inStockProducts.slice(0, displayedCount).map(p => (
                    <ProductCard
                      key={p.id}
                      product={p}
                      onAddToCart={addToCart}
                      isFavorite={favorites.has(p.id)}
                      onToggleFavorite={toggleFavorite}
                      allowZeroStock={trainingMode}
                      cartQty={cartQtyById.get(p.id) ?? 0}
                    />
                  ))}
                </div>
                {inStockProducts.length > displayedCount && (
                  <p className="mt-4 text-center text-xs text-muted-foreground">
                    Showing {displayedCount} of {inStockProducts.length} — scroll to load more
                  </p>
                )}
              </>
            )}
          </div>

          {/* Bottom Action Bar */}
          <div className="flex flex-shrink-0 items-center gap-3 border-t border-border/80 bg-card px-3 py-2.5 sm:px-5">
            <button
              type="button"
              onClick={() => setCart([])}
              disabled={cart.length === 0}
              aria-label="Clear cart"
              className="flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" />
              <span className="hidden sm:inline">Clear Cart</span>
            </button>

            {isSyncing && (
              <div className="ml-auto flex items-center gap-1.5 text-xs text-warning">
                <Loader2 className="h-3 w-3 animate-spin" />
                Syncing…
              </div>
            )}

            {/* Small screens: open the order sheet */}
            <button
              type="button"
              onClick={() => setIsCartSheetOpen(true)}
              className={cn(
                'flex h-11 items-center gap-3 whitespace-nowrap rounded-xl bg-primary pl-3 pr-4 text-sm font-semibold text-primary-foreground shadow-sm transition-all active:scale-[0.99] lg:hidden',
                !isSyncing && 'ml-auto',
                cart.length === 0 && 'bg-muted text-muted-foreground shadow-none',
              )}
            >
              <span className="relative">
                <ShoppingCart className="h-5 w-5" />
                {cart.length > 0 && (
                  <span className="num absolute -right-2 -top-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-card px-1 text-[10px] font-bold text-primary">
                    {cart.length}
                  </span>
                )}
              </span>
              <span>{cart.length > 0 ? 'Review order' : 'Cart empty'}</span>
              {cart.length > 0 && <span className="num font-semibold opacity-90">{total.toLocaleString()} RWF</span>}
            </button>
          </div>
        </div>

        {/* Backdrop for the small-screen order sheet */}
        {isCartSheetOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] lg:hidden"
            onClick={() => setIsCartSheetOpen(false)}
            aria-hidden
          />
        )}

        {/* ── RIGHT: current order ──────────────────────────────────────── */}
        <div
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col rounded-t-2xl border-t border-border/80 bg-card shadow-modal transition-transform duration-300 ease-out',
            'lg:static lg:z-auto lg:max-h-none lg:w-[340px] lg:flex-shrink-0 lg:translate-y-0 lg:rounded-none lg:border-l lg:border-t-0 lg:shadow-none xl:w-[380px]',
            isCartSheetOpen ? 'translate-y-0' : 'translate-y-full',
          )}
          role="region"
          aria-label="Current order"
        >
          {/* Sheet grab handle (small screens) */}
          <div className="flex justify-center pt-2 lg:hidden" aria-hidden>
            <span className="h-1 w-10 rounded-full bg-border" />
          </div>

          {/* Order header */}
          <div className="flex flex-shrink-0 items-center justify-between border-b border-border/80 px-5 py-3.5">
            <div className="flex items-center gap-2.5">
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              <h2 className="panel-title">Current order</h2>
              {cart.length > 0 && (
                <span className="num inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                  {cart.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCart([])}
                  className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
                  title="Clear cart"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsCartSheetOpen(false)}
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
                aria-label="Close order"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Customer selector */}
          <div className="flex-shrink-0 border-b border-border/80 px-5 py-3.5">
            <div ref={customerDropdownRef} className="relative">
              <button
                type="button"
                onClick={() => setShowCustomerDropdown(prev => !prev)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-xl border px-3.5 py-2.5 text-left text-sm transition-all',
                  'border-input bg-surface-subtle hover:border-primary/40',
                  !selectedCustomer && 'border-dashed',
                  showCustomerDropdown && 'border-primary/60 bg-background ring-4 ring-ring/15',
                )}
              >
                <User className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                <span className={cn('flex-1 truncate text-xs', selectedCustomerObj ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                  {selectedCustomerObj ? selectedCustomerObj.name : 'Search customer or member…'}
                </span>
                {selectedCustomerObj && (
                  <span className="flex-shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium capitalize text-primary">
                    {selectedCustomerObj.type}
                  </span>
                )}
              </button>

              {showCustomerDropdown && (
                <div className="panel absolute inset-x-0 top-full z-50 mt-1.5 shadow-dropdown">
                  <div className="border-b border-border/80 p-2">
                    <Input
                      value={customerSearch}
                      onChange={e => setCustomerSearch(e.target.value)}
                      placeholder="Search by name or phone…"
                      className="h-8 text-xs"
                      autoFocus
                    />
                  </div>
                  <ul className="max-h-44 overflow-y-auto py-1">
                    {filteredCustomers.length === 0 ? (
                      <li className="px-3 py-2 text-xs text-muted-foreground">No customers found</li>
                    ) : filteredCustomers.map(c => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => { setSelectedCustomer(c.id); setShowCustomerDropdown(false); setCustomerSearch('') }}
                          className={cn(
                            'w-full px-3 py-2 text-left text-xs transition-colors hover:bg-muted',
                            c.id === selectedCustomer && 'bg-primary/10',
                          )}
                        >
                          <span className="block font-medium text-foreground">{c.name}</span>
                          {c.phone && <span className="text-muted-foreground">{c.phone}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setIsAddCustomerOpen(true)}
              className="mt-2 flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <UserPlus className="h-3 w-3" />
              Add New Customer
            </button>
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto px-5">
            {cart.length === 0 ? (
              <div className="flex h-full min-h-[10rem] flex-col items-center justify-center gap-3 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground">
                  <ShoppingCart className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-medium text-foreground">Cart is empty</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Tap a product or scan a barcode</p>
                </div>
              </div>
            ) : cart.map(item => (
              <CartItemRow
                key={item.product.id}
                item={item}
                onRemove={removeFromCart}
                onUpdateQuantity={updateQuantity}
                onUpdatePrice={updatePrice}
                onUpdateDiscount={updateDiscount}
                priceEditable={orgSettings.featureFlags.allowManualDiscounts}
                vatRegistered={vatRegistered}
              />
            ))}
          </div>

          {/* Order summary + checkout */}
          <div className="flex-shrink-0 space-y-2.5 border-t border-border/80 bg-surface-subtle px-5 py-4">
            {/* Subtotal */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Subtotal</span>
              <span className="num font-medium text-foreground">{subtotal.toLocaleString()} RWF</span>
            </div>

            {/* Discount */}
            {totalDiscount > 0 && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Discount included</span>
                <span className="num font-medium text-foreground">-{totalDiscount.toLocaleString()} RWF</span>
              </div>
            )}
            {cart.length > 0 && orgSettings.featureFlags.allowManualDiscounts && (
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <label htmlFor="pos-cart-discount">Discount all items</label>
                <div className="flex items-center gap-1.5">
                  <input
                    id="pos-cart-discount"
                    type="number"
                    min={0}
                    max={99.99}
                    step="any"
                    value={cartDiscountInput}
                    onChange={e => setCartDiscountInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && applyCartDiscount()}
                    placeholder="%"
                    className="num w-14 rounded-md border border-input bg-background px-1.5 py-0.5 text-right text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                  />
                  <button
                    type="button"
                    onClick={applyCartDiscount}
                    className="rounded-md border border-border px-2 py-0.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
            {discountLimitError && (
              <p className="text-xs text-danger">{discountLimitError}</p>
            )}

            {/* Tax */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{vatRegistered ? (taxAmount > 0 ? `VAT (${vatLabelRate}%)` : 'VAT (0%)') : 'VAT (Not registered — D)'}</span>
              <span className="num font-medium text-foreground">{taxAmount.toLocaleString()} RWF</span>
            </div>

            {/* Total */}
            <div className="flex items-baseline justify-between border-t border-border/80 pt-3">
              <span className="text-sm font-semibold text-foreground">Total</span>
              <span className="num text-2xl font-semibold tracking-tight text-foreground">
                {total.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">RWF</span>
              </span>
            </div>

            {cart.length > 0 && !selectedCustomer && (
              <p className="flex items-center gap-1.5 text-xs text-warning">
                <User className="h-3.5 w-3.5" />
                Select a customer to continue
              </p>
            )}

            {/* Process Payment button */}
            <button
              type="button"
              onClick={handleOpenPayment}
              disabled={cart.length === 0 || !selectedCustomer || isSubmitting}
              className="mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
              ) : (
                <>Process Payment <ChevronRight className="h-4 w-4" /></>
              )}
            </button>

            {/* Create Quote (Proforma) — a printable estimate, not a real
                sale: no payment, no stock movement, never sent to RRA. */}
            <button
              type="button"
              onClick={handleCreateProforma}
              disabled={cart.length === 0 || !selectedCustomer || isSubmitting}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              Create Quote (Proforma)
            </button>
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
          isProcessing={isSubmitting}
        />
      )}

      <SaleSuccessModal
        isOpen={isSuccessOpen}
        saleData={successSale}
        onPrint={handlePrintInvoice}
        onDownload={handleDownloadInvoice}
        onShare={handleShareInvoice}
        onNewSale={handleNewSale}
        onViewInvoice={handleViewInvoice}
      />
    </>
  )
}
