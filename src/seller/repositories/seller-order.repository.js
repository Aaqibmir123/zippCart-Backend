import { OrderModel } from '../../user/models/order.model.js';
import { StoreModel } from '../../shared/models/store.model.js';
import { closedStatuses } from '../../returns/return.constants.js';

export function createSellerOrderRepository() {
  return {
    storeForOwner: (ownerId) => StoreModel.findOne({ ownerId, status: 'approved', isActive: true }).select('_id').lean(),
    list: (storeId, page, limit) => OrderModel.find({ 'shipments.storeId': storeId })
      .select('-returnCases.history -returnCases.photoIds -returnCases.pickupAddress -returnCases.proposedAddress -returnCases.payoutEncrypted')
      .sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    summary: async (storeId) => {
      const [result] = await OrderModel.aggregate([
        { $match: { 'shipments.storeId': storeId } },
        { $project: {
          items: { $filter: { input: '$items', as: 'item', cond: { $eq: ['$$item.storeId', storeId] } } },
          shipment: { $first: { $filter: { input: '$shipments', as: 'shipment', cond: { $eq: ['$$shipment.storeId', storeId] } } } },
          receivedAt: 1, returnRequestedAt: 1, status: 1,
          activeReturns: { $size: { $filter: { input: { $ifNull: ['$returnCases', []] }, as: 'record',
            cond: { $and: [{ $eq: ['$$record.storeId', storeId] },
              { $not: [{ $in: ['$$record.status', closedStatuses] }] }] } } } },
        } },
        { $project: {
          value: { $sum: { $map: { input: '$items', as: 'item',
            in: { $multiply: ['$$item.price', '$$item.quantity'] } } } },
          shipmentStatus: '$shipment.status', receivedAt: 1, returnRequestedAt: 1, status: 1,
          activeReturns: 1,
        } },
        { $group: {
          _id: null, totalOrders: { $sum: 1 }, orderValue: { $sum: '$value' },
          pending: { $sum: { $cond: [{ $eq: ['$shipmentStatus', 'placed'] }, 1, 0] } },
          dispatched: { $sum: { $cond: [{ $and: [
            { $eq: ['$shipmentStatus', 'dispatched'] }, { $eq: ['$receivedAt', null] },
          ] }, 1, 0] } },
          delivered: { $sum: { $cond: [{ $ne: ['$receivedAt', null] }, 1, 0] } },
          returnRequests: { $sum: { $cond: [{ $or: [{ $gt: ['$activeReturns', 0] },
            { $in: ['$status', ['return_requested', 'return_approved']] }] }, 1, 0] } },
        } },
      ]);
      return { totalOrders: result?.totalOrders ?? 0, orderValue: result?.orderValue ?? 0,
        pending: result?.pending ?? 0, dispatched: result?.dispatched ?? 0,
        delivered: result?.delivered ?? 0, returnRequests: result?.returnRequests ?? 0 };
    },
    dispatch: async (storeId, orderId) => {
      const order = await OrderModel.findOneAndUpdate(
        { _id: orderId, shipments: { $elemMatch: { storeId, status: 'placed' } } },
        { $set: { 'shipments.$.status': 'dispatched', 'shipments.$.dispatchedAt': new Date() } },
        { returnDocument: 'after' },
      ).lean();
      if (!order) return null;
      await OrderModel.updateOne({ _id: orderId,
        shipments: { $not: { $elemMatch: { status: { $ne: 'dispatched' } } } } },
      { $set: { status: 'dispatched' } });
      return order;
    },
  };
}
