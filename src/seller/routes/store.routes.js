import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import {
  createStoreRegistrationLimiter,
  handleStoreBodyError,
  parseStoreBody,
  preventStoreCaching,
  requireStoreJson,
  requireStoreOrigin,
} from '../../middlewares/store.middleware.js';

export function createStoreRouter(controller) {
  const router = Router();

  router.use(requireAuth, preventStoreCaching, requireStoreOrigin);
  router.get('/me', asyncHandler(controller.getMyStore));
  router.post(
    '/',
    createStoreRegistrationLimiter(),
    requireStoreJson,
    parseStoreBody,
    asyncHandler(controller.register),
  );
  router.use(handleStoreBodyError);

  return router;
}
