import { Router } from 'express';

import { requireAuth } from '../../middlewares/auth.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';

export function createFavoriteRouter(controller) {
  const router = Router();
  router.use(requireAuth);
  router.get('/', asyncHandler(controller.getFavorites));
  router.put('/:productId', asyncHandler(controller.addFavorite));
  router.delete('/:productId', asyncHandler(controller.removeFavorite));
  return router;
}
