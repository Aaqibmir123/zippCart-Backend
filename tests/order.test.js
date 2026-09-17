import assert from 'node:assert/strict';
import test from 'node:test';
import { createOrderService } from '../src/user/services/order.service.js';
import { placeOrderSchema } from '../src/user/validators/order.validator.js';

const address = { name: 'Test User', phone: '9876543210', line1: 'Flat 204', locality: 'MG Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001', label: 'Home' };
const input = { shippingAddressId: 'a'.repeat(24), billingAddressId: 'b'.repeat(24) };
const productId = '1'.repeat(24);
function fixture() {
  let cart = [{ _id: 'cart1', productId, color: '', size: '', quantity: 2, updatedAt: new Date('2026-01-01') }];
  const orders = [];
  let failClear = false;
  const repository = {
    cart: async () => cart,
    address: async (user) => user === 'owner' ? address : null,
    find: async (user, key) => orders.find((order) => order.userId === user && order.checkoutKey === key),
    list: async (user) => orders.filter((order) => order.userId === user),
    findById: async (user, id) => orders.find((order) => order.userId === user && order._id === id),
    confirmReceived: async (user, id, at) => {
      const order = orders.find((entry) => entry.userId === user && entry._id === id && entry.status === 'dispatched');
      if (!order) return null;
      Object.assign(order, { status: 'delivered', receivedAt: at });
      return order;
    },
    requestReturn: async (user, id, cutoff, request) => {
      const order = orders.find((entry) => entry.userId === user && entry._id === id && entry.receivedAt >= cutoff && entry.status === 'delivered' && !entry.returnRequestedAt);
      if (!order) return null;
      Object.assign(order, { status: 'return_requested', returnRequestedAt: new Date(),
        returnPreference: request.preference, returnReason: request.reason, returnDescription: request.description });
      return order;
    },
    create: async (data) => { const order = { ...data, _id: 'order1', createdAt: new Date() }; orders.push(order); return order; },
    clear: async () => { if (failClear) throw new Error('Temporary database error'); cart = []; },
  };
  const catalog = { findPurchasable: async (id) => id === productId ? { _id: productId, storeId: '3'.repeat(24), name: 'Real product', price: 2499, stock: 10, sizes: [], colors: [] } : null };
  return { service: createOrderService(repository, 40, catalog), orders, setCart: (value) => { cart = value; }, failClear: (value) => { failClear = value; } };
}
test('quote uses server prices and configured delivery charge', async () => {
  const { service } = fixture();
  const quote = await service.quote('owner', input);
  assert.equal(quote.subtotal, 4998);
  assert.equal(quote.total, 5038);
  assert.equal(quote.delivery, 40);
  assert.equal('cartSnapshot' in quote, false);
  assert.equal('userId' in quote.shippingAddress, false);
});
test('COD persists once, stays unpaid, and a network retry returns the same order', async () => {
  const { service, orders } = fixture();
  const quote = await service.quote('owner', input);
  const request = { ...input, checkoutKey: quote.checkoutKey, paymentMethod: 'cod' };
  const first = await service.place('owner', request);
  const retry = await service.place('owner', request);
  assert.equal(first.id, retry.id);
  assert.equal(orders.length, 1);
  assert.equal(first.paymentStatus, 'unpaid');
  assert.equal(first.status, 'placed');
  assert.equal('checkoutKey' in first, false);
  assert.equal((await service.list('other')).length, 0);
  assert.equal((await service.get('owner', first.id)).id, first.id);
  await assert.rejects(service.get('other', first.id), { statusCode: 404 });
});
test('cleanup failure can be retried without creating another order', async () => {
  const fixtureState = fixture();
  const quote = await fixtureState.service.quote('owner', input);
  const request = { ...input, checkoutKey: quote.checkoutKey, paymentMethod: 'cod' };
  fixtureState.failClear(true);
  await assert.rejects(fixtureState.service.place('owner', request));
  fixtureState.failClear(false);
  await fixtureState.service.place('owner', request);
  assert.equal(fixtureState.orders.length, 1);
});
test('changed cart, foreign addresses, empty cart and UPI cannot place orders', async () => {
  const { service, setCart, orders } = fixture();
  const quote = await service.quote('owner', input);
  const request = { ...input, checkoutKey: quote.checkoutKey, paymentMethod: 'cod' };
  await assert.rejects(service.quote('other', input), { statusCode: 400 });
  await assert.rejects(service.place('owner', { ...request, paymentMethod: 'upi' }), { statusCode: 400 });
  assert.equal(placeOrderSchema.safeParse({ ...request, paymentMethod: 'upi' }).success, false);
  setCart([{ _id: 'cart1', productId, color: '', size: '', quantity: 3, updatedAt: new Date('2026-01-02') }]);
  await assert.rejects(service.place('owner', request), { statusCode: 409 });
  setCart([]);
  await assert.rejects(service.quote('owner', input), { statusCode: 400 });
  assert.equal(orders.length, 0);
});
test('return requests start after receipt, last 24 hours and cannot be duplicated', async () => {
  const returnInput = { preference: 'refund', reason: 'wrong_item', description: 'Wrong item received in my parcel' };
  const { service, orders } = fixture();
  const quote = await service.quote('owner', input);
  const placed = await service.place('owner', { ...input, checkoutKey: quote.checkoutKey, paymentMethod: 'cod' });
  assert.equal(placed.returnEligibleUntil, null);
  await assert.rejects(service.requestReturn('owner', placed.id, returnInput), { statusCode: 409 });
  orders[0].status = 'dispatched';
  const received = await service.confirmReceived('owner', placed.id);
  assert.ok(received.returnEligibleUntil);
  const returned = await service.requestReturn('owner', placed.id, returnInput);
  assert.equal(returned.status, 'return_requested');
  assert.equal(returned.returnPreference, 'refund');
  assert.equal(returned.returnDescription, returnInput.description);
  await assert.rejects(service.requestReturn('owner', placed.id, returnInput), { statusCode: 409 });
  orders[0].returnRequestedAt = null;
  orders[0].status = 'delivered';
  orders[0].receivedAt = new Date(Date.now() - 86400001);
  await assert.rejects(service.requestReturn('owner', placed.id, returnInput), { statusCode: 409 });
});
test('buy now quotes one product and leaves existing cart untouched', async () => {
  const state = fixture();
  const buyNow = { productId, color: '', size: '', quantity: 1, purchaseId: 'buy-now-unique-123' };
  const quote = await state.service.quote('owner', { ...input, buyNow });
  assert.equal(quote.items.length, 1);
  assert.equal(quote.subtotal, 2499);
  const order = await state.service.place('owner', { ...input, buyNow, checkoutKey: quote.checkoutKey, paymentMethod: 'cod' });
  assert.equal(order.items[0].quantity, 1);
  assert.equal(state.orders[0].cartSnapshot.length, 0);
});
