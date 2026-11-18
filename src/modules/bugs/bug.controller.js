import { asyncHandler } from '../../utils/asyncHandler.js';
import { getProjectForUser } from '../projects/project.service.js';
import * as bugService from './bug.service.js';

const loadBug = req => bugService.getBugForUser(req.params.id, req.user);

export const listBugs = asyncHandler(async (req, res) => {
  const project = await getProjectForUser(req.query.project, req.user);
  res.json(await bugService.listBugs(project, req.query));
});

export const getBug = asyncHandler(async (req, res) => {
  res.json(await bugService.getBugWithHistory(await loadBug(req)));
});

export const createBug = asyncHandler(async (req, res) => {
  const project = await getProjectForUser(req.body.project_id, req.user);
  res.status(201).json({ bug: await bugService.createBug(project, req.body, req.user.id) });
});

export const updateBug = asyncHandler(async (req, res) => {
  res.json({ bug: await bugService.updateBug(await loadBug(req), req.body, req.user.id) });
});

export const changeStatus = asyncHandler(async (req, res) => {
  res.json({ bug: await bugService.changeStatus(await loadBug(req), req.body, req.user) });
});

export const updateNotes = asyncHandler(async (req, res) => {
  res.json({ bug: await bugService.updateNotes(await loadBug(req), req.body, req.user.id) });
});

export const deleteBug = asyncHandler(async (req, res) => {
  await bugService.deleteBug(await loadBug(req), req.user);
  res.json({ ok: true });
});
