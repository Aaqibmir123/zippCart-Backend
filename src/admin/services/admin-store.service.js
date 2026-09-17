import { createAdminStoreRepository } from "../repositories/admin-store.repository.js";
import { decryptStoreData } from "../../utils/store-crypto.js";
import { createAppError } from "../../utils/app-error.js";
import { publicStore } from "../../seller/services/store.service.js";

export function createAdminStoreService(
  repository = createAdminStoreRepository(),
) {
  async function readPrivate(id) {
    const store = await repository.detail(id);
    if (!store) throw createAppError("Registration not found.", 404);
    return {
      store,
      data: decryptStoreData(store.privateData, String(store.ownerId)),
    };
  }
  return {
    list: async (query) => {
      const records = await repository.list(query);
      const more = records.length > query.limit;
      const stores = records.slice(0, query.limit).map(publicStore);
      return { stores, nextCursor: more ? stores.at(-1).id : null };
    },
    counts: async () => {
      const counts = { pending: 0, approved: 0, rejected: 0, all: 0 };
      for (const row of await repository.counts()) {
        if (["pending", "approved", "rejected"].includes(row._id))
          counts[row._id] = row.count;
        counts.all += row.count;
      }
      return counts;
    },
    detail: async (id) => {
      const { store, data } = await readPrivate(id);
      return {
        ...publicStore(store),
        ownerFullName: data.ownerFullName,
        mobileNumber: data.mobileNumber,
        fullAddress: data.fullAddress,
        payout: data.payout,
        termsVersion: store.termsVersion,
        termsAcceptedAt: store.termsAcceptedAt,
        reviewedAt: store.reviewedAt ?? null,
      };
    },
    document: async (id, name) => {
      const { data } = await readPrivate(id);
      const document = data.documents[name];
      if (!document) throw createAppError("Document not found.", 404);
      return { dataUrl: `data:${document.mimeType};base64,${document.base64}` };
    },
  };
}
