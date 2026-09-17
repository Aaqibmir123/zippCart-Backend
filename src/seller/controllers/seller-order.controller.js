import { z } from 'zod';

const idSchema = z.string().regex(/^[a-f\d]{24}$/i);
const pageSchema = z.coerce.number().int().min(1).max(10000).default(1);
export function createSellerOrderController(service) {
  return {
    list: async (req, res) => res.json(await service.list(req.user.id, pageSchema.parse(req.query.page))),
    dispatch: async (req, res) => res.json({ order: await service.dispatch(req.user.id, idSchema.parse(req.params.id)) }),
  };
}
