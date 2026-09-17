import { OrderModel } from '../models/order.model.js';
import { AddressModel } from '../models/address.model.js';
import { CartItemModel } from '../models/cart-item.model.js';
import { randomUUID } from 'node:crypto';

export function createOrderRepository() {
  return {
    cart: (userId) => CartItemModel.find({ userId }).sort({ productId: 1 }).lean(),
    address: (userId, id) => AddressModel.findOne({ _id: id, userId }).lean(),
    find: (userId, checkoutKey) => OrderModel.findOne({ userId, checkoutKey }).lean(),
    findById: (userId, id) => OrderModel.findOne({ userId, _id: id }).lean(),
    confirmReceived: (userId, id, at) => OrderModel.findOneAndUpdate(
      { userId, _id: id, status: 'dispatched', receivedAt: null,
        shipments: { $not: { $elemMatch: { status: { $ne: 'dispatched' } } } },
        'shipments.0': { $exists: true } },
      { $set: { status: 'delivered', receivedAt: at } },
      { returnDocument: 'after' },
    ).lean(),
    requestReturn: (userId, id, cutoff, request) => OrderModel.findOneAndUpdate(
      { userId, _id: id, receivedAt: { $gte: cutoff }, status: 'delivered', returnRequestedAt: null,
        'returnCases.0': { $exists: false } },
      { $set: { status: 'return_requested', returnRequestedAt: new Date(),
        returnRequestId: `RET-${randomUUID().replaceAll('-', '').slice(0, 20).toUpperCase()}`,
        returnPreference: request.preference, returnReason: request.reason, returnDescription: request.description } },
      { returnDocument: 'after' },
    ).lean(),
    setCartItems: (userId, items) => CartItemModel.bulkWrite(items.map(({ productId, color, size, quantity }) => ({
      updateOne: { filter: { userId, productId, color, size }, update: { $set: { quantity }, $setOnInsert: { userId, productId, color, size } }, upsert: true },
    }))),
    list: (userId) => OrderModel.find({ userId }).select('-returnCases.history -returnCases.items -returnCases.photoIds -returnCases.pickupAddress -returnCases.proposedAddress -returnCases.payoutEncrypted')
      .sort({ createdAt: -1 }).lean(),
    create: async (data) => {
      await OrderModel.init();
      try { return await OrderModel.create(data); }
      catch (error) {
        if (error.code !== 11000) throw error;
        const existing = await OrderModel.findOne({ userId: data.userId, cartKey: data.cartKey });
        if (!existing) throw error;
        return existing;
      }
    },
    clear: (userId, snapshot) => CartItemModel.deleteMany({
      userId,
      $or: snapshot.map((item) => ({ _id: item.id, quantity: item.quantity, updatedAt: new Date(item.updatedAt) })),
    }),
  };
}
