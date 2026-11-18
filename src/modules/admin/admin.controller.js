import { asyncHandler } from '../../utils/asyncHandler.js';
import * as adminService from './admin.service.js';

export const summary = asyncHandler(async (_req, res) => {
  res.json({ counts: await adminService.accountCounts() });
});

export const listUsers = asyncHandler(async (req, res) => {
  res.json(await adminService.listAccounts(req.query));
});

export const approveUser = asyncHandler(async (req, res) => {
  res.json(await adminService.approve(req.params.id, req.user.id));
});

export const rejectUser = asyncHandler(async (req, res) => {
  res.json(await adminService.reject(req.params.id, req.user.id));
});

export const setUserStatus = asyncHandler(async (req, res) => {
  res.json(await adminService.changeActive(req.params.id, req.body, req.user.id));
});
