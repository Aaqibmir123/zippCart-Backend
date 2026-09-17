import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
export function createOrderRouter(controller) {
  const router = Router();
  router.use(requireAuth);
  router.get('/', asyncHandler(controller.list));
  router.get('/:id', asyncHandler(controller.get));
  router.post('/quote', asyncHandler(controller.quote));
  router.post('/:id/reorder', asyncHandler(controller.reorder));
  router.post('/:id/return', asyncHandler(controller.requestReturn));
  router.post('/:id/received', asyncHandler(controller.confirmReceived));
  router.post('/', asyncHandler(controller.place));
  return router;
}
