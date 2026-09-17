import mongoose from 'mongoose';
import { OrderModel } from '../user/models/order.model.js';
import { ReturnPhotoModel } from './return.schema.js';
import { closedStatuses, returnStatuses } from './return.constants.js';
import { createAppError } from '../utils/app-error.js';

const selection = 'userId items shippingAddress receivedAt status returnRequestedAt returnCases returnsRevision';
export function createReturnRepository() {
  return {
    order: (id, userId) => OrderModel.findOne({ _id: id, ...(userId ? { userId } : {}) }).select(selection).lean(),
    save: (order, cases) => OrderModel.findOneAndUpdate({ _id: order._id,
      // Missing revision supports pre-existing orders without a migration.
      ...(order.returnsRevision ? { returnsRevision: order.returnsRevision }
        : { $or: [{ returnsRevision: 0 }, { returnsRevision: { $exists: false } }] }),
      status: order.status, returnRequestedAt: null,
    }, { $set: { returnCases: cases }, $inc: { returnsRevision: 1 } },
    { returnDocument: 'after', runValidators: true }).select(selection).lean(),
    list: async ({ status, page }, userId) => {
      const condition = status === 'all' ? { $exists: true } : status === 'open'
        ? { $in: returnStatuses.filter((value) => !closedStatuses.includes(value)) } : status === 'closed' ? { $in: closedStatuses } : status;
      const result = await OrderModel.aggregate([
        { $match: { 'returnCases.status': condition, 'returnCases.0': { $exists: true },
          ...(userId ? { userId: new mongoose.Types.ObjectId(userId) } : {}) } },
        { $unwind: '$returnCases' }, { $match: { 'returnCases.status': condition } },
        { $sort: { 'returnCases.updatedAt': -1, 'returnCases.id': -1 } },
        { $facet: { rows: [{ $skip: (page - 1) * 20 }, { $limit: 20 },
          { $project: { _id: 0, orderId: { $toString: '$_id' }, id: '$returnCases.id', requestId: '$returnCases.requestId',
            status: '$returnCases.status', preference: '$returnCases.preference', createdAt: '$returnCases.createdAt',
            customer: '$returnCases.pickupAddress.name', amount: '$returnCases.amount',
            itemName: { $arrayElemAt: ['$returnCases.items.name', 0] }, updatedAt: '$returnCases.updatedAt',
            lastMessage: { $arrayElemAt: ['$returnCases.history.note', -1] },
            unread: { $anyElementTrue: [{ $map: { input: { $range: [0, { $size: '$returnCases.history' }] }, as: 'index',
              in: { $and: [{ $gt: ['$$index', { $ifNull: [userId ? '$returnCases.customerReadVersion' : '$returnCases.adminReadVersion', -1] }] },
                { $eq: [{ $arrayElemAt: ['$returnCases.history.actor', '$$index'] }, userId ? 'admin' : 'customer'] }] } } }] },
          } }], total: [{ $count: 'value' }] } },
      ]).option({ maxTimeMS: 5000 });
      const total = result[0]?.total[0]?.value ?? 0;
      return { cases: result[0]?.rows ?? [], nextPage: page * 20 < total ? page + 1 : null, total };
    },
    addPhoto: async (record) => {
      const identity = { orderId: record.orderId, uploadedBy: record.uploadedBy, digest: record.digest };
      const existing = await ReturnPhotoModel.findOne(identity).select('_id').lean();
      if (existing) return existing;
      const slot = await OrderModel.updateOne({ _id: record.orderId,
        $or: [{ returnPhotoCount: { $lt: 100 } }, { returnPhotoCount: { $exists: false } }] },
      { $inc: { returnPhotoCount: 1 } });
      if (!slot.modifiedCount) throw createAppError('Photo limit reached for this order. Contact support.', 409);
      try { return await ReturnPhotoModel.create(record); }
      catch (error) {
        await OrderModel.updateOne({ _id: record.orderId }, { $inc: { returnPhotoCount: -1 } });
        if (error.code === 11000) return ReturnPhotoModel.findOne(identity).select('_id').lean();
        throw error;
      }
    },
    photo: (orderId, id) => ReturnPhotoModel.findOne({ _id: id, orderId }).select('+data').lean(),
    photos: (orderId, uploadedBy, ids) => ReturnPhotoModel.find({ orderId, uploadedBy,
      _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } }).select('_id').lean(),
  };
}
