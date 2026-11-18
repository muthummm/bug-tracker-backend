import mongoose from 'mongoose';
import { ROLES, USER_STATUS } from '../../constants/index.js';
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
 * Who hears about a change to a bug: its assignee (usually the developer) and its reporter (usually the tester).
 * The person who made the change is never notified about their own action, and only current project
 * members (or a super admin who reported the bug) are notified.
 */
async function recipientsFor(bug, actorId) {
  const ids = new Set([bug.assignee_id, bug.reporter_id]);
  ids.delete(actorId);
  ids.delete(null);
  ids.delete(undefined);
  if (!ids.size) return [];
  const [members, admins] = await Promise.all([
    Member.find({ project_id: bug.project_id, user_id: { $in: [...ids] } }, { user_id: 1 }).lean(),
    User.find({ _id: { $in: [...ids] }, role: ROLES.SUPER_ADMIN }, { _id: 1 }).lean(),
  ]);
  const allowed = new Set([...members.map(m => m.user_id), ...admins.map(a => a._id)]);
  return [...ids].filter(id => allowed.has(id));
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

/** Tells every active super admin that someone signed up and is waiting for approval. */
export async function notifyAdminsOfSignup(user) {
  try {
    const admins = await User.find({ role: ROLES.SUPER_ADMIN, status: USER_STATUS.ACTIVE }, { _id: 1 }).lean();
    if (!admins.length) return;
    const rows = await Notification.insertMany(admins.map(a => ({
      user_id: a._id, actor_id: user._id, subject_user_id: user._id, type: 'signup_request',
    })));
    pushToDesktops(rows, {
      title: `${user.name} wants to join as ${user.role}`,
      body: `Username: ${user.username}\nApprove or reject the request in the admin panel.`,
      url: '/#admin',
    });
  } catch (err) {
    console.error('[notifications] could not record notification:', err.message || err);
  }
}

/** Once one admin approves or rejects a request, it no longer shows as unread for any admin. */
export const resolveSignupRequest = userId =>
  Notification.updateMany({ type: 'signup_request', subject_user_id: userId, read: false }, { read: true });

export const unreadCount = userId => Notification.countDocuments({ user_id: userId, read: false });

/** The user's latest notifications with actor, bug and project names filled in. */
export async function listForUser(userId, query = {}) {
  const filter = { user_id: userId };
  if (query.unread === '1' || query.unread === 'true') filter.read = false;
  const rows = await Notification.find(filter).sort({ created_at: -1, _id: -1 }).limit(LIST_LIMIT).lean();

  const subjectIds = [...new Set(rows.map(r => r.subject_user_id).filter(id => id != null))];
  const [actors, bugs, projects, subjects, unread] = await Promise.all([
    usersById(rows.map(r => r.actor_id)),
    Bug.find({ _id: { $in: [...new Set(rows.map(r => r.bug_id).filter(id => id != null))] } }, { description: 1 }).lean(),
    Project.find({ _id: { $in: [...new Set(rows.map(r => r.project_id).filter(id => id != null))] } }, { name: 1 }).lean(),
    User.find({ _id: { $in: subjectIds } }, { username: 1, status: 1 }).lean(),
    unreadCount(userId),
  ]);
  const bugById = new Map(bugs.map(b => [b._id, b]));
  const projectById = new Map(projects.map(p => [p._id, p]));
  const subjectById = new Map(subjects.map(s => [s._id, s]));

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
      // signup_request: the request's username and where it stands now (pending/active/rejected/...)
      subject_username: subjectById.get(n.subject_user_id)?.username ?? null,
      subject_status: subjectById.get(n.subject_user_id)?.status ?? null,
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
