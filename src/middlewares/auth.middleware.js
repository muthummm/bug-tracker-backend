import { FULL_ACCESS_ROLES, MESSAGES, ROLES } from '../constants/index.js';
import { findUserByToken } from '../modules/auth/auth.service.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/** Requires `Authorization: Bearer <token>` of an active account; sets `req.user` and `req.token`. */
export const authenticate = asyncHandler(async (req, _res, next) => {
  const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const user = token ? await findUserByToken(token) : null;
  if (!user) throw ApiError.unauthorized(MESSAGES.SIGN_IN);
  req.user = user;
  req.token = token;
  next();
});

/** Allows only the given roles. Use after `authenticate`. */
export const requireRole = (roles, message) => (req, _res, next) => {
  if (!roles.includes(req.user?.role)) return next(ApiError.forbidden(message));
  next();
};

/** Testers and the super admin: report bugs, import sheets, create projects and edit every field. */
export const testerOnly = requireRole(FULL_ACCESS_ROLES, MESSAGES.TESTER_ONLY);

/** Super admin only: approve sign-ups, (de)activate accounts and manage project teams. */
export const adminOnly = requireRole([ROLES.SUPER_ADMIN], MESSAGES.ADMIN_ONLY);
