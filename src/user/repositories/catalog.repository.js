import { ProductModel } from '../../seller/models/product.model.js';
import { StoreModel } from '../../shared/models/store.model.js';

export function createCatalogRepository() {
  async function approvedStoreIds() {
    return (await StoreModel.find({ status: 'approved', isActive: true }).select('_id').lean()).map((store) => store._id);
  }
  return {
    lookup: async (ids) => {
      const storeIds = await approvedStoreIds();
      return ProductModel.find({ _id: { $in: ids }, storeId: { $in: storeIds }, active: true, stock: { $gt: 0 } })
        .select('-images -colors +photo').populate('storeId', 'storeName').lean();
    },
    list: async ({ category, search, page, limit }) => {
      const storeIds = await approvedStoreIds();
      const filter = {
        storeId: { $in: storeIds }, active: true, stock: { $gt: 0 },
        ...(category ? { category } : {}),
        ...(search ? { name: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } } : {}),
      };
      const [products, total] = await Promise.all([
        ProductModel.find(filter).select('-images -colors +photo')
          .populate('storeId', 'storeName').sort({ createdAt: -1, _id: -1 })
          .skip((page - 1) * limit).limit(limit).lean(),
        ProductModel.countDocuments(filter),
      ]);
      return { products, total };
    },
    find: async (id) => {
      const product = await ProductModel.findOne({ _id: id, active: true, stock: { $gt: 0 } })
        .select('+photo').populate('storeId', 'storeName status isActive').lean();
      return product?.storeId?.status === 'approved' && product.storeId.isActive ? product : null;
    },
    findPurchasable: async (id) => {
      if (!/^[a-fA-F0-9]{24}$/.test(id)) return null;
      const product = await ProductModel.findOne({ _id: id, active: true, stock: { $gt: 0 } })
        .select('name price mrp stock sizes variants colors.name storeId coverImage').lean();
      if (!product) return null;
      const store = await StoreModel.findOne({ _id: product.storeId, status: 'approved', isActive: true }).select('_id').lean();
      return store ? product : null;
    },
  };
}
