import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler.js';

export function createCatalogRouter(controller) {
  const router = Router();
  router.get('/', asyncHandler(controller.list));
  router.post('/lookup', asyncHandler(controller.lookup));
  router.get('/:id', asyncHandler(controller.get));
  return router;
}
