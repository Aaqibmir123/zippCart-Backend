import { Router } from 'express';

import { asyncHandler } from '../../utils/async-handler.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requireStoreOrigin } from '../../middlewares/store.middleware.js';
import { getAccount, switchAccountMode } from '../controllers/account.controller.js';

export function createAuthRouter(controller) {
  const router = Router();
  router.get('/me', requireAuth, requireStoreOrigin, asyncHandler(getAccount));
  router.post('/mode', requireAuth, requireStoreOrigin, asyncHandler(switchAccountMode));
  router.post('/otp/request', asyncHandler(controller.requestOtp));
  router.post('/otp/verify', asyncHandler(controller.verifyOtp));
  router.post('/refresh', asyncHandler(controller.refresh));
  router.post('/logout', asyncHandler(controller.logout));
  return router;
}
