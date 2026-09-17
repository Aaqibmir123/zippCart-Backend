import { createHash } from 'node:crypto';
import { prepareProductPhoto } from '../seller/services/product-photo.service.js';
import { createAppError } from '../utils/app-error.js';
import { closedStatuses } from './return.constants.js';

export function createReturnPhotoService(repository, service) {
  return {
    upload: async (orderId, user, data) => {
      const order = await service.requireOrder(orderId, user);
      const active = (order.returnCases ?? []).some((record) => !closedStatuses.includes(record.status));
      const eligible = order.status === 'delivered' && !order.returnRequestedAt && order.receivedAt &&
        Date.now() - new Date(order.receivedAt).getTime() <= 86400000;
      if (!eligible && !active) throw createAppError('Photos can only be added to an eligible order or open return.', 409);
      const clean = await prepareProductPhoto(data);
      const photo = await repository.addPhoto({ orderId, uploadedBy: user.id,
        actor: String(order.userId) === user.id ? 'customer' : 'admin',
        data: clean, digest: createHash('sha256').update(clean).digest('hex') });
      return { id: String(photo._id) };
    },
    read: async (orderId, id, user) => {
      const order = await service.requireOrder(orderId, user);
      const photo = await repository.photo(orderId, id);
      const attached = (order.returnCases ?? []).some((record) => record.photoIds.includes(id) ||
        record.history.some((event) => event.photoIds.includes(id)));
      if (!photo || (!user.roles?.includes('admin') && String(photo.uploadedBy) !== user.id && !attached))
        throw createAppError('Photo not found.', 404);
      return { data: photo.data };
    },
  };
}
