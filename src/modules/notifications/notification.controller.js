import { asyncHandler } from '../../utils/asyncHandler.js';
import * as service from './notification.service.js';

export const list = asyncHandler(async (req, res) => {
  res.json(await service.listForUser(req.user.id, req.query));
});

export const count = asyncHandler(async (req, res) => {
  res.json({ unread: await service.unreadCount(req.user.id) });
});

export const markRead = asyncHandler(async (req, res) => {
  res.json(await service.markRead(req.user.id, req.params.id));
});

export const markAllRead = asyncHandler(async (req, res) => {
  res.json(await service.markAllRead(req.user.id, req.query));
});
