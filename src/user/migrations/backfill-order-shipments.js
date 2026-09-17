import { OrderModel } from '../models/order.model.js';
import { ProductModel } from '../../seller/models/product.model.js';

const objectId = /^[a-f\d]{24}$/i;
export async function backfillOrderShipments() {
  let updated = 0;
  const legacy = OrderModel.find({ 'shipments.0': { $exists: false }, status: 'placed' })
    .select('_id items').lean().cursor();
  for await (const order of legacy) {
    const ids = [...new Set(order.items.map((item) => item.productId))];
    if (!ids.length || ids.some((id) => !objectId.test(id))) continue;
    const products = await ProductModel.find({ _id: { $in: ids } }).select('_id storeId').lean();
    const stores = new Map(products.map((product) => [String(product._id), String(product.storeId)]));
    if (ids.some((id) => !stores.has(id))) continue;
    const items = order.items.map((item) => ({ ...item, storeId: stores.get(item.productId) }));
    const shipments = [...new Set(items.map((item) => item.storeId))]
      .map((storeId) => ({ storeId, status: 'placed', dispatchedAt: null }));
    const result = await OrderModel.updateOne({ _id: order._id, 'shipments.0': { $exists: false }, status: 'placed' },
      { $set: { items, shipments } });
    updated += result.modifiedCount;
  }
  return updated;
}
