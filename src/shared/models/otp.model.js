import mongoose from 'mongoose';

const otpSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, unique: true, trim: true },
    codeHash: { type: String, required: true },
    sessionId: { type: String },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true },
);

export const OtpModel = mongoose.model('Otp', otpSchema);
