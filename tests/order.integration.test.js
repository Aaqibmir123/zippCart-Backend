import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { OrderModel } from '../src/user/models/order.model.js';
import { createOrderRepository } from '../src/user/repositories/order.repository.js';
import { createSellerOrderRepository } from '../src/seller/repositories/seller-order.repository.js';
import { createAdminReturnRepository } from '../src/admin/repositories/admin-return.repository.js';
import { createAdminReturnService } from '../src/admin/services/admin-return.service.js';
import { publicOrder } from '../src/user/services/order.service.js';
import { ProductModel } from '../src/seller/models/product.model.js';
import { backfillOrderShipments } from '../src/user/migrations/backfill-order-shipments.js';

test('MongoDB dispatch, receipt and return window are stored atomically', {
  skip: process.env.ORDER_INTEGRATION !== '1', timeout: 30000,
}, async () => {
  const databaseName = `zippcart_order_test_${randomUUID().replaceAll('-', '')}`;
  try {
    await mongoose.connect(env.MONGODB_URI, { dbName: databaseName, serverSelectionTimeoutMS: 5000 });
    const userId = new mongoose.Types.ObjectId();
    const storeA = String(new mongoose.Types.ObjectId());
    const storeB = String(new mongoose.Types.ObjectId());
    const product = await ProductModel.create({ storeId: storeA, name: 'Jacket', category: 'Fashion',
      description: 'Denim jacket', sku: 'TEST-JACKET', price: 500, mrp: 600, stock: 5 });
    const legacy = await OrderModel.create({ userId, checkoutKey: 'c'.repeat(64), cartKey: 'd'.repeat(64),
      items: [{ productId: String(product._id), name: 'Jacket', price: 500, quantity: 1 }],
      cartSnapshot: [], shippingAddress: { name: 'Buyer' }, billingAddress: { name: 'Buyer' },
      subtotal: 500, delivery: 0, total: 500, status: 'placed' });
    const dummy = await OrderModel.create({ userId, checkoutKey: 'e'.repeat(64), cartKey: 'f'.repeat(64),
      items: [{ productId: '1', name: 'Old sample', price: 10, quantity: 1 }],
      cartSnapshot: [], shippingAddress: { name: 'Buyer' }, billingAddress: { name: 'Buyer' },
      subtotal: 10, delivery: 0, total: 10, status: 'placed' });
    assert.equal(await backfillOrderShipments(), 1);
    assert.equal((await OrderModel.findById(legacy._id).lean()).shipments[0].storeId, storeA);
    assert.equal((await OrderModel.findById(dummy._id).lean()).shipments.length, 0);
    const initial = await OrderModel.create({
      userId, checkoutKey: 'a'.repeat(64), cartKey: 'b'.repeat(64),
      items: [{ storeId: storeA, name: 'Shirt', price: 500, quantity: 1 },
        { storeId: storeB, name: 'Watch', price: 1000, quantity: 1 }],
      shipments: [{ storeId: storeA, status: 'placed', dispatchedAt: null },
        { storeId: storeB, status: 'placed', dispatchedAt: null }],
      cartSnapshot: [], shippingAddress: { name: 'Buyer' }, billingAddress: { name: 'Buyer' },
      subtotal: 1500, delivery: 0, total: 1500, status: 'placed',
    });
    const id = String(initial._id);
    const seller = createSellerOrderRepository();
    const customer = createOrderRepository();
    assert.equal((await seller.list(storeA, 1, 30)).length, 2);
    assert.equal((await seller.list(storeB, 1, 30)).length, 1);
    assert.deepEqual(await seller.summary(storeB), { totalOrders: 1, orderValue: 1000,
      pending: 1, dispatched: 0, delivered: 0, returnRequests: 0 });
    assert.equal(await seller.dispatch(String(new mongoose.Types.ObjectId()), id), null);
    await seller.dispatch(storeA, id);
    assert.equal(await customer.confirmReceived(userId, id, new Date()), null);
    await seller.dispatch(storeB, id);
    assert.equal((await OrderModel.findById(id).lean()).status, 'dispatched');
    const received = await customer.confirmReceived(userId, id, new Date());
    assert.equal(received.status, 'delivered');
    assert.equal(received.paymentStatus, 'unpaid');
    assert.equal(await customer.confirmReceived(userId, id, new Date()), null);
    const request = { preference: 'exchange', reason: 'wrong_item', description: 'Wrong item received in the parcel' };
    const returned = await customer.requestReturn(userId, id, new Date(Date.now() - 86400000), request);
    assert.equal(returned.status, 'return_requested');
    assert.equal(returned.returnPreference, 'exchange');
    assert.match(returned.returnRequestId, /^RET-[A-F0-9]{20}$/);
    assert.equal(publicOrder(returned).returnRequestId, returned.returnRequestId);
    assert.equal(await customer.requestReturn(userId, id, new Date(Date.now() - 86400000), request), null);
    const admin = createAdminReturnService(createAdminReturnRepository());
    assert.equal((await admin.list({ status: 'open', page: 1 })).total, 1);
    assert.equal((await admin.detail(id)).returnRequestId, returned.returnRequestId);
    const approved = await admin.review(id, { action: 'approve', note: 'Exchange approved' });
    assert.equal(approved.status, 'return_approved');
    assert.equal((await seller.summary(storeA)).returnRequests, 1);
    const completed = await admin.review(id, { action: 'complete', reference: 'EXCHANGE-123', note: '' });
    assert.equal(completed.status, 'return_completed');
    assert.equal((await seller.summary(storeA)).returnRequests, 0);
    assert.equal((await admin.list({ status: 'closed', page: 1 })).total, 1);
  } finally {
    if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
