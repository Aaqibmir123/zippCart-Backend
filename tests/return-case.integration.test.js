import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { env } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { OrderModel } from '../src/user/models/order.model.js';
import { UserModel } from '../src/shared/models/user.model.js';
import { ReturnPhotoModel } from '../src/returns/return.schema.js';
import { createReturnRepository } from '../src/returns/return.repository.js';
import { createAccessToken } from '../src/utils/tokens.js';
import { address, bankPayout } from './return-case.fixture.js';
import { createSellerOrderRepository } from '../src/seller/repositories/seller-order.repository.js';

test('return HTTP + MongoDB: private photos, CAS concurrency, grouping, history and refund lifecycle', {
  skip: process.env.RETURN_INTEGRATION !== '1', timeout: 60000,
}, async () => {
  const databaseName = `zippcart_return_test_${randomUUID().replaceAll('-', '')}`;
  const previousAdminPhone = env.ADMIN_PHONE;
  env.ADMIN_PHONE = '9876543212';
  let server;
  try {
    await mongoose.connect(env.MONGODB_URI, { dbName: databaseName, serverSelectionTimeoutMS: 5000 });
    await Promise.all([OrderModel.init(), UserModel.init(), ReturnPhotoModel.init()]);
    const buyer = await UserModel.create({ phone: '9876543210' });
    const stranger = await UserModel.create({ phone: '9876543211' });
    const admin = await UserModel.create({ phone: '9876543212', roles: ['customer', 'admin'] });
    const order = await OrderModel.create({ userId: buyer._id, checkoutKey: 'c'.repeat(64), cartKey: 'd'.repeat(64),
      items: [{ productId: '1'.repeat(24), storeId: '2'.repeat(24), name: 'Shirt', price: 500, quantity: 2, color: 'Blue', size: 'M' },
        { productId: '3'.repeat(24), storeId: '4'.repeat(24), name: 'Watch', price: 800, quantity: 1, color: '', size: '' }],
      cartSnapshot: [], shippingAddress: address, billingAddress: address, subtotal: 1800, delivery: 0, total: 1800,
      status: 'delivered', receivedAt: new Date(), shipments: [
        { storeId: '2'.repeat(24), status: 'dispatched' }, { storeId: '4'.repeat(24), status: 'dispatched' }],
    });
    const orderId = String(order._id);
    server = createApp().listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const url = `http://127.0.0.1:${server.address().port}/api/v1`;
    const call = (path, body, user = buyer, headers = {}) => fetch(url + path, {
      method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json',
        ...(user ? { Cookie: `accessToken=${createAccessToken({ sub: String(user._id), phone: user.phone })}` } : {}), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const base = `/returns/orders/${orderId}`;
    assert.equal((await call(base, undefined, null)).status, 401);
    assert.equal((await call(base, undefined, stranger)).status, 404);
    assert.equal((await call('/returns/admin', undefined, buyer)).status, 403);
    assert.equal((await call(base, {}, buyer, { Origin: 'https://untrusted.example' })).status, 403);
    assert.equal((await call(`/orders/${orderId}/return`, {})).status, 410);
    assert.equal((await call(`${base}/photos`, { data: 'data:image/jpeg;base64,aW52YWxpZA==' })).status, 400);
    const bytes = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#43785a' } }).jpeg().toBuffer();
    const upload = await call(`${base}/photos`, { data: `data:image/jpeg;base64,${bytes.toString('base64')}` });
    assert.equal(upload.status, 201);
    const photo = await upload.json();
    const duplicate = await (await call(`${base}/photos`, { data: `data:image/jpeg;base64,${bytes.toString('base64')}` })).json();
    assert.equal(duplicate.id, photo.id);
    assert.equal((await OrderModel.findById(orderId).lean()).returnPhotoCount, 1);
    assert.equal((await call(`${base}/photos/${photo.id}`, undefined, stranger)).status, 404);
    assert.equal((await call(`${base}/photos/${photo.id}`)).headers.get('cache-control'), 'no-store');
    assert.ok((await (await call(`${base}/photos/${photo.id}`, undefined, admin)).json()).data.startsWith('data:image/jpeg;base64,'));
    const request = { clientKey: randomUUID(), preference: 'refund', reason: 'size_fit', description: 'The item does not fit as expected',
      items: [{ index: 0, quantity: 2 }, { index: 1, quantity: 1 }], pickupAddress: address, photoIds: [photo.id], refundMethod: 'upi',
      payout: { method: 'upi', upiId: 'buyer@bank' } };
    const created = await call(base, request);
    assert.equal(created.status, 201, JSON.stringify(await created.clone().json()));
    const records = (await created.json()).cases;
    assert.equal(records.length, 2);
    const sellerRepository = createSellerOrderRepository();
    assert.equal((await sellerRepository.summary('2'.repeat(24))).returnRequests, 1);
    assert.equal(records[0].amount, 1000);
    assert.equal(records[0].storeId, undefined);
    assert.equal(records[0].history[0].actorId, undefined);
    assert.equal(records[0].payoutEncrypted, undefined);
    assert.equal(JSON.stringify(records).includes('buyer@bank'), false);
    const payoutPath = `${base}/${records[0].id}/payout`;
    assert.equal((await call(payoutPath, undefined, stranger)).status, 404);
    assert.equal((await call(payoutPath, undefined, null)).status, 401);
    const privatePayout = await call(payoutPath, undefined, admin);
    assert.equal(privatePayout.headers.get('cache-control'), 'no-store');
    assert.deepEqual((await privatePayout.json()).payout, request.payout);
    assert.equal(JSON.stringify(await OrderModel.findById(orderId).lean()).includes('buyer@bank'), false);
    assert.equal((await (await call('/returns/mine?status=all')).json()).total, 2);
    assert.equal((await (await call('/returns/mine?status=all', undefined, stranger)).json()).total, 0);
    const bankUpdate = await call(`${base}/${records[1].id}/actions`, { action: 'payout', version: 0,
      clientKey: randomUUID(), note: 'Use my bank account for this refund', payout: bankPayout });
    assert.equal(bankUpdate.status, 200);
    assert.equal((await bankUpdate.json()).case.payoutSummary, 'Bank account ending 8901');
    assert.deepEqual((await (await call(`${base}/${records[1].id}/payout`, undefined, admin)).json()).payout, bankPayout);
    assert.equal(JSON.stringify(await (await call(base)).json()).includes(bankPayout.accountNumber), false);
    assert.equal((await (await call(base, request)).json()).cases[0].id, records[0].id);
    assert.equal((await call(base, { ...request, clientKey: randomUUID() })).status, 409);
    const list = await (await call('/returns/admin?status=open', undefined, admin)).json();
    assert.equal(list.total, 2);
    assert.equal(list.cases[0].history, undefined);
    let record = records[0];
    const adminPath = `/returns/admin/orders/${orderId}/${record.id}/actions`;
    const approval = { action: 'approve', version: 0, clientKey: randomUUID(), note: 'Proof reviewed and accepted' };
    assert.equal((await call(adminPath, approval, buyer)).status, 403);
    const race = await Promise.all([call(adminPath, approval, admin), call(adminPath, { ...approval, clientKey: randomUUID() }, admin)]);
    assert.deepEqual(race.map((response) => response.status).sort(), [200, 409]);
    record = (await (await call(base)).json()).cases.find((item) => item.id === record.id);
    async function action(name, extra = {}, customer = false) {
      const response = await call(customer ? `${base}/${record.id}/actions` : adminPath,
        { action: name, clientKey: randomUUID(), version: record.version, note: 'Verified with customer and collection team', ...extra }, customer ? buyer : admin);
      assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
      record = (await response.json()).case;
    }
    await action('message', { note: 'Please keep the package ready for collection', photoIds: [] });
    assert.equal((await (await call('/returns/mine?status=all')).json()).cases.find((item) => item.id === record.id).unread, true);
    assert.equal((await call(`${base}/${record.id}/read`, { version: record.version })).status, 200);
    assert.equal((await (await call('/returns/mine?status=all')).json()).cases.find((item) => item.id === record.id).unread, false);
    await action('message', { note: 'The package is ready at the confirmed address', photoIds: [] }, true);
    const adminCases = await (await call(`/returns/admin/orders/${orderId}`, undefined, admin)).json();
    assert.equal(adminCases.cases.find((item) => item.id === record.id).unread, true);
    assert.equal((await call(`/returns/admin/orders/${orderId}/${record.id}/read`, { version: record.version }, buyer)).status, 403);
    assert.equal((await call(`/returns/admin/orders/${orderId}/${record.id}/read`, { version: record.version }, admin)).status, 200);
    assert.equal((await (await call('/returns/admin?status=open', undefined, admin)).json()).cases.find((item) => item.id === record.id).unread, false);
    await action('ask_information', { dueAt: new Date(Date.now() + 172800000).toISOString() });
    await action('reply', { photoIds: [photo.id] }, true);
    assert.equal(record.status, 'pickup_pending');
    await action('schedule', { acceptAddressChange: true, pickup: { mode: 'pickup',
      start: new Date(Date.now() + 86400000).toISOString(), end: new Date(Date.now() + 90000000).toISOString(),
      contact: 'Pickup team', reference: 'COLLECT-123', instructions: 'Pack securely with the original tags.' } });
    await action('picked_up'); await action('received');
    await action('inspection_pass', { receivedQuantity: 2 });
    await action('refund_complete', { amount: 1000, reference: 'REFUND-123', method: 'upi', paymentVerified: true });
    assert.equal(record.status, 'refund_completed');
    const persisted = await OrderModel.findById(orderId).lean();
    assert.equal(persisted.returnCases[0].status, 'refund_completed');
    assert.equal(persisted.returnCases[1].status, 'under_review');
    assert.equal(persisted.status, 'delivered');
    assert.equal((await sellerRepository.summary('2'.repeat(24))).returnRequests, 0);
    assert.equal((await sellerRepository.summary('4'.repeat(24))).returnRequests, 1);
    assert.equal((await (await call('/returns/admin?status=closed', undefined, admin)).json()).total, 1);
    const summaries = await (await call(`/orders/${orderId}`)).json();
    assert.equal(summaries.order.returnCases.length, 2);
    assert.equal(summaries.order.returnCases[0].pickupAddress, undefined);
    // Independent snapshots cannot both update the same order document.
    const repo = createReturnRepository();
    const snapshot = await repo.order(orderId, String(buyer._id));
    const writes = await Promise.all([repo.save(snapshot, snapshot.returnCases), repo.save(snapshot, snapshot.returnCases)]);
    assert.equal(writes.filter(Boolean).length, 1);
  } finally {
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === databaseName && databaseName.startsWith('zippcart_return_test_'))
      await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    env.ADMIN_PHONE = previousAdminPhone;
  }
});
