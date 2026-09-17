import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/authorization.middleware.js';
import { preventStoreCaching, requireStoreOrigin } from '../middlewares/store.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';
import { idSchema, requestSchema, customerActionSchema, adminActionSchema, listSchema, photoSchema, readSchema } from './return.validator.js';
import { createReturnRepository } from './return.repository.js';
import { createReturnService } from './return.service.js';
import { createReturnPhotoService } from './return-photo.service.js';

export function createReturnRouter(catalog) {
  const router = Router();
  const repository = createReturnRepository();
  const service = createReturnService(repository, catalog);
  const photos = createReturnPhotoService(repository, service);
  router.use(requireAuth, preventStoreCaching, requireStoreOrigin);
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: 'draft-8',
    legacyHeaders: false, keyGenerator: (req) => req.user.id, message: { message: 'Too many updates. Try again shortly.' } });
  router.get('/admin', requireRole('admin'), asyncHandler(async (req, res) => res.json(await service.list(listSchema.parse(req.query)))));
  router.get('/mine', asyncHandler(async (req, res) => res.json(await service.inbox(req.user, listSchema.parse(req.query)))));
  router.get('/admin/orders/:orderId', requireRole('admin'), asyncHandler(async (req, res) => res.json({
    cases: await service.orderCases(idSchema.parse(req.params.orderId), req.user, true),
  })));
  router.get('/orders/:orderId/:caseId/payout', asyncHandler(async (req, res) => res.json({
    payout: await service.payout(idSchema.parse(req.params.orderId), idSchema.parse(req.params.caseId), req.user),
  })));
  router.post('/orders/:orderId/:caseId/read', asyncHandler(async (req, res) => {
    await service.markRead(idSchema.parse(req.params.orderId), idSchema.parse(req.params.caseId), req.user, readSchema.parse(req.body).version);
    res.json({ success: true });
  }));
  router.post('/admin/orders/:orderId/:caseId/read', requireRole('admin'), asyncHandler(async (req, res) => {
    await service.markRead(idSchema.parse(req.params.orderId), idSchema.parse(req.params.caseId), req.user, readSchema.parse(req.body).version, true);
    res.json({ success: true });
  }));
  router.get('/orders/:orderId', asyncHandler(async (req, res) => res.json({
    cases: await service.orderCases(idSchema.parse(req.params.orderId), req.user),
  })));
  router.post('/orders/:orderId', limiter, asyncHandler(async (req, res) => res.status(201).json({
    cases: await service.create(idSchema.parse(req.params.orderId), req.user, requestSchema.parse(req.body)),
  })));
  router.post('/orders/:orderId/photos', limiter, asyncHandler(async (req, res) => res.status(201).json(
    await photos.upload(idSchema.parse(req.params.orderId), req.user, photoSchema.parse(req.body).data),
  )));
  router.get('/orders/:orderId/photos/:photoId', asyncHandler(async (req, res) => res.json(
    await photos.read(idSchema.parse(req.params.orderId), idSchema.parse(req.params.photoId), req.user),
  )));
  router.post('/orders/:orderId/:caseId/actions', limiter, asyncHandler(async (req, res) => res.json({
    case: await service.action(idSchema.parse(req.params.orderId), idSchema.parse(req.params.caseId),
      req.user, customerActionSchema.parse(req.body)),
  })));
  router.post('/admin/orders/:orderId/:caseId/actions', requireRole('admin'), limiter,
    asyncHandler(async (req, res) => res.json({ case: await service.action(idSchema.parse(req.params.orderId),
      idSchema.parse(req.params.caseId), req.user, adminActionSchema.parse(req.body), true) })));
  return router;
}
