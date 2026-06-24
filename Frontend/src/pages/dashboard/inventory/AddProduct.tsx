import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import {
    ArrowLeft, Package, Wrench, Upload, X, Info, DollarSign,
    Barcode, Layers, FileText, Save, Check, ChevronsUpDown
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

const addProductSchema = yup.object({
    itemType: yup.string().oneOf(['PRODUCT', 'SERVICE']).required(),
    name: yup.string().required('Product name is required').min(2).max(200),
    category: yup.string().required('Category is required'),
    description: yup.string().max(1000),
    unitPrice: yup.number().typeError('Must be a number').required('Unit price is required').positive('Must be positive'),
    taxCode: yup.string().required('Tax code is required'),
    batchNumber: yup.string(),
    expiryDate: yup.string().nullable(),
    quantity: yup.number().typeError('Must be a number').min(0, 'Cannot be negative'),
    minStock: yup.number().typeError('Must be a number').min(0, 'Cannot be negative'),
    measurementUnit: yup.string(),
    sku: yup.string(),
    barcode: yup.string(),
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

    const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({
        resolver: yupResolver(addProductSchema) as any,
        defaultValues: {
            itemType: 'PRODUCT',
            name: '',
            category: '',
            description: '',
            unitPrice: undefined,
            taxCode: '',
            batchNumber: '',
            expiryDate: null,
            quantity: undefined,
            minStock: undefined,
            measurementUnit: '',
            sku: '',
            barcode: '',
        },
    })

    const watchItemType = watch('itemType')
    const watchUnitPrice = watch('unitPrice')
    const watchQuantity = watch('quantity')
    const watchTaxCode = watch('taxCode')

    useEffect(() => {
        setItemType(watchItemType as 'PRODUCT' | 'SERVICE')
    }, [watchItemType])

    useEffect(() => {
        apiClient.getTaxCodes().then(setTaxCodes).catch(() => {
            setTaxCodes([
                { code: 'A', label: 'Exempted (0%)', rate: 0, category: 'EXEMPT' },
                { code: 'B', label: 'Standard (18%)', rate: 18, category: 'STANDARD' },
                { code: 'C', label: 'Zero-rated (0%)', rate: 0, category: 'ZERO_RATED' },
                { code: 'D', label: 'Exempted Entity (0%)', rate: 0, category: 'EXEMPT' },
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

    const selectedTaxRate = taxCodes.find(tc => tc.code === watchTaxCode)?.rate ?? 0

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

    const onSubmit = async (data: Record<string, any>) => {
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
                payload.batchNumber = undefined
                payload.quantity = 0
                payload.expiryDate = undefined
                payload.minStock = 0
                payload.measurementUnit = 'OTHER'
                payload.sku = data.sku || undefined
                payload.barcode = undefined
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

    return (
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate('/dashboard/inventory-all')}
                        className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                        <ArrowLeft className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
                            Add New {itemType === 'SERVICE' ? 'Service' : 'Product'}
                        </h1>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                            Fill in the details below to add a new item to your inventory.
                        </p>
                    </div>
                </div>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                {/* Item Type Toggle */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
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

                {/* Product Image */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
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

                {/* Product Info */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
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

                {/* Pricing & Tax */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
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
                                    {...register('unitPrice')}
                                    type="number"
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
                                {...register('taxCode')}
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

                {/* Inventory Details (Product only) */}
                {itemType === 'PRODUCT' && (
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
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
                                    {...register('batchNumber')}
                                    placeholder="e.g. BATCH-001"
                                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50 dark:bg-gray-900 dark:text-white"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Expiry Date</label>
                                <input
                                    {...register('expiryDate')}
                                    type="date"
                                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50 dark:bg-gray-900 dark:text-white"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Quantity <span className="text-red-500">*</span>
                                </label>
                                <input
                                    {...register('quantity')}
                                    type="number"
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
                                    {...register('minStock')}
                                    type="number"
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
                                    {...register('measurementUnit')}
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

                {/* Additional Info */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
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
                                {...register('sku')}
                                placeholder="e.g. MED-PCM-001"
                                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50 dark:bg-gray-900 dark:text-white"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Barcode</label>
                            <input
                                {...register('barcode')}
                                placeholder="e.g. 8901234567890"
                                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50 dark:bg-gray-900 dark:text-white"
                            />
                        </div>
                    </div>
                </div>

                {/* Summary */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
                    <div className="flex items-center gap-2 mb-5">
                        <div className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-900/20">
                            <FileText className="h-4 w-4 text-rose-600" />
                        </div>
                        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Summary</h2>
                    </div>
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm py-1.5">
                            <span className="text-gray-500 dark:text-gray-400">Item Type</span>
                            <span className="font-medium text-gray-900 dark:text-white capitalize">{itemType.toLowerCase()}</span>
                        </div>
                        <div className="flex justify-between text-sm py-1.5">
                            <span className="text-gray-500 dark:text-gray-400">Unit Price</span>
                            <span className="font-medium text-gray-900 dark:text-white">{Number(watchUnitPrice || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} RWF</span>
                        </div>
                        {itemType === 'PRODUCT' && (
                            <div className="flex justify-between text-sm py-1.5">
                                <span className="text-gray-500 dark:text-gray-400">Quantity</span>
                                <span className="font-medium text-gray-900 dark:text-white">{watchQuantity || 0}</span>
                            </div>
                        )}
                        <div className="border-t border-gray-100 dark:border-gray-700 my-2" />
                        <div className="flex justify-between text-sm py-1.5">
                            <span className="text-gray-500 dark:text-gray-400">Subtotal</span>
                            <span className="font-medium text-gray-900 dark:text-white">
                                {((watchUnitPrice || 0) * (itemType === 'PRODUCT' ? (watchQuantity || 1) : 1)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} RWF
                            </span>
                        </div>
                        <div className="flex justify-between text-sm py-1.5">
                            <span className="text-gray-500 dark:text-gray-400">
                                Tax ({selectedTaxRate}%)
                            </span>
                            <span className="font-medium text-gray-900 dark:text-white">
                                {((watchUnitPrice || 0) * (itemType === 'PRODUCT' ? (watchQuantity || 1) : 1) * selectedTaxRate / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} RWF
                            </span>
                        </div>
                        <div className="border-t border-gray-100 dark:border-gray-700 my-2" />
                        <div className="flex justify-between text-sm py-1.5">
                            <span className="text-base font-semibold text-gray-900 dark:text-white">Total</span>
                            <span className="text-base font-bold text-blue-600 dark:text-blue-400">
                                {((watchUnitPrice || 0) * (itemType === 'PRODUCT' ? (watchQuantity || 1) : 1) * (1 + selectedTaxRate / 100)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} RWF
                            </span>
                        </div>
                    </div>
                </div>

                {/* Form Actions */}
                <div className="flex items-center justify-end gap-3 pt-2 pb-4">
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
    )
}
