import { json } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createAppError } from '../utils/app-error.js';

export function preventStoreCaching(_request, response, next) {
  response.set('Cache-Control', 'no-store');
  next();
}

export function requireStoreOrigin(request, _response, next) {
  const origin = request.get('origin');
  if (origin && origin !== process.env.CLIENT_ORIGIN) {
    return next(createAppError('Origin is not allowed.', 403));
  }
  next();
}

export function createStoreRegistrationLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (request) => request.user.id,
    message: { message: 'Too many registration attempts. Please try again in 15 minutes.' },
  });
}

export function requireStoreJson(request, _response, next) {
  if (!request.is('application/json')) {
    return next(createAppError('Use application/json.', 415));
  }
  next();
}

export const parseStoreBody = json({ limit: '6mb' });

// Keep malformed upload bodies out of generic error logging.
export function handleStoreBodyError(error, _request, response, next) {
  if (error.type === 'entity.parse.failed') {
    return response.status(400).json({ message: 'Invalid JSON request.' });
  }
  if (error.type === 'entity.too.large') {
    return response.status(413).json({ message: 'Registration photos are too large.' });
  }
  next(error);
}
