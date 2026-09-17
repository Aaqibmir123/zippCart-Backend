import { z } from 'zod';

export function createProductController(service) {
  return {
    list: async (request, response) => {
      const page = z.coerce.number().int().min(1).max(10000).default(1).parse(request.query.page);
      response.json(await service.list(request.user.id, page));
    },
    get: async (request, response) => {
      response.json({ product: await service.get(request.user.id, request.params.id) });
    },
    create: async (request, response) => {
      response.status(201).json({ product: await service.create(request.user.id, request.body) });
    },
    update: async (request, response) => {
      response.json({ product: await service.update(request.user.id, request.params.id, request.body) });
    },
    setStatus: async (request, response) => {
      response.json({ product: await service.setStatus(request.user.id, request.params.id, request.body) });
    },
  };
}
