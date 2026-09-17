import { z } from 'zod';
const id = z.string().regex(/^[a-f\d]{24}$/i);
const buyNowSchema = z.object({
  productId: id, color: z.string().max(40).default(''), size: z.string().max(30).default(''),
  quantity: z.number().int().min(1).max(99), purchaseId: z.string().regex(/^[a-zA-Z0-9-]{12,100}$/),
}).strict();
export const quoteSchema = z.object({ shippingAddressId: id, billingAddressId: id, buyNow: buyNowSchema.optional() });
export const placeOrderSchema = quoteSchema.extend({ checkoutKey: z.string().regex(/^[a-f\d]{64}$/), paymentMethod: z.literal('cod') });
export const orderParamsSchema = z.object({ id });
export const returnSchema = z.object({
  preference: z.enum(['refund', 'exchange']),
  reason: z.enum(['damaged', 'wrong_item', 'not_as_described', 'size_fit', 'other']),
  description: z.string().trim().min(10).max(500),
}).strict();
export const reorderSchema = z.object({
  items: z.array(z.object({ productId: id, color: z.string().max(40).default(''), size: z.string().max(30).default(''), quantity: z.number().int().min(1).max(99) })).min(1).max(100),
}).refine((data) => new Set(data.items.map((item) => `${item.productId}:${item.color}:${item.size}`)).size === data.items.length, 'Duplicate products are not allowed.');
