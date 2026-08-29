/**
 * Errors carry the HTTP status and a stable machine-readable code. Messages are
 * user-facing: say what happened and what to do, no apologies, no vagueness.
 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (code: string, message: string, details?: unknown) =>
  new AppError(400, code, message, details);

export const unauthorized = (code = 'unauthorized', message = 'Sign in to continue.') =>
  new AppError(401, code, message);

export const forbidden = (code = 'forbidden', message = 'You cannot do that.') =>
  new AppError(403, code, message);

export const notFound = (code = 'not_found', message = 'Not found.') =>
  new AppError(404, code, message);

export const conflict = (code: string, message: string) =>
  new AppError(409, code, message);

export const tooMany = (message = 'Too many attempts. Wait a moment and try again.') =>
  new AppError(429, 'rate_limited', message);
