import { ProductModel } from '../models/product.model.js';
import { StoreModel } from '../../shared/models/store.model.js';

export function createProductRepository() {
  return {
    storeForOwner: (ownerId) => StoreModel.findOne({ ownerId, status: 'approved', isActive: true }).select('_id').lean(),
    list: (storeId, skip, limit) => ProductModel.find({ storeId })
      .select('-images -colors +photo').sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit + 1).lean(),
    find: (storeId, id) => ProductModel.findOne({ _id: id, storeId }).select('+photo').lean(),
    count: (storeId) => ProductModel.countDocuments({ storeId }),
    create: async (data) => (await ProductModel.create(data)).toObject(),
    update: (storeId, id, data) => ProductModel.findOneAndUpdate(
      { _id: id, storeId }, { $set: data }, { returnDocument: 'after', runValidators: true },
    ).select('+photo').lean(),
    setStatus: (storeId, id, active) => ProductModel.findOneAndUpdate(
      { _id: id, storeId }, { $set: { active } }, { returnDocument: 'after', runValidators: true },
    ).select('-images -colors +photo').lean(),
  };
}
