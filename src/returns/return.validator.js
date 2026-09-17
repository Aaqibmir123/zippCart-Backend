import { z } from 'zod';
import { addressSchema } from '../user/validators/address.validator.js';
import { reasons, returnStatuses } from './return.constants.js';
import { payoutSchema } from './return-payout.js';

export const idSchema = z.string().regex(/^[a-f\d]{24}$/i);
const note = z.string().trim().min(3).max(1000);
const photos = z.array(idSchema).max(5).refine((ids) => new Set(ids).size === ids.length, 'Duplicate photos.');
const option = z.string().trim().max(40);
export const requestSchema = z.object({
  clientKey: z.string().regex(/^[a-zA-Z0-9-]{12,100}$/),
  preference: z.enum(['refund', 'exchange']), reason: z.enum(reasons),
  description: z.string().trim().min(10).max(1000),
  items: z.array(z.object({ index: z.number().int().min(0).max(99), quantity: z.number().int().min(1).max(99),
    exchangeColor: option.default(''), exchangeSize: option.default(''),
  }).strict()).min(1).max(100).refine((items) => new Set(items.map((i) => i.index)).size === items.length, 'Duplicate items.'),
  photoIds: photos, pickupAddress: addressSchema.strict(),
  refundMethod: z.enum(['upi', 'bank', 'cash']).optional(),
  payout: payoutSchema.optional(),
}).strict().superRefine((value, context) => {
  if (['damaged', 'wrong_item', 'not_as_described'].includes(value.reason) && value.photoIds.length < 2)
    context.addIssue({ code: 'custom', path: ['photoIds'], message: 'Add a full product photo and a clear issue/label photo.' });
  if (value.preference === 'refund' && !value.refundMethod)
    context.addIssue({ code: 'custom', path: ['refundMethod'], message: 'Choose your preferred refund method.' });
  if (value.preference === 'refund' && (!value.payout || value.payout.method !== value.refundMethod))
    context.addIssue({ code: 'custom', path: ['payout'], message: 'Enter the details for your selected refund method.' });
});
const base = { version: z.number().int().min(0), clientKey: z.string().regex(/^[a-zA-Z0-9-]{12,100}$/) };
export const customerActionSchema = z.discriminatedUnion('action', [
  z.object({ ...base, action: z.literal('message'), note, photoIds: photos }).strict(),
  z.object({ ...base, action: z.literal('payout'), note, payout: payoutSchema }).strict(),
  z.object({ ...base, action: z.literal('reply'), note, photoIds: photos, pickupAddress: addressSchema.strict().optional() }).strict(),
  z.object({ ...base, action: z.literal('address'), note, pickupAddress: addressSchema.strict() }).strict(),
  z.object({ ...base, action: z.literal('reschedule'), note, pickupAddress: addressSchema.strict().optional() }).strict(),
  z.object({ ...base, action: z.literal('cancel'), note }).strict(),
  z.object({ ...base, action: z.literal('switch_refund'), note, refundMethod: z.enum(['upi', 'bank', 'cash']), payout: payoutSchema }).strict(),
]);
const action = (name, extra = {}) => z.object({ ...base, action: z.literal(name), note, ...extra }).strict();
export const adminActionSchema = z.discriminatedUnion('action', [
  action('message', { photoIds: photos }),
  action('ask_information', { dueAt: z.string().datetime() }), action('approve'), action('reject'),
  action('schedule', { pickup: z.object({ mode: z.enum(['pickup', 'dropoff']), start: z.string().datetime(),
    end: z.string().datetime(), contact: z.string().trim().min(3).max(120), reference: z.string().trim().min(3).max(100),
    instructions: z.string().trim().min(3).max(500),
  }).strict(), acceptAddressChange: z.boolean() }),
  action('pickup_failed'), action('picked_up'), action('received'),
  action('inspection_pass', { receivedQuantity: z.number().int().min(1).max(9900) }),
  action('inspection_dispute', { photoIds: photos.refine((ids) => ids.length > 0, 'Add an inspection photo.') }),
  action('refund_complete', { amount: z.number().positive().max(1e9), reference: z.string().trim().min(6).max(100),
    method: z.enum(['upi', 'bank', 'cash']), paymentVerified: z.literal(true) }),
  action('dispatch_exchange', { reference: z.string().trim().min(3).max(100), carrier: z.string().trim().min(2).max(100),
    stockConfirmed: z.literal(true) }), action('complete_exchange'),
]);
export const listSchema = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1),
  status: z.enum(['open', 'closed', 'all', ...returnStatuses]).default('open') });
export const photoSchema = z.object({ data: z.string().max(690000).startsWith('data:image/jpeg;base64,') }).strict();
export const readSchema = z.object({ version: z.number().int().min(0).max(100) }).strict();
