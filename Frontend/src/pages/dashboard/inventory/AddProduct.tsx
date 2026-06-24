import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import {
    Package, Wrench, Upload, X, Info, DollarSign,
    Barcode, Layers, Save, Check, ChevronsUpDown
} from 'lucide-react'
import { cn } from '../../../lib/utils'
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '../../../components/ui/command'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '../../../components/ui/popover'
import { toast } from 'react-toastify'
import { apiClient } from '../../../lib/api-client'
import { useBranch } from '../../../context/BranchContext'
import { MEASUREMENT_UNIT_OPTIONS } from '../../../types/ebm'

// ──────────────────────────────────────────────────────────
// Fix #3: Floating-point safe RWF rounding helpers
// ──────────────────────────────────────────────────────────
function toRwf(value: number): number {
    return Math.round(value * 100) / 100
}

/** RRA inclusive tax: extract VAT from a gross amount at a given rate (e.g. 18). */
function computeInclusiveVat(gross: number, ratePercent: number): { taxable: number; vat: number } {
    if (ratePercent <= 0 || gross <= 0) return { taxable: toRwf(gross), vat: 0 }
    const rate = ratePercent / 100
    const taxable = toRwf(gross / (1 + rate))
    const vat = toRwf(gross - taxable)
    return { taxable, vat }
}

// ──────────────────────────────────────────────────────────
// Validation schema with explicit RRA constraints
// ──────────────────────────────────────────────────────────
const addProductSchema = yup.object({
    itemType: yup.string().oneOf(['PRODUCT', 'SERVICE']).required(),
    name: yup.string().required('Product name is required').min(2).max(200),
    category: yup.string().required('Category is required'),
    description: yup.string().max(1000),
    unitPrice: yup
        .number()
        .typeError('Must be a number')
        .required('Unit price is required')
        .positive('Must be positive'),
    taxCode: yup
        .string()
        .required('RRA Tax Code is required')
        .oneOf(['A', 'B', 'C', 'D'], 'Must be A, B, C, or D'),
    // Inventory fields — only validated for PRODUCT (purged for SERVICE via useEffect)
    batchNumber: yup.string().max(50),
    expiryDate: yup.date().nullable().min(new Date(), 'Expiry must be in the future'),
    quantity: yup
        .number()
        .typeError('Must be a number')
        .transform((v) => (isNaN(v) ? undefined : v))
        .min(0, 'Cannot be negative'),
    minStock: yup
        .number()
        .typeError('Must be a number')
        .transform((v) => (isNaN(v) ? undefined : v))
        .min(0, 'Cannot be negative'),
    measurementUnit: yup.string(),
    sku: yup
        .string()
        .matches(/^[A-Za-z0-9-_]*$/, 'SKU: letters, numbers, hyphens, underscores only'),
    barcode: yup
        .string()
        .matches(/^\d{0,13}$/, 'Barcode must be up to 13 digits'),
})

interface TaxCodeOption {
    code: string
    label: string
    rate: number
    category: string
}

interface AddProductProps {
    onSuccess?: () => void
}

// ──────────────────────────────────────────────────────────
// Fix #1: Ordered list of section IDs for scroll-to-error
// ──────────────────────────────────────────────────────────
const SECTION_ORDER = [
    'item-type',
    'product-image',
    'product-info',
    'pricing-tax',
    'inventory-details',
    'additional-info',
] as const

// Fields that must be purged when switching from PRODUCT to SERVICE
const INVENTORY_FIELDS = ['batchNumber', 'expiryDate', 'quantity', 'minStock', 'measurementUnit'] as const

