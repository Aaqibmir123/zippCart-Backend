import {
  adminDocumentSchema,
  adminStoreListSchema,
  storeIdSchema,
} from "../validators/admin-store.validator.js";

export function createAdminStoreController(service) {
  return {
    list: async (req, res) =>
      res.json(await service.list(adminStoreListSchema.parse(req.query))),
    counts: async (_req, res) => res.json({ counts: await service.counts() }),
    detail: async (req, res) =>
      res.json({
        store: await service.detail(storeIdSchema.parse(req.params.id)),
      }),
    document: async (req, res) =>
      res.json(
        await service.document(
          storeIdSchema.parse(req.params.id),
          adminDocumentSchema.parse(req.params.document),
        ),
      ),
  };
}
