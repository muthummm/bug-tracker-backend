import { ApiError } from '../../utils/ApiError.js';
import { hashPassword, randomHex, verifyPassword } from '../../utils/password.js';
import { ROLES } from '../../constants/index.js';
import { Bug } from '../bugs/bug.model.js';
import { nextIds } from '../counter/counter.model.js';
import { User } from '../users/user.model.js';
import { findByUsername, toPublicUser } from '../users/user.service.js';
import { Session } from './session.model.js';

const USERNAME_TAKEN = 'That username is taken.';

async function createSession(userId) {
  const token = randomHex(32);
  await Session.create({ _id: token, user_id: userId });
  return token;
}

/** The signed-in user for a session token, or null. */
export async function findUserByToken(token) {
  const session = await Session.findById(token).lean();
  const user = session && await User.findById(session.user_id).lean();
  return user ? { ...user, id: user._id } : null;
}

export async function register({ name, username, password, role }) {
  const existing = await findByUsername(username);
  let userId;

  if (existing && existing.password_hash === '') {
    // A placeholder made by the spreadsheet import (e.g. an assignee): the real person claims it
    await User.updateOne({ _id: existing._id }, { name, password_hash: hashPassword(password), role });
    // Managers are never assignees, so bugs the import gave this placeholder become unassigned
    if (role === ROLES.MANAGER) await Bug.updateMany({ assignee_id: existing._id }, { assignee_id: null });
    userId = existing._id;
  } else if (existing) {
    throw ApiError.conflict(USERNAME_TAKEN);
  } else {
    userId = await nextIds('users');
    try {
      await User.create({
        _id: userId, name, username, username_lower: username.toLowerCase(), password_hash: hashPassword(password), role,
      });
    } catch (e) {
      if (e.code === 11000) throw ApiError.conflict(USERNAME_TAKEN);
      throw e;
    }
  }

  const user = await User.findById(userId).lean();
  return { token: await createSession(userId), user: toPublicUser(user) };
}

export async function login({ username, password }) {
  const user = await findByUsername(username);
  if (user && user.password_hash === '')
    throw ApiError.unauthorized('This account has no password yet. Use "Create an account" with this username to set one.');
  if (!user || !verifyPassword(password, user.password_hash))
    throw ApiError.unauthorized('Wrong username or password.');
  return { token: await createSession(user._id), user: toPublicUser(user) };
}

export const logout = token => Session.deleteOne({ _id: token });
