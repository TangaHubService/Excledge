import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '../../components/ui/drawer';
import { useEffect } from 'react';
import PhoneInputWithCountryCode from '../../components/PhoneInputWithCountryCode';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { yupResolver } from '@hookform/resolvers/yup';

import type { CustomerFormData } from '../../types/customer';
import { customerSchema } from '../../schema/customer';

interface CustomerFormProps {
    initialData: Partial<CustomerFormData>;
    onSubmit: (data: CustomerFormData) => void;
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


    const {
        register,
        handleSubmit,
        setValue,
        reset,
        formState: { errors: formErrors },
        watch,
    } = useForm<CustomerFormData>({
        resolver: yupResolver(customerSchema) as any,
        defaultValues: {
            name: '',
            email: '',
            phone: '',
            tin: '',
            type: 'INDIVIDUAL',
            balance: 0,
        },
    });

    useEffect(() => {
        if (initialData) {
            const formData = {
                name: initialData.name || '',
                email: initialData.email || '',
                phone: initialData.phone || '',
                tin: initialData.tin || '',
                type: initialData.type || 'INDIVIDUAL',
                balance: initialData.balance || 0,
            };
            reset(formData);
        } else {
            reset({
                name: '',
                email: '',
                phone: '',
                tin: '',
                type: 'INDIVIDUAL',
                balance: 0,
            });
        }
    }, [initialData, reset]);

    const phoneValue = watch('phone');



    const handleFormSubmit = (data: CustomerFormData) => {
        onSubmit(data);
    };

    return (
        <Drawer open={true} onOpenChange={onClose}>
      <DrawerContent
        className="sm:max-w-[680px] bg-white border-gray-200"
      >
        <DrawerHeader>
          <DrawerTitle className="text-xl font-semibold mb-2">
            {initialData?.id ? t('customers.editCustomer') : t('customers.addNewCustomer')}
          </DrawerTitle>
        </DrawerHeader>


                <div className="px-6 pb-6">
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-5 space-y-5">
                        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
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
                                    className={`w-full rounded-md border bg-white dark:bg-gray-700 ${formErrors.name ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'} px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white`}
                                    {...register('name')}
                                />
                                {formErrors.name && (
                                    <p className="mt-1 text-sm text-red-600">{formErrors.name.message}</p>
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
                                    className={`w-full rounded-md border bg-white dark:bg-gray-700 ${formErrors.email ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'} px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white`}
                                    {...register('email')}
                                />

                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    {t('customers.phoneNumber')}
                                </label>
                                <PhoneInputWithCountryCode
                                    value={phoneValue ?? undefined}
                                    onChange={(value: string) => setValue('phone', value, { shouldValidate: false })}
                                    className={`w-full ${formErrors.phone ? 'border-red-500' : ''}`}
                                    placeholder="e.g. 788123456"
                                    disabled={isLoading}
                                    error={formErrors.phone ? String(formErrors.phone.message) : ''}
                                />
                            </div>

                            <div>
                                <label
                                    htmlFor="tin"
                                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                                >
                                    {t('customers.tinNumber') || 'TIN Number'}
                                </label>
                                <input
                                    id="tin"
                                    type="text"
                                    placeholder="e.g. 123456789"
                                    className={`w-full rounded-md border bg-white dark:bg-gray-700 ${formErrors.tin ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'} px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white`}
                                    {...register('tin')}
                                />
                                {formErrors.tin && (
                                    <p className="mt-1 text-sm text-red-600">{formErrors.tin.message}</p>
                                )}
                            </div>

                            <div>
                                <label
                                    htmlFor="type"
                                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                                >
                                    {t('customers.customerType')} *
                                </label>

                                <select
                                    id="type"
                                    className={`w-full appearance-none rounded-md border bg-white dark:bg-gray-700 ${formErrors.type ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'} px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white`}
                                    {...register('type')}
                                >
                                    <option value="INDIVIDUAL">{t('customers.individual')}</option>
                                    <option value="CORPORATE">{t('customers.corporate')}</option>
                                    <option value="INSURANCE">{t('customers.insurance')}</option>
                                </select>

                                {formErrors.type && (
                                    <p className="mt-1 text-sm text-red-600">{formErrors.type.message}</p>
                                )}
                            </div>

                            <div>
                                <label
                                    htmlFor="balance"
                                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                                >
                                    {t('common.total')} *
                                </label>

                                <input
                                    id="balance"
                                    type="number"
                                    step="0.01"
                                    className={`w-full rounded-md border bg-white dark:bg-gray-700 ${formErrors.balance ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'} px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white ${initialData?.id ? 'bg-gray-100 dark:bg-gray-600 cursor-not-allowed' : ''}`}
                                    {...register('balance')}
                                    readOnly={!!initialData?.id}
                                    disabled={!!initialData?.id}
                                />
                                {formErrors.balance && (
                                    <p className="mt-1 text-sm text-red-600">{formErrors.balance.message}</p>
                                )}
                            </div>

                            <DrawerFooter className="flex justify-end space-x-3 pt-4 px-0">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
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
                            </DrawerFooter>
                        </form>
                    </div>
                </div>
            </DrawerContent>
        </Drawer>
    );
}