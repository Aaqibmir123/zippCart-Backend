import { returnIdSchema, returnListSchema, returnReviewSchema } from '../validators/admin-return.validator.js';

export function createAdminReturnController(service) {
  return {
    list: async (req, res) => res.json(await service.list(returnListSchema.parse(req.query))),
    detail: async (req, res) => res.json({ order: await service.detail(returnIdSchema.parse(req.params.id)) }),
    review: async (req, res) => res.json({ order: await service.review(
      returnIdSchema.parse(req.params.id), returnReviewSchema.parse(req.body),
    ) }),
  };
}
