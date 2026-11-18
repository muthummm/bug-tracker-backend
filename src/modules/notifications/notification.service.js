import mongoose from 'mongoose';
import { ROLES } from '../../constants/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { toPositiveInt } from '../../utils/sanitize.js';
import { Bug, bugKey } from '../bugs/bug.model.js';
import { Member } from '../projects/member.model.js';
import { Project } from '../projects/project.model.js';
import { User } from '../users/user.model.js';
import { sendToUsers } from '../push/push.service.js';
import { usersById } from '../users/user.service.js';
import { Notification } from './notification.model.js';

const LIST_LIMIT = 100;
const NL = '\n';
const clip = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '');

/** Title, text and link of the desktop notification for one event. */
async function desktopMessage({ type, actorId, projectId, bug, from_status, to_status, comment }) {
  const [actor, project] = await Promise.all([
    User.findById(actorId, { name: 1 }).lean(),
    Project.findById(projectId, { name: 1 }).lean(),
  ]);
  const who = actor?.name || 'Someone';
  const projectName = project?.name || 'a project';
  if (type === 'added_to_project') {
    return { title: `${who} added you to ${projectName}`, body: 'Open Bug Log to see its bugs.', url: `/#project-${projectId}` };
  }
  const key = bugKey(bug._id);
  const title = {
    reported: `${who} reported ${key}`,
    status: `${who} changed ${key} to ${to_status}`,
    comment: `${who} commented on ${key}`,
    edited: to_status ? `${who} edited ${key} (now ${to_status})` : `${who} edited ${key}`,
    notes: `${who} updated the notes on ${key}`,
  }[type] || `${who} updated ${key}`;
  const lines = [clip(bug.description, 120)];
  if (type === 'status' && from_status) lines.push(`${from_status} → ${to_status}`);
  if (comment) lines.push(`“${clip(comment, 140)}”`);
  lines.push(projectName);
  return { title, body: lines.filter(Boolean).join(NL), url: `/#project-${projectId}/bug-${bug._id}` };
}

/** Desktop pop-ups for the rows just saved; runs in the background so the request isn't slowed down. */
function pushToDesktops(rows, message) {
  sendToUsers(rows.map(r => ({ userId: r.user_id, payload: { ...message, tag: `bug-log-${r._id}`, id: String(r._id) } })))
    .catch(() => {});
}

/**
 * Who hears about a change to a bug: its assignee (usually the developer), its reporter (usually the tester)
 * and every manager in the project. The person who made the change is never notified about their own action,
 * and only current project members are notified.
 */
async function recipientsFor(bug, actorId) {
  const memberIds = (await Member.find({ project_id: bug.project_id }, { user_id: 1 }).lean()).map(m => m.user_id);
  const managers = await User.find({ _id: { $in: memberIds }, role: ROLES.MANAGER }, { _id: 1 }).lean();
  const members = new Set(memberIds);
  const ids = new Set([bug.assignee_id, bug.reporter_id, ...managers.map(m => m._id)]);
  ids.delete(actorId);
  return [...ids].filter(id => id != null && members.has(id));
}

/**
 * Records a notification for everyone who should hear about a bug change.
 * A failure here is logged and swallowed: the bug change itself already succeeded.
 * @param {object} bug   the bug after the change (needs _id, project_id, assignee_id, reporter_id)
 * @param {number} actorId
 * @param {{ type: string, from_status?: string|null, to_status?: string|null, comment?: string }} event
 */
export async function notifyBugChange(bug, actorId, event) {
  try {
    const recipients = await recipientsFor(bug, actorId);
    if (!recipients.length) return;
    const now = new Date();
    const rows = await Notification.insertMany(recipients.map(userId => ({
      user_id: userId, actor_id: actorId, project_id: bug.project_id, bug_id: bug._id,
      type: event.type, from_status: event.from_status ?? null, to_status: event.to_status ?? null,
      comment: event.comment || '', created_at: now,
    })));
    pushToDesktops(rows, await desktopMessage({ ...event, actorId, projectId: bug.project_id, bug }));
  } catch (err) {
    console.error('[notifications] could not record notification:', err.message || err);
  }
}

/** Tells a person they were added to a project (not when they added themselves). */
export async function notifyAddedToProject(projectId, userId, actorId) {
  if (userId === actorId) return;
  try {
    const row = await Notification.create({ user_id: userId, actor_id: actorId, project_id: projectId, type: 'added_to_project' });
    pushToDesktops([row], await desktopMessage({ type: 'added_to_project', actorId, projectId }));
  } catch (err) {
    console.error('[notifications] could not record notification:', err.message || err);
  }
}

export const unreadCount = userId => Notification.countDocuments({ user_id: userId, read: false });

/** The user's latest notifications with actor, bug and project names filled in. */
export async function listForUser(userId, query = {}) {
  const filter = { user_id: userId };
  if (query.unread === '1' || query.unread === 'true') filter.read = false;
  const rows = await Notification.find(filter).sort({ created_at: -1, _id: -1 }).limit(LIST_LIMIT).lean();

  const [actors, bugs, projects, unread] = await Promise.all([
    usersById(rows.map(r => r.actor_id)),
    Bug.find({ _id: { $in: [...new Set(rows.map(r => r.bug_id).filter(id => id != null))] } }, { description: 1 }).lean(),
    Project.find({ _id: { $in: [...new Set(rows.map(r => r.project_id))] } }, { name: 1 }).lean(),
    unreadCount(userId),
  ]);
  const bugById = new Map(bugs.map(b => [b._id, b]));
  const projectById = new Map(projects.map(p => [p._id, p]));

  return {
    unread,
    notifications: rows.map(({ _id, ...n }) => ({
      id: String(_id),
      ...n,
      bug_key: n.bug_id != null ? bugKey(n.bug_id) : null,
      bug_title: bugById.get(n.bug_id)?.description ?? null, // null = the bug was deleted
      project_name: projectById.get(n.project_id)?.name ?? null,
      actor_name: actors.get(n.actor_id)?.name ?? 'Someone',
      actor_role: actors.get(n.actor_id)?.role ?? null,
    })),
  };
}

export async function markRead(userId, rawId) {
  if (!mongoose.isValidObjectId(rawId)) throw ApiError.notFound('Notification not found.');
  const { matchedCount } = await Notification.updateOne({ _id: rawId, user_id: userId }, { read: true });
  if (!matchedCount) throw ApiError.notFound('Notification not found.');
  return { unread: await unreadCount(userId) };
}

/** Marks all of the user's notifications read, or only those about one bug (?bug=ID). */
export async function markAllRead(userId, query = {}) {
  const filter = { user_id: userId, read: false };
  const bugId = toPositiveInt(query.bug);
  if (bugId) filter.bug_id = bugId;
  await Notification.updateMany(filter, { read: true });
  return { unread: await unreadCount(userId) };
}

export const deleteForBug = bugId => Notification.deleteMany({ bug_id: bugId });

/** Someone who leaves a project stops seeing its notifications. */
export const deleteForMember = (projectId, userId) => Notification.deleteMany({ project_id: projectId, user_id: userId });
