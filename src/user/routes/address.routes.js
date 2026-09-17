import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';

export function createAddressRouter(controller) {
  const router = Router();
  router.use(requireAuth);
  router.get('/', asyncHandler(controller.list));
  router.post('/', asyncHandler(controller.create));
  router.put('/:id', asyncHandler(controller.update));
  router.delete('/:id', asyncHandler(controller.remove));
  return router;
}
