import { z } from 'zod';

export const addressSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/),
  line1: z.string().trim().min(3).max(160),
  locality: z.string().trim().min(2).max(100),
  landmark: z.string().trim().max(120).optional().default(''),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  pincode: z.string().trim().regex(/^[1-9]\d{5}$/),
  label: z.enum(['Home', 'Work', 'Other']),
});
export const addressParamsSchema = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i) });
