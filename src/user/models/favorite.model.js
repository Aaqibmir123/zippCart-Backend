import mongoose from 'mongoose';

const favoriteSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
    productId: { type: String, required: true, trim: true },
  },
  { timestamps: true },
);

favoriteSchema.index({ userId: 1, productId: 1 }, { unique: true });
favoriteSchema.index({ userId: 1, createdAt: -1 });

export const FavoriteModel = mongoose.model('Favorite', favoriteSchema);
