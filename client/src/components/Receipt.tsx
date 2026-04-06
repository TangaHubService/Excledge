import React from 'react';
import { useTranslation } from 'react-i18next';
import type { CartItem } from '../pages/dashboard/sales/pos';
import { useOrganization } from '../context/OrganizationContext';


interface ReceiptProps {
    cart: CartItem[];
    total: number;
    subtotal: number;
    paymentMethod: string;
    receiptNumber: string;
    date: string;
    cashierName: string;
    customer: { name: string, phone: string };
    payed: number;
    unpaid: number;
}

export const Receipt: React.FC<ReceiptProps> = ({
    cart,
    total,
    subtotal,
    paymentMethod,
    receiptNumber,
    date,
    cashierName,
    customer,
    payed,
    unpaid
}) => {
    const { t } = useTranslation();
    const { organization } = useOrganization();
    return (
        <div className="p-4 max-w-xs mx-auto bg-white" id="receipt">
            <div className="mb-4">
                <h2 className="text-lg font-bold">{organization?.name || t('pos.yourBusinessName')}</h2>
                {organization?.avatar && <img src={organization.avatar} alt={organization?.name} className="h-24 w-24 rounded-full object-contain" />}
                {organization?.address && <p className="text-sm">{t('pos.receipt.address')} : {organization.address}</p>}
                {(organization?.city || organization?.country) && (
                    <p className="text-sm">
                        {organization.city}
                        {organization.city && organization.country ? ', ' : ''}
                        {organization.country}
                    </p>
                )}
                {organization?.phone && <p className="text-sm">{t('pos.receipt.tel')}: {organization.phone}</p>}
                {organization?.email && <p className="text-sm">{t('pos.receipt.email')}: {organization.email}</p>}
                {organization?.tin && <p className="text-sm">{t('pos.receipt.tin')}: {organization.tin}</p>}
            </div>

            <div className="border-b-2 border-dashed border-gray-300 py-2 my-2">
                <div className='flex flex-col text-xs'>
                    <span className='text-xs'><span className='font-bold'>{t('pos.receipt.receiptNumber')} :</span> #{receiptNumber}</span>
                    <span className='text-xs'><span className='font-bold'>{t('pos.receipt.date')} :</span> {date}</span>
                    <span className='text-xs'><span className='font-bold'> {t('pos.receipt.customer')} :</span> {customer.name}</span>
                    <span className='text-xs'><span className='font-bold'> {t('pos.receipt.phone')} :</span> {customer.phone}</span>
                </div>
                <div className="text-sm"><span className='font-bold'>{t('pos.receipt.cashier')} :</span> {cashierName}</div>
            </div>

            <div className="mb-4">
                {cart.map((item, index) => (
                    <div key={index} className="flex justify-between py-1 border-b-2 border-dashed border-gray-300 text-sm">
                        <div>
                            <span className="font-medium">{item.product.name}</span>
                            <span className="text-gray-500 ml-2">x{item.quantity}</span>
                            {item.product.batchNumber && (
                                <div className="text-xs text-gray-500">{t('pos.receipt.batch')}: {item.product.batchNumber}</div>
                            )}
                        </div>
                        <span>{(item.quantity * item.unitPrice).toFixed(2)} RWF</span>
                    </div>
                ))}
            </div>

            <div className="border-t-2 border-dashed border-gray-300 pt-2">
                <div className="flex justify-between text-sm mb-1">
                    <span className='text-xs'><span className='font-bold'>{t('pos.receipt.subtotal')} :</span> {subtotal.toFixed(2)} RWF</span>
                </div>
                <div className="flex justify-between font-bold mt-2">
                    <span className='text-xs'><span className='font-bold'>{t('pos.receipt.total')} :</span> {total.toFixed(2)} RWF</span>
                </div>
                <div className="text-sm mt-2">
                    <p className='text-xs'><span className='font-bold'>{t('pos.receipt.payed')} :</span> {payed.toFixed(2)} RWF</p>
                    <p className='text-xs'><span className='font-bold'>{t('pos.receipt.unpaid')} :</span> {unpaid.toFixed(2)} RWF</p>
                    <p className='text-xs'><span className='font-bold'>{t('pos.receipt.paymentType')} :</span> {t(`pos.paymentMethods.${paymentMethod}`)}</p>
                </div>
            </div>

            <div className="text-center mt-6 text-xs text-gray-500 border-t-2 border-dashed border-gray-300 pt-2">
                <p>{t('pos.receipt.thankYou')}</p>
                <p>{t('pos.receipt.comeAgain')}</p>
            </div>
            <p className="text-xs text-center bottom-0">{t('pos.receipt.poweredBy')}</p>
        </div>
    );
};