import React, { useState } from 'react';
import type { SupplierDialogProps } from '../types/supplierTypes';
import PhoneInputWithCountryCode from '../../../../components/PhoneInputWithCountryCode';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter, DrawerClose } from "../../../../components/ui/drawer";

interface FormErrors {
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
    contactPerson?: string;
}

export const SupplierDialog: React.FC<SupplierDialogProps> = ({
    isOpen,
    onClose,
    editingSupplier,
    formData,
    setFormData,
    onSubmit,
}) => {
    const [errors, setErrors] = useState<FormErrors>({});
    const [loading, setLoading] = useState(false);

    const validateForm = (): boolean => {
        const newErrors: FormErrors = {};

        if (!formData.name.trim()) {
            newErrors.name = 'Supplier name is required';
        }

        if (!formData.email.trim()) {
            newErrors.email = 'Email is required';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            newErrors.email = 'Please enter a valid email address';
        }

        if (!formData.phone.trim()) {
            newErrors.phone = 'Phone number is required';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (validateForm()) {
            setLoading(true);
            try {
                await onSubmit(e);
            } finally {
                setLoading(false);
            }
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handlePhoneChange = (value: string) => {
        setFormData(prev => ({
            ...prev,
            phone: value
        }));
    };

    return (
        <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DrawerContent className="max-w-md w-full">
                <DrawerHeader>
                    <DrawerTitle>{editingSupplier ? "Edit Supplier" : "Add New Supplier"}</DrawerTitle>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        {editingSupplier ? "Update supplier information" : "Add a new supplier"}
                    </p>
                </DrawerHeader>

                <form onSubmit={handleSubmit} className="p-4 space-y-3 overflow-y-auto">
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-0.5">
                            Supplier Name <span className="text-danger">*</span>
                        </label>
                        <input
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            className={`w-full px-3 py-1.5 border rounded-md ${errors.name ? 'border-red-500' : 'border-border'
                                } dark:text-white text-sm`}
                        />
                        {errors.name && <p className="mt-0.5 text-xs text-danger">{errors.name}</p>}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-foreground mb-0.5">
                            Email <span className="text-danger">*</span>
                        </label>
                        <input
                            type="email"
                            name="email"
                            required
                            value={formData.email}
                            onChange={handleChange}
                            className={`w-full px-3 py-1.5 border rounded-md ${errors.email ? 'border-red-500' : 'border-border'
                                } dark:text-white text-sm`}
                        />
                        {errors.email && <p className="mt-0.5 text-xs text-danger">{errors.email}</p>}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-foreground mb-0.5">
                            Phone Number <span className="text-danger">*</span>
                        </label>
                        <PhoneInputWithCountryCode
                            value={formData.phone || ''}
                            onChange={handlePhoneChange}
                            placeholder="e.g. 700 000 000"
                            className={errors.phone ? 'border-red-500' : ''}
                        />
                        {errors.phone && <p className="mt-0.5 text-xs text-danger">{errors.phone}</p>}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-foreground mb-0.5">
                            Contact Person
                        </label>
                        <input
                            type="text"
                            name="contactPerson"
                            value={formData.contactPerson}
                            onChange={handleChange}
                            className="w-full px-3 py-1.5 border border-border rounded-md dark:text-white text-sm"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-foreground mb-0.5">
                            Address
                        </label>
                        <textarea
                            name="address"
                            value={formData.address}
                            onChange={handleChange}
                            rows={2}
                            className="w-full px-3 py-1.5 border border-border rounded-md dark:text-white text-sm"
                        />
                    </div>

                    <DrawerFooter className="px-0 pb-0">
                        <DrawerClose asChild>
                            <button
                                type="button"
                                disabled={loading}
                                className="px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-md hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Cancel
                            </button>
                        </DrawerClose>
                        <button
                            type="submit"
                            disabled={loading}
                            className={`px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring flex items-center justify-center space-x-2 ${loading ? 'opacity-75 cursor-not-allowed' : ''
                                }`}
                        >
                            {loading ? (
                                <>
                                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    {editingSupplier ? 'Updating...' : 'Adding...'}
                                </>
                            ) : (
                                editingSupplier ? 'Update' : 'Add'
                            )}
                        </button>
                    </DrawerFooter>
                </form>
            </DrawerContent>
        </Drawer>
    );
};