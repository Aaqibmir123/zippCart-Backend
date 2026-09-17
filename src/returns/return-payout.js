import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { createAppError } from '../utils/app-error.js';

export const payoutSchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('upi'), upiId: z.string().trim().toLowerCase()
    .regex(/^[a-z0-9._-]{2,256}@[a-z][a-z0-9.-]{1,63}$/, 'Enter a valid UPI ID.') }).strict(),
  z.object({ method: z.literal('bank'), accountHolder: z.string().trim().min(2).max(100),
    accountNumber: z.string().trim().regex(/^\d{9,18}$/, 'Enter a 9–18 digit account number.'),
    ifsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Enter a valid IFSC.') }).strict(),
  z.object({ method: z.literal('cash') }).strict(),
]);

function key() {
  const value = process.env.STORE_ENCRYPTION_KEY;
  if (!value || !/^[a-f\d]{64}$/i.test(value)) throw createAppError('Refund details are temporarily unavailable. Contact support.', 503);
  return Buffer.from(value, 'hex');
}
export function sealPayout(value, orderId, caseId) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(`return-payout:${orderId}:${caseId}:v1`));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64')).join('.');
}
export function openPayout(value, orderId, caseId) {
  const secret = key();
  try {
    const [iv, tag, encrypted] = value.split('.').map((part) => Buffer.from(part, 'base64'));
    const decipher = createDecipheriv('aes-256-gcm', secret, iv);
    decipher.setAAD(Buffer.from(`return-payout:${orderId}:${caseId}:v1`));
    decipher.setAuthTag(tag);
    return payoutSchema.parse(JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')));
  } catch { throw createAppError('Could not read refund details securely. Contact support.', 503); }
}
export function payoutSummary(value) {
  if (value.method === 'cash') return 'Cash refund';
  if (value.method === 'bank') return `Bank account ending ${value.accountNumber.slice(-4)}`;
  const [name, bank] = value.upiId.split('@');
  return `${name.slice(0, 2)}***@${bank}`;
}
export function setPayout(record, value, orderId) {
  record.refundMethod = value.method;
  record.payoutSummary = payoutSummary(value);
  record.payoutEncrypted = value.method === 'cash' ? undefined : sealPayout(value, orderId, record.id);
}
