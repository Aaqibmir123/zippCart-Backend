import { createAppError } from '../../utils/app-error.js';

const MAX_QUANTITY = 99;
const publicItem = (item) => ({
  id: String(item._id), productId: item.productId,
  color: item.color ?? '', size: item.size ?? '', quantity: item.quantity,
});

export function createCartService(repository, catalog) {
  async function requireProduct(productId, color, size, quantity) {
    const product = await catalog.findPurchasable(productId);
    if (!product) throw createAppError('This product is unavailable.', 404);
    const sizes = product.sizes?.length ? product.sizes : (product.variants ? product.variants.split(',').map((value) => value.trim()) : []);
    if ((sizes.length && !sizes.includes(size)) || (!sizes.length && size))
      throw createAppError('Choose an available size.', 400);
    const names = (product.colors ?? []).map((item) => item.name);
    if ((names.length && !names.includes(color)) || (!names.length && color))
      throw createAppError('Choose an available color.', 400);
    if (quantity > product.stock) throw createAppError('Not enough stock is available.', 409);
    return product;
  }
  return {
    addItem: async (userId, data) => {
      const current = (await repository.findByUserId(userId)).find((item) =>
        item.productId === data.productId && (item.color ?? '') === data.color && (item.size ?? '') === data.size);
      const quantity = Math.min(MAX_QUANTITY, (current?.quantity ?? 0) + data.quantity);
      await requireProduct(data.productId, data.color, data.size, quantity);
      if (current && quantity === current.quantity) return publicItem(current);
      return publicItem(await repository.add(userId, { ...data, quantity: quantity - (current?.quantity ?? 0) }));
    },
    getCart: async (userId) => (await repository.findByUserId(userId)).map(publicItem),
    setQuantity: async (userId, id, quantity) => {
      const current = await repository.find(userId, id);
      if (!current) throw createAppError('This cart item no longer exists.', 404);
      if (quantity === 0) { await repository.remove(userId, id); return null; }
      await requireProduct(current.productId, current.color ?? '', current.size ?? '', quantity);
      return publicItem(await repository.updateQuantity(userId, id, quantity));
    },
    removeItem: (userId, id) => repository.remove(userId, id),
  };
}
