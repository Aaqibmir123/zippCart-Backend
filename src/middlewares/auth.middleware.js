import { createAppError } from "../utils/app-error.js";
import { verifyAccessToken } from "../utils/tokens.js";
import { createUserRepository } from "../shared/repositories/user.repository.js";

export async function requireAuth(request, _response, next) {
  const accessToken = request.cookies.accessToken;
  if (!accessToken)
    return next(createAppError("Authentication is required.", 401));

  try {
    const payload = verifyAccessToken(accessToken);
    const user = await createUserRepository().findById(payload.sub);
    if (!user || user.phone !== payload.phone)
      return next(
        createAppError("Account not found. Please sign in again.", 401),
      );
    request.user = user;
    return next();
  } catch {
    return next(
      createAppError("Your session has expired. Please log in again.", 401),
    );
  }
}
