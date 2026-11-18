import { asyncHandler } from '../../utils/asyncHandler.js';
import * as authService from './auth.service.js';
import { parseLoginInput, parseRegisterInput } from './auth.validation.js';

export const register = asyncHandler(async (req, res) => {
  res.status(201).json(await authService.register(parseRegisterInput(req.body)));
});

export const login = asyncHandler(async (req, res) => {
  res.json(await authService.login(parseLoginInput(req.body)));
});

export const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.token);
  res.json({ ok: true });
});
