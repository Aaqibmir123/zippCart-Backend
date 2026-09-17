import { z } from 'zod';

export const favoriteProductParamsSchema = z.object({
  productId: z.string().trim().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/, 'Invalid product identifier.'),
});
