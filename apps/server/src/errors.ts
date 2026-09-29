import { ErrorCodes, type ErrorCode } from "@ixm/shared";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const errors = {
  validation: (msg = "Invalid request") => new AppError(ErrorCodes.VALIDATION_ERROR, msg, 400),
  unauthorized: (msg = "Authentication required") => new AppError(ErrorCodes.UNAUTHORIZED, msg, 401),
  forbidden: (msg = "Not allowed") => new AppError(ErrorCodes.FORBIDDEN, msg, 403),
  notFound: (msg = "Not found") => new AppError(ErrorCodes.NOT_FOUND, msg, 404),
  conflict: (msg = "Conflict") => new AppError(ErrorCodes.CONFLICT, msg, 409),
  rateLimited: () => new AppError(ErrorCodes.RATE_LIMITED, "Too many attempts, try again in a minute", 429),
  credentials: () => new AppError(ErrorCodes.INVALID_CREDENTIALS, "Invalid code", 401),
  disabled: () => new AppError(ErrorCodes.ACCOUNT_DISABLED, "Account disabled", 403),
  csrf: () => new AppError(ErrorCodes.CSRF_REJECTED, "CSRF validation failed", 403),
  payload: () => new AppError(ErrorCodes.PAYLOAD_TOO_LARGE, "Payload too large", 413),
  media: (msg = "Unsupported file type") => new AppError(ErrorCodes.UNSUPPORTED_MEDIA, msg, 415),
  unavailable: (msg = "Server in avvio, riprova tra un attimo.") =>
    new AppError(ErrorCodes.INTERNAL, msg, 503),
};
