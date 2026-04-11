import { useEffect, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { TableSkeleton } from "../../components/ui/TableSkeleton";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import {
  Card,
  CardContent
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import { useTheme } from "../../context/ThemeContext";
import { useBranch } from "../../context/BranchContext";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import {
  Plus,
  Search,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  Upload,
  Loader2,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../components/ui/dialog";
import { ScrollArea, ScrollBar } from "../../components/ui/scroll-area";

import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { toast } from "react-toastify";
import CreatableSelect from "react-select/creatable";
import { apiClient } from "../../lib/api-client";
import { parseInventoryGetProductsResponse } from "../../lib/inventory-response";
import { useDebounce } from "use-debounce";
import { type Product } from "../../types";
import ViewProductDialog from "./inventory/ViewProductDialog";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import InventoryHistoryDialog from "./inventory/InventoryHistoryDialog";
import StockAdjustmentDialog from "./inventory/StockAdjustmentDialog";
import { History, Edit, Pencil } from "lucide-react";

type ProductNameItem = {
  value: string | number;
  label: string;
  id: number;
  name: string;
  sku?: string;
  itemCode?: string;
  itemClassCode?: string;
  packageUnitCode?: string;
  quantityUnitCode?: string;
  expiryDate: string;
  batchNumber: string;
  category: string;
  unitPrice: number;
  minStock: number;
  description: string;
};

type ProductFormState = {
  batchNumber: string;
  name: string;
  sku: string;
  itemCode: string;
  itemClassCode: string;
  packageUnitCode: string;
  quantityUnitCode: string;
  quantity: number;
  unitPrice: number;
  expiryDate: string;
  minStock: number;
  description: string;
  imageUrl: string;
};

const createEmptyProductForm = (): ProductFormState => ({
  batchNumber: "",
  name: "",
  sku: "",
  itemCode: "",
  itemClassCode: "",
  packageUnitCode: "",
  quantityUnitCode: "",
  quantity: 0,
  unitPrice: 0,
  expiryDate: "",
  minStock: 0,
  description: "",
  imageUrl: "",
});

const normalizeDateForInput = (value?: string | null) =>
  value ? value.slice(0, 10) : "";

const buildProductOption = (
  source: Partial<ProductNameItem> & {
    value: string | number;
    label: string;
    id?: number;
    name?: string;
  }
): ProductNameItem => ({
  value: source.value,
  label: source.label,
  id: typeof source.id === "number" ? source.id : Number(source.id ?? 0),
  name: source.name ?? source.label,
  sku: source.sku ?? "",
  itemCode: source.itemCode ?? "",
  itemClassCode: source.itemClassCode ?? "",
  packageUnitCode: source.packageUnitCode ?? "",
  quantityUnitCode: source.quantityUnitCode ?? "",
  expiryDate: source.expiryDate ?? "",
  batchNumber: source.batchNumber ?? "",
  category: source.category ?? "",
  unitPrice: source.unitPrice ?? 0,
  minStock: source.minStock ?? 0,
  description: source.description ?? "",
});

const productToFormData = (
  product: Partial<Product> & Partial<ProductNameItem>
): ProductFormState => ({
  batchNumber: product.batchNumber ?? "",
  name: product.name ?? product.label ?? "",
  sku: product.sku ?? "",
  itemCode: product.itemCode ?? "",
  itemClassCode: product.itemClassCode ?? "",
  packageUnitCode: product.packageUnitCode ?? "",
  quantityUnitCode: product.quantityUnitCode ?? "",
  quantity: typeof product.quantity === "number" ? product.quantity : 0,
  unitPrice: typeof product.unitPrice === "number" ? product.unitPrice : 0,
  expiryDate: normalizeDateForInput(product.expiryDate),
  minStock: typeof product.minStock === "number" ? product.minStock : 0,
  description: product.description ?? "",
  imageUrl:
    "imageUrl" in product && typeof product.imageUrl === "string"
      ? product.imageUrl
      : "",
});


function getDaysRemaining(expiryDate: string) {
  const now = new Date();
  const expiry = new Date(expiryDate);
  return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

const fetchProductNames = async (query: string) => {
  if (!query.trim()) return [];
  try {
    const response = await apiClient.getProducts({
      search: query,
    });
    const { items } = parseInventoryGetProductsResponse(response);
    return items.map((item: any) => ({
      value: item.id,
      label: item.name,
      id: item.id,
      name: item.name,
      sku: item.sku ?? "",
      itemCode: item.itemCode ?? "",
      itemClassCode: item.itemClassCode ?? "",
      packageUnitCode: item.packageUnitCode ?? "",
      quantityUnitCode: item.quantityUnitCode ?? "",
      category: item.category ?? "",
      expiryDate: item.expiryDate ?? "",
      batchNumber: item.batchNumber ?? "",
      unitPrice: item.unitPrice ?? 0,
      minStock: item.minStock ?? 0,
      description: item.description ?? "",
    })) as ProductNameItem[];
  } catch (error) {
    console.error("Error fetching product names:", error);
    return [];
  }
};

export const InventoryManagement = () => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { selectedBranchId } = useBranch();
  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState("");
  const [category, setCategory] = useState("");
  const [expiryStatus, setExpiryStatus] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [viewProduct, setViewProduct] = useState<Product | null>(null);
  const [categoryInput, setCategoryInput] = useState("");
  const [formData, setFormData] = useState<ProductFormState>(
    createEmptyProductForm()
  );

  const [totalPages, setTotalPages] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const [previewItems, setPreviewItems] = useState<any[]>([]);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [uniqueProductNames, setUniqueProductNames] = useState<
    ProductNameItem[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedProduct, setSelectedProduct] =
    useState<ProductNameItem | null>(null);
  const [debouncedSearchTerm] = useDebounce(searchTerm, 500);
  const [productSearch, setProductSearch] = useState("");
  const [debouncedProductSearch] = useDebounce(productSearch, 400);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [lowStockProducts, setLowStockProducts] = useState(0);
  const [expiredProducts, setExpiredProducts] = useState(0);

  // Ledger dialogs state
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedProductForHistory, setSelectedProductForHistory] = useState<number | null>(null);
  const [adjustmentDialogOpen, setAdjustmentDialogOpen] = useState(false);
  const [selectedProductForAdjustment, setSelectedProductForAdjustment] = useState<{
    id: number;
    name: string;
    quantity: number;
  } | null>(null);
  const [expiringProducts, setExpiringProducts] = useState(0);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isErrorsModalOpen, setIsErrorsModalOpen] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");


  const validateForm = (data: typeof formData) => {
    const errors: Record<string, string> = {};

    if (!data.name.trim()) {
      errors.name = "Product name is required";
    }

    if (!categoryInput.trim()) {
      errors.category = "Category is required";
    }

    if (data.unitPrice <= 0) {
      errors.unitPrice = "Unit price must be greater than 0";
    }

    if (data.quantity < 0) {
      errors.quantity = "Quantity cannot be negative";
    }

    if (data.minStock < 0) {
      errors.minStock = "Minimum stock cannot be negative";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };


  useEffect(() => {
    getProducts({
      search: debouncedSearchTerm,
      category,
      expiryStatus,
      page: currentPage,
      limit: itemsPerPage,
      branchId: selectedBranchId,
    });
  }, [debouncedSearchTerm, category, expiryStatus, currentPage, itemsPerPage, selectedBranchId]);
  const getProducts = async (params: any) => {
    setLoading(true);

    try {
      const response = await apiClient.getProducts(params);
      const parsed = parseInventoryGetProductsResponse(response);
      setProducts((parsed.items || []) as Product[]);
      setLowStockProducts(parsed.lowStockProducts);
      setExpiredProducts(parsed.expiredProducts);
      setExpiringProducts(parsed.expiringProducts);
      setTotalPages(parsed.pagination?.totalPages || 1);
      setCurrentPage(parsed.pagination?.currentPage || 1);
    } catch (error) {
      console.error("Error fetching products:", error);
      toast.error(t('messages.errorLoadingData'));
      // Reset statistics on error
      setLowStockProducts(0);
      setExpiredProducts(0);
      setExpiringProducts(0);
    } finally {
      setLoading(false);
    }
  };

  const getExpiryStatus = (expiryDate: string) => {
    const daysRemaining = getDaysRemaining(expiryDate);
    if (daysRemaining < 0)
      return {
        label: t('inventory.expired'),
        variant: "destructive",

        color: "text-red-600",
      };
    if (daysRemaining <= 30)
      return {
        label: `${Number.isNaN(daysRemaining) ? "N/A" : daysRemaining}d left`,
        variant: "default",
        color: "text-orange-600",
      };
    if (daysRemaining <= 90)
      return {
        label: `${Number.isNaN(daysRemaining) ? "N/A" : daysRemaining}d left`,
        variant: "secondary",
        color: "text-yellow-600",
      };
    return {
      label: `${Number.isNaN(daysRemaining) ? "N/A" : daysRemaining}d left`,
      variant: "outline",
      color: "text-gray-600",
    };
  };

  const badgeColorMap: Record<string, string> = {
    Expired: "bg-red-500 text-white",
    "Low Stock": "bg-yellow-500 text-white",
    Default: "bg-gray-200 text-gray-800",
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    setCurrentPage(newPage);
  };
  const [uniqueCategories, setUniqueCategories] = useState<string[]>([]);

  useEffect(() => {
    const categories = Array.from(
      new Set(products.map((prod) => prod.category).filter(Boolean))
    ) as string[];
    setUniqueCategories(categories);
  }, [products]);

  useEffect(() => {
    // Generate product names from existing products
    const productNames: ProductNameItem[] = products.map((p) => ({
      value: p.id,
      label: p.name,
      id: typeof p.id === "number" ? p.id : Number(p.id),
      name: p.name,
      sku: p.sku || "",
      itemCode: p.itemCode || "",
      itemClassCode: p.itemClassCode || "",
      packageUnitCode: p.packageUnitCode || "",
      quantityUnitCode: p.quantityUnitCode || "",
      category: p.category || "",
      expiryDate: p.expiryDate || "",
      batchNumber: p.batchNumber || "",
      unitPrice: p.unitPrice,
      minStock: p.minStock,
      description: p.description || "",
    }));
    setUniqueProductNames(productNames);
  }, [products]);

  useEffect(() => {
    const loadProductNames = async () => {
      if (debouncedProductSearch) {
        const results = await fetchProductNames(debouncedProductSearch);
        setUniqueProductNames(results);
      }
    };
    loadProductNames();
  }, [debouncedProductSearch]);

  const resetProductForm = () => {
    setEditingProduct(null);
    setSelectedProduct(null);
    setCategoryInput("");
    setFormData(createEmptyProductForm());
    setImageFile(null);
    setImagePreview("");
    setFormErrors({});
  };

  const openCreateDialog = () => {
    resetProductForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (product: Product) => {
    setEditingProduct(product);
    setSelectedProduct(
      buildProductOption({
        value: product.id,
        label: product.name,
        id: product.id,
        name: product.name,
        sku: product.sku,
        itemCode: product.itemCode,
        itemClassCode: product.itemClassCode,
        packageUnitCode: product.packageUnitCode,
        quantityUnitCode: product.quantityUnitCode,
        category: product.category,
        expiryDate: product.expiryDate,
        batchNumber: product.batchNumber,
        unitPrice: product.unitPrice,
        minStock: product.minStock,
        description: product.description,
      })
    );
    setCategoryInput(product.category || "");
    setFormData(productToFormData(product));
    setImageFile(null);
    setImagePreview("");
    setFormErrors({});
    setIsDialogOpen(true);
  };

  const handleSaveProduct = async () => {
    // Validate form before submission
    if (!validateForm(formData)) {
      return;
    }

    setLoading(true);

    try {
      let imageUrl = formData.imageUrl;

      // Upload image if a file is selected
      if (imageFile) {
        const formDataImage = new FormData();
        formDataImage.append('image', imageFile);

        try {
          const response = await fetch(`${import.meta.env.VITE_PUBLIC_API_URL}/upload/image`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`,
            },
            body: formDataImage,
          });

          if (response.ok) {
            const data = await response.json();
            imageUrl = data.imageUrl;
          } else {
            throw new Error('Image upload failed');
          }
        } catch (error) {
          console.error('Error uploading image:', error);
          toast.warn('Failed to upload image, saving product without image');
        } finally {
          // Image upload complete
        }
      }

      const productData = {
        ...formData,
        category: categoryInput,
        imageUrl,
        branchId: selectedBranchId,
        id: editingProduct?.id || crypto.randomUUID(),
      };

      if (editingProduct) {
        // Update existing product
        await apiClient.updateProduct(String(editingProduct.id), productData);
        toast.success(t('messages.productUpdated'));
      } else {
        // Add new product
        await apiClient.createProduct(productData);
        toast.success(t('messages.productAdded'));
      }


      // Refresh products list
      await getProducts({
        search: debouncedSearchTerm,
        category,
        expiryStatus,
        page: currentPage,
        limit: itemsPerPage,
        branchId: selectedBranchId,
      });

      // Reset form
      setIsDialogOpen(false);
      resetProductForm();
    } catch (error) {
      console.error("Failed to save product:", error);
      toast.error(t('messages.saveError'));

    } finally {
      setLoading(false);
    }
  };


  const confirmDelete = async () => {
    if (!productToDelete) return;
    setLoading(true);
    try {
      await apiClient.deleteProduct(String(productToDelete.id));
      toast.success(t('messages.productDeleted'));
      await getProducts({

        search: debouncedSearchTerm,
        category,
        expiryStatus,
        page: currentPage,
        limit: itemsPerPage,
        branchId: selectedBranchId,
      });
    } catch (error: any) {
      toast.error(`${t('messages.deleteError')}: ${error.message}`);

    } finally {
      setLoading(false);
      setDeleteDialogOpen(false);
      setProductToDelete(null);
    }
  };

  const downloadTemplate = () => {
    const templateData = [
      [
        "Product Name*",
        "Category*",
        "Unit Price*",
        "Quantity*",
        "Min Stock*",
        "Description",
        "Expiry Date (YYYY/MM/DD) - Optional",
        "Batch Number",
        "SKU",
        "VSDC Item Code",
        "VSDC Item Class Code",
        "Package Unit Code",
        "Quantity Unit Code",
      ],
      [
        "Paracetamol",
        "Medication",
        "5.99",
        "50",
        "100",
        "Pain reliever",
        "2025/12/31",
        "BATCH001",
        "PARA-500",
        "RW1NTXU0000001",
        "5059690800",
        "BX",
        "EA",
      ],
      [
        "Bandage",
        "First Aid",
        "2.50",
        "50",
        "200",
        "For wounds",
        "2025/12/31",
        "BATCH002",
        "BAND-STD",
        "RW1NTXU0000002",
        "3005100000",
        "PK",
        "EA",
      ],
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(templateData);

    const wscols = [
      { wch: 20 }, // Product Name
      { wch: 15 }, // Category
      { wch: 12 }, // Unit Price
      { wch: 12 }, // Quantity
      { wch: 12 }, // Min Stock
      { wch: 30 }, // Description
      { wch: 20 }, // Expiry Date
      { wch: 15 }, // Batch Number
      { wch: 16 }, // SKU
      { wch: 22 }, // Item Code
      { wch: 22 }, // Item Class Code
      { wch: 18 }, // Package Unit Code
      { wch: 18 }, // Quantity Unit Code
    ];
    ws["!cols"] = wscols;

    XLSX.utils.book_append_sheet(wb, ws, "Products Template");

    const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const data = new Blob([excelBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    saveAs(data, "Inventory_Upload_Template.xlsx");
  };

  const handleBulkUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      const processedProducts: any[] = [];
      const errors: any[] = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i] as (string | number | null | undefined)[];
        if (!row || row.every((cell: any) => cell === null || cell === ""))
          continue;

        try {
          if (
            !row[0] ||
            !row[1] ||
            row[2] === undefined ||
            row[3] === undefined
          ) {
            errors.push(`Row ${i + 1}: Missing required fields`);
            continue;
          }
          let expiryDate: Date | null = null;
          const rawDate = row[6];

          if (rawDate) {
            if (typeof rawDate === "number") {
              const excelEpoch = new Date(1899, 11, 30);
              expiryDate = new Date(
                excelEpoch.getTime() + (rawDate - 1) * 24 * 60 * 60 * 1000
              );
            } else if (typeof rawDate === "string" && rawDate.trim() !== "") {
              // Handle YYYY/MM/DD format
              const [year, month, day] = rawDate.split("/").map(Number);
              if (year && month && day) {
                const parsedDate = new Date(year, month - 1, day);
                if (!isNaN(parsedDate.getTime())) {
                  expiryDate = parsedDate;
                }
              }
              if (!expiryDate) {
                const parsedDate = new Date(rawDate);
                if (!isNaN(parsedDate.getTime())) {
                  expiryDate = parsedDate;
                }
              }
            } else if (
              rawDate &&
              Object.prototype.toString.call(rawDate) === "[object Date]" &&
              !isNaN(rawDate as unknown as number)
            ) {
              expiryDate = new Date(
                rawDate as unknown as string | number | Date
              );
            }
          }

          if (expiryDate) {
            expiryDate.setHours(0, 0, 0, 0);
            if (expiryDate < today) {
              errors.push(
                `Row ${i + 1}: Product "${row[0]
                }" has an expiry date in the past`
              );
              continue;
            }
          }

          const product = {
            name: String(row[0] || "").trim(),
            category: String(row[1] || "").trim(),
            unitPrice: Number(row[2]) || 0,
            quantity: Number(row[3]) || 0,
            minStock: Number(row[4]) || 0,
            description: String(row[5] || "").trim(),
            expiryDate: expiryDate ? expiryDate.toISOString() : "",
            batchNumber: String(row[7] || `BATCH-${Date.now()}-${i}`).trim(),
            sku: String(row[8] || "").trim(),
            itemCode: String(row[9] || "").trim(),
            itemClassCode: String(row[10] || "").trim(),
            packageUnitCode: String(row[11] || "").trim(),
            quantityUnitCode: String(row[12] || "").trim(),
          };

          if (isNaN(product.unitPrice) || product.unitPrice < 0) {
            errors.push(`Row ${i + 1}: Invalid unit price`);
            continue;
          }

          if (isNaN(product.minStock) || product.minStock < 0) {
            errors.push(`Row ${i + 1}: Invalid minimum stock`);
            continue;
          }

          processedProducts.push(product);
        } catch (error: any) {
          errors.push(`Error processing row ${i + 1}: ${error.message}`);
        }
      }

      if (errors.length > 0) {
        setValidationErrors(errors);
        setIsErrorsModalOpen(true);
        toast.error(`Found ${errors.length} error(s) in the uploaded file.`);
      }

      if (processedProducts.length > 0) {
        setPreviewItems(processedProducts);
        setIsPreviewModalOpen(true);
      } else if (errors.length === 0) {
        toast.error("The uploaded file is empty or not in the correct format.");
      }
      event.target.value = "";
    } catch (error) {
      console.error("Error processing file:", error);
      toast.error("There was an error processing the file. Please check the format and try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (previewItems.length === 0) return;
    setLoading(true);
    try {
      await apiClient.createProducts(previewItems, selectedBranchId);
      await getProducts({
        search: debouncedSearchTerm,
        category,
        expiryStatus,
        page: currentPage,
        limit: itemsPerPage,
        branchId: selectedBranchId,
      });
      toast.success(`Successfully imported ${previewItems.length} product(s)`);
      setIsPreviewModalOpen(false);
      setPreviewItems([]);
    } catch (error: any) {
      console.error("Error importing products:", error);
      // Display the actual error message from the API
      const errorMessage = error?.response?.data?.message || error?.response?.data?.error || error?.message || t('messages.importError');
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`min-h-screen ${theme === "dark" ? "bg-gray-900" : "bg-gray-50"
        } p-6`}
    >
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Toast Notification */}

        <div className="flex items-center justify-between">
          <div>
            <h1
              className={`text-3xl font-bold ${theme === "dark" ? "text-white" : "text-gray-900"
                }`}
            >
              {t('inventory.inventoryManagement')}
            </h1>

            <p
              className={`text-gray-600 ${theme === "dark" ? "text-gray-400" : ""
                }`}
            >
              {t('inventory.trackManageStock')}
            </p>

          </div>

          <div className="flex gap-2 items-center">
            <label className="cursor-pointer inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors h-10">
              <input
                type="file"
                accept=".xlsx"
                onChange={handleBulkUpload}
                className="hidden"
                disabled={isUploading}
              />
              {isUploading ? (
                <>
                  <Loader2 className="animate-spin h-4 w-4 mr-2" />
                  {t('common.uploading')}
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Import Product
                </>
              )}
            </label>

            <Button
              onClick={downloadTemplate}
              variant="outline"
              className="text-gray-700 border-gray-300 hover:bg-gray-50 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-800 h-10"
            >
              <Download className="h-4 w-4 mr-2" />
              {t('inventory.downloadTemplate')}
            </Button>

            {/* Add Product Modal */}
            <Dialog
              open={isDialogOpen}
              onOpenChange={(open) => {
                setIsDialogOpen(open);
                if (!open) {
                  resetProductForm();
                }
              }}
            >
              <DialogTrigger asChild>
                <Button
                  onClick={openCreateDialog}
                  className="bg-blue-600 hover:bg-blue-700 text-white transition-colors duration-200 h-10"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {t('inventory.addProduct')}
                </Button>
              </DialogTrigger>
              <DialogContent
                className={`max-h-[90vh] overflow-y-auto sm:max-w-[600px] ${theme === "dark"
                  ? "bg-gray-900 border-gray-700 text-gray-100"
                  : "bg-white border-gray-200"
                  } shadow-xl transition-all duration-200`}
              >
                <DialogHeader className="border-b border-gray-200 dark:border-gray-700 pb-4">
                  <DialogTitle
                    className={`text-lg font-semibold ${theme === "dark" ? "text-white" : "text-gray-900"
                      }`}
                  >
                    {editingProduct ? t('inventory.editProduct') : t('inventory.addNewProduct')}
                  </DialogTitle>

                </DialogHeader>
                <div
                  className={`space-y-6 py-2 px-1 ${theme === "dark" ? "bg-gray-900 t" : "bg-white"
                    }`}
                >
                  {/* Product Name Input */}
                  <div className="w-full">
                    <div className="flex justify-between items-center">
                      <label className="block mb-2">{t('inventory.productName')}</label>
                      {formErrors.name && <span className="text-red-500 text-sm">{formErrors.name}</span>}
                    </div>

                    <CreatableSelect
                      className="dark:text-white"
                      isClearable
                      placeholder={t('common.search')}

                      onInputChange={(value) => setProductSearch(value)}
                      onChange={(newValue: any) => {
                        const selectedOption = newValue
                          ? buildProductOption(newValue)
                          : null;
                        setSelectedProduct(selectedOption);
                        if (newValue) {
                          setFormData((prev) => ({
                            ...prev,
                            name: newValue.label,
                            sku: newValue.sku || "",
                            itemCode: newValue.itemCode || "",
                            itemClassCode: newValue.itemClassCode || "",
                            packageUnitCode: newValue.packageUnitCode || "",
                            quantityUnitCode: newValue.quantityUnitCode || "",
                            unitPrice: newValue.unitPrice || prev.unitPrice || 0,
                            minStock: newValue.minStock || prev.minStock || 0,
                            description: newValue.description || prev.description || "",
                          }));
                          if (newValue.category) {
                            setCategoryInput(newValue.category);
                          }
                        } else {
                          setFormData((prev) => ({
                            ...prev,
                            name: "",
                            sku: "",
                            itemCode: "",
                            itemClassCode: "",
                            packageUnitCode: "",
                            quantityUnitCode: "",
                            unitPrice: 0,
                            minStock: 0,
                            description: "",
                          }));
                          setCategoryInput("");
                        }
                      }}
                      onCreateOption={(inputValue) => {
                        const newProduct = buildProductOption({
                          value: inputValue,
                          label: inputValue,
                        });
                        setSelectedProduct(newProduct);
                        setFormData((prev) => ({
                          ...prev,
                          name: inputValue,
                          sku: "",
                          itemCode: "",
                          itemClassCode: "",
                          packageUnitCode: "",
                          quantityUnitCode: "",
                        }));
                      }}
                      options={uniqueProductNames}
                      value={selectedProduct}
                      styles={{
                        control: (base) => ({
                          ...base,
                          backgroundColor: theme === "dark" ? "#1f2937" : "white",
                          borderColor: theme === "dark" ? "#374151" : "#d1d5db",
                          color: theme === "dark" ? "white" : "black",
                        }),
                        singleValue: (base) => ({
                          ...base,
                          color: theme === "dark" ? "white" : "black",
                        }),
                        input: (base) => ({
                          ...base,
                          color: theme === "dark" ? "white" : "black",
                        }),
                        placeholder: (base) => ({
                          ...base,
                          color: theme === "dark" ? "#9ca3af" : "#6b7280", // gray tones
                        }),
                        menu: (base) => ({
                          ...base,
                          backgroundColor: theme === "dark" ? "#1f2937" : "white",
                        }),
                        option: (base, state) => ({
                          ...base,
                          backgroundColor: state.isFocused
                            ? theme === "dark"
                              ? "#374151"
                              : "#f3f4f6"
                            : theme === "dark"
                              ? "#1f2937"
                              : "white",
                          color: theme === "dark" ? "white" : "black",
                        }),
                      }}
                    />
                  </div>

                  {/* Category Input */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label>Category</Label>
                      {formErrors.category && <span className="text-red-500 text-sm">{formErrors.category}</span>}
                    </div>

                    <CreatableSelect
                      isClearable
                      placeholder={t('common.search')}

                      value={
                        categoryInput
                          ? { label: categoryInput, value: categoryInput }
                          : null
                      }
                      onChange={(newValue: any) => {
                        if (newValue) {
                          setCategoryInput(newValue.value);
                          if (!uniqueCategories.includes(newValue.value)) {
                            setUniqueCategories((prev) => [
                              ...prev,
                              newValue.value,
                            ]);
                          }
                        } else {
                          setCategoryInput("");
                        }
                      }}
                      options={uniqueCategories.map((cat) => ({
                        label: cat,
                        value: cat,
                      }))}
                      formatCreateLabel={(inputValue) => `➕ Add "${inputValue}"`}
                      styles={{
                        control: (base, state) => ({
                          ...base,
                          backgroundColor: theme === "dark" ? "#1f2937" : "white",
                          borderColor: state.isFocused
                            ? theme === "dark"
                              ? "#4b5563"
                              : "#9ca3af"
                            : theme === "dark"
                              ? "#374151"
                              : "#d1d5db",
                          boxShadow: state.isFocused
                            ? theme === "dark"
                              ? "0 0 0 1px #60a5fa"
                              : "0 0 0 1px #3b82f6"
                            : "none",
                          color: theme === "dark" ? "white" : "black",
                          transition: "all 0.2s ease-in-out",
                        }),
                        singleValue: (base) => ({
                          ...base,
                          color: theme === "dark" ? "white" : "black",
                        }),
                        input: (base) => ({
                          ...base,
                          color: theme === "dark" ? "white" : "black",
                        }),
                        placeholder: (base) => ({
                          ...base,
                          color: theme === "dark" ? "#9ca3af" : "#6b7280", // subtle gray
                        }),
                        menu: (base) => ({
                          ...base,
                          backgroundColor: theme === "dark" ? "#1f2937" : "white",
                          color: theme === "dark" ? "white" : "black",
                        }),
                        option: (base, state) => ({
                          ...base,
                          backgroundColor: state.isFocused
                            ? theme === "dark"
                              ? "#374151"
                              : "#f3f4f6"
                            : theme === "dark"
                              ? "#1f2937"
                              : "white",
                          color: theme === "dark" ? "white" : "black",
                          cursor: "pointer",
                        }),
                        dropdownIndicator: (base) => ({
                          ...base,
                          color: theme === "dark" ? "#9ca3af" : "#6b7280",
                          "&:hover": {
                            color: theme === "dark" ? "#d1d5db" : "#374151",
                          },
                        }),
                        clearIndicator: (base) => ({
                          ...base,
                          color: theme === "dark" ? "#9ca3af" : "#6b7280",
                          "&:hover": {
                            color: theme === "dark" ? "#f87171" : "#ef4444",
                          },
                        }),
                      }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>SKU</Label>
                      <Input
                        placeholder="e.g., PARA-500"
                        value={formData.sku}
                        onChange={(e) =>
                          setFormData({ ...formData, sku: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>VSDC Item Code</Label>
                      <Input
                        placeholder="e.g., RW1NTXU0000001"
                        value={formData.itemCode}
                        onChange={(e) =>
                          setFormData({ ...formData, itemCode: e.target.value })
                        }
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>VSDC Item Class Code</Label>
                      <Input
                        placeholder="e.g., 5059690800"
                        value={formData.itemClassCode}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            itemClassCode: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Package Unit Code</Label>
                      <Input
                        placeholder="e.g., BX"
                        value={formData.packageUnitCode}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            packageUnitCode: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Quantity Unit Code</Label>
                      <Input
                        placeholder="e.g., EA"
                        value={formData.quantityUnitCode}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            quantityUnitCode: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>

                  {/* Image Upload Input */}
                  <div className="space-y-2">
                    <Label>{t('inventory.productImage')} ({t('common.optional')})</Label>

                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              setImageFile(file);
                              // Create preview
                              const reader = new FileReader();
                              reader.onloadend = () => {
                                setImagePreview(reader.result as string);
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                          className="dark:bg-gray-800 dark:text-white"
                        />
                      </div>
                      {(imagePreview || formData.imageUrl) && (
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-20 border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
                            <img
                              src={imagePreview || formData.imageUrl}
                              alt="Product preview"
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setImageFile(null);
                              setImagePreview("");
                              setFormData({ ...formData, imageUrl: "" });
                            }}
                            className="text-red-600 hover:text-red-700"
                          >
                            Remove
                          </Button>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Upload an image for this product (JPG, PNG, max 5MB)
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label>{t('inventory.batchNumber')}</Label>

                      </div>
                      <Input
                        placeholder="e.g., A2301"
                        value={formData.batchNumber}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            batchNumber: e.target.value,
                          })
                        }
                      />
                      {formErrors.batchNumber && <span className="text-red-500 text-sm">{formErrors.batchNumber}</span>}
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label>{t('inventory.expiryDate')}</Label>

                      </div>
                      <Input
                        type="date"
                        className="text-gray-900 dark:text-white"
                        value={formData.expiryDate}
                        onChange={(e) =>
                          setFormData({ ...formData, expiryDate: e.target.value })
                        }
                      />
                      {formErrors.expiryDate && <span className="text-red-500 text-sm">{formErrors.expiryDate}</span>}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label>{t('inventory.unitPrice')}</Label>

                      </div>
                      <Input
                        placeholder="0.00"
                        step="0.01"
                        value={formData.unitPrice}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value) || 0;
                          setFormData({
                            ...formData,
                            unitPrice: value
                          });
                          if (formErrors.unitPrice) {
                            setFormErrors(prev => ({ ...prev, unitPrice: '' }));
                          }
                        }}
                        className={formErrors.unitPrice ? 'border-red-500' : ''}
                      />
                      {formErrors.unitPrice && <span className="text-red-500 text-sm">{formErrors.unitPrice}</span>}
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label>{t('inventory.quantity')}</Label>

                      </div>
                      <Input
                        placeholder="0"
                        value={formData.quantity}
                        onChange={(e) => {
                          const value = parseInt(e.target.value) || 0;
                          setFormData({
                            ...formData,
                            quantity: value
                          });
                          if (formErrors.quantity) {
                            setFormErrors(prev => ({ ...prev, quantity: '' }));
                          }
                        }}
                        className={formErrors.quantity ? 'border-red-500' : ''}
                      />
                      {formErrors.quantity && <span className="text-red-500 text-sm">{formErrors.quantity}</span>}
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label>{t('inventory.minStock')}</Label>

                      </div>
                      <Input
                        placeholder="0"
                        value={formData.minStock}
                        onChange={(e) => {
                          const value = parseInt(e.target.value) || 0;
                          setFormData({
                            ...formData,
                            minStock: value
                          });
                          if (formErrors.minStock) {
                            setFormErrors(prev => ({ ...prev, minStock: '' }));
                          }
                        }}
                        className={formErrors.minStock ? 'border-red-500' : ''}
                      />
                      {formErrors.minStock && <span className="text-red-500 text-sm">{formErrors.minStock}</span>}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('inventory.description')}</Label>

                    <Textarea
                      placeholder={t('inventory.description')}

                      value={formData.description}
                      onChange={(e) =>
                        setFormData({ ...formData, description: e.target.value })
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    className="w-full bg-blue-600 hover:bg-blue-700"
                    onClick={handleSaveProduct}
                    disabled={loading}
                  >
                    {loading
                      ? "Saving..."
                      : editingProduct
                        ? "Update Product"
                        : "Add Product"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>


        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {/* Low Stock Card */}
          <Card
            onClick={() => navigate('/dashboard/low-stock')}
            className={`shadow-sm cursor-pointer hover:opacity-90 transition-opacity px-4 py-3 ${theme === "dark" ? "bg-gray-800 border-gray-700" : ""
              }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('inventory.lowStock')}</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <p className="text-2xl font-bold text-yellow-600">{lowStockProducts || 0}</p>
                  <p className="text-xs text-gray-400">{t('inventory.itemsBelowMin')}</p>
                </div>
              </div>
              <div className="p-2 bg-yellow-100 dark:bg-yellow-900/20 rounded-full">
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
              </div>
            </div>
          </Card>

          {/* Expired Items Card */}
          <Card
            onClick={() => navigate('/dashboard/expired')}
            className={`shadow-sm cursor-pointer hover:opacity-90 transition-opacity px-4 py-3 ${theme === "dark" ? "bg-gray-800 border-gray-700" : ""
              }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('inventory.expired')}</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <p className="text-2xl font-bold text-red-600">{expiredProducts || 0}</p>
                  <p className="text-xs text-gray-400">{t('inventory.itemsPastExpiry')}</p>
                </div>
              </div>
              <div className="p-2 bg-red-100 dark:bg-red-900/20 rounded-full">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
            </div>
          </Card>

          {/* Expiring Soon Card */}
          <Card
            onClick={() => navigate('/dashboard/expiring-products')}
            className={`shadow-sm cursor-pointer hover:opacity-90 transition-opacity px-4 py-3 ${theme === "dark" ? "bg-gray-800 border-gray-700" : ""
              }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('inventory.expiringSoon')}</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <p className="text-2xl font-bold text-orange-600">{expiringProducts || 0}</p>
                  <p className="text-xs text-gray-400">{t('inventory.itemsExpiring90')}</p>
                </div>
              </div>
              <div className="p-2 bg-orange-100 dark:bg-orange-900/20 rounded-full">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
              </div>
            </div>
          </Card>
        </div>
        <div className="flex gap-4 flex-wrap items-end w-full md:w-auto">
          <div className="relative flex-1 min-w-[200px] space-y-1">
            <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('inventory.searchProducts')}
            </Label>
            <div className="relative group">
              <Search className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors ${searchTerm ? 'text-blue-500' : 'text-gray-400 group-focus-within:text-blue-500'
                }`} />
              <Input
                type="text"
                placeholder={t('inventory.searchPlaceholder')}
                className={`w-full max-w-2xl pl-10 pr-10 transition-all duration-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 rounded-lg ${theme === "dark"
                  ? " bg-gray-700 border-gray-600 text-white placeholder-gray-500"
                  : "bg-white border-gray-200 text-gray-900 placeholder-gray-400 hover:border-gray-300 shadow-sm"
                  }`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('inventory.category')}
            </Label>
            <select
              className={`border rounded-md px-3 py-2 w-full ${theme === "dark"
                ? "bg-gray-800 border-gray-700 text-gray-400"
                : "bg-white border-gray-300 text-gray-800"
                }`}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">{t('inventory.allCategories')}</option>
              {uniqueCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('inventory.expiryStatus')}
            </Label>
            <select
              className={`border rounded-md px-3 py-2 w-full ${theme === "dark"
                ? "bg-gray-800 border-gray-700 text-gray-400"
                : "bg-white border-gray-300 text-gray-800"
                }`}
              value={expiryStatus}
              onChange={(e) => setExpiryStatus(e.target.value)}
            >
              <option value="">{t('common.all')}</option>
              <option value="expired">{t('inventory.expired')}</option>
              <option value="expiring">{t('inventory.expiringSoon')}</option>
            </select>
          </div>
        </div>
        <div className="space-y-2">
          <Card className={theme === "dark" ? "border-none " : "border-none "}>
            <CardContent className="p-0 px-1">
              {loading ? (
                <TableSkeleton
                  rows={6}
                  columns={8}
                  className={theme === "dark" ? "bg-gray-800" : "bg-white"}
                  rowHeight="h-10"
                />
              ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-300 dark:border-gray-700">
                  <Table
                    className={`w-full ${theme === "dark" ? "text-gray-200" : "text-gray-800"
                      }`}
                  >
                    <TableHeader
                      className={theme === "dark" ? "bg-gray-800" : "bg-gray-50"}
                    >
                      <TableRow>
                        <TableHead
                          className={
                            theme === "dark" ? "text-gray-400" : "text-gray-600"
                          }
                        >
                          ID
                        </TableHead>
                        <TableHead
                          className={
                            theme === "dark" ? "text-gray-400" : "text-gray-600"
                          }
                        >
                          {t('common.product')}
                        </TableHead>

                        <TableHead
                          className={
                            theme === "dark" ? "text-gray-400" : "text-gray-600"
                          }
                        >
                          {t('inventory.batchNumber')}
                        </TableHead>

                        <TableHead
                          className={
                            theme === "dark" ? "text-gray-400" : "text-gray-600"
                          }
                        >
                          {t('inventory.qty')}
                        </TableHead>

                        <TableHead
                          className={
                            theme === "dark" ? "text-gray-400" : "text-gray-600"
                          }
                        >
                          {t('common.price')}
                        </TableHead>

                        <TableHead
                          className={
                            theme === "dark" ? "text-gray-400" : "text-gray-600"
                          }
                        >
                          {t('inventory.category')}
                        </TableHead>

                        <TableHead
                          className={
                            theme === "dark" ? "text-gray-400" : "text-gray-600"
                          }
                        >
                          {t('inventory.expiryDate')}
                        </TableHead>

                        <TableHead
                          className={
                            theme === "dark" ? "text-gray-400" : "text-gray-600"
                          }
                        >
                          {t('common.status')}
                        </TableHead>

                        <TableHead
                          className={
                            theme === "dark" ? "text-gray-400" : "text-gray-600"
                          }
                        >
                          {t('common.actions')}
                        </TableHead>

                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {products?.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={9}
                            className="text-center text-gray-600"
                          >
                            {t('messages.noData')}
                          </TableCell>

                        </TableRow>
                      ) : (
                        products?.map((item) => {
                          const status = getExpiryStatus(item.expiryDate || "");
                          return (
                            <TableRow
                              key={item.id}
                              className={`${theme === "dark"
                                ? "hover:bg-gray-800 border-b border-gray-800"
                                : "hover:bg-gray-50 border-b border-white"
                                }`}
                            >
                              <TableCell
                                className={
                                  theme === "dark"
                                    ? "text-blue-400 hover:text-blue-300"
                                    : "text-blue-600 hover:text-blue-700"
                                }
                              >
                                <button
                                  onClick={() => setViewProduct(item)}
                                  className="underline hover:no-underline font-mono text-xs select-all"
                                >
                                  {item.id}
                                </button>
                              </TableCell>
                              <TableCell
                                className={
                                  theme === "dark"
                                    ? "text-gray-300"
                                    : "text-gray-900"
                                }
                              >
                                {item.name}
                              </TableCell>
                              <TableCell
                                className={
                                  theme === "dark"
                                    ? "text-gray-300"
                                    : "text-gray-900"
                                }
                              >
                                {item.batchNumber}
                              </TableCell>
                              <TableCell
                                className={
                                  theme === "dark"
                                    ? "text-gray-300"
                                    : "text-gray-900"
                                }
                              >
                                {item.quantity}
                              </TableCell>
                              <TableCell
                                className={
                                  theme === "dark"
                                    ? "text-gray-300"
                                    : "text-gray-900"
                                }
                              >
                                {Number(item.unitPrice).toFixed(2)} Frw
                              </TableCell>
                              <TableCell
                                className={
                                  theme === "dark"
                                    ? "text-gray-300"
                                    : "text-gray-900"
                                }
                              >
                                {item.category}
                              </TableCell>
                              <TableCell className={status.color}>
                                {item.expiryDate
                                  ? new Date(item.expiryDate).toLocaleDateString()
                                  : "N/A"}
                              </TableCell>
                              <TableCell
                                className={
                                  theme === "dark"
                                    ? "text-gray-300"
                                    : "text-gray-900"
                                }
                              >
                                <Badge
                                  className={
                                    badgeColorMap[status.label] ??
                                    badgeColorMap["Default"]
                                  }
                                >
                                  {status.label === " " ? "N/A" : status.label}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openEditDialog(item)}
                                    className="h-8 px-2"
                                    title={t('inventory.editProduct') || 'Edit Product'}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setSelectedProductForHistory(item.id);
                                      setHistoryDialogOpen(true);
                                    }}
                                    className="h-8 px-2"
                                    title={t('inventory.viewHistory') || 'View History'}
                                  >
                                    <History className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setSelectedProductForAdjustment({
                                        id: item.id,
                                        name: item.name,
                                        quantity: item.quantity,
                                      });
                                      setAdjustmentDialogOpen(true);
                                    }}
                                    className="h-8 px-2"
                                    title={t('inventory.adjustStock') || 'Adjust Stock'}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pagination */}
          <div className="flex items-center justify-end gap-6 border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
            <div className="flex items-center gap-2">
              <span className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                {t('common.rowsPerPage') || "Rows per page:"}
              </span>
              <select
                className={`border rounded-md px-2 py-1 text-sm ${theme === "dark"
                  ? "bg-gray-800 border-gray-700 text-gray-300"
                  : "bg-white border-gray-300 text-gray-700"
                  }`}
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
              >
                {[10, 20, 50, 100].map(size => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`text-sm font-medium ${theme === "dark" ? "text-gray-300" : "text-gray-600"
                  }`}
              >
                {t('customers.pageXOfY', { current: currentPage, total: totalPages })}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === 1}
                onClick={() => handlePageChange(currentPage - 1)}
                className={`${theme === "dark"
                  ? "bg-gray-800 hover:bg-gray-700 border-gray-700 text-white"
                  : "bg-white hover:bg-gray-100 border-gray-300 text-gray-800"
                  } transition-colors duration-200`}
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> {t('common.prev')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === totalPages}
                onClick={() => handlePageChange(currentPage + 1)}
                className={`${theme === "dark"
                  ? "bg-gray-800 hover:bg-gray-700 border-gray-700 text-white"
                  : "bg-white hover:bg-gray-100 border-gray-300 text-gray-800"
                  } transition-colors duration-200`}
              >
                {t('common.next')} <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        </div>


        <ViewProductDialog
          viewProduct={viewProduct}
          setViewProduct={setViewProduct}
          onStockUpdated={() => {
            getProducts({
              search: debouncedSearchTerm,
              category,
              expiryStatus,
              page: currentPage,
              limit: itemsPerPage,
            });
          }}
        />

        {/* Inventory History Dialog */}
        <InventoryHistoryDialog
          productId={selectedProductForHistory}
          productName={products.find(p => p.id === selectedProductForHistory)?.name}
          open={historyDialogOpen}
          onOpenChange={setHistoryDialogOpen}
        />

        {/* Stock Adjustment Dialog */}
        <StockAdjustmentDialog
          productId={selectedProductForAdjustment?.id || null}
          productName={selectedProductForAdjustment?.name}
          currentStock={selectedProductForAdjustment?.quantity}
          open={adjustmentDialogOpen}
          onOpenChange={setAdjustmentDialogOpen}
          onSuccess={() => {
            getProducts({
              search: debouncedSearchTerm,
              category,
              expiryStatus,
              page: currentPage,
              limit: itemsPerPage,
            });
            setSelectedProductForAdjustment(null);
          }}
        />

        <ConfirmDialog
          open={deleteDialogOpen}
          onClose={() => setDeleteDialogOpen(false)}
          onConfirm={confirmDelete}
          title={t('common.confirmDelete') || "Confirm Deletion"}
          message={`${t('messages.confirmDeleteProduct') || "Are you sure you want to delete"} ${productToDelete?.name}?`}
          confirmText={t('common.delete') || "Delete"}
          variant="destructive"
          loading={loading}
        />

        {/* Validation Errors Modal */}
        <Dialog open={isErrorsModalOpen} onOpenChange={setIsErrorsModalOpen}>
          <DialogContent className="max-h-[80vh] overflow-y-auto bg-white dark:bg-gray-800 dark:text-white">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold">
                {t('common.error')}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Found {validationErrors.length} error(s) in the uploaded file.
                Please fix these issues and try again.
              </p>
              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-[60vh] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[100px]">{t('common.row')}</TableHead>
                        <TableHead>{t('common.message')}</TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {validationErrors.map((error, index) => {
                        const rowMatch = error.match(/Row (\d+):/);
                        const rowNumber = rowMatch ? rowMatch[1] : "N/A";
                        const errorMessage = error.replace(/^Row \d+: /, "");

                        return (
                          <TableRow key={index}>
                            <TableCell className="font-medium">
                              {rowNumber}
                            </TableCell>
                            <TableCell className="text-red-600 dark:text-red-400">
                              {errorMessage}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
              <div className="flex justify-end space-x-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setIsErrorsModalOpen(false)}
                  className={`${theme === "dark"
                    ? "bg-gray-800 hover:bg-gray-700 border-gray-700 text-white"
                    : "bg-white hover:bg-gray-100 border-gray-300 text-gray-800"
                    }`}
                >
                  {t('common.close')}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Excel Preview Modal */}
        <Dialog open={isPreviewModalOpen} onOpenChange={setIsPreviewModalOpen}>
          <DialogContent className={`sm:max-w-4xl max-h-[90vh] flex flex-col p-0 ${theme === "dark" ? "bg-gray-900 text-white" : "bg-white"}`}>
            <DialogHeader className="p-6 pb-2">
              <DialogTitle>{t('inventory.previewImport')}</DialogTitle>
            </DialogHeader>

            <div className="flex-1 flex flex-col min-h-0 px-6 pb-6">
              <p className="text-sm text-gray-500 mb-4">
                Please review the products to be imported. Found {previewItems.length} valid items.
              </p>

              <ScrollArea className="h-[60vh] border rounded-md">
                <div className="min-w-[1500px]">
                  <Table>
                    <TableHeader className={theme === "dark" ? "bg-gray-800" : "bg-gray-50"}>
                      <TableRow>
                        <TableHead className="whitespace-nowrap">Name</TableHead>
                        <TableHead className="whitespace-nowrap">Category</TableHead>
                        <TableHead className="whitespace-nowrap">Price</TableHead>
                        <TableHead className="whitespace-nowrap">Qty</TableHead>
                        <TableHead className="whitespace-nowrap">Min Stock</TableHead>
                        <TableHead className="whitespace-nowrap">Description</TableHead>
                        <TableHead className="whitespace-nowrap">Expiry</TableHead>
                        <TableHead className="whitespace-nowrap">Batch</TableHead>
                        <TableHead className="whitespace-nowrap">SKU</TableHead>
                        <TableHead className="whitespace-nowrap">Item Code</TableHead>
                        <TableHead className="whitespace-nowrap">Item Class</TableHead>
                        <TableHead className="whitespace-nowrap">Pkg Unit</TableHead>
                        <TableHead className="whitespace-nowrap">Qty Unit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewItems.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium whitespace-nowrap">{item.name}</TableCell>
                          <TableCell className="whitespace-nowrap">{item.category}</TableCell>
                          <TableCell className="whitespace-nowrap">{item.unitPrice}</TableCell>
                          <TableCell className="whitespace-nowrap">{item.quantity}</TableCell>
                          <TableCell className="whitespace-nowrap">{item.minStock}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{item.description}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">
                            {item.expiryDate ? new Date(item.expiryDate).toLocaleDateString() : 'N/A'}
                          </TableCell>
                          <TableCell className="whitespace-nowrap font-mono text-xs">{item.batchNumber}</TableCell>
                          <TableCell className="whitespace-nowrap font-mono text-xs">{item.sku || 'N/A'}</TableCell>
                          <TableCell className="whitespace-nowrap font-mono text-xs">{item.itemCode || 'N/A'}</TableCell>
                          <TableCell className="whitespace-nowrap font-mono text-xs">{item.itemClassCode || 'N/A'}</TableCell>
                          <TableCell className="whitespace-nowrap font-mono text-xs">{item.packageUnitCode || 'N/A'}</TableCell>
                          <TableCell className="whitespace-nowrap font-mono text-xs">{item.quantityUnitCode || 'N/A'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>

              <div className="flex justify-end gap-3 pt-6 mt-auto">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsPreviewModalOpen(false);
                    setPreviewItems([]);
                  }}
                  className={theme === "dark" ? "border-gray-700 hover:bg-gray-800" : ""}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleConfirmImport}
                  disabled={loading}
                  className="bg-green-600 hover:bg-green-700 text-white min-w-[140px]"
                >
                  {loading ? (
                    <>
                      <Loader2 className="animate-spin h-4 w-4 mr-2" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Confirm Import
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};
