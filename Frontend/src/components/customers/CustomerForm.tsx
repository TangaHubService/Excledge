import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { useTheme } from '../../context/ThemeContext';
import { useEffect } from 'react';
import PhoneInputWithCountryCode from '../../components/PhoneInputWithCountryCode';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { zodResolver } from '@hookform/resolvers/zod';

import type { Customer } from '../../types/customer';
import { createCustomerSchema, updateCustomerSchema, type CreateCustomerInput, type UpdateCustomerInput } from '../../schema';

interface CustomerFormProps {
    initialData?: Partial<Customer>;
    onSubmit: (data: CreateCustomerInput | UpdateCustomerInput) => void;
    onClose: () => void;
    isLoading: boolean;
}

export function CustomerForm({
    initialData,
    onSubmit,
    onClose,
    isLoading,
}: CustomerFormProps) {
    const { t } = useTranslation();
    const { theme } = useTheme();

    const isEditMode = !!initialData?.id;
    const schema = isEditMode ? updateCustomerSchema : createCustomerSchema;

    const {
        register,
        handleSubmit,
        setValue,
        reset,
        formState: { errors: formErrors },
        watch,
    } = useForm<CreateCustomerInput | UpdateCustomerInput>({
        resolver: zodResolver(schema),
        defaultValues: {
            name: '',
            email: '',
            phone: '',
            customerType: 'INDIVIDUAL',
        },
    });

    useEffect(() => {
        if (initialData) {
            const formData = {
                name: initialData.name || '',
                email: initialData.email || '',
                phone: initialData.phone || '',
                customerType: (initialData as any).customerType || 'INDIVIDUAL',
            };
            reset(formData);
        } else {
            reset({
                name: '',
                email: '',
                phone: '',
                customerType: 'INDIVIDUAL',
            });
        }
    }, [initialData, reset]);

    const phoneValue = watch('phone');

    const handleFormSubmit = (data: CreateCustomerInput | UpdateCustomerInput) => {
        onSubmit(data);
    };

    return (
        <Dialog open={true} onOpenChange={onClose}>
            <DialogContent
                className={`w-full ${theme === 'dark' ? 'bg-gray-800 border border-gray-700 text-white' : 'bg-white border border-gray-200 text-gray-900'} rounded-lg p-6`}
            >
                <DialogHeader>
                    <DialogTitle className="text-xl font-semibold mb-2">
                        {initialData?.id ? t('customers.editCustomer') : t('customers.addNewCustomer')}
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4 w-full max-w-full">
                    <div>
                        <label
                            htmlFor="name"
                            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                        >
                            {t('customers.fullName')} *
                        </label>

                        <input
                            id="name"
                            type="text"
                            className={`w-full max-w-full rounded-md border ${formErrors.name ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'} px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white`}
                            {...register('name')}
                        />
                        {formErrors.name && (
                            <p className="mt-1 text-sm text-red-600">{String(formErrors.name.message)}</p>
                        )}
                    </div>

                    <div>
                        <label
                            htmlFor="email"
                            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                        >
                            {t('common.email')}
                        </label>

                        <input
                            id="email"
                            type="email"
                            className={`w-full max-w-full rounded-md border ${formErrors.email ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'} px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white`}
                            {...register('email')}
                        />

                    </div>

                    <div>
                        <PhoneInputWithCountryCode
                            value={phoneValue}
                            onChange={(value: string) => setValue('phone', value, { shouldValidate: false })}
                            className={`w-full max-w-full ${formErrors.phone ? 'border-red-500' : ''}`}
                            placeholder="e.g. 788123456"
                            disabled={isLoading}
                            error={formErrors.phone ? String(formErrors.phone.message) : ''}
                        />
                    </div>

                    <div>
                        <label
                            htmlFor="customerType"
                            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                        >
                            {t('customers.customerType')} *
                        </label>

                        <select
                            id="customerType"
                            className={`w-full max-w-full rounded-md border ${formErrors.customerType ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'} px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white`}
                            {...register('customerType')}
                        >
                            <option value="INDIVIDUAL">{t('customers.individual')}</option>
                            <option value="CORPORATE">{t('customers.corporate')}</option>
                            <option value="INSURANCE">{t('customers.insurance')}</option>
                        </select>

                        {formErrors.customerType && (
                            <p className="mt-1 text-sm text-red-600">{String(formErrors.customerType.message)}</p>
                        )}
                    </div>

                    {isEditMode && (
                        <div>
                            <label
                                htmlFor="TIN"
                                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                            >
                                {t('customers.tin')}
                            </label>

                            <input
                                id="TIN"
                                type="text"
                                className={`w-full max-w-full rounded-md border ${formErrors.TIN ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'} px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white`}
                                {...register('TIN')}
                            />
                            {formErrors.TIN && (
                                <p className="mt-1 text-sm text-red-600">{String(formErrors.TIN.message)}</p>
                            )}
                        </div>
                    )}

                    <DialogFooter className="flex justify-end space-x-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className={`px-4 py-2 text-sm font-medium ${theme === 'dark' ? 'text-gray-300 bg-gray-900 border border-gray-700 hover:bg-gray-800' : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'} rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
                            disabled={isLoading}
                        >
                            {t('common.cancel')}
                        </button>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading ? (
                                <span className="flex items-center">
                                    <svg
                                        className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                                        xmlns="http://www.w3.org/2000/svg"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                    >
                                        <circle
                                            className="opacity-25"
                                            cx="12"
                                            cy="12"
                                            r="10"
                                            stroke="currentColor"
                                            strokeWidth="4"
                                        ></circle>
                                        <path
                                            className="opacity-75"
                                            fill="currentColor"
                                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                        ></path>
                                    </svg>
                                    {initialData?.id ? t('common.updating') : t('common.creating')}
                                </span>
                            ) : initialData?.id ? (
                                t('customers.updateCustomer')
                            ) : (
                                t('customers.createCustomer')
                            )}

                        </button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}