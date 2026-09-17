import { createAppError } from '../../utils/app-error.js';

function serialize(address) {
  const { name, phone, line1, locality, landmark, city, state, pincode, label } = address;
  return { id: String(address._id), name, phone, line1, locality, landmark, city, state, pincode, label };
}
export function createAddressService(repository) {
  return {
    list: async (userId) => (await repository.list(userId)).map(serialize),
    create: async (userId, data) => serialize(await repository.create(userId, data)),
    update: async (userId, id, data) => {
      const address = await repository.update(userId, id, data);
      if (!address) throw createAppError('Address not found.', 404);
      return serialize(address);
    },
    remove: async (userId, id) => {
      if (!await repository.remove(userId, id)) throw createAppError('Address not found.', 404);
    },
  };
}
