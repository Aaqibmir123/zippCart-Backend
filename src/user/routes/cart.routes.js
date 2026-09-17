import { Router } from 'express';

import { requireAuth } from '../../middlewares/auth.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';

export function createCartRouter(controller) {
  const router = Router();
  router.use(requireAuth);
  router.get('/', asyncHandler(controller.getCart));
  router.post('/items', asyncHandler(controller.addItem));
  router.patch('/items/:itemId', asyncHandler(controller.updateItem));
  router.delete('/items/:itemId', asyncHandler(controller.removeItem));
  return router;
}
