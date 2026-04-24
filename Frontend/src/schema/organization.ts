import { z } from 'zod';

export const businessTypeEnum = z.enum([
  'RETAIL',
  'WHOLESALE', 
  'DISTRIBUTOR',
  'PHARMACY',
  'HEALTHCARE',
  'RETAIL_SHOP',
  'HARDWARE_STORE',
  'GROCERY_STORE',
  'ELECTRONICS_STORE',
  'CLOTHING_STORE',
  'RESTAURANT',
  'BAKERY',
  'OTHER'
]);

export const createOrganizationSchema = z.object({
  name: z.string().min(3, 'Organization name must be at least 3 characters').max(255),
  address: z.string().optional(),
  phone: z.string().regex(/^(\+?\d{1,3}[- ]?)?\d{9,14}$/, 'Invalid phone number').optional(),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  businessType: businessTypeEnum,
});

export const updateOrganizationSchema = z.object({
  name: z.string().min(3, 'Organization name must be at least 3 characters').max(255).optional(),
  address: z.string().optional(),
  phone: z.string().regex(/^(\+?\d{1,3}[- ]?)?\d{9,14}$/, 'Invalid phone number').optional(),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  businessType: businessTypeEnum.optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
export type BusinessType = z.infer<typeof businessTypeEnum>;