import { FavoriteModel } from '../models/favorite.model.js';

export function createFavoriteRepository() {
  async function listByUserId(userId) {
    return FavoriteModel.find({ userId }).sort({ createdAt: -1 }).lean();
  }

  async function add(userId, productId) {
    await FavoriteModel.updateOne(
      { productId, userId },
      { $setOnInsert: { productId, userId } },
      { upsert: true },
    );
  }

  async function remove(userId, productId) {
    await FavoriteModel.deleteOne({ productId, userId });
  }

  return { add, listByUserId, remove };
}
