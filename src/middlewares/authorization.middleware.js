import { createAppError } from "../utils/app-error.js";

export function requireRole(role) {
  return (request, _response, next) => {
    if (!request.user?.roles?.includes(role))
      return next(createAppError("Access denied.", 403));
    next();
  };
}

export function requireApprovedStore(request, _response, next) {
  const user = request.user;
  if (
    !user?.roles?.includes("store_owner") ||
    user.storeStatus !== "approved" ||
    !user.isActive
  ) {
    return next(
      createAppError(
        "An approved, active store is required for Seller Mode.",
        403,
      ),
    );
  }
  next();
}
