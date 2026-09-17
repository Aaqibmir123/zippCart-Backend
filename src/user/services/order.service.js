import { createHash } from 'node:crypto';
import { createAppError } from '../../utils/app-error.js';
import { getReturnRequestId } from '../../shared/utils/return-request-id.js';

const hash = (data) => createHash('sha256').update(JSON.stringify(data)).digest('hex');
const snapshotAddress = (address) => {
  const { name, phone, line1, locality, landmark, city, state, pincode, label } = address;
  return { name, phone, line1, locality, landmark, city, state, pincode, label };
};
export function publicOrder(order) {
  const { shippingAddress, billingAddress, subtotal, delivery, total, paymentMethod, paymentStatus, status, createdAt, returnRequestedAt, receivedAt } = order;
  const items = order.items.map(({ storeId, ...item }) => item);
  return { id: String(order._id), items, shippingAddress, billingAddress, subtotal, delivery, total,
    paymentMethod, paymentStatus, status, createdAt, trackingAvailable: !!order.shipments?.length,
    receivedAt: receivedAt ?? null,
    dispatchedAt: order.shipments?.length && order.shipments.every((item) => item.dispatchedAt)
      ? new Date(Math.max(...order.shipments.map((item) => new Date(item.dispatchedAt).getTime()))).toISOString() : null,
    returnRequestedAt: returnRequestedAt ?? null,
    returnRequestId: getReturnRequestId(order),
    returnPreference: order.returnPreference ?? null, returnReason: order.returnReason ?? null,
    returnDescription: order.returnDescription ?? null, returnReviewNote: order.returnReviewNote ?? null,
    returnReviewedAt: order.returnReviewedAt ?? null, returnCompletedAt: order.returnCompletedAt ?? null,
    returnReference: order.returnReference ?? null,
    returnCases: (order.returnCases ?? []).map(({ id, status, preference }) => ({ id, status, preference })),
    returnEligibleUntil: receivedAt ? new Date(new Date(receivedAt).getTime() + 24 * 60 * 60 * 1000).toISOString() : null };
}

export function createOrderService(repository, delivery = 0, catalog) {
  async function buildQuote(userId, { shippingAddressId, billingAddressId, buyNow }) {
    const [cart, shipping, billing] = await Promise.all([
      buyNow ? Promise.resolve([buyNow]) : repository.cart(userId),
      repository.address(userId, shippingAddressId), repository.address(userId, billingAddressId),
    ]);
    if (!shipping || !billing) throw createAppError('Please select a valid delivery and billing address.', 400);
    if (!cart.length) throw createAppError('Your cart is empty.', 400);
    const items = await Promise.all(cart.map(async (item) => {
      const product = await catalog.findPurchasable(item.productId);
      if (!product || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99 || item.quantity > product.stock) {
        throw createAppError('A cart item is unavailable. Please review your cart.', 400);
      }
      const size = item.size ?? '';
      const color = item.color ?? '';
      const sizes = product.sizes?.length ? product.sizes : (product.variants ? product.variants.split(',').map((value) => value.trim()) : []);
      const colors = (product.colors ?? []).map((value) => value.name);
      if ((sizes.length && !sizes.includes(size)) || (!sizes.length && size) || (colors.length && !colors.includes(color)) || (!colors.length && color)) {
        throw createAppError('A product option changed. Please review your cart.', 409);
      }
      return { productId: String(product._id), storeId: String(product.storeId), name: product.name, price: product.price,
        quantity: item.quantity, color, size, coverImage: product.coverImage ?? null };
    }));
    const totalByProduct = new Map();
    for (const item of items) totalByProduct.set(item.productId, (totalByProduct.get(item.productId) ?? 0) + item.quantity);
    for (const [productId, quantity] of totalByProduct) {
      const available = await catalog.findPurchasable(productId);
      if (!available || quantity > available.stock) throw createAppError('Not enough stock is available. Please review your cart.', 409);
    }
    const cartSnapshot = buyNow ? [] : cart.map((item) => ({ id: String(item._id), quantity: item.quantity,
      color: item.color ?? '', size: item.size ?? '', updatedAt: new Date(item.updatedAt).toISOString() }));
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const shippingAddress = snapshotAddress(shipping);
    const billingAddress = snapshotAddress(billing);
    const cartKey = hash(buyNow ? [userId, 'buy-now', buyNow.purchaseId] : [userId, cartSnapshot]);
    const checkoutKey = hash([cartKey, items, shippingAddress, billingAddress, delivery]);
    const shipments = [...new Set(items.map((item) => item.storeId))].map((storeId) => ({ storeId, status: 'placed', dispatchedAt: null }));
    return { checkoutKey, cartKey, cartSnapshot, items, shipments, shippingAddress, billingAddress, subtotal, delivery, total: subtotal + delivery };
  }
  return {
    quote: async (userId, input) => {
      const { cartSnapshot, cartKey, shipments, items, ...quote } = await buildQuote(userId, input);
      return { ...quote, items: items.map(({ storeId, ...item }) => item) };
    },
    place: async (userId, input) => {
      if (input.paymentMethod !== 'cod') throw createAppError('Only cash on delivery is available.', 400);
      let order = await repository.find(userId, input.checkoutKey);
      if (!order) {
        const quote = await buildQuote(userId, input);
        if (quote.checkoutKey !== input.checkoutKey) throw createAppError('Your cart or address changed. Refresh checkout before placing the order.', 409);
        order = await repository.create({ ...quote, userId, paymentMethod: 'cod', paymentStatus: 'unpaid', status: 'placed' });
      }
      if (order.checkoutKey !== input.checkoutKey) throw createAppError('This checkout was already used for a different order.', 409);
      // The durable order is the source of truth. Retrying the same checkout is idempotent.
      if (order.cartSnapshot.length) await repository.clear(userId, order.cartSnapshot);
      return publicOrder(order);
    },
    list: async (userId) => (await repository.list(userId)).map(publicOrder),
    get: async (userId, id) => {
      const order = await repository.findById(userId, id);
      if (!order) throw createAppError('Order not found.', 404);
      return publicOrder(order);
    },
    confirmReceived: async (userId, id) => {
      const order = await repository.confirmReceived(userId, id, new Date());
      if (!order) throw createAppError('This order is not fully dispatched or was already received.', 409);
      return publicOrder(order);
    },
    requestReturn: async (userId, id, request) => {
      const existing = await repository.findById(userId, id);
      if (!existing) throw createAppError('Order not found.', 404);
      if (existing.returnRequestedAt) throw createAppError('A return is already requested.', 409);
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      if (existing.status !== 'delivered' || !existing.receivedAt) throw createAppError('Return requests open after the order is received.', 409);
      if (new Date(existing.receivedAt) < cutoff) throw createAppError('The 24-hour return window has closed.', 409);
      const order = await repository.requestReturn(userId, id, cutoff, request);
      if (!order) throw createAppError('The return window has closed or a request already exists.', 409);
      return publicOrder(order);
    },
  };
}
