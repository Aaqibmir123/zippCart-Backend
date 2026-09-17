import { StoreModel } from "../../shared/models/store.model.js";

export function createAdminStoreRepository() {
  return {
    list: ({ status, cursor, limit }) =>
      StoreModel.find({
        ...(status === "all" ? {} : { status }),
        ...(cursor ? { _id: { $lt: cursor } } : {}),
      })
        .select(
          "storeName storeCategory locality pincode payoutMethod status isActive createdAt",
        )
        .sort({ _id: -1 })
        .limit(limit + 1)
        .lean(),
    counts: () =>
      StoreModel.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    detail: (id) => StoreModel.findById(id).select("+privateData").lean(),
  };
}
