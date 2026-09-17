import { OtpModel } from '../models/otp.model.js';

export function createOtpRepository() {
  async function save(phone, codeHash, expiresAt, sessionId) {
    await OtpModel.findOneAndUpdate(
      { phone },
      { codeHash, sessionId, expiresAt },
      { returnDocument: 'after', upsert: true },
    );
  }

  async function find(phone) {
    return OtpModel.findOne({ phone });
  }

  async function remove(phone) {
    await OtpModel.deleteOne({ phone });
  }

  return { save, find, remove };
}
