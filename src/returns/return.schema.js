import mongoose from 'mongoose';
import { returnStatuses, reasons } from './return.constants.js';

const options = { _id: false, strict: 'throw' };
const address = new mongoose.Schema({
  name: String, phone: String, line1: String, locality: String, landmark: String,
  city: String, state: String, pincode: String, label: String,
}, options);
const item = new mongoose.Schema({
  index: Number, productId: String, name: String, color: String, size: String,
  price: Number, quantity: Number, exchangeColor: String, exchangeSize: String,
}, options);
const event = new mongoose.Schema({
  id: String, action: String, actor: { type: String, enum: ['customer', 'admin'] },
  actorId: String, at: Date, note: String, photoIds: [String], status: String,
  address, schedule: { type: mongoose.Schema.Types.Mixed },
}, options);
export const returnCaseSchema = new mongoose.Schema({
  id: { type: String, required: true }, clientKey: String, requestId: String,
  storeId: String, status: { type: String, enum: returnStatuses, required: true },
  preference: { type: String, enum: ['refund', 'exchange'], required: true },
  reason: { type: String, enum: reasons, required: true }, description: String,
  items: [item], photoIds: [String], pickupAddress: address, proposedAddress: address,
  addressChangeRequested: { type: Boolean, default: false },
  refundMethod: String, amount: Number, reference: String,
  payoutEncrypted: String, payoutSummary: String,
  customerReadVersion: { type: Number, default: -1 }, adminReadVersion: { type: Number, default: -1 },
  pickup: { type: mongoose.Schema.Types.Mixed }, replacement: { type: mongoose.Schema.Types.Mixed },
  resumeStatus: String, proofDueAt: Date, createdAt: Date, updatedAt: Date,
  version: { type: Number, default: 0 }, history: [event],
}, options);

const photoSchema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, required: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, required: true },
  actor: { type: String, enum: ['customer', 'admin'], required: true },
  digest: { type: String, required: true }, data: { type: String, required: true, select: false },
}, { timestamps: true });
photoSchema.index({ orderId: 1, uploadedBy: 1, digest: 1 }, { unique: true });
export const ReturnPhotoModel = mongoose.model('ReturnPhoto', photoSchema);
