// Account management for the super admin: sign-up requests and activating/deactivating testers and developers.
import { SIGNUP_ROLES, USER_STATUS, USER_STATUS_LIST } from '../../constants/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { cleanString, escapeRegex, toPositiveInt } from '../../utils/sanitize.js';
import { endAllSessions } from '../auth/auth.service.js';
import { resolveSignupRequest } from '../notifications/notification.service.js';
import { Member } from '../projects/member.model.js';
import { User } from '../users/user.model.js';
import { toPublicUser, usersById } from '../users/user.service.js';

const { PENDING, ACTIVE, INACTIVE, REJECTED } = USER_STATUS;
const MANAGED = { role: { $in: SIGNUP_ROLES } }; // the admin manages testers and developers, not other admins

/** A tester/developer account by id, or 404. */
async function findManagedUser(rawId) {
  const id = toPositiveInt(rawId);
  const user = id ? await User.findOne({ _id: id, ...MANAGED }).lean() : null;
  if (!user) throw ApiError.notFound('Account not found.');
  return user;
}

async function setStatus(user, status, adminId) {
  await User.updateOne({ _id: user._id }, { status, reviewed_by: adminId, reviewed_at: new Date() });
  return toPublicUser({ ...user, status });
}

/** Number of accounts in each status (for the tabs in the admin panel). */
export async function accountCounts() {
  const rows = await User.aggregate([{ $match: MANAGED }, { $group: { _id: '$status', n: { $sum: 1 } } }]);
  const counts = Object.fromEntries(USER_STATUS_LIST.map(s => [s, 0]));
  for (const r of rows) if (r._id in counts) counts[r._id] = r.n;
  counts.all = Object.values(counts).reduce((a, b) => a + b, 0);
  return counts;
}

/** Testers and developers, newest first. Filters: ?status=pending|active|inactive|rejected &role= &q= */
export async function listAccounts(query = {}) {
  const filter = { ...MANAGED };
  if (USER_STATUS_LIST.includes(query.status)) filter.status = query.status;
  if (SIGNUP_ROLES.includes(query.role)) filter.role = query.role;
  const q = cleanString(query.q, 80);
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: rx }, { username: rx }];
  }

  const users = await User.find(filter, { password_hash: 0 }).sort({ created_at: -1, _id: -1 }).lean();
  const ids = users.map(u => u._id);
  const [reviewers, projectCounts, counts] = await Promise.all([
    usersById(users.map(u => u.reviewed_by)),
    Member.aggregate([{ $match: { user_id: { $in: ids } } }, { $group: { _id: '$user_id', n: { $sum: 1 } } }]),
    accountCounts(),
  ]);
  const projectsById = new Map(projectCounts.map(p => [p._id, p.n]));

  return {
    counts,
    users: users.map(u => ({
      ...toPublicUser(u),
      created_at: u.created_at,
      reviewed_at: u.reviewed_at,
      reviewed_by_name: reviewers.get(u.reviewed_by)?.name ?? null,
      projects: projectsById.get(u._id) || 0,
    })),
  };
}

/** Approves a sign-up request (a previously rejected one can be approved later too). */
export async function approve(rawId, adminId) {
  const user = await findManagedUser(rawId);
  if (![PENDING, REJECTED].includes(user.status)) throw ApiError.conflict(`${user.name}'s account is already approved.`);
  const updated = await setStatus(user, ACTIVE, adminId);
  await resolveSignupRequest(user._id);
  return { user: updated, counts: await accountCounts() };
}

export async function reject(rawId, adminId) {
  const user = await findManagedUser(rawId);
  if (user.status !== PENDING) throw ApiError.conflict(`Only pending requests can be rejected. ${user.name}'s account is ${user.status}.`);
  const updated = await setStatus(user, REJECTED, adminId);
  await resolveSignupRequest(user._id);
  return { user: updated, counts: await accountCounts() };
}

/** Turns an approved account on or off. Deactivating signs the person out everywhere immediately. */
export async function changeActive(rawId, body, adminId) {
  const status = body?.status;
  if (![ACTIVE, INACTIVE].includes(status)) throw ApiError.badRequest('Status must be "active" or "inactive".');
  const user = await findManagedUser(rawId);
  if (user.status === PENDING) throw ApiError.conflict(`${user.name}'s sign-up is still pending. Approve or reject it first.`);
  if (user.status === REJECTED) throw ApiError.conflict(`${user.name}'s sign-up was rejected. Approve it first to activate the account.`);
  if (user.status === status) throw ApiError.conflict(`${user.name}'s account is already ${status}.`);

  const updated = await setStatus(user, status, adminId);
  if (status === INACTIVE) await endAllSessions(user._id);
  return { user: updated, counts: await accountCounts() };
}
