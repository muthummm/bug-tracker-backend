import { asyncHandler } from '../../utils/asyncHandler.js';
import * as memberService from './member.service.js';
import * as projectService from './project.service.js';

const loadProject = req => projectService.getProjectForUser(req.params.id, req.user);

// ---------- projects ----------
export const listProjects = asyncHandler(async (req, res) => {
  res.json(await projectService.listProjectsForUser(req.user));
});

export const createProject = asyncHandler(async (req, res) => {
  res.status(201).json({ project: await projectService.createProject(req.body, req.user) });
});

export const updateProject = asyncHandler(async (req, res) => {
  const project = await loadProject(req);
  res.json({ project: await projectService.updateProject(project, req.body) });
});

export const deleteProject = asyncHandler(async (req, res) => {
  await projectService.deleteProject(await loadProject(req));
  res.json({ ok: true });
});

// ---------- members ("Team") ----------
export const listMembers = asyncHandler(async (req, res) => {
  const project = await loadProject(req);
  res.json(await memberService.listMembers(project._id));
});

export const addMember = asyncHandler(async (req, res) => {
  const project = await loadProject(req);
  res.status(201).json(await memberService.addToProject(project._id, req.body, req.user.id));
});

export const removeMember = asyncHandler(async (req, res) => {
  const project = await loadProject(req);
  res.json(await memberService.removeFromProject(project._id, req.params.userId));
});
