import { UserModel } from "../models/user.model.js";
import { loadAccountAccess } from "../services/account-access.service.js";

export function createUserRepository() {
  async function findOrCreateByPhone(phone) {
    let user;
    try {
      user = await UserModel.findOneAndUpdate(
        { phone },
        { $setOnInsert: { phone } },
        { returnDocument: "after", upsert: true },
      );
    } catch (error) {
      if (error.code !== 11000) throw error;
      user = await UserModel.findOne({ phone });
    }
    return loadAccountAccess(user);
  }

  async function findByPhone(phone) {
    return loadAccountAccess(await UserModel.findOne({ phone }).lean());
  }

  const findById = async (id) =>
    loadAccountAccess(await UserModel.findById(id).lean());
  const updateProfile = async (id, data) =>
    loadAccountAccess(
      await UserModel.findByIdAndUpdate(
        id,
        { $set: data },
        { returnDocument: "after", runValidators: true },
      ),
    );
  return { findByPhone, findOrCreateByPhone, findById, updateProfile };
}
