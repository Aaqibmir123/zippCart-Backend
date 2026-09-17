import mongoose from 'mongoose';

const addressSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User', index: true },
  name: { type: String, required: true },
  phone: { type: String, required: true },
  line1: { type: String, required: true },
  locality: { type: String, required: true },
  landmark: { type: String, default: '' },
  city: { type: String, required: true },
  state: { type: String, required: true },
  pincode: { type: String, required: true },
  label: { type: String, enum: ['Home', 'Work', 'Other'], default: 'Home' },
}, { timestamps: true });

export const AddressModel = mongoose.model('Address', addressSchema);
