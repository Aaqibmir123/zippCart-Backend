import { OrderModel } from '../../user/models/order.model.js';
import { StoreModel } from '../../shared/models/store.model.js';

const filterFor = (status) => status === 'open' ? { status: { $in: ['return_requested', 'return_approved'] } }
  : status === 'closed' ? { status: { $in: ['return_rejected', 'return_completed'] } }
    : { returnRequestedAt: { $ne: null } };

export function createAdminReturnRepository() {
  return {
    list: (status, page, limit) => OrderModel.find(filterFor(status))
      .sort({ returnRequestedAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    count: (status) => OrderModel.countDocuments(filterFor(status)),
    find: (id) => OrderModel.findOne({ _id: id, returnRequestedAt: { $ne: null } }).lean(),
    storeNames: (ids) => ids.length ? StoreModel.find({ _id: { $in: ids } }).select('_id storeName').lean() : [],
    transition: (id, expected, update) => OrderModel.findOneAndUpdate(
      { _id: id, status: expected, returnRequestedAt: { $ne: null } },
      { $set: update }, { returnDocument: 'after' },
    ).lean(),
  };
}
