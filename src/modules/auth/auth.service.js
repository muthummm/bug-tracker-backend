import { USER_STATUS } from '../../constants/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { hashPassword, randomHex, verifyPassword } from '../../utils/password.js';
import { nextIds } from '../counter/counter.model.js';
import { notifyAdminsOfSignup } from '../notifications/notification.service.js';
import { User } from '../users/user.model.js';
import { findByUsername, toPublicUser } from '../users/user.service.js';
import { Session } from './session.model.js';

const USERNAME_TAKEN = 'That username is taken.';

// What a person sees when they try to sign in with an account that isn't active
const STATUS_MESSAGES = {
  [USER_STATUS.PENDING]: 'Your account is waiting for approval by the admin. You can sign in once it is approved.',
  [USER_STATUS.REJECTED]: 'Your sign-up request was not approved. Contact the admin if you think this is a mistake.',
  [USER_STATUS.INACTIVE]: 'Your account has been deactivated. Contact the admin to turn it back on.',
};

async function createSession(userId) {
  const token = randomHex(32);
  await Session.create({ _id: token, user_id: userId });
  return token;
}

/** The signed-in user for a session token, or null (also null once the account is no longer active). */
export async function findUserByToken(token) {
  const session = await Session.findById(token).lean();
  const user = session && await User.findById(session.user_id).lean();
  return user?.status === USER_STATUS.ACTIVE ? { ...user, id: user._id } : null;
}

/** Signs someone out everywhere, e.g. when their account is deactivated. */
export const endAllSessions = userId => Session.deleteMany({ user_id: userId });

/**
 * Creates a sign-up request. The account stays "pending" (can't sign in) until the
 * super admin approves it; every active super admin is notified.
 * Someone whose request was rejected can apply again with the same username: their old
 * request is replaced by the new one (new name, role and password) and goes back to pending.
 */
export async function register({ name, username, password, role }) {
  const existing = await findByUsername(username);
  if (existing && existing.status !== USER_STATUS.REJECTED) {
    throw ApiError.conflict(existing.status === USER_STATUS.PENDING
      ? 'A request with that username is already waiting for the admin’s approval.'
      : USERNAME_TAKEN);
  }

  let userId;
  if (existing) {
    userId = existing._id;
    await User.updateOne({ _id: userId, status: USER_STATUS.REJECTED }, {
      name, username, password_hash: hashPassword(password), role,
      status: USER_STATUS.PENDING, reviewed_by: null, reviewed_at: null, created_at: new Date(),
    });
  } else {
    userId = await nextIds('users');
    try {
      await User.create({
        _id: userId, name, username, username_lower: username.toLowerCase(),
        password_hash: hashPassword(password), role, status: USER_STATUS.PENDING,
      });
    } catch (e) {
      if (e.code === 11000) throw ApiError.conflict(USERNAME_TAKEN);
      throw e;
    }
  }

  const user = await User.findById(userId).lean();
  await notifyAdminsOfSignup(user);
  return {
    pending: true,
    message: 'Your request has been sent to the admin. You can sign in as soon as it is approved.',
    user: toPublicUser(user),
  };
}

export async function login({ username, password }) {
  const user = await findByUsername(username);
  if (!user || !verifyPassword(password, user.password_hash))
    throw ApiError.unauthorized('Wrong username or password.');
  // Only after the password is right, so this can't be used to find out which usernames exist
  if (user.status !== USER_STATUS.ACTIVE) throw ApiError.forbidden(STATUS_MESSAGES[user.status] || STATUS_MESSAGES.inactive);
  return { token: await createSession(user._id), user: toPublicUser(user) };
}

export const logout = token => Session.deleteOne({ _id: token });
