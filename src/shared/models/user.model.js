import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, unique: true, trim: true },
    roles: { type: [String], enum: ['customer', 'store_owner', 'admin'], default: ['customer'] },
    storeStatus: { type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none' },
    isActive: { type: Boolean, default: false },
    mode: { type: String, enum: ['customer', 'seller'], default: 'customer' },
    fullName: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    profileImage: { type: String, default: null },
  },
  { timestamps: true },
);

export const UserModel = mongoose.model('User', userSchema);
