import { Router, json } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { requireApprovedStore } from "../../middlewares/authorization.middleware.js";
import {
  preventStoreCaching,
  requireStoreOrigin,
} from "../../middlewares/store.middleware.js";
import { asyncHandler } from "../../utils/async-handler.js";

export function createSellerRouter(controller, productController, orderController) {
  const router = Router();
  router.use(
    requireAuth,
    preventStoreCaching,
    requireStoreOrigin,
    requireApprovedStore,
  );
  router.get("/session", asyncHandler(controller.getMyStore));
  router.get('/orders', asyncHandler(orderController.list));
  router.post('/orders/:id/dispatch', asyncHandler(orderController.dispatch));
  router.get('/products', asyncHandler(productController.list));
  router.get('/products/:id', asyncHandler(productController.get));
  router.use(json({ limit: '6mb' }));
  router.post('/products', asyncHandler(productController.create));
  router.put('/products/:id', asyncHandler(productController.update));
  router.patch('/products/:id/status', asyncHandler(productController.setStatus));
  return router;
}
