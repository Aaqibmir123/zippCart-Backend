import { createReturnService } from '../src/returns/return.service.js';
import { requestSchema, customerActionSchema, adminActionSchema } from '../src/returns/return.validator.js';
process.env.STORE_ENCRYPTION_KEY ??= 'ab'.repeat(32);
export const bankPayout = { method: 'bank', accountHolder: 'Test Buyer', accountNumber: '12345678901', ifsc: 'SBIN0001234' };

export const ids = { order: 'a'.repeat(24), user: 'b'.repeat(24), admin: 'c'.repeat(24), store: 'd'.repeat(24), product: 'e'.repeat(24) };
export const address = { name: 'Test Buyer', phone: '9876543210', line1: 'House 10', locality: 'Main Road',
  city: 'Srinagar', state: 'Jammu and Kashmir', pincode: '190001', landmark: '', label: 'Home' };
export const buyer = { id: ids.user, roles: ['user'] };
export const admin = { id: ids.admin, roles: ['admin'] };
export function fixture() {
  let now = new Date('2026-09-16T10:00:00Z');
  let order = { _id: ids.order, userId: ids.user, items: [{ productId: ids.product, storeId: ids.store,
    name: 'Shirt', price: 500, quantity: 3, color: 'Blue', size: 'M' }], status: 'delivered',
    receivedAt: new Date(now.getTime() - 3600000), shippingAddress: address, returnCases: [], returnsRevision: 0 };
  const repository = {
    order: async (id, userId) => id === ids.order && (!userId || userId === order.userId) ? structuredClone(order) : null,
    save: async (expected, cases) => {
      if (expected.returnsRevision !== order.returnsRevision) return null;
      order = { ...order, returnsRevision: order.returnsRevision + 1, returnCases: structuredClone(cases) };
      return structuredClone(order);
    },
    photos: async (_order, user, photos) => user === ids.user || user === ids.admin ? photos.filter((id) => id !== 'f'.repeat(24)).map((_id) => ({ _id })) : [],
    list: async () => ({ cases: [], total: 0 }),
  };
  let stock = 20;
  const catalog = { findPurchasable: async (id) => ({ _id: id, stock, sizes: ['M', 'L'], colors: [{ name: 'Blue' }] }) };
  const service = createReturnService(repository, catalog, () => now);
  let key = 0;
  const nextKey = () => `return-test-key-${++key}`;
  const request = (extra = {}) => requestSchema.parse({ clientKey: nextKey(), preference: 'refund', reason: 'size_fit',
    description: 'This shirt does not fit properly', photoIds: [], items: [{ index: 0, quantity: 1 }],
    pickupAddress: address, refundMethod: 'upi', payout: { method: 'upi', upiId: 'buyer@bank' }, ...extra });
  const act = async (record, action, extra = {}, asAdmin = true) => {
    const schema = asAdmin ? adminActionSchema : customerActionSchema;
    return service.action(ids.order, record.id, asAdmin ? admin : buyer, schema.parse({ version: record.version,
      clientKey: nextKey(), note: 'Confirmed after checking the request', action,
      ...(action === 'switch_refund' ? { payout: bankPayout } : {}), ...extra }), asAdmin);
  };
  return { service, repository, request, act, now: () => now, setNow: (value) => { now = value; },
    setStock: (value) => { stock = value; }, order: () => order, setOrder: (value) => { order = value; } };
}
export const pickup = { mode: 'pickup', start: '2026-09-17T10:00:00Z', end: '2026-09-17T12:00:00Z',
  contact: 'Pickup desk 9876543210', reference: 'PICKUP-12345', instructions: 'Pack the item with its tags.' };
