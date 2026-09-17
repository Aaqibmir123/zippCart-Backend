import { CartItemModel } from '../models/cart-item.model.js';

export function createCartRepository() {
  return {
    add: (userId, { productId, color, size, quantity }) => CartItemModel.findOneAndUpdate(
      { userId, productId, color, size },
      { $inc: { quantity }, $setOnInsert: { userId, productId, color, size } },
      { new: true, runValidators: true, upsert: true },
    ).lean(),
    findByUserId: (userId) => CartItemModel.find({ userId }).sort({ updatedAt: -1 }).lean(),
    find: (userId, id) => CartItemModel.findOne({ userId, _id: id }).lean(),
    remove: (userId, id) => CartItemModel.deleteOne({ userId, _id: id }),
    updateQuantity: (userId, id, quantity) => CartItemModel.findOneAndUpdate(
      { userId, _id: id }, { $set: { quantity } }, { new: true, runValidators: true },
    ).lean(),
  };
}
