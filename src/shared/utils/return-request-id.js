export function getReturnRequestId(order) {
  if (!order.returnRequestedAt) return null;
  return order.returnRequestId ?? `RET-${String(order._id).toUpperCase()}`;
}
