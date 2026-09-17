import { createAppError } from '../../utils/app-error.js';
import { getReturnRequestId } from '../../shared/utils/return-request-id.js';

export function createSellerOrderService(repository) {
  async function storeFor(ownerId) {
    const store = await repository.storeForOwner(ownerId);
    if (!store) throw createAppError('An approved, active store is required.', 403);
    return String(store._id);
  }
  function publicSellerOrder(order, storeId) {
    const items = order.items.filter((item) => item.storeId === storeId)
      .map(({ storeId: _storeId, ...item }) => item);
    const shipment = order.shipments.find((item) => item.storeId === storeId);
    return { id: String(order._id), items,
      status: order.returnRequestedAt ? order.status : order.receivedAt ? 'delivered' : shipment.status,
      dispatchedAt: shipment.dispatchedAt ?? null, receivedAt: order.receivedAt ?? null,
      returnRequestedAt: order.returnRequestedAt ?? null, returnPreference: order.returnPreference ?? null,
      returnRequestId: getReturnRequestId(order),
      returnReason: order.returnReason ?? null, returnDescription: order.returnDescription ?? null,
      returnReviewNote: order.returnReviewNote ?? null, returnReviewedAt: order.returnReviewedAt ?? null,
      returnCompletedAt: order.returnCompletedAt ?? null,
      returnCases: (order.returnCases ?? []).filter((record) => record.storeId === storeId)
        .map(({ id, status, preference, reason, items }) => ({ id, status, preference, reason,
          items: items.map(({ name, quantity, exchangeColor, exchangeSize }) => ({ name, quantity, exchangeColor, exchangeSize })) })),
      createdAt: order.createdAt,
      customer: order.shippingAddress.name, shippingAddress: order.shippingAddress,
      paymentMethod: order.paymentMethod, paymentStatus: order.paymentStatus,
      subtotal: items.reduce((sum, item) => sum + item.price * item.quantity, 0) };
  }
  return {
    list: async (ownerId, page = 1) => {
      const storeId = await storeFor(ownerId);
      const limit = 30;
      const [rows, summary] = await Promise.all([repository.list(storeId, page, limit), repository.summary(storeId)]);
      return { orders: rows.map((order) => publicSellerOrder(order, storeId)), summary,
        total: summary.totalOrders, nextPage: page * limit < summary.totalOrders ? page + 1 : null };
    },
    dispatch: async (ownerId, orderId) => {
      const storeId = await storeFor(ownerId);
      const order = await repository.dispatch(storeId, orderId);
      if (!order) throw createAppError('Order not found or already dispatched.', 409);
      return publicSellerOrder(order, storeId);
    },
  };
}
