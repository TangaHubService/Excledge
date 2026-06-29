import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import {
    Package, Wrench, Upload, X,
    Save, Check, ChevronsUpDown, ChevronLeft, ChevronRight
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

function toRwf(value: number): number {
    return Math.round(value * 100) / 100
}

function computeInclusiveVat(gross: number, ratePercent: number): { taxable: number; vat: number } {
    if (ratePercent <= 0 || gross <= 0) return { taxable: toRwf(gross), vat: 0 }
    const rate = ratePercent / 100
    const taxable = toRwf(gross / (1 + rate))
    const vat = toRwf(gross - taxable)
    return { taxable, vat }
}

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

const STEPS = [
    { id: 'basic', label: 'Basic Info' },
    { id: 'pricing', label: 'Pricing & Inventory' },
    { id: 'review', label: 'Review' },
] as const

type StepId = (typeof STEPS)[number]['id']

export default function AddProduct({ onSuccess }: AddProductProps) {
    const navigate = useNavigate()
    const { selectedBranchId } = useBranch()
    const [currentStep, setCurrentStep] = useState<StepId>('basic')

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

    const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})
    const setSectionRef = (id: string) => (el: HTMLDivElement | null) => {
        sectionRefs.current[id] = el
    }

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

    const bindField = (field: string, nextField: string) => {
        const { ref, ...rest } = register(field as any)
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

    useEffect(() => {
        setItemType(watchItemType as 'PRODUCT' | 'SERVICE')
    }, [watchItemType])

    const taxPreview = (() => {
        const price = Number(watchUnitPrice) || 0
        const code = watchTaxCode
        const rateInfo = taxCodes.find((t) => t.code === code)
        const ratePct = rateInfo?.rate ?? 0
        const { taxable, vat } = computeInclusiveVat(price, ratePct)
        return { price: toRwf(price), taxable, vat, ratePct, label: rateInfo?.label ?? '' }
    })()

    const INVENTORY_FIELDS = ['batchNumber', 'expiryDate', 'quantity', 'minStock', 'measurementUnit'] as const

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

    const goToStep = (step: StepId) => {
        setCurrentStep(step)
    }

    const handleNext = async () => {
        if (currentStep === 'basic') {
            const fields = ['itemType', 'name', 'category']
            const valid = await trigger(fields as any)
            if (!valid) {
                toast.error('Please fill in all required fields')
                return
            }
            goToStep('pricing')
        } else if (currentStep === 'pricing') {
            const fields = ['unitPrice', 'taxCode']
            const valid = await trigger(fields as any)
            if (!valid) {
                toast.error('Please fill in pricing fields')
                return
            }
            goToStep('review')
        }
    }

    const handlePrevious = () => {
        if (currentStep === 'pricing') goToStep('basic')
        else if (currentStep === 'review') goToStep('pricing')
    }

    const onSubmit = async (data: Record<string, any>) => {
        const isValid = await trigger()
        if (!isValid) {
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

    const stepIndex = STEPS.findIndex(s => s.id === currentStep)
    const isFirstStep = stepIndex === 0
    const isLastStep = stepIndex === STEPS.length - 1

    return (
        <div className="mx-auto max-w-xl">
            <div className="space-y-6">
                {/* Step Indicator */}
                <div className="flex items-center gap-1">
                    {STEPS.map((step, idx) => (
                        <div key={step.id} className="flex items-center gap-1 flex-1 min-w-0">
                            <button
                                type="button"
                                onClick={() => {
                                    if (idx < stepIndex) goToStep(step.id)
                                }}
                                className={cn(
                                    'flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all min-w-0',
                                    currentStep === step.id && 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100',
                                    currentStep !== step.id && idx < stepIndex && 'text-emerald-600 dark:text-emerald-400',
                                    currentStep !== step.id && idx > stepIndex && 'text-gray-400 dark:text-gray-500',
                                    idx < stepIndex && 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50',
                                )}
                                aria-current={currentStep === step.id ? 'step' : undefined}
                            >
                                <span className={cn(
                                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                                    idx < stepIndex && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
                                    currentStep === step.id && 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900',
                                    idx > stepIndex && 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500',
                                )}>
                                    {idx < stepIndex ? <Check className="h-3 w-3" /> : idx + 1}
                                </span>
                                <span className="hidden sm:inline truncate">{step.label}</span>
                            </button>
                            {idx < STEPS.length - 1 && (
                                <div className={cn(
                                    'h-px flex-1 min-w-[8px] mx-1',
                                    idx < stepIndex ? 'bg-emerald-300 dark:bg-emerald-700' : 'bg-gray-200 dark:bg-gray-700',
                                )} aria-hidden="true" />
                            )}
                        </div>
                    ))}
                </div>

                <form>
                    {/* ══════ STEP 1: BASIC INFO ══════ */}
                    {currentStep === 'basic' && (
                        <div className="space-y-6">
                            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Basic Information</h2>

                            <div ref={setSectionRef('item-type')}>
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

                            <div ref={setSectionRef('product-image')}>
                                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 block">Product Image</label>
                                {imagePreview ? (
                                    <div className="relative">
                                        <img
                                            src={imagePreview}
                                            alt="Preview"
                                            className="w-full h-36 object-cover rounded-xl border border-gray-200 dark:border-gray-700"
                                        />
                                        <button
                                            type="button"
                                            onClick={removeImage}
                                            className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full shadow-md hover:bg-red-600 transition-colors"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                ) : (
                                    <label className="flex flex-col items-center justify-center w-full h-28 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors bg-gray-50 dark:bg-gray-900/50">
                                        <Upload className="h-6 w-6 text-gray-400 mb-1.5" />
                                        <span className="text-xs text-gray-500">Click to upload image</span>
                                        <input type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
                                    </label>
                                )}
                            </div>

                            <div ref={setSectionRef('product-info')}>
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
                                    <div className="space-y-1.5 md:col-span-2">
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
                                                        {watch('category') || 'Select or type category...'}
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
                        </div>
                    )}

                    {/* ══════ STEP 2: PRICING & INVENTORY ══════ */}
                    {currentStep === 'pricing' && (
                        <div className="space-y-6">
                            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Pricing & Inventory</h2>

                            <div ref={setSectionRef('pricing-tax')}>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                            Unit Price <span className="text-red-500">*</span>
                                        </label>
                                        <div className="relative">
                                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-500 dark:text-gray-400">RWF</span>
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
                                            {...bindField('taxCode', 'batchNumber')}
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

                            {itemType === 'PRODUCT' && (
                                <div ref={setSectionRef('inventory-details')}>
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

                            <div ref={setSectionRef('additional-info')}>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">SKU</label>
                                        <input
                                            {...bindField('sku', 'barcode')}
                                            placeholder={itemType === 'PRODUCT' ? 'e.g. MED-PCM-001' : 'e.g. SVC-001'}
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
                        </div>
                    )}

                    {/* ══════ STEP 3: REVIEW & CONFIRM ══════ */}
                    {currentStep === 'review' && (
                        <div className="space-y-6">
                            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Review & Confirm</h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Please review the information below before saving.</p>

                            <div className="space-y-4">
                                <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                                    <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Basic Information</h3>
                                    </div>
                                    <div className="px-4 py-3 space-y-2.5">
                                        <ReviewRow label="Item Type" value={itemType === 'PRODUCT' ? 'Product' : 'Service'} />
                                        <ReviewRow label="Name" value={watch('name') || '-'} />
                                        <ReviewRow label="Category" value={watch('category') || '-'} />
                                        {watch('description') && <ReviewRow label="Description" value={watch('description')} />}
                                        {imagePreview && (
                                            <div className="flex justify-between items-start">
                                                <span className="text-sm text-gray-500 dark:text-gray-400">Image</span>
                                                <img src={imagePreview} alt="Preview" className="h-12 w-12 object-cover rounded-md border" />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                                    <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Pricing & Tax</h3>
                                    </div>
                                    <div className="px-4 py-3 space-y-2.5">
                                        <ReviewRow label="Unit Price" value={watch('unitPrice') ? `RWF ${Number(watch('unitPrice')).toLocaleString()}` : '-'} />
                                        <ReviewRow label="Tax Code" value={watch('taxCode') ? taxCodes.find(t => t.code === watch('taxCode'))?.label || watch('taxCode') : '-'} />
                                        {watch('unitPrice') && watch('taxCode') && (
                                            <>
                                                <ReviewRow label="Taxable Amount" value={`RWF ${taxPreview.taxable.toFixed(2)}`} />
                                                <ReviewRow label="VAT" value={`RWF ${taxPreview.vat.toFixed(2)}`} />
                                            </>
                                        )}
                                    </div>
                                </div>

                                {itemType === 'PRODUCT' && (
                                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                                        <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Inventory Details</h3>
                                        </div>
                                        <div className="px-4 py-3 space-y-2.5">
                                            {watch('batchNumber') && <ReviewRow label="Batch Number" value={watch('batchNumber')} />}
                                            {watch('expiryDate') && <ReviewRow label="Expiry Date" value={new Date(watch('expiryDate')!).toLocaleDateString()} />}
                                            <ReviewRow label="Quantity" value={String(watch('quantity') ?? 0)} />
                                            <ReviewRow label="Min Stock" value={String(watch('minStock') ?? 0)} />
                                            <ReviewRow label="Measurement Unit" value={watch('measurementUnit') || 'PCS'} />
                                        </div>
                                    </div>
                                )}

                                {(watch('sku') || watch('barcode')) && (
                                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                                        <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Additional Info</h3>
                                        </div>
                                        <div className="px-4 py-3 space-y-2.5">
                                            {watch('sku') && <ReviewRow label="SKU" value={watch('sku')} />}
                                            {watch('barcode') && <ReviewRow label="Barcode" value={watch('barcode')} />}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── Navigation Buttons ── */}
                    <div className="flex items-center justify-between gap-3 pt-6 pb-2 border-t border-gray-100 dark:border-gray-700 mt-6">
                        <div>
                            {!isFirstStep && (
                                <button
                                    type="button"
                                    onClick={handlePrevious}
                                    className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm font-medium"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                    Previous
                                </button>
                            )}
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={() => onSuccess ? onSuccess() : navigate('/dashboard/inventory-all')}
                                className="px-5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm font-medium"
                            >
                                Cancel
                            </button>
                            {!isLastStep ? (
                                <button
                                    type="button"
                                    onClick={handleNext}
                                    className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors shadow-lg shadow-blue-500/20"
                                >
                                    Next
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    disabled={isSubmitting || isUploadingImage}
                                    onClick={handleSubmit(onSubmit)}
                                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20"
                                >
                                    {isSubmitting ? (
                                        <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <Save className="h-4 w-4" />
                                    )}
                                    Save {itemType === 'SERVICE' ? 'Service' : 'Product'}
                                </button>
                            )}
                        </div>
                    </div>
                </form>
            </div>
        </div>
    )
}

function ReviewRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 text-right max-w-[60%] break-words">{value}</span>
        </div>
    )
}


