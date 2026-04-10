import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Upload } from 'lucide-react';
import {
    SuppliersCard,
    SupplierDialog,
    Toast
} from './components';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import { SupplierImport } from '../imports/SupplierImport';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "../../../components/ui/dialog";
import { useTheme } from '../../../context/ThemeContext';
import type {
    Supplier,
    FormData,
    SuppliersPageProps
} from './types/supplierTypes';
import { useTranslation } from 'react-i18next';
import { useDebounce } from '../../../hooks/use-debounce';

// Main SuppliersPage Component
const SuppliersPage = ({ apiClient, organizationId }: SuppliersPageProps) => {
    const { t } = useTranslation();
    const { theme } = useTheme();
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const debouncedSearchTerm = useDebounce(searchTerm, 500);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
    const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' | 'warning' } | null>(null);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [supplierToDelete, setSupplierToDelete] = useState<string | number | null>(null);

    const [formData, setFormData] = useState<FormData>({
        name: "",
        email: "",
        phone: "",
        address: "",
        contactPerson: "",
    });

    const fetchSuppliers = useCallback(async () => {
        try {
            setLoading(true);
            const response = await apiClient.getSuppliers(organizationId);
            setSuppliers(response.suppliers || []);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : t('suppliers.fetchError');
            showToast(errorMessage, 'error');
        } finally {
            setLoading(false);
        }
    }, [apiClient, organizationId, t]);

    useEffect(() => {
        if (organizationId) {
            fetchSuppliers();
        }
    }, [organizationId, fetchSuppliers]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingSupplier) {
                await apiClient.updateSupplier(editingSupplier.id, formData);
                showToast(t('suppliers.supplierUpdated'));
            } else {
                await apiClient.createSupplier(organizationId, formData);
                showToast(t('suppliers.supplierCreated'));
            }
            setIsDialogOpen(false);
            resetForm();
            fetchSuppliers();
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : t('suppliers.saveError');
            showToast(errorMessage, 'error');
        }
    };

    const handleDelete = (id: string | number) => {
        setSupplierToDelete(id);
        setDeleteDialogOpen(true);
    };

    const confirmDelete = async () => {
        if (!supplierToDelete) return;

        try {
            await apiClient.deleteSupplier(supplierToDelete);
            showToast(t('suppliers.supplierDeleted'));
            fetchSuppliers();
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : t('suppliers.deleteError');
            showToast(errorMessage, 'error');
        } finally {
            setDeleteDialogOpen(false);
            setSupplierToDelete(null);
        }
    };

    const handleEdit = (supplier: Supplier) => {
        setEditingSupplier(supplier);
        setFormData({
            name: supplier.name,
            email: supplier.email,
            phone: supplier.phone || '',
            address: supplier.address || '',
            contactPerson: supplier.contactPerson || '',
        });
        setIsDialogOpen(true);
    };

    const resetForm = () => {
        setFormData({
            name: "",
            email: "",
            phone: "",
            address: "",
            contactPerson: "",
        });
        setEditingSupplier(null);
    };

    const showToast = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'success') => {
        setToast({ message, type });
    };

    const filteredSuppliers = suppliers.filter(supplier =>
        supplier.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        supplier.email.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        (supplier.phone && supplier.phone.toLowerCase().includes(debouncedSearchTerm.toLowerCase())) ||
        (supplier.contactPerson && supplier.contactPerson.toLowerCase().includes(debouncedSearchTerm.toLowerCase())) ||
        (supplier.address && supplier.address.toLowerCase().includes(debouncedSearchTerm.toLowerCase()))
    );

    return (
        <div className="container mx-auto px-4 py-8 dark:bg-gray-900 min-h-screen">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">{t('suppliers.title')}</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage your suppliers and their contact information</p>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <button
                        onClick={() => setIsImportDialogOpen(true)}
                        className="flex-1 md:flex-none inline-flex items-center justify-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-semibold rounded-lg shadow-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all active:scale-95"
                    >
                        <Upload className="h-4 w-4 mr-2" />
                        {t('common.import')}
                    </button>
                    <button
                        onClick={() => {
                            resetForm();
                            setIsDialogOpen(true);
                        }}
                        className="flex-1 md:flex-none inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-semibold rounded-lg shadow-md text-white bg-blue-600 hover:bg-blue-700 transition-all active:scale-95 shadow-blue-500/20"
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        {t('suppliers.addSupplier')}
                    </button>
                </div>
            </div>

            <SuppliersCard
                loading={loading}
                suppliers={filteredSuppliers}
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                onEdit={handleEdit}
                onDelete={handleDelete}
            />

            <SupplierDialog
                isOpen={isDialogOpen}
                onClose={() => {
                    setIsDialogOpen(false);
                    resetForm();
                }}
                onSubmit={handleSubmit}
                formData={formData}
                setFormData={setFormData}
                editingSupplier={editingSupplier}
            />

            <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
                <DialogContent
                    className={`max-w-4xl max-h-[90vh] overflow-y-auto ${theme === "dark"
                        ? "bg-gray-900 border-gray-700 text-gray-100"
                        : "bg-white border-gray-200 text-gray-900"
                        }`}
                >
                    <DialogHeader>
                        <DialogTitle className={theme === "dark" ? "text-white" : "text-gray-900"}>
                            {t("import.supplierImport")}
                        </DialogTitle>
                    </DialogHeader>
                    <SupplierImport onSuccess={() => {
                        setIsImportDialogOpen(false);
                        fetchSuppliers();
                    }} />
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                open={deleteDialogOpen}
                onClose={() => setDeleteDialogOpen(false)}
                onConfirm={confirmDelete}
                title={t('common.confirmDelete') || "Confirm Deletion"}
                message={`${t('messages.confirmDeleteSupplier') || "Are you sure you want to delete"} ${supplierToDelete ? suppliers.find(s => String(s.id) === String(supplierToDelete))?.name : 'this supplier'}?`}
                confirmText={t('common.delete') || "Delete"}
                variant="destructive"
                loading={loading}
            />
            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast(null)}
                />
            )}
        </div>
    );
};

export default SuppliersPage;