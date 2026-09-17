import { z } from 'zod';

export const returnIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
export const returnListSchema = z.object({
  status: z.enum(['open', 'closed', 'all']).default('open'),
  page: z.coerce.number().int().min(1).max(10000).default(1),
});
export const returnReviewSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve'), note: z.string().trim().max(500).default(''),
    preference: z.enum(['refund', 'exchange']).optional() }).strict(),
  z.object({ action: z.literal('reject'), note: z.string().trim().min(10).max(500) }).strict(),
  z.object({ action: z.literal('complete'), reference: z.string().trim().min(6).max(100),
    note: z.string().trim().max(500).default('') }).strict(),
]);
