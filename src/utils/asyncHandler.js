/** Wraps an async route handler so a rejected promise reaches Express's error middleware. */
export const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
