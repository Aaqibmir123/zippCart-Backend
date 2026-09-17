import { orderParamsSchema, placeOrderSchema, quoteSchema, reorderSchema } from '../validators/order.validator.js';
import { createAppError } from '../../utils/app-error.js';
export function createOrderController(service, reorder) {
  return {
    quote: async (req, res) => res.json({ quote: await service.quote(req.user.id, quoteSchema.parse(req.body)) }),
    place: async (req, res) => res.status(201).json({ order: await service.place(req.user.id, placeOrderSchema.parse(req.body)) }),
    list: async (req, res) => res.json({ orders: await service.list(req.user.id) }),
    get: async (req, res) => res.json({ order: await service.get(req.user.id, orderParamsSchema.parse(req.params).id) }),
    confirmReceived: async (req, res) => res.json({ order: await service.confirmReceived(req.user.id, orderParamsSchema.parse(req.params).id) }),
    reorder: async (req, res) => res.json(await reorder(req.user.id, orderParamsSchema.parse(req.params).id, reorderSchema.parse(req.body).items)),
    requestReturn: async () => { throw createAppError('Update the app to submit an item-wise return with proof and pickup address.', 410); },
  };
}
