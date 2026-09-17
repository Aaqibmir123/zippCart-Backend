import { z } from "zod";
export const storeIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
export const adminStoreListSchema = z
  .object({
    status: z
      .enum(["all", "pending", "approved", "rejected"])
      .default("pending"),
    cursor: storeIdSchema.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(15),
  })
  .strict();
export const adminDocumentSchema = z.enum([
  "storeFrontPhoto",
  "aadhaarCard",
  "panCard",
  "shopLicense",
]);
