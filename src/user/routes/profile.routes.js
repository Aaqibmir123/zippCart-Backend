import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { updateProfileSchema } from '../validators/profile.validator.js';
export function createProfileRouter(service) {
  const router = Router();
  router.use(requireAuth);
  router.get('/', asyncHandler(async (req, res) => res.json({ user: await service.get(req.user.id) })));
  router.patch('/', asyncHandler(async (req, res) => res.json({ user: await service.update(req.user.id, updateProfileSchema.parse(req.body)) })));
  return router;
}
