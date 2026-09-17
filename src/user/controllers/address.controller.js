import { addressParamsSchema, addressSchema } from '../validators/address.validator.js';

export function createAddressController(service) {
  return {
    list: async (req, res) => res.json({ addresses: await service.list(req.user.id) }),
    create: async (req, res) => res.status(201).json({ address: await service.create(req.user.id, addressSchema.parse(req.body)) }),
    update: async (req, res) => res.json({ address: await service.update(req.user.id, addressParamsSchema.parse(req.params).id, addressSchema.parse(req.body)) }),
    remove: async (req, res) => {
      await service.remove(req.user.id, addressParamsSchema.parse(req.params).id);
      res.status(204).end();
    },
  };
}
