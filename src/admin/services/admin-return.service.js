import { createAppError } from '../../utils/app-error.js';
import { getReturnRequestId } from '../../shared/utils/return-request-id.js';

export function publicReturn(order, storeNames = new Map()) {
  return { id: String(order._id), createdAt: order.createdAt, status: order.status,
    returnRequestId: getReturnRequestId(order),
    shipments: (order.shipments ?? []).map((shipment) => ({
      status: shipment.status, dispatchedAt: shipment.dispatchedAt ?? null,
      storeName: storeNames.get(String(shipment.storeId)) ?? null,
    })), receivedAt: order.receivedAt ?? null,
    items: order.items.map(({ storeId, ...item }) => ({ ...item,
      storeName: storeNames.get(String(storeId)) ?? null })), customer: order.shippingAddress.name,
    shippingAddress: order.shippingAddress, total: order.total, paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus, returnRequestedAt: order.returnRequestedAt,
    returnPreference: order.returnPreference ?? null, returnReason: order.returnReason ?? null,
    returnDescription: order.returnDescription ?? null, returnReviewNote: order.returnReviewNote ?? null,
    returnReviewedAt: order.returnReviewedAt ?? null, returnCompletedAt: order.returnCompletedAt ?? null,
    returnReference: order.returnReference ?? null };
}

export function createAdminReturnService(repository) {
  async function namesFor(orders) {
    const ids = [...new Set(orders.flatMap((order) => [
      ...order.items.map((item) => item.storeId), ...(order.shipments ?? []).map((item) => item.storeId),
    ]).filter((id) => /^[a-f\d]{24}$/i.test(String(id))))];
    return new Map((await repository.storeNames(ids)).map((store) => [String(store._id), store.storeName]));
  }
  return {
    list: async ({ status, page }) => {
      const limit = 30;
      const [rows, total] = await Promise.all([repository.list(status, page, limit), repository.count(status)]);
      const names = await namesFor(rows);
      return { returns: rows.map((row) => publicReturn(row, names)), total,
        nextPage: page * limit < total ? page + 1 : null };
    },
    detail: async (id) => {
      const order = await repository.find(id);
      if (!order) throw createAppError('Return request not found.', 404);
      return publicReturn(order, await namesFor([order]));
    },
    review: async (id, input) => {
      const current = await repository.find(id);
      if (!current) throw createAppError('Return request not found.', 404);
      const expected = input.action === 'complete' ? 'return_approved' : 'return_requested';
      if (current.status !== expected) throw createAppError('This return has already changed. Refresh and try again.', 409);
      if (input.action === 'approve' && !current.returnPreference && !input.preference) {
        throw createAppError('Select refund or exchange for this older request.', 400);
      }
      const at = new Date();
      const update = input.action === 'approve'
        ? { status: 'return_approved', returnPreference: current.returnPreference ?? input.preference,
          returnReviewedAt: at, returnReviewNote: input.note }
        : input.action === 'reject'
          ? { status: 'return_rejected', returnReviewedAt: at, returnReviewNote: input.note }
          : { status: 'return_completed', returnCompletedAt: at, returnReference: input.reference,
            returnReviewNote: input.note || current.returnReviewNote };
      const result = await repository.transition(id, expected, update);
      if (!result) throw createAppError('This return has already changed. Refresh and try again.', 409);
      return publicReturn(result, await namesFor([result]));
    },
  };
}
