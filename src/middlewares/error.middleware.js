import { ApiError } from '../utils/ApiError.js';

export function notFound(_req, _res, next) {
  next(ApiError.notFound());
}

/** Every error ends up here and leaves as `{ error: "message" }`. Express needs all 4 arguments. */
export function errorHandler(err, req, res, _next) {
  if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });

  // Errors raised by Express's body parsers
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request body is not valid JSON.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'The request is too large.' });

  console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
}
