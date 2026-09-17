import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, ids, buyer, admin, address, pickup } from './return-case.fixture.js';
import { requestSchema, adminActionSchema } from '../src/returns/return.validator.js';

test('full refund lifecycle requires collection, matching inspection, verified amount and reference', async () => {
  const f = fixture();
  let [record] = await f.service.create(ids.order, buyer, f.request());
  assert.equal(record.amount, 500);
  assert.equal(record.storeId, undefined);
  assert.equal(record.history[0].actorId, undefined);
  await assert.rejects(f.act(record, 'refund_complete', { amount: 500, method: 'upi', paymentVerified: true, reference: 'REFUND123' }), { statusCode: 409 });
  record = await f.act(record, 'approve');
  record = await f.act(record, 'schedule', { pickup, acceptAddressChange: true });
  record = await f.act(record, 'picked_up');
  record = await f.act(record, 'received');
  await assert.rejects(f.act(record, 'inspection_pass', { receivedQuantity: 2 }), { statusCode: 409 });
  record = await f.act(record, 'inspection_pass', { receivedQuantity: 1 });
  await assert.rejects(f.act(record, 'refund_complete', { amount: 501, method: 'upi', paymentVerified: true, reference: 'REFUND123' }), { statusCode: 409 });
  await assert.rejects(f.act(record, 'refund_complete', { amount: 500, method: 'cash', paymentVerified: true, reference: 'REFUND123' }), { statusCode: 409 });
  record = await f.act(record, 'refund_complete', { amount: 500, method: 'upi', paymentVerified: true, reference: 'REFUND123' });
  assert.equal(record.status, 'refund_completed');
  assert.equal(record.reference, 'REFUND123');
  assert.deepEqual(record.history.map((event) => event.action), ['submitted', 'approve', 'schedule', 'picked_up', 'received', 'inspection_pass', 'refund_complete']);
  assert.equal(f.order().status, 'delivered');
  await assert.rejects(f.act(record, 'approve'), { statusCode: 409 });
});

test('exchange verifies variant and stock, then tracks replacement dispatch and receipt', async () => {
  const f = fixture();
  let [record] = await f.service.create(ids.order, buyer, f.request({ preference: 'exchange',
    items: [{ index: 0, quantity: 2, exchangeSize: 'L', exchangeColor: 'Blue' }] }));
  f.setStock(1);
  await assert.rejects(f.act(record, 'approve'), { statusCode: 409 });
  f.setStock(3);
  record = await f.act(record, 'approve');
  record = await f.act(record, 'schedule', { pickup, acceptAddressChange: true });
  record = await f.act(record, 'picked_up');
  record = await f.act(record, 'received');
  record = await f.act(record, 'inspection_pass', { receivedQuantity: 2 });
  await assert.rejects(f.act(record, 'complete_exchange'), { statusCode: 409 });
  f.setStock(0);
  await assert.rejects(f.act(record, 'dispatch_exchange', { stockConfirmed: true, carrier: 'Local courier', reference: 'TRACK123' }), { statusCode: 409 });
  f.setStock(2);
  record = await f.act(record, 'dispatch_exchange', { stockConfirmed: true, carrier: 'Local courier', reference: 'TRACK123' });
  await assert.rejects(f.act(record, 'switch_refund', { refundMethod: 'bank' }, false), { statusCode: 409 });
  record = await f.act(record, 'complete_exchange');
  assert.equal(record.status, 'exchange_completed');
  assert.equal(record.replacement.reference, 'TRACK123');
});

test('customer can switch an exchange to their preferred refund method', async () => {
  const f = fixture();
  let [record] = await f.service.create(ids.order, buyer, f.request({ preference: 'exchange',
    items: [{ index: 0, quantity: 1, exchangeSize: 'L', exchangeColor: 'Blue' }] }));
  record = await f.act(record, 'switch_refund', { refundMethod: 'bank' }, false);
  assert.equal(record.preference, 'refund'); assert.equal(record.refundMethod, 'bank');
});

test('proof reply remains available after the initial 24-hour request window', async () => {
  const f = fixture();
  let [record] = await f.service.create(ids.order, buyer, f.request());
  record = await f.act(record, 'ask_information', { dueAt: '2026-09-19T10:00:00Z' });
  f.setNow(new Date('2026-09-18T10:00:00Z'));
  record = await f.act(record, 'reply', { photoIds: ['1'.repeat(24)] }, false);
  assert.equal(record.status, 'under_review');
  assert.deepEqual(record.history.at(-1).photoIds, ['1'.repeat(24)]);
  await assert.rejects(f.service.create(ids.order, buyer, f.request()), { statusCode: 409 });
});

