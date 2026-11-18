import { MESSAGES, hasFullAccess } from '../constants/index.js';
import { findUserByToken } from '../modules/auth/auth.service.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/** Requires `Authorization: Bearer <token>`; sets `req.user` and `req.token`. */
export const authenticate = asyncHandler(async (req, _res, next) => {
  const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const user = token ? await findUserByToken(token) : null;
  if (!user) throw ApiError.unauthorized(MESSAGES.SIGN_IN);
  req.user = user;
  req.token = token;
  next();
});

/** Only testers and managers report bugs, import sheets, manage projects and edit every field. */
export function testerOnly(req, _res, next) {
  if (!hasFullAccess(req.user?.role)) return next(ApiError.forbidden(MESSAGES.TESTER_ONLY));
  next();
}
