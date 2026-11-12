/**
 * Application error carrying an HTTP status and a stable machine-readable
 * code. Services throw these; the error middleware translates them.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError(400, 'BAD_REQUEST', message, details);
  }

  static notFound(message = 'Resource not found', details?: unknown): AppError {
    return new AppError(404, 'NOT_FOUND', message, details);
  }

  static forbidden(message: string, details?: unknown): AppError {
    return new AppError(403, 'FORBIDDEN', message, details);
  }

  static conflict(message: string, details?: unknown, code = 'CONFLICT'): AppError {
    return new AppError(409, code, message, details);
  }

  /** Request is well-formed but violates a business rule (e.g. budget exceeded). */
  static unprocessable(code: string, message: string, details?: unknown): AppError {
    return new AppError(422, code, message, details);
  }
}
