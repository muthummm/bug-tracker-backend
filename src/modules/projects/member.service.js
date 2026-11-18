import { FULL_ACCESS_ROLES } from '../../constants/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { cleanString, toPositiveInt } from '../../utils/sanitize.js';
import { Bug } from '../bugs/bug.model.js';
import { deleteForMember, notifyAddedToProject } from '../notifications/notification.service.js';
import { User } from '../users/user.model.js';
import { findByUsername, toPublicUser, usersById } from '../users/user.service.js';
import { Member } from './member.model.js';

export const isMember = async (projectId, userId) =>
  Boolean(await Member.exists({ project_id: projectId, user_id: userId }));

/** Adds a member (does nothing if they are already one). */
export async function addMember(projectId, userId, addedBy = null) {
  await Member.updateOne(
    { project_id: projectId, user_id: userId },
    { $setOnInsert: { added_by: addedBy, added_at: new Date() } },
    { upsert: true },
  );
}

export const projectIdsForUser = async userId =>
  (await Member.find({ user_id: userId }, { project_id: 1 }).lean()).map(m => m.project_id);

/** The project's team, testers first, then by name. */
export async function listMembers(projectId) {
  const rows = await Member.find({ project_id: projectId }).lean();
  const [users, adders] = await Promise.all([
    User.find({ _id: { $in: rows.map(r => r.user_id) } }).lean(),
    usersById(rows.map(r => r.added_by)),
  ]);
  const byId = new Map(users.map(u => [u._id, u]));

  return rows
    .filter(r => byId.has(r.user_id))
    .map(r => {
      const u = byId.get(r.user_id);
      return {
        id: u._id, name: u.name, username: u.username, role: u.role, pending: u.password_hash === '',
        added_at: r.added_at, added_by_name: adders.get(r.added_by)?.name ?? null,
      };
    })
    .sort((a, b) => b.role.localeCompare(a.role) || a.name.localeCompare(b.name));
}

/** Adds a person by user id or username. */
export async function addToProject(projectId, { user_id: rawUserId, username }, addedBy) {
  const userId = toPositiveInt(rawUserId);
  const user = userId
    ? await User.findById(userId).lean()
    : await findByUsername(cleanString(username, 40));
  if (!user) throw ApiError.notFound('No account with that username. Ask them to create an account first.');
  if (await isMember(projectId, user._id)) throw ApiError.conflict(`${user.name} is already in this project.`);

  await addMember(projectId, user._id, addedBy);
  await notifyAddedToProject(projectId, user._id, addedBy);
  return { added: toPublicUser(user), members: await listMembers(projectId) };
}

/** Removes a person; their bugs in this project become unassigned. A project keeps at least one tester or manager. */
export async function removeFromProject(projectId, rawUserId) {
  const userId = Number(rawUserId);
  if (!(await isMember(projectId, userId))) throw ApiError.notFound('That person is not in this project.');

  const others = (await Member.find({ project_id: projectId, user_id: { $ne: userId } }, { user_id: 1 }).lean())
    .map(m => m.user_id);
  if (!(await User.exists({ _id: { $in: others }, role: { $in: FULL_ACCESS_ROLES } })))
    throw ApiError.badRequest('A project needs at least one tester or manager. Add another one before removing this person.');

  await Member.deleteOne({ project_id: projectId, user_id: userId });
  await deleteForMember(projectId, userId);
  // Nothing stays assigned to someone who can no longer see it
  const { modifiedCount } = await Bug.updateMany({ project_id: projectId, assignee_id: userId }, { assignee_id: null });
  return { ok: true, unassigned: modifiedCount, members: await listMembers(projectId) };
}
