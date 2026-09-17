import { createAppError } from "../../utils/app-error.js";
import { encryptStoreData, getStoreKey } from "../../utils/store-crypto.js";
import { prepareDocuments } from "./store-documents.service.js";
import { registrationSchema } from "../validators/store.validator.js";

export function publicStore(store) {
  if (!store) return null;
  const {
    storeName,
    storeCategory,
    locality,
    pincode,
    payoutMethod,
    status,
    isActive,
    createdAt,
  } = store;
  return {
    id: String(store._id),
    storeStatus: status,
    storeName,
    storeCategory,
    locality,
    pincode,
    payoutMethod,
    status,
    isActive,
    createdAt,
  };
}

export function createStoreService(
  repository,
  {
    prepare = prepareDocuments,
    encrypt = encryptStoreData,
    key = getStoreKey,
  } = {},
) {
  async function requireAccount(ownerId) {
    const account = await repository.accountExists(ownerId);
    if (!account)
      throw createAppError("Account not found. Please sign in again.", 401);
    return account;
  }
  async function registrationResult(ownerId, store, created) {
    await repository.syncOwner(ownerId, store);
    return { store: publicStore(store), created };
  }
  return {
    get: async (ownerId) => {
      await requireAccount(ownerId);
      return publicStore(await repository.findByOwner(ownerId));
    },
    register: async (ownerId, input) => {
      const data = registrationSchema.parse(input);
      await requireAccount(ownerId);
      // Contact details never determine ownership or change the login identity.
      const existing = await repository.findByOwner(ownerId);
      // Create-once semantics: retries return the existing store and cannot change it.
      if (existing) return registrationResult(ownerId, existing, false);
      const encryptionKey = key();
      const documents = await prepare(data);
      const privateData = encrypt(
        {
          ownerFullName: data.ownerFullName,
          mobileNumber: data.mobileNumber,
          fullAddress: data.fullAddress,
          payout: data.payout,
          documents,
        },
        ownerId,
        encryptionKey,
      );
      try {
        const store = await repository.create({
          ownerId,
          storeName: data.storeName,
          storeCategory: data.storeCategory,
          locality: data.locality,
          pincode: data.pincode,
          payoutMethod: data.payout.method,
          privateData,
          status: "pending",
          isActive: false,
          termsVersion: data.termsVersion,
          termsAcceptedAt: new Date(),
        });
        return await registrationResult(ownerId, store, true);
      } catch (error) {
        if (error.code === 11000) {
          const stored = await repository.findByOwner(ownerId);
          if (stored) return registrationResult(ownerId, stored, false);
        }
        // Do not pass persistence errors containing private records to generic logging.
        throw createAppError(
          "Could not save your registration. Please try again.",
          503,
        );
      }
    },
  };
}
