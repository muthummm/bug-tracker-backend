import { ACTIVE_STATUSES, FULL_ACCESS_ROLES, MESSAGES, TO_VERIFY_STATUSES } from '../../constants/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { cleanString, toPositiveInt } from '../../utils/sanitize.js';
import { Bug } from '../bugs/bug.model.js';
import { nextIds } from '../counter/counter.model.js';
import { User } from '../users/user.model.js';
import { Member } from './member.model.js';
import { addMember, isMember, projectIdsForUser } from './member.service.js';
import { Project } from './project.model.js';

const NAME_TAKEN = 'A project with that name already exists.';

export const toProjectResponse = p => ({
  id: p._id, name: p.name, description: p.description, created_by: p.created_by, created_at: p.created_at,
});

/**
 * A project the user is a member of. Non-members get the same 404 as a missing project,
 * so nobody can tell that a project they weren't added to exists.
 */
export async function getProjectForMember(rawId, userId) {
  const id = toPositiveInt(rawId);
  const project = id ? await Project.findById(id).lean() : null;
  if (!project || !(await isMember(project._id, userId))) throw ApiError.notFound(MESSAGES.PROJECT_NOT_FOUND);
  return project;
}

/** The user's projects with bug counts, most recently active first. */
export async function listProjectsForUser(userId) {
  const ids = await projectIdsForUser(userId);
  const [projects, stats, memberCounts] = await Promise.all([
    Project.find({ _id: { $in: ids } }).lean(),
    Bug.aggregate([
      { $match: { project_id: { $in: ids } } },
      { $group: {
        _id: '$project_id',
        total: { $sum: 1 },
        active: { $sum: { $cond: [{ $in: ['$status', ACTIVE_STATUSES] }, 1, 0] } },
        to_verify: { $sum: { $cond: [{ $in: ['$status', TO_VERIFY_STATUSES] }, 1, 0] } },
        mine: { $sum: { $cond: [{ $and: [{ $eq: ['$assignee_id', userId] }, { $in: ['$status', ACTIVE_STATUSES] }] }, 1, 0] } },
        last_activity: { $max: '$updated_at' },
      } },
    ]),
    Member.aggregate([{ $match: { project_id: { $in: ids } } }, { $group: { _id: '$project_id', n: { $sum: 1 } } }]),
  ]);

  const statsById = new Map(stats.map(s => [s._id, s]));
  const membersById = new Map(memberCounts.map(m => [m._id, m.n]));

  return projects
    .map(p => {
      const s = statsById.get(p._id) || {};
      return {
        ...toProjectResponse(p),
        members: membersById.get(p._id) || 0,
        total: s.total || 0,
        active: s.active || 0,
        to_verify: s.to_verify || 0,
        mine: s.mine || 0,
        last_activity: s.last_activity || null,
      };
    })
    .sort((a, b) => new Date(b.last_activity || b.created_at) - new Date(a.last_activity || a.created_at));
}

export async function createProject(body, userId) {
  const name = cleanString(body.name, 120);
  const description = cleanString(body.description, 500);
  if (!name) throw ApiError.badRequest('Give the project a name.');
  if (await Project.exists({ name_lower: name.toLowerCase() })) throw ApiError.conflict(NAME_TAKEN);

  const id = await nextIds('projects');
  try {
    await Project.create({ _id: id, name, name_lower: name.toLowerCase(), description, created_by: userId });
  } catch (e) {
    if (e.code === 11000) throw ApiError.conflict(NAME_TAKEN);
    throw e;
  }
  await addMember(id, userId, userId);
  return toProjectResponse(await Project.findById(id).lean());
}

export async function updateProject(project, body) {
  const name = cleanString(body.name, 120) || project.name;
  if (name.toLowerCase() !== project.name_lower && await Project.exists({ name_lower: name.toLowerCase() }))
    throw ApiError.conflict(NAME_TAKEN);
  const description = typeof body.description === 'string' ? cleanString(body.description, 500) : project.description;

  await Project.updateOne({ _id: project._id }, { name, name_lower: name.toLowerCase(), description });
  return toProjectResponse(await Project.findById(project._id).lean());
}

export async function deleteProject(project) {
  if (await Bug.exists({ project_id: project._id })) throw ApiError.badRequest('Only empty projects can be deleted.');
  await Promise.all([Project.deleteOne({ _id: project._id }), Member.deleteMany({ project_id: project._id })]);
}

/** Finds a project by name, creating it if needed (command-line import). Every tester and manager gets access to a new one. */
export async function findOrCreateProjectByName(name) {
  const existing = await Project.findOne({ name_lower: name.toLowerCase() }).lean();
  if (existing) return existing._id;

  const id = await nextIds('projects');
  await Project.create({ _id: id, name, name_lower: name.toLowerCase() });
  const testers = await User.find({ role: { $in: FULL_ACCESS_ROLES } }, { _id: 1 }).lean();
  if (testers.length) await Member.insertMany(testers.map(t => ({ project_id: id, user_id: t._id })), { ordered: false });
  return id;
}
