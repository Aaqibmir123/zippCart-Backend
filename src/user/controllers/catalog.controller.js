import { z } from 'zod';
import { SHOP_CATEGORIES } from '../services/catalog.service.js';

const listSchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  category: z.enum(SHOP_CATEGORIES).optional(),
  search: z.string().trim().min(1).max(80).optional(),
});
const idSchema = z.string().regex(/^[a-fA-F0-9]{24}$/);
const lookupSchema = z.object({ ids: z.array(idSchema).max(100) }).strict();

export function createCatalogController(service) {
  return {
    lookup: async (request, response) => {
      response.json({ products: await service.lookup(lookupSchema.parse(request.body).ids) });
    },
    list: async (request, response) => {
      const options = listSchema.parse(request.query);
      response.json(await service.list({ ...options, limit: 24 }));
    },
    get: async (request, response) => {
      response.json({ product: await service.get(idSchema.parse(request.params.id)) });
    },
  };
}
