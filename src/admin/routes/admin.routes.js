import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/authorization.middleware.js";
import {
  preventStoreCaching,
  requireStoreOrigin,
} from "../../middlewares/store.middleware.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { reviewStore } from "../controllers/store-review.controller.js";

export function createAdminRouter(controller, returnController) {
  const router = Router();
  router.use(
    requireAuth,
    requireRole("admin"),
    preventStoreCaching,
    requireStoreOrigin,
  );
  router.get("/stores", asyncHandler(controller.list));
  router.get("/stores/counts", asyncHandler(controller.counts));
  router.get("/stores/:id", asyncHandler(controller.detail));
  router.get(
    "/stores/:id/documents/:document",
    asyncHandler(controller.document),
  );
  router.patch("/stores/:id/status", asyncHandler(reviewStore));
  router.get('/returns', asyncHandler(returnController.list));
  router.get('/returns/:id', asyncHandler(returnController.detail));
  router.patch('/returns/:id/status', asyncHandler(returnController.review));
  return router;
}
