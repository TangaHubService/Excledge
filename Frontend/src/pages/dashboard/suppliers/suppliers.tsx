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
    Drawer,
    DrawerContent,
    DrawerHeader,
    DrawerTitle,
} from "../../../components/ui/drawer";
import { useTheme } from '../../../context/ThemeContext';
import type {
    Supplier,
    FormData,
    SuppliersPageProps
} from './types/supplierTypes';
import { useTranslation } from 'react-i18next';
import { useDebounce } from '../../../hooks/use-debounce';
import { PageHeader } from "../../../components/common/PageHeader";

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
                await apiClient.updateSupplier(editingSupplier.id, formData, organizationId);
                showToast(t('suppliers.supplierUpdated'));
            } else {
                await apiClient.createSupplier(organizationId, formData);
                showToast(t('suppliers.supplierCreated'));
            }
            setIsDialogOpen(false);
            resetForm();
            await fetchSuppliers();
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
            await apiClient.deleteSupplier(supplierToDelete, organizationId);
            showToast(t('suppliers.supplierDeleted'));
            await fetchSuppliers();
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

    const handleAdd = () => {
        resetForm();
        setIsDialogOpen(true);
    };

    const showToast = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'success') => {
        setToast({ message, type });
    };

    const filteredSuppliers = suppliers.filter(supplier =>
        supplier.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        supplier.email.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        (supplier.phone && supplier.phone.toLowerCase().includes(debouncedSearchTerm.toLowerCase())) ||
        (supplier.contactPerson && supplier.contactPerson.toLowerCase().includes(debouncedSearchTerm.toLowerCase())) ||
        (supplier.address && supplier.address.toLowerCase().includes(debouncedSearchTerm.toLowerCase())) ||
        (supplier.TIN && supplier.TIN.toLowerCase().includes(debouncedSearchTerm.toLowerCase()))
    );

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <PageHeader
              title={t('suppliers.title')}
              description={<>Manage your suppliers and their contact information</>}
              actions={
                <>
                  <button
                      type="button"
                      onClick={() => setIsImportDialogOpen(true)}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-card/20 hover:bg-card/30 border border-white/30 text-white text-sm font-semibold rounded-lg backdrop-blur-sm transition-all"
                  >
                      <Upload className="h-4 w-4" />
                      {t('common.import')}
                  </button>
                  <button
                      type="button"
                      onClick={handleAdd}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
                  >
                      <Plus className="h-4 w-4" />
                      {t('suppliers.addSupplier')}
                  </button>
                </>
              }
            />

            <SuppliersCard
                loading={loading}
                suppliers={filteredSuppliers}
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                onAdd={handleAdd}
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

            <Drawer open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
                <DrawerContent
                    className={`max-w-4xl overflow-y-auto ${theme === "dark"
                        ? "bg-gray-900 border-gray-700 text-gray-100"
                        : "bg-card border-border text-foreground"
                        }`}
                >
                    <DrawerHeader>
                        <DrawerTitle className={theme === "dark" ? "text-white" : "text-foreground"}>
                            {t("import.supplierImport")}
                        </DrawerTitle>
                    </DrawerHeader>
                    <SupplierImport onSuccess={() => {
                        setIsImportDialogOpen(false);
                        fetchSuppliers();
                    }} />
                </DrawerContent>
            </Drawer>

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
