import mongoose from 'mongoose';
import { returnCaseSchema } from '../../returns/return.schema.js';

const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  checkoutKey: { type: String, required: true },
  cartKey: { type: String, required: true },
  items: { type: [mongoose.Schema.Types.Mixed], required: true },
  cartSnapshot: { type: [mongoose.Schema.Types.Mixed], required: true },
  shippingAddress: { type: mongoose.Schema.Types.Mixed, required: true },
  billingAddress: { type: mongoose.Schema.Types.Mixed, required: true },
  subtotal: { type: Number, required: true },
  delivery: { type: Number, required: true },
  total: { type: Number, required: true },
  paymentMethod: { type: String, enum: ['cod'], default: 'cod' },
  paymentStatus: { type: String, default: 'unpaid' },
  status: { type: String, default: 'placed' },
  shipments: { type: [mongoose.Schema.Types.Mixed], default: [] },
  receivedAt: { type: Date, default: null },
  returnRequestedAt: { type: Date, default: null },
  returnRequestId: { type: String, default: null },
  returnPreference: { type: String, enum: ['refund', 'exchange'], default: null },
  returnReason: { type: String, default: null },
  returnDescription: { type: String, default: null },
  returnReviewNote: { type: String, default: null },
  returnReviewedAt: { type: Date, default: null },
  returnCompletedAt: { type: Date, default: null },
  returnReference: { type: String, default: null },
  returnCases: { type: [returnCaseSchema], default: [] },
  returnsRevision: { type: Number, default: 0 },
  returnPhotoCount: { type: Number, default: 0 },
}, { timestamps: true });
orderSchema.index({ userId: 1, checkoutKey: 1 }, { unique: true });
orderSchema.index({ userId: 1, cartKey: 1 }, { unique: true });
orderSchema.index({ 'shipments.storeId': 1, createdAt: -1 });
orderSchema.index({ status: 1, returnRequestedAt: -1 });
orderSchema.index({ 'returnCases.status': 1, 'returnCases.createdAt': -1 });
orderSchema.index({ returnRequestId: 1 }, { unique: true,
  partialFilterExpression: { returnRequestId: { $type: 'string' } } });
export const OrderModel = mongoose.model('Order', orderSchema);
