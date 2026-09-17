import assert from 'node:assert/strict';
import test from 'node:test';
import { createSellerOrderService } from '../src/seller/services/seller-order.service.js';
import { createSellerOrderRepository } from '../src/seller/repositories/seller-order.repository.js';
import { OrderModel } from '../src/user/models/order.model.js';

const storeId = '1'.repeat(24);
const otherStoreId = '2'.repeat(24);
const orderId = '3'.repeat(24);
const address = { name: 'Buyer', phone: '9876543210', line1: 'Flat 1', city: 'Delhi' };
const order = {
  _id: orderId, createdAt: new Date(), shippingAddress: address,
  paymentMethod: 'cod', paymentStatus: 'unpaid', receivedAt: null,
  items: [{ storeId, name: 'Shirt', price: 500, quantity: 2 },
    { storeId: otherStoreId, name: 'Watch', price: 1000, quantity: 1 }],
  shipments: [{ storeId, status: 'placed', dispatchedAt: null },
    { storeId: otherStoreId, status: 'dispatched', dispatchedAt: new Date() }],
};

test('seller sees only items from their approved store', async () => {
  const service = createSellerOrderService({
    storeForOwner: async (ownerId) => ownerId === 'owner' ? { _id: storeId } : null,
    list: async () => [order], summary: async () => ({ totalOrders: 1, orderValue: 1000,
      pending: 1, dispatched: 0, delivered: 0, returnRequests: 0 }), dispatch: async () => order,
  });
  await assert.rejects(service.list('stranger'), { statusCode: 403 });
  const { orders: [result], total, summary, nextPage } = await service.list('owner');
  assert.equal(total, 1);
  assert.equal(summary.orderValue, 1000);
  assert.equal(summary.pending, 1);
  assert.equal(nextPage, null);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].name, 'Shirt');
  assert.equal(result.subtotal, 1000);
  assert.equal(result.status, 'placed');
});

test('seller sees return request details on their order', async () => {
  const requestedAt = new Date();
  const service = createSellerOrderService({
    storeForOwner: async () => ({ _id: storeId }),
    list: async () => [{ ...order, status: 'return_requested', returnRequestedAt: requestedAt, returnReason: 'Damaged item' }],
    summary: async () => ({ totalOrders: 1, orderValue: 1000, pending: 0,
      dispatched: 0, delivered: 1, returnRequests: 1 }),
  });
  const { orders: [result], summary } = await service.list('owner');
  assert.equal(result.status, 'return_requested');
  assert.equal(result.returnReason, 'Damaged item');
  assert.equal(result.returnRequestId, `RET-${orderId.toUpperCase()}`);
  assert.equal(result.returnRequestedAt, requestedAt);
  assert.equal(summary.returnRequests, 1);
});

test('seller return summaries isolate stores and omit private case data', async () => {
  const ownCase = { id: 'case-one', storeId, status: 'under_review', preference: 'exchange', reason: 'size_fit',
    items: [{ name: 'Shirt', quantity: 1, exchangeSize: 'L' }], photoIds: ['private'],
    history: [{ note: 'Private' }], pickupAddress: address };
  const service = createSellerOrderService({ storeForOwner: async () => ({ _id: storeId }),
    list: async () => [{ ...order, returnCases: [ownCase, { ...ownCase, id: 'case-two', storeId: otherStoreId }] }],
    summary: async () => ({ totalOrders: 1 }) });
  const { orders: [result] } = await service.list('owner');
  assert.equal(result.returnCases.length, 1);
  assert.equal(result.returnCases[0].id, 'case-one');
  assert.equal(result.returnCases[0].items[0].exchangeSize, 'L');
  for (const key of ['storeId', 'photoIds', 'history', 'pickupAddress']) assert.equal(key in result.returnCases[0], false);
});

test('dispatch atomically targets only the seller shipment in placed state', async (t) => {
  let filter;
  let update;
  let statusUpdate;
  t.mock.method(OrderModel, 'findOneAndUpdate', (query, change) => {
    filter = query; update = change;
    return { lean: async () => order };
  });
  t.mock.method(OrderModel, 'updateOne', async (query) => { statusUpdate = query; });
  await createSellerOrderRepository().dispatch(storeId, orderId);
  assert.deepEqual(filter, { _id: orderId, shipments: { $elemMatch: { storeId, status: 'placed' } } });
  assert.equal(update.$set['shipments.$.status'], 'dispatched');
  assert.equal(statusUpdate._id, orderId);
});
