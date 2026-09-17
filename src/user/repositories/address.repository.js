import { AddressModel } from '../models/address.model.js';

export function createAddressRepository() {
  return {
    list: (userId) => AddressModel.find({ userId }).sort({ createdAt: -1 }).lean(),
    create: (userId, data) => AddressModel.create({ ...data, userId }),
    update: (userId, id, data) => AddressModel.findOneAndUpdate({ _id: id, userId }, { $set: data }, { new: true, runValidators: true }),
    remove: (userId, id) => AddressModel.findOneAndDelete({ _id: id, userId }),
  };
}
