import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdminReturnService } from '../src/admin/services/admin-return.service.js';
import { returnReviewSchema } from '../src/admin/validators/admin-return.validator.js';

const id = 'a'.repeat(24);
const order = { _id: id, status: 'return_requested', createdAt: new Date(),
  items: [{ storeId: 'b'.repeat(24), name: 'Shirt', price: 100, quantity: 1 }],
  shippingAddress: { name: 'Buyer' }, total: 100, paymentMethod: 'cod', paymentStatus: 'unpaid',
  returnRequestedAt: new Date(), returnPreference: 'refund', returnReason: 'damaged',
  returnDescription: 'The shirt arrived damaged' };

test('admin review moves a return through approved and completed only with a real reference', async () => {
  let current = { ...order };
  const repository = {
    find: async () => current,
    storeNames: async () => [{ _id: 'b'.repeat(24), storeName: 'Style Shop' }],
    transition: async (_id, expected, update) => {
      if (current.status !== expected) return null;
      current = { ...current, ...update };
      return current;
    },
  };
  const service = createAdminReturnService(repository);
  assert.equal(returnReviewSchema.safeParse({ action: 'complete', reference: 'x' }).success, false);
  await assert.rejects(service.review(id, { action: 'complete', reference: 'TXN12345', note: '' }), { statusCode: 409 });
  const approved = await service.review(id, { action: 'approve', note: '' });
  assert.equal(approved.status, 'return_approved');
  assert.equal(approved.returnRequestId, `RET-${id.toUpperCase()}`);
  assert.equal(approved.returnPreference, 'refund');
  await assert.rejects(service.review(id, { action: 'reject', note: 'Not eligible' }), { statusCode: 409 });
  const completed = await service.review(id, { action: 'complete', reference: 'TXN12345', note: '' });
  assert.equal(completed.status, 'return_completed');
  assert.equal(completed.returnReference, 'TXN12345');
  assert.equal('storeId' in completed.items[0], false);
  assert.equal(completed.items[0].storeName, 'Style Shop');
});

test('older return requires admin to choose refund or exchange before approval', async () => {
  const current = { ...order, returnPreference: null };
  const service = createAdminReturnService({ find: async () => current,
    storeNames: async () => [],
    transition: async (_id, _expected, update) => ({ ...current, ...update }) });
  await assert.rejects(service.review(id, { action: 'approve', note: '' }), { statusCode: 400 });
  const approved = await service.review(id, { action: 'approve', note: '', preference: 'exchange' });
  assert.equal(approved.returnPreference, 'exchange');
});
