import mongoose from 'mongoose';

const colorSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 40 },
  images: { type: [String], default: [] },
}, { _id: false });

const productSchema = new mongoose.Schema({
  storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, immutable: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  category: { type: String, required: true },
  description: { type: String, required: true, trim: true, maxlength: 1000 },
  brand: { type: String, default: '', trim: true, maxlength: 80 },
  sku: { type: String, required: true, trim: true, uppercase: true, maxlength: 60 },
  variants: { type: String, default: '', trim: true, maxlength: 200 },
  sizes: { type: [String], default: [] },
  images: { type: [String], default: [] },
  colors: { type: [colorSchema], default: [] },
  price: { type: Number, required: true, min: 0.01, max: 1000000 },
  mrp: { type: Number, required: true, min: 0.01, max: 1000000 },
  stock: { type: Number, required: true, min: 0, max: 1000000 },
  photo: { type: String, default: null, select: false },
  coverImage: { type: String, default: null },
  active: { type: Boolean, default: true },
}, { timestamps: true, strict: 'throw' });

productSchema.index({ storeId: 1, sku: 1 }, { unique: true, name: 'one_sku_per_store' });
productSchema.index({ storeId: 1, createdAt: -1 }, { name: 'seller_products' });

export const ProductModel = mongoose.model('SellerProduct', productSchema);
