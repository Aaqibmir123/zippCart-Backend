import { z } from 'zod';

const productIdSchema = z.string().regex(/^[a-fA-F0-9]{24}$/);
const itemIdSchema = z.string().regex(/^[a-fA-F0-9]{24}$/);

export const cartItemParamsSchema = z.object({ itemId: itemIdSchema });
export const addCartItemSchema = z.object({
  productId: productIdSchema,
  color: z.string().trim().max(40).default(''),
  size: z.string().trim().max(30).default(''),
  quantity: z.number().int().min(1).max(10).default(1),
}).strict();
export const updateCartItemSchema = z.object({ quantity: z.number().int().min(0).max(99) });
