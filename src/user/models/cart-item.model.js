import mongoose from 'mongoose';

const cartItemSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
    productId: { type: String, required: true, trim: true },
    color: { type: String, default: '', trim: true },
    size: { type: String, default: '', trim: true },
    quantity: { type: Number, required: true, min: 1, max: 99 },
  },
  { timestamps: true },
);

cartItemSchema.index({ userId: 1, productId: 1, color: 1, size: 1 }, { unique: true, name: 'cart_variant' });
cartItemSchema.index({ userId: 1, updatedAt: -1 });

export const CartItemModel = mongoose.model('CartItem', cartItemSchema);
