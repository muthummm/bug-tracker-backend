import { asyncHandler } from '../../utils/asyncHandler.js';
import { getProjectForMember } from '../projects/project.service.js';
import * as bugService from './bug.service.js';

const loadBug = req => bugService.getBugForMember(req.params.id, req.user.id);

export const listBugs = asyncHandler(async (req, res) => {
  const project = await getProjectForMember(req.query.project, req.user.id);
  res.json(await bugService.listBugs(project, req.query));
});

export const getBug = asyncHandler(async (req, res) => {
  res.json(await bugService.getBugWithHistory(await loadBug(req)));
});

export const createBug = asyncHandler(async (req, res) => {
  const project = await getProjectForMember(req.body.project_id, req.user.id);
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
  await bugService.deleteBug(await loadBug(req), req.user.id);
  res.json({ ok: true });
});
