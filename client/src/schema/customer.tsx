import * as yup from 'yup';

export const customerSchema = yup.object().shape({
    name: yup.string().required('Name is required'),
    email: yup.string().email('Invalid email address').notRequired().nullable(),
    phone: yup.string().notRequired().nullable(),
    type: yup
        .string()
        .required('Customer type is required'),
    balance: yup
        .number()
        .typeError('Balance must be a number')
        .min(0, 'Balance cannot be negative')
        .required('Balance is required')
});