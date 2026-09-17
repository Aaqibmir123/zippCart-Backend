import { createStoreRepository } from "../../seller/repositories/store.repository.js";
import { publicStore } from "../../seller/services/store.service.js";
import { createAppError } from "../../utils/app-error.js";

export async function reviewStoreRegistration(
  id,
  status,
  reviewerId,
  expectedStatus,
) {
  const repository = createStoreRepository();
  const store = await repository.review(id, status, reviewerId, expectedStatus);
  if (!store)
    throw createAppError(
      expectedStatus
        ? "This request has changed. Refresh before reviewing."
        : "Store not found.",
      expectedStatus ? 409 : 404,
    );
  await repository.syncOwner(store.ownerId, store);
  return publicStore(store);
}
