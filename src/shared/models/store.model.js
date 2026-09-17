import mongoose from "mongoose";

const encryptedSchema = new mongoose.Schema(
  {
    version: { type: Number, required: true, enum: [1] },
    iv: { type: Buffer, required: true },
    tag: { type: Buffer, required: true },
    ciphertext: { type: Buffer, required: true },
  },
  { _id: false },
);
const storeSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    storeName: { type: String, required: true, maxlength: 100 },
    storeCategory: { type: String, required: true },
    locality: { type: String, required: true, maxlength: 100 },
    pincode: { type: String, required: true, match: /^[1-9]\d{5}$/ },
    payoutMethod: { type: String, enum: ["upi", "bank"], required: true },
    privateData: { type: encryptedSchema, required: true, select: false },
    status: {
      type: String,
      enum: ["none", "pending", "approved", "rejected"],
      default: "pending",
    },
    isActive: { type: Boolean, default: false },
    termsVersion: { type: String, required: true },
    termsAcceptedAt: { type: Date, required: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
  },
  { timestamps: true, strict: "throw" },
);

// One store per account. This index also serves GET /me and concurrent retry checks.
storeSchema.index(
  { ownerId: 1 },
  { unique: true, name: "one_store_per_owner" },
);
storeSchema.index({ status: 1, _id: -1 }, { name: 'admin_store_status_cursor' });
export const StoreModel = mongoose.model("Store", storeSchema);
