import { UserModel } from "../../shared/models/user.model.js";
import { StoreModel } from "../../shared/models/store.model.js";

const summaryFields =
  "_id storeName storeCategory locality pincode payoutMethod status isActive createdAt";
export function createStoreRepository() {
  return {
    review: (id, status, reviewerId, expectedStatus) =>
      StoreModel.findOneAndUpdate(
        { _id: id, ...(expectedStatus ? { status: expectedStatus } : {}) },
        {
          $set: {
            status,
            isActive: status === "approved",
            reviewedBy: reviewerId,
            reviewedAt: new Date(),
          },
        },
        { returnDocument: "after", runValidators: true },
      )
        .select(`ownerId ${summaryFields}`)
        .lean(),
    accountExists: (ownerId) =>
      UserModel.findById(ownerId).select("phone").lean(),
    syncOwner: (ownerId, store) =>
      UserModel.updateOne(
        { _id: ownerId },
        {
          $addToSet: { roles: { $each: ["customer", "store_owner"] } },
          $set: {
            storeStatus: store.status,
            isActive: store.status === "approved" && store.isActive === true,
            ...(store.status !== "approved" || !store.isActive
              ? { mode: "customer" }
              : {}),
          },
        },
      ),
    findByOwner: (ownerId) =>
      StoreModel.findOne({ ownerId }).select(summaryFields).lean().exec(),
    create: async (record) => (await StoreModel.create(record)).toObject(),
  };
}
