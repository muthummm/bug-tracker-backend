import {
  DEV_STATUSES, MESSAGES, PRIORITIES, PRIORITY_RANK, ROLES, STATUSES,
} from '../../constants/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { cleanString, escapeRegex, toPositiveInt } from '../../utils/sanitize.js';
import { nextIds } from '../counter/counter.model.js';
import { deleteForBug, notifyBugChange } from '../notifications/notification.service.js';
import { isMember } from '../projects/member.service.js';
import { toProjectResponse } from '../projects/project.service.js';
import { removeScreenshot } from '../uploads/upload.service.js';
import { usersById } from '../users/user.service.js';
import { Bug, bugKey } from './bug.model.js';
import { History } from './history.model.js';
import { parseBugInput } from './bug.validation.js';

const SEARCH_FIELDS = ['panel', 'module', 'description', 'steps', 'actual', 'notes'];

// ---------- helpers ----------

/** Adds the key (BUG-001) and assignee/reporter names the frontend shows. */
export async function shapeBugs(bugs) {
  const users = await usersById(bugs.flatMap(b => [b.assignee_id, b.reporter_id]));
  return bugs.map(({ _id, ...b }) => ({
    id: _id,
    ...b,
    key: bugKey(_id),
    assignee_name: users.get(b.assignee_id)?.name ?? null,
    reporter_name: users.get(b.reporter_id)?.name ?? null,
  }));
}

const shapeOne = async id => (await shapeBugs([await Bug.findById(id).lean()]))[0];

const addHistory = (bugId, userId, fromStatus, toStatus, comment, at = new Date()) =>
  History.create({ bug_id: bugId, user_id: userId, from_status: fromStatus, to_status: toStatus, comment, created_at: at });

/** A bug in a project the user belongs to; otherwise 404. */
export async function getBugForMember(rawId, userId) {
  const id = toPositiveInt(rawId);
  const bug = id ? await Bug.findById(id).lean() : null;
  if (!bug || !(await isMember(bug.project_id, userId))) throw ApiError.notFound(MESSAGES.BUG_NOT_FOUND);
  return bug;
}

function buildFilter(projectId, query) {
  const filter = { project_id: projectId };
  if (STATUSES.includes(query.status)) filter.status = query.status;
  if (query.panel) filter.panel = cleanString(query.panel, 100);
  if (PRIORITIES.includes(query.priority)) filter.priority = query.priority;
  if (query.assignee === 'none') filter.assignee_id = null;
  else if (toPositiveInt(query.assignee)) filter.assignee_id = toPositiveInt(query.assignee);

  const q = cleanString(query.q, 200);
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = SEARCH_FIELDS.map(field => ({ [field]: rx }));
    const idMatch = q.match(/^bug-?0*(\d+)$/i); // "BUG-12" finds bug 12
    if (idMatch) filter.$or.push({ _id: Number(idMatch[1]) });
  }
  return filter;
}

// ---------- queries ----------

export async function listBugs(project, query) {
  const sort = { old: { _id: 1 }, updated: { updated_at: -1 } }[query.sort] || { _id: -1 };
  const rows = await Bug.find(buildFilter(project._id, query)).sort(sort).lean();
  if (query.sort === 'priority')
    rows.sort((a, b) => (PRIORITY_RANK[a.priority] ?? 4) - (PRIORITY_RANK[b.priority] ?? 4) || b._id - a._id);

  const [statusCounts, panels] = await Promise.all([
    Bug.aggregate([{ $match: { project_id: project._id } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    Bug.distinct('panel', { project_id: project._id, panel: { $ne: '' } }),
  ]);

  return {
    project: toProjectResponse(project),
    bugs: await shapeBugs(rows),
    counts: Object.fromEntries(statusCounts.map(c => [c._id, c.n])),
    panels: panels.sort(),
  };
}

export async function getBugWithHistory(bug) {
  const history = await History.find({ bug_id: bug._id }).sort({ created_at: -1, _id: -1 }).lean();
  const users = await usersById(history.map(h => h.user_id));
  return {
    bug: (await shapeBugs([bug]))[0],
    history: history.map(({ _id, ...h }) => ({
      id: String(_id),
      ...h,
      user_name: users.get(h.user_id)?.name ?? null,
      user_role: users.get(h.user_id)?.role ?? null,
    })),
  };
}

// ---------- commands ----------

export async function createBug(project, body, userId) {
  const fields = await parseBugInput(body, project._id);
  const id = await nextIds('bugs');
  const now = new Date();
  await Bug.create({ _id: id, project_id: project._id, ...fields, reporter_id: userId, created_at: now, updated_at: now });
  await addHistory(id, userId, null, fields.status, 'Bug reported', now);
  await notifyBugChange({ _id: id, project_id: project._id, ...fields, reporter_id: userId }, userId, { type: 'reported', to_status: fields.status });
  return shapeOne(id);
}

export async function updateBug(old, body, userId) {
  const fields = await parseBugInput(body, old.project_id);
  await Bug.updateOne({ _id: old._id }, { ...fields, updated_at: new Date() });

  const changed = fields.status !== old.status;
  await addHistory(old._id, userId, changed ? old.status : null, changed ? fields.status : null, 'Edited bug details');
  // Uses the bug after the edit, so a newly assigned person is notified too
  await notifyBugChange({ ...old, ...fields }, userId,
    { type: 'edited', from_status: changed ? old.status : null, to_status: changed ? fields.status : null });
  if (old.screenshot && old.screenshot !== fields.screenshot) await removeScreenshot(old.screenshot);
  return shapeOne(old._id);
}

/** Quick status change, optionally with a comment (the main thing developers and testers do). */
export async function changeStatus(old, body, user) {
  const { status } = body;
  const comment = cleanString(body.comment, 1000);
  if (!STATUSES.includes(status)) throw ApiError.badRequest('Unknown status.');
  if (status === old.status && !comment) throw ApiError.badRequest('Pick a new status or add a comment.');

  const changed = status !== old.status;
  if (changed && user.role === ROLES.DEVELOPER && !DEV_STATUSES.includes(status))
    throw ApiError.forbidden(`Only a tester can set a bug to ${status}. Mark it Fixed or Ready for Retest and the tester will verify it.`);

  await Bug.updateOne({ _id: old._id }, { status, updated_at: new Date() });
  await addHistory(old._id, user.id, changed ? old.status : null, changed ? status : null, comment);
  await notifyBugChange(old, user.id, changed
    ? { type: 'status', from_status: old.status, to_status: status, comment }
    : { type: 'comment', comment });
  return shapeOne(old._id);
}

/** Anyone in the project can edit notes (developers add root cause, build numbers, etc.). */
export async function updateNotes(old, body, userId) {
  const notes = cleanString(body.notes);
  if (notes === old.notes) throw ApiError.badRequest('Notes are unchanged.');
  await Bug.updateOne({ _id: old._id }, { notes, updated_at: new Date() });
  await addHistory(old._id, userId, null, null, 'Updated notes');
  await notifyBugChange(old, userId, { type: 'notes' });
  return shapeOne(old._id);
}

export async function deleteBug(bug, userId) {
  if (bug.reporter_id !== userId) throw ApiError.forbidden('Only the person who reported this bug can delete it.');
  await Promise.all([Bug.deleteOne({ _id: bug._id }), History.deleteMany({ bug_id: bug._id }), deleteForBug(bug._id)]);
  if (bug.screenshot) await removeScreenshot(bug.screenshot);
}
