import { StoreModel } from "../models/store.model.js";
import { env } from "../../config/env.js";
import { UserModel } from '../models/user.model.js';

export function resolveAccountAccess(user, store) {
  const record = user.toObject ? user.toObject() : user;
  const roles = ["customer"];
  if (store) roles.push("store_owner");
  if (env.ADMIN_PHONE && record.phone === env.ADMIN_PHONE) roles.push("admin");
  const storeStatus = store?.status ?? "none";
  const isActive = storeStatus === "approved" && store?.isActive === true;
  return {
    ...record,
    id: String(record._id),
    roles,
    storeStatus,
    isActive,
    mode: record.mode === "seller" && isActive ? "seller" : "customer",
  };
}

export async function loadAccountAccess(user) {
  if (!user) return null;
  const configuredAdmin = !!env.ADMIN_PHONE && user.phone === env.ADMIN_PHONE;
  if (configuredAdmin && !user.roles?.includes('admin')) {
    await UserModel.updateOne({ _id: user._id }, { $addToSet: { roles: { $each: ['customer', 'admin'] } } });
  } else if (!configuredAdmin && user.roles?.includes('admin')) {
    await UserModel.updateOne({ _id: user._id }, { $pull: { roles: 'admin' } });
  }
  // Store is the authority: stale tokens and denormalized user flags cannot grant access.
  const store = await StoreModel.findOne({ ownerId: user._id })
    .select("status isActive")
    .lean();
  return resolveAccountAccess(user, store);
}
