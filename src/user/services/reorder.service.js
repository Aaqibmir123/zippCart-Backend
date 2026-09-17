import { createAppError } from '../../utils/app-error.js';

export function createReorderService(repository, catalog) {
  return async (userId, orderId, items) => {
    const order = await repository.findById(userId, orderId);
    if (!order) throw createAppError('Order not found.', 404);
    for (const item of items) {
      const ordered = order.items.find((entry) => entry.productId === item.productId &&
        (entry.color ?? '') === (item.color ?? '') && (entry.size ?? '') === (item.size ?? ''));
      const product = await catalog.findPurchasable(item.productId);
      const sizes = product?.sizes?.length ? product.sizes : (product?.variants?.split(',').map((value) => value.trim()).filter(Boolean) ?? []);
      const colors = (product?.colors ?? []).map((value) => value.name);
      const chosenSize = item.size ?? '';
      const chosenColor = item.color ?? '';
      if (!ordered || !product || item.quantity > product.stock ||
        (sizes.length ? !sizes.includes(chosenSize) : !!chosenSize) ||
        (colors.length ? !colors.includes(chosenColor) : !!chosenColor)) {
        throw createAppError('A selected product is no longer available for reorder.', 400);
      }
    }
    // Set the chosen quantities, preserving unrelated cart items. Retrying never adds duplicates.
    await repository.setCartItems(userId, items);
    return { message: 'Items added to cart.' };
  };
}
