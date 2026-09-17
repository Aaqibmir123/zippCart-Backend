import { createAppError } from '../../utils/app-error.js';
import { publicProduct } from '../../seller/services/product.service.js';

export const SHOP_CATEGORIES = ['Fashion', 'Watches', 'Beauty', 'Home', 'Accessories', 'Electronics', 'Other'];

function summary(product) {
  return {
    id: String(product._id), name: product.name, category: product.category,
    brand: product.brand ?? '', price: product.price, mrp: product.mrp,
    stock: product.stock, coverImage: product.coverImage ?? product.photo ?? null,
    storeName: product.storeId?.storeName ?? '',
  };
}

export function createCatalogService(repository) {
  return {
    lookup: async (ids) => (await repository.lookup(ids)).map(summary),
    list: async (options) => {
      const { products, total } = await repository.list(options);
      return { products: products.map(summary), total, nextPage: options.page * options.limit < total ? options.page + 1 : null };
    },
    get: async (id) => {
      const product = await repository.find(id);
      if (!product) throw createAppError('Product is no longer available.', 404);
      return { ...publicProduct(product), storeName: product.storeId.storeName };
    },
  };
}
