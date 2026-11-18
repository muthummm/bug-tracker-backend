/** An error with an HTTP status. Throw it anywhere; the error middleware turns it into `{ error }`. */
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }

  static badRequest(message) { return new ApiError(400, message); }
  static unauthorized(message) { return new ApiError(401, message); }
  static forbidden(message) { return new ApiError(403, message); }
  static notFound(message = 'Not found.') { return new ApiError(404, message); }
  static conflict(message) { return new ApiError(409, message); }
  static badGateway(message) { return new ApiError(502, message); }
  static unavailable(message) { return new ApiError(503, message); }
}
