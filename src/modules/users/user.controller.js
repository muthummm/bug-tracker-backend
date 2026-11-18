import { asyncHandler } from '../../utils/asyncHandler.js';
import { listUsers, toPublicUser } from './user.service.js';

export const getMe = (req, res) => res.json({ user: toPublicUser(req.user) });

export const getUsers = asyncHandler(async (_req, res) => {
  res.json(await listUsers());
});
