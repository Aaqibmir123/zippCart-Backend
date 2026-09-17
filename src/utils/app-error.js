export function createAppError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

export function isAppError(error) {
  return error instanceof Error && typeof error.statusCode === 'number';
}