export default function AddProduct({ onSuccess }: AddProductProps) {
    const navigate = useNavigate()
    const { selectedBranchId } = useBranch()

    const [itemType, setItemType] = useState<'PRODUCT' | 'SERVICE'>('PRODUCT')
    const [imageFile, setImageFile] = useState<File | null>(null)
    const [imagePreview, setImagePreview] = useState<string>('')
    const [isUploadingImage, setIsUploadingImage] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [taxCodes, setTaxCodes] = useState<TaxCodeOption[]>([])
    const [uploadedImageUrl, setUploadedImageUrl] = useState<string>('')
    const [existingCategories, setExistingCategories] = useState<string[]>([])
    const [existingNames, setExistingNames] = useState<string[]>([])
    const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false)
    const [namePopoverOpen, setNamePopoverOpen] = useState(false)

    // ── Fix #1: Refs for each section block ──
    const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})
    const setSectionRef = (id: string) => (el: HTMLDivElement | null) => {
        sectionRefs.current[id] = el
    }

    // ── Fix #4: Focus bridge for Enter-key advancement ──
    // Compose react-hook-form's register ref with our own so both co-exist.
    const composeRefs = (rhfRef: React.Ref<any>, fieldName: string) => (el: any) => {
        if (typeof rhfRef === 'function') rhfRef(el)
        inputRefs.current[fieldName] = el
    }

    const inputRefs = useRef<Record<string, HTMLElement | null>>({})

    const advanceOnEnter =
        (nextField: string): React.KeyboardEventHandler =>
        (e) => {
            if (e.key === 'Enter') {
                e.preventDefault()
                inputRefs.current[nextField]?.focus()
            }
        }

    // Helper: destructure register() so we can inject composeRefs without overriding the built-in ref
    const bindField = (field: string, nextField: string) => {
        const { ref, ...rest } = register(field)
        return { ...rest, ref: composeRefs(ref, field), onKeyDown: advanceOnEnter(nextField) }
    }

    const {
        register,
        handleSubmit,
        watch,
        setValue,
        resetField,
        trigger,
        formState: { errors },
    } = useForm({
        resolver: yupResolver(addProductSchema) as any,
        defaultValues: {
            itemType: 'PRODUCT',
            name: '',
            category: '',
            description: '',
            unitPrice: undefined as number | undefined,
            taxCode: '',
            batchNumber: '',
            expiryDate: null,
            quantity: undefined as number | undefined,
            minStock: undefined as number | undefined,
            measurementUnit: '',
            sku: '',
            barcode: '',
        },
    })

    const watchItemType = watch('itemType')
    const watchUnitPrice = watch('unitPrice')
    const watchTaxCode = watch('taxCode')

    // Sync watched value to local state for UI branching
    useEffect(() => {
        setItemType(watchItemType as 'PRODUCT' | 'SERVICE')
    }, [watchItemType])

    // ── Fix #2: Purge inventory fields when switching to SERVICE ──
    useEffect(() => {
        if (watchItemType === 'SERVICE') {
            for (const field of INVENTORY_FIELDS) {
                resetField(field, { defaultValue: field === 'measurementUnit' ? 'OTHER' : field === 'expiryDate' ? null : '' })
            }
            setValue('quantity', 0, { shouldDirty: false, shouldTouch: false, shouldValidate: false })
            setValue('minStock', 0, { shouldDirty: false, shouldTouch: false, shouldValidate: false })
        }
    }, [watchItemType, resetField, setValue])

    useEffect(() => {
        apiClient.getTaxCodes().then(setTaxCodes).catch(() => {
            setTaxCodes([
                { code: 'A', label: 'A — Exempted (0%)', rate: 0, category: 'EXEMPT' },
                { code: 'B', label: 'B — Standard (18%)', rate: 18, category: 'STANDARD' },
                { code: 'C', label: 'C — Zero-rated (0%)', rate: 0, category: 'ZERO_RATED' },
                { code: 'D', label: 'D — Non-Taxable (0%)', rate: 0, category: 'EXEMPT' },
            ])
        })
    }, [])

    useEffect(() => {
        if (!selectedBranchId) return
        apiClient.getProducts({ page: 1, limit: 200, branchId: selectedBranchId })
            .then((res: any) => {
                const items = res?.items || res?.data || []
                const cats = Array.from(new Set(
                    items.filter((p: any) => p.category).map((p: any) => p.category)
                )) as string[]
                setExistingCategories(cats.sort())
                const names = Array.from(new Set(
                    items.filter((p: any) => p.name).map((p: any) => p.name)
                )) as string[]
                setExistingNames(names.sort())
            })
            .catch(() => {})
    }, [selectedBranchId])

    // ── Tax preview (Fix #3: locked to 2-decimal RWF) ──
    const taxPreview = (() => {
        const price = Number(watchUnitPrice) || 0
        const code = watchTaxCode
        const rateInfo = taxCodes.find((t) => t.code === code)
        const ratePct = rateInfo?.rate ?? 0
        const { taxable, vat } = computeInclusiveVat(price, ratePct)
        return { price: toRwf(price), taxable, vat, ratePct, label: rateInfo?.label ?? '' }
    })()

    const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        if (!file.type.startsWith('image/')) {
            toast.error('Please select an image file')
            return
        }
        if (file.size > 5 * 1024 * 1024) {
            toast.error('Image must be under 5MB')
            return
        }
        setImageFile(file)
        setImagePreview(URL.createObjectURL(file))
    }, [])

    const removeImage = useCallback(() => {
        setImageFile(null)
        setImagePreview('')
        setUploadedImageUrl('')
    }, [])

    const uploadImage = async (): Promise<string | null> => {
        if (!imageFile) return uploadedImageUrl || null
        setIsUploadingImage(true)
        try {
            const result = await apiClient.uploadProductImage(imageFile)
            setUploadedImageUrl(result.imageUrl)
            return result.imageUrl
        } catch {
            toast.warn('Image upload failed, saving without image')
            return null
        } finally {
            setIsUploadingImage(false)
        }
    }

    // ── Fix #1: Scroll-to-error using idiomatic React refs ──
    const scrollToFirstError = useCallback(() => {
        for (const sectionId of SECTION_ORDER) {
            const sectionEl = sectionRefs.current[sectionId]
            if (sectionEl) {
                sectionEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
                return
            }
        }
    }, [])

    const onSubmit = async (data: Record<string, any>) => {
        // Run full validation before anything else
        const isValid = await trigger()
        if (!isValid) {
            scrollToFirstError()
            toast.error('Please fix the highlighted fields before saving')
            return
        }

        if (!selectedBranchId) {
            toast.error('Please select a branch before adding a product')
            return
        }

        setIsSubmitting(true)
        try {
            const imageUrl = await uploadImage()

            const payload: Record<string, any> = {
                name: data.name,
                category: data.category,
                description: data.description || '',
                unitPrice: data.unitPrice,
                taxCode: data.taxCode,
                itemType: data.itemType,
                branchId: selectedBranchId,
                imageUrl: imageUrl || undefined,
            }

            if (data.itemType === 'PRODUCT') {
                payload.batchNumber = data.batchNumber || undefined
                payload.quantity = data.quantity || 0
                payload.expiryDate = data.expiryDate || undefined
                payload.minStock = data.minStock || 0
                payload.measurementUnit = data.measurementUnit || 'PCS'
                payload.sku = data.sku || undefined
                payload.barcode = data.barcode || undefined
            } else {
                // SERVICE — inventory fields already purged by Fix #2
                // SKU and barcode are inventory-specific; never send for SERVICE
                payload.quantity = 0
                payload.minStock = 0
                payload.measurementUnit = 'OTHER'
            }

            await apiClient.createProduct(payload)
            toast.success(data.itemType === 'SERVICE' ? 'Service added successfully' : 'Product added successfully')
            if (onSuccess) onSuccess()
            else navigate('/dashboard/inventory-all')
        } catch (error: any) {
            toast.error(error.message || 'Failed to save product')
        } finally {
            setIsSubmitting(false)
        }
    }

    // ──────────────────────────────────────────────────────────
    // Render
    // ──────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col lg:flex-row gap-6 max-w-7xl mx-auto px-4 py-6">
            {/* ── MAIN FORM COLUMN ── */}
            <div className="flex-1 min-w-0 space-y-6">
                <form onSubmit={handleSubmit(onSubmit)}>
                    {/* ── Item Type Toggle (section 0) ── */}
                    <div ref={setSectionRef('item-type')} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 block">
                            Item Type <span className="text-red-500">*</span>
                        </label>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => { setValue('itemType', 'PRODUCT'); setItemType('PRODUCT') }}
                                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                                    itemType === 'PRODUCT'
                                        ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                                }`}
                            >
                                <Package className="h-4 w-4" />
                                Product
                            </button>
                            <button
                                type="button"
                                onClick={() => { setValue('itemType', 'SERVICE'); setItemType('SERVICE') }}
                                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                                    itemType === 'SERVICE'
                                        ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                                }`}
                            >
                                <Wrench className="h-4 w-4" />
                                Service
                            </button>
                        </div>
                    </div>

                    {/* ── Product Image (section 1) ── */}
                    <div ref={setSectionRef('product-image')} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                                <Upload className="h-4 w-4 text-blue-600" />
                            </div>
                            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Product Image</h2>
                        </div>
                        {imagePreview ? (
                            <div className="relative inline-block">
                                <img
                                    src={imagePreview}
                                    alt="Preview"
                                    className="h-32 w-32 object-cover rounded-xl border border-gray-200 dark:border-gray-700"
                                />
                                <button
                                    type="button"
                                    onClick={removeImage}
                                    className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full shadow-md hover:bg-red-600 transition-colors"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </div>
                        ) : (
                            <label className="flex flex-col items-center justify-center h-32 w-32 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors bg-gray-50 dark:bg-gray-900/50">
                                <Upload className="h-6 w-6 text-gray-400 mb-1" />
                                <span className="text-xs text-gray-500">Upload Image</span>
                                <input type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
                            </label>
                        )}
                    </div>

                    {/* ── Product Info (section 2) ── */}
                    <div ref={setSectionRef('product-info')} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
                        <div className="flex items-center gap-2 mb-5">
                            <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/20">
                                <Info className="h-4 w-4 text-indigo-600" />
                            </div>
                            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Product Info</h2>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div className="space-y-1.5 md:col-span-2">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    {itemType === 'SERVICE' ? 'Service Name' : 'Product Name'} <span className="text-red-500">*</span>
                                </label>
                                <Popover open={namePopoverOpen} onOpenChange={setNamePopoverOpen}>
                                    <PopoverTrigger asChild>
                                        <button
                                            type="button"
                                            role="combobox"
                                            aria-expanded={namePopoverOpen}
                                            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50 dark:bg-gray-900 dark:text-white ${
                                                errors.name ? 'border-red-400' : 'border-gray-200 dark:border-gray-700'
                                            }`}
                                        >
                                            <span className={watch('name') ? 'truncate' : 'text-gray-400 truncate'}>
                                                {watch('name') || (itemType === 'SERVICE' ? 'Select or type service name...' : 'Select or type product name...')}
                                            </span>
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg" align="start">
                                        <Command className="bg-transparent">
                                            <CommandInput
                                                placeholder="Search or type new..."
                                                className="bg-white dark:bg-gray-800"
                                                value={watch('name')}
                                                onValueChange={(v) => {
                                                    setValue('name', v, { shouldValidate: true })
                                                }}
                                            />
                                            <CommandList>
                                                {existingNames.length > 0 && (
                                                    <CommandGroup heading="Existing names">
                                                        {existingNames.map((n) => (
                                                            <CommandItem
                                                                key={n}
                                                                value={n}
                                                                onSelect={() => {
                                                                    setValue('name', n, { shouldValidate: true })
                                                                    setNamePopoverOpen(false)
                                                                }}
                                                            >
                                                                <Check
                                                                    className={cn(
                                                                        'mr-2 h-4 w-4 shrink-0',
                                                                        watch('name') === n ? 'opacity-100' : 'opacity-0'
                                                                    )}
                                                                />
                                                                {n}
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>
                                                )}
                                                {watch('name') && !existingNames.includes(watch('name')) && (
                                                    <CommandEmpty className="py-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => setNamePopoverOpen(false)}
                                                            className="w-full text-left px-2 py-1.5 text-sm text-blue-600 hover:bg-accent rounded-sm"
                                                        >
                                                            Use "{watch('name')}"
                                                        </button>
                                                    </CommandEmpty>
                                                )}
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                                {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Category <span className="text-red-500">*</span>
                                </label>
                                <Popover open={categoryPopoverOpen} onOpenChange={setCategoryPopoverOpen}>
                                    <PopoverTrigger asChild>
                                        <button
                                            type="button"
                                            role="combobox"
                                            aria-expanded={categoryPopoverOpen}
                                            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50 dark:bg-gray-900 dark:text-white ${
                                                errors.category ? 'border-red-400' : 'border-gray-200 dark:border-gray-700'
                                            }`}
                                        >
                                            <span className={watch('category') ? '' : 'text-gray-400'}>
                                                {watch('category') || (itemType === 'SERVICE' ? 'Select or type category...' : 'Select or type category...')}
                                            </span>
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg" align="start">
                                        <Command className="bg-transparent">
                                            <CommandInput
                                                placeholder="Search or type new..."
                                                className="bg-white dark:bg-gray-800"
                                                value={watch('category')}
                                                onValueChange={(v) => {
                                                    setValue('category', v, { shouldValidate: true })
                                                }}
                                            />
                                            <CommandList>
                                                {existingCategories.length > 0 && (
                                                    <CommandGroup heading="Existing categories">
                                                        {existingCategories.map((cat) => (
                                                            <CommandItem
                                                                key={cat}
                                                                value={cat}
                                                                onSelect={() => {
                                                                    setValue('category', cat, { shouldValidate: true })
                                                                    setCategoryPopoverOpen(false)
                                                                }}
                                                            >
                                                                <Check
                                                                    className={cn(
                                                                        'mr-2 h-4 w-4',
                                                                        watch('category') === cat ? 'opacity-100' : 'opacity-0'
                                                                    )}
                                                                />
                                                                {cat}
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>
                                                )}
                                                {watch('category') && !existingCategories.includes(watch('category')) && (
                                                    <CommandEmpty className="py-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => setCategoryPopoverOpen(false)}
                                                            className="w-full text-left px-2 py-1.5 text-sm text-blue-600 hover:bg-accent rounded-sm"
                                                        >
                                                            Use "{watch('category')}"
                                                        </button>
                                                    </CommandEmpty>
                                                )}
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                                {errors.category && <p className="text-xs text-red-500 mt-1">{errors.category.message}</p>}
                            </div>
                            <div className="space-y-1.5 md:col-span-2">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
                                <textarea
                                    {...register('description')}
                                    rows={3}
                                    placeholder={itemType === 'SERVICE' ? 'Describe the service details...' : 'Product description...'}
                                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50 dark:bg-gray-900 dark:text-white resize-none"
                                />
                            </div>
                        </div>
                    </div>

                    {/* ── Pricing & Tax (section 3) ── */}
                    <div ref={setSectionRef('pricing-tax')} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
                        <div className="flex items-center gap-2 mb-5">
                            <div className="p-1.5 rounded-lg bg-green-50 dark:bg-green-900/20">
                                <DollarSign className="h-4 w-4 text-green-600" />
                            </div>
                            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Pricing &amp; Tax</h2>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Unit Price <span className="text-red-500">*</span>
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-500 dark:text-gray-400">
                                        RWF
                                    </span>
                                    <input
                                        {...bindField('unitPrice', 'taxCode')}
                                        type="number"
                                        inputMode="decimal"
                                        step="0.01"
                                        min="0"
                                        placeholder="0.00"
                                        className={`w-full pl-14 pr-3.5 py-2.5 rounded-xl border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50 dark:bg-gray-900 dark:text-white ${
                                            errors.unitPrice ? 'border-red-400' : 'border-gray-200 dark:border-gray-700'
                                        }`}
                                    />
                                </div>
                                {errors.unitPrice && <p className="text-xs text-red-500 mt-1">{errors.unitPrice.message}</p>}
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    RRA Tax Code <span className="text-red-500">*</span>
                                </label>
                                <select
                                    {...bindField('taxCode', itemType === 'PRODUCT' ? 'batchNumber' : 'sku')}
                                    className={`w-full px-3.5 py-2.5 rounded-xl border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50 dark:bg-gray-900 dark:text-white ${
                                        errors.taxCode ? 'border-red-400' : 'border-gray-200 dark:border-gray-700'
                                    }`}
                                >
                                    <option value="">Select Tax Code</option>
                                    {taxCodes.map(tc => (
                                        <option key={tc.code} value={tc.code}>{tc.label}</option>
                                    ))}
                                </select>
                                {errors.taxCode && <p className="text-xs text-red-500 mt-1">{errors.taxCode.message}</p>}
                            </div>
                        </div>
                    </div>

                    {/* ── Inventory Details (section 4) — PRODUCT only, else visually absent ── */}
                    {itemType === 'PRODUCT' && (
                        <div ref={setSectionRef('inventory-details')} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
                            <div className="flex items-center gap-2 mb-5">
                                <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20">
                                    <Layers className="h-4 w-4 text-amber-600" />
                                </div>
                                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Inventory Details</h2>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Batch Number</label>
                                    <input
                                        {...bindField('batchNumber', 'expiryDate')}
                                        placeholder="e.g. BATCH-001"
                                        className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50 dark:bg-gray-900 dark:text-white"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Expiry Date</label>
                                    <input
                                        {...bindField('expiryDate', 'quantity')}
                                        type="date"
                                        className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50 dark:bg-gray-900 dark:text-white"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Quantity <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        {...bindField('quantity', 'minStock')}
                                        type="number"
                                        inputMode="numeric"
                                        min="0"
                                        placeholder="0"
                                        className={`w-full px-3.5 py-2.5 rounded-xl border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50 dark:bg-gray-900 dark:text-white ${
                                            errors.quantity ? 'border-red-400' : 'border-gray-200 dark:border-gray-700'
                                        }`}
                                    />
                                    {errors.quantity && <p className="text-xs text-red-500 mt-1">{errors.quantity.message}</p>}
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Min Stock <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        {...bindField('minStock', 'measurementUnit')}
                                        type="number"
                                        inputMode="numeric"
                                        min="0"
                                        placeholder="10"
                                        className={`w-full px-3.5 py-2.5 rounded-xl border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50 dark:bg-gray-900 dark:text-white ${
                                            errors.minStock ? 'border-red-400' : 'border-gray-200 dark:border-gray-700'
                                        }`}
                                    />
                                    {errors.minStock && <p className="text-xs text-red-500 mt-1">{errors.minStock.message}</p>}
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Measurement Unit <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        {...bindField('measurementUnit', 'sku')}
                                        className={`w-full px-3.5 py-2.5 rounded-xl border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50 dark:bg-gray-900 dark:text-white ${
                                            errors.measurementUnit ? 'border-red-400' : 'border-gray-200 dark:border-gray-700'
                                        }`}
                                    >
                                        <option value="">Select Unit</option>
                                        {MEASUREMENT_UNIT_OPTIONS.map(u => (
                                            <option key={u.value} value={u.value}>{u.label}</option>
                                        ))}
                                    </select>
                                    {errors.measurementUnit && <p className="text-xs text-red-500 mt-1">{errors.measurementUnit.message}</p>}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Additional Info (section 5) ── */}
                    <div ref={setSectionRef('additional-info')} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
                        <div className="flex items-center gap-2 mb-5">
                            <div className="p-1.5 rounded-lg bg-purple-50 dark:bg-purple-900/20">
                                <Barcode className="h-4 w-4 text-purple-600" />
                            </div>
                            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Additional Info</h2>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">SKU</label>
                                <input
                                    {...bindField('sku', 'barcode')}
                                    placeholder="e.g. MED-PCM-001"
                                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50 dark:bg-gray-900 dark:text-white"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Barcode</label>
                                <input
                                    {...bindField('barcode', '')}
                                    inputMode="numeric"
                                    maxLength={13}
                                    placeholder="e.g. 8901234567890"
                                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50 dark:bg-gray-900 dark:text-white"
                                />
                            </div>
                        </div>
                    </div>

                    {/* ── Sticky bottom form actions (visible on mobile) ── */}
                    <div className="flex items-center justify-end gap-3 pt-6 pb-2 border-t border-gray-100 dark:border-gray-700 lg:hidden">
                        <button
                            type="button"
                            onClick={() => onSuccess ? onSuccess() : navigate('/dashboard/inventory-all')}
                            className="px-5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || isUploadingImage}
                            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-blue-500/20"
                        >
                            {isSubmitting ? (
                                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <Save className="h-4 w-4" />
                            )}
                            Save {itemType === 'SERVICE' ? 'Service' : 'Product'}
                        </button>
                    </div>
                </form>
            </div>

            {/* ── SIDEBAR COLUMN — live tax preview + required fields + submit ── */}
            <aside className="w-full lg:w-80 xl:w-96 shrink-0">
                <div className="lg:sticky lg:top-24 space-y-4">
                    {/* Tax Preview (Fix #3: strict toRwf rounding) */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Tax Preview</h4>
                            <span className="text-[10px] font-medium text-blue-600 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-800">
                                Tax Inclusive
                            </span>
                        </div>

                        <div className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">Unit Price</span>
                            <span className="font-medium">RWF {taxPreview.price.toFixed(2)}</span>
                        </div>

                        {taxPreview.label && (
                            <>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-600 dark:text-gray-400">Tax Code</span>
                                    <span className={`font-mono font-bold ${
                                        taxPreview.ratePct > 0 ? 'text-amber-600' : 'text-green-600'
                                    }`}>
                                        {watchTaxCode} — {taxPreview.label}
                                    </span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-600 dark:text-gray-400">Taxable Amount</span>
                                    <span className="font-medium">RWF {taxPreview.taxable.toFixed(2)}</span>
                                </div>
                                <div className={`flex justify-between text-sm border-t pt-2 ${
                                    taxPreview.ratePct > 0 ? 'border-amber-200 dark:border-amber-800' : 'border-gray-200 dark:border-gray-700'
                                }`}>
                                    <span className="text-gray-600 dark:text-gray-400">VAT Amount</span>
                                    <span className={`font-semibold ${
                                        taxPreview.ratePct > 0 ? 'text-amber-600' : 'text-green-600'
                                    }`}>
                                        RWF {taxPreview.vat.toFixed(2)}
                                    </span>
                                </div>
                                <div className="flex justify-between text-sm border-t border-gray-200 dark:border-gray-700 pt-2">
                                    <span className="font-semibold text-gray-800 dark:text-gray-200">Total (incl. VAT)</span>
                                    <span className="font-bold text-lg">RWF {taxPreview.price.toFixed(2)}</span>
                                </div>
                            </>
                        )}

                        {!watchTaxCode && (
                            <p className="text-xs text-gray-400 italic">Select a tax code to see the full preview</p>
                        )}
                    </div>

                    {/* Required Fields Checklist */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 space-y-2">
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Required Fields</h4>
                        {[
                            { key: 'itemType', label: 'Item Type' },
                            { key: 'name', label: itemType === 'SERVICE' ? 'Service Name' : 'Product Name' },
                            { key: 'category', label: 'Category' },
                            { key: 'unitPrice', label: 'Unit Price' },
                            { key: 'taxCode', label: 'RRA Tax Code' },
                            ...(itemType === 'PRODUCT'
                                ? [
                                    { key: 'quantity', label: 'Quantity' },
                                    { key: 'minStock', label: 'Min Stock' },
                                    { key: 'measurementUnit', label: 'Measurement Unit' },
                                  ]
                                : []),
                        ].map(({ key, label }) => {
                            const value = watch(key as any)
                            // itemType is always filled since it has a default
                            const filled = key === 'itemType' ? true : value !== undefined && value !== '' && value !== null
                            return (
                                <div key={key} className="flex items-center gap-2 text-sm">
                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${filled ? 'bg-green-500' : 'bg-red-400'}`} />
                                    <span className={filled ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'}>
                                        {label}
                                    </span>
                                </div>
                            )
                        })}
                    </div>

                    {/* Submit button (sidebar on desktop) */}
                    <button
                        type="submit"
                        onClick={handleSubmit(onSubmit)}
                        disabled={isSubmitting || isUploadingImage}
                        className="hidden lg:flex w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20 items-center justify-center gap-2"
                    >
                        {isSubmitting ? (
                            <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <Save className="h-4 w-4" />
                        )}
                        Save {itemType === 'SERVICE' ? 'Service' : 'Product'}
                    </button>

                    {/* Cancel button (sidebar on desktop) */}
                    <button
                        type="button"
                        onClick={() => onSuccess ? onSuccess() : navigate('/dashboard/inventory-all')}
                        className="hidden lg:block w-full py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm font-medium text-center"
                    >
                        Cancel
                    </button>
                </div>
            </aside>
        </div>
    )
}
