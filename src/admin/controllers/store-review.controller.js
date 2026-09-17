import { z } from "zod";
import { reviewStoreRegistration } from "../services/store-review.service.js";

const reviewSchema = z
  .object({
    storeStatus: z.enum(["approved", "rejected"]),
    expectedStatus: z.enum(["pending", "approved", "rejected"]).optional(),
  })
  .strict();
const idSchema = z.string().regex(/^[a-f\d]{24}$/i);

export async function reviewStore(request, response) {
  const id = idSchema.parse(request.params.id);
  const { storeStatus, expectedStatus } = reviewSchema.parse(request.body);
  const store = await reviewStoreRegistration(
    id,
    storeStatus,
    request.user.id,
    expectedStatus,
  );
  response.json({ store });
}
