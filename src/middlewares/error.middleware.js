import { ZodError } from 'zod';

import { isAppError } from '../utils/app-error.js';

export function errorMiddleware(error, _request, response, _next) {
  if (error.type === 'entity.too.large') {
    response.status(413).json({ message: 'Photo is too large. Please choose a smaller image.' });
    return;
  }
  if (error instanceof ZodError) {
    response.status(400).json({ message: 'Invalid request.', issues: error.flatten().fieldErrors });
    return;
  }

  if (isAppError(error)) {
    response.status(error.statusCode).json({ message: error.message });
    return;
  }

  console.error(error);
  response.status(500).json({ message: 'An unexpected server error occurred.' });
}
