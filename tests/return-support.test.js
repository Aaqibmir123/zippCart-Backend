import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, ids, buyer, admin, bankPayout } from './return-case.fixture.js';
import { payoutSchema, openPayout } from '../src/returns/return-payout.js';
import { requestSchema } from '../src/returns/return.validator.js';

test('payout details are encrypted, masked in cases, owner/admin only, and bound to the case', async () => {
  const f = fixture();
  const [record] = await f.service.create(ids.order, buyer, f.request({ refundMethod: 'bank', payout: bankPayout }));
  assert.equal(record.payoutSummary, 'Bank account ending 8901');
  assert.equal(JSON.stringify(record).includes(bankPayout.accountNumber), false);
  assert.equal(record.payoutEncrypted, undefined);
  const stored = f.order().returnCases[0].payoutEncrypted;
  assert.equal(stored.includes(bankPayout.accountNumber), false);
  assert.deepEqual(await f.service.payout(ids.order, record.id, admin), bankPayout);
  assert.deepEqual(await f.service.payout(ids.order, record.id, buyer), bankPayout);
  await assert.rejects(f.service.payout(ids.order, record.id, { id: '0'.repeat(24), roles: ['seller'] }), { statusCode: 404 });
  assert.throws(() => openPayout(stored, ids.order, 'wrong-case'), { statusCode: 503 });
  assert.throws(() => openPayout(stored.slice(0, -5), ids.order, record.id), { statusCode: 503 });
});

test('existing requests accept payout corrections without leaking account data into history', async () => {
  const f = fixture();
  let [record] = await f.service.create(ids.order, buyer, f.request());
  delete f.order().returnCases[0].payoutEncrypted;
  delete f.order().returnCases[0].payoutSummary;
  record = await f.act(record, 'payout', { payout: bankPayout, note: bankPayout.accountNumber }, false);
  assert.equal(record.refundMethod, 'bank');
  assert.equal(record.history.at(-1).note, 'Refund details updated securely.');
  assert.equal(JSON.stringify(record.history).includes(bankPayout.accountNumber), false);
  record = await f.act(record, 'reject');
  await assert.rejects(f.act(record, 'payout', { payout: { method: 'upi', upiId: 'new@bank' } }, false), { statusCode: 409 });
});

test('two-way messages keep the lifecycle stage and read acknowledgements do not consume newer replies', async () => {
  const f = fixture();
  let [record] = await f.service.create(ids.order, buyer, f.request());
  assert.equal(record.unread, false);
  record = await f.act(record, 'message', { note: 'Please confirm the pickup landmark', photoIds: [] });
  let customer = (await f.service.orderCases(ids.order, buyer))[0];
  assert.equal(customer.unread, true);
  assert.equal(customer.status, 'under_review');
  const viewedVersion = record.version;
  record = await f.act(record, 'message', { note: 'A second message is now available', photoIds: [] });
  await f.service.markRead(ids.order, record.id, buyer, viewedVersion);
  assert.equal((await f.service.orderCases(ids.order, buyer))[0].unread, true);
  await f.service.markRead(ids.order, record.id, buyer, record.version);
  assert.equal((await f.service.orderCases(ids.order, buyer))[0].unread, false);
  await assert.rejects(f.service.markRead(ids.order, record.id, buyer, record.version + 1), { statusCode: 400 });
  await assert.rejects(f.service.markRead(ids.order, record.id, buyer, record.version, true), { statusCode: 403 });
  record = await f.act(record, 'message', { note: 'The landmark is next to the school', photoIds: [] }, false);
  assert.equal((await f.service.orderCases(ids.order, admin, true))[0].unread, true);
  assert.equal(record.status, 'under_review');
  await f.service.markRead(ids.order, record.id, admin, record.version, true);
  assert.equal((await f.service.orderCases(ids.order, admin, true))[0].unread, false);
});

test('payout validation rejects method mismatch, missing data, malformed UPI/IFSC and secret fields', () => {
  const f = fixture();
  const request = f.request();
  assert.equal(requestSchema.safeParse({ ...request, payout: undefined }).success, false);
  assert.equal(requestSchema.safeParse({ ...request, payout: bankPayout }).success, false);
  for (const data of [{ method: 'upi', upiId: 'not-upi' }, { ...bankPayout, ifsc: 'BAD' },
    { ...bankPayout, accountNumber: '123' }, { method: 'upi', upiId: 'buyer@bank', pin: '1234' }])
    assert.equal(payoutSchema.safeParse(data).success, false);
  assert.deepEqual(payoutSchema.parse({ method: 'upi', upiId: ' Buyer@Bank ' }), { method: 'upi', upiId: 'buyer@bank' });
});