test('scheduled address changes require admin confirmation and failed pickup can be rescheduled', async () => {
  const f = fixture();
  let [record] = await f.service.create(ids.order, buyer, f.request());
  record = await f.act(record, 'approve');
  record = await f.act(record, 'schedule', { pickup, acceptAddressChange: true });
  const changed = { ...address, line1: 'House 99' };
  await assert.rejects(f.act(record, 'address', { pickupAddress: changed }, false), { statusCode: 409 });
  record = await f.act(record, 'reschedule', { pickupAddress: changed }, false);
  assert.equal(record.pickupAddress.line1, address.line1);
  assert.equal(record.proposedAddress.line1, changed.line1);
  await assert.rejects(f.act(record, 'schedule', { pickup, acceptAddressChange: false }), { statusCode: 409 });
  record = await f.act(record, 'schedule', { pickup, acceptAddressChange: true });
  assert.equal(record.pickupAddress.line1, changed.line1);
  record = await f.act(record, 'pickup_failed');
  record = await f.act(record, 'schedule', { pickup, acceptAddressChange: true });
  assert.equal(record.status, 'pickup_scheduled');
});

test('inspection disputes retain proof, accept replies and can resume inspection', async () => {
  const f = fixture();
  let [record] = await f.service.create(ids.order, buyer, f.request());
  record = await f.act(record, 'approve');
  record = await f.act(record, 'schedule', { pickup, acceptAddressChange: true });
  record = await f.act(record, 'picked_up');
  record = await f.act(record, 'received');
  record = await f.act(record, 'inspection_dispute', { photoIds: ['1'.repeat(24)] });
  record = await f.act(record, 'ask_information', { dueAt: '2026-09-18T10:00:00Z' });
  await assert.rejects(f.act(record, 'cancel', {}, false), { statusCode: 409 });
  await assert.rejects(f.act(record, 'address', { pickupAddress: address }, false), { statusCode: 409 });
  record = await f.act(record, 'reply', { photoIds: [] }, false);
  assert.equal(record.status, 'inspection_disputed');
  record = await f.act(record, 'inspection_pass', { receivedQuantity: 1 });
  assert.equal(record.status, 'refund_pending');
});

test('seller grouping, quantity claims, retries and snapshots are enforced', async () => {
  const f = fixture();
  f.setOrder({ ...f.order(), items: [...f.order().items, { ...f.order().items[0], storeId: '9'.repeat(24), quantity: 1 }] });
  const request = f.request({ items: [{ index: 0, quantity: 2 }, { index: 1, quantity: 1 }] });
  const records = await f.service.create(ids.order, buyer, request);
  assert.equal(records.length, 2); assert.equal(records[0].amount, 1000);
  assert.equal((await f.service.create(ids.order, buyer, request))[0].id, records[0].id);
  await assert.rejects(f.service.create(ids.order, buyer, f.request({ items: [{ index: 0, quantity: 2 }] })), { statusCode: 409 });
  f.order().shippingAddress = { ...address, line1: 'Different address' };
  assert.equal((await f.service.orderCases(ids.order, buyer))[0].pickupAddress.line1, address.line1);
});

test('ownership, admin authority, foreign photos and stale updates are rejected', async () => {
  const f = fixture();
  const [record] = await f.service.create(ids.order, buyer, f.request());
  await assert.rejects(f.service.orderCases(ids.order, { id: '0'.repeat(24), roles: [] }), { statusCode: 404 });
  await assert.rejects(f.service.create(ids.order, buyer, f.request({ photoIds: ['f'.repeat(24)] })), { statusCode: 400 });
  const input = { action: 'approve', clientKey: 'idempotency-test-key', version: 0, note: 'Request checked' };
  await assert.rejects(f.service.action(ids.order, record.id, buyer, input, true), { statusCode: 403 });
  const result = await f.service.action(ids.order, record.id, admin, input, true);
  assert.equal((await f.service.action(ids.order, record.id, admin, input, true)).version, result.version);
  await assert.rejects(f.act(record, 'approve'), { statusCode: 409 });
});

test('concurrent overlapping item requests cannot both reserve the same quantity', async () => {
  const f = fixture();
  const results = await Promise.allSettled([1, 2].map(() => f.service.create(ids.order, buyer, f.request({ items: [{ index: 0, quantity: 3 }] }))));
  assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
  assert.equal(f.order().returnCases.length, 1);
});

test('validators reject missing proof, duplicate indices, injected fields, fake completion and empty disputes', () => {
  const f = fixture();
  const valid = f.request();
  assert.equal(requestSchema.safeParse({ ...valid, reason: 'damaged' }).success, false);
  assert.equal(requestSchema.safeParse({ ...valid, items: [valid.items[0], valid.items[0]] }).success, false);
  assert.equal(requestSchema.safeParse({ ...valid, status: 'refund_completed' }).success, false);
  assert.equal(requestSchema.safeParse({ ...valid, pickupAddress: { ...address, userId: ids.user } }).success, false);
  assert.equal(adminActionSchema.safeParse({ action: 'refund_complete', version: 0, clientKey: 'long-enough-key',
    note: 'Paid', amount: 500, method: 'upi', reference: 'REF123', paymentVerified: false }).success, false);
  assert.equal(adminActionSchema.safeParse({ action: 'inspection_dispute', version: 0, clientKey: 'long-enough-key', note: 'Issue', photoIds: [] }).success, false);
});
