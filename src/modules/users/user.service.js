import { SIGNUP_ROLES, USER_STATUS } from '../../constants/index.js';
import { User } from './user.model.js';

/** The fields of a user that are safe to send to the browser. */
export const toPublicUser = user => user && {
  id: user._id, name: user.name, username: user.username, role: user.role, status: user.status,
};

export const findByUsername = username => User.findOne({ username_lower: username.toLowerCase() }).lean();

/** Map of id -> { name, role } for the given user ids (nulls and duplicates are ignored). */
export async function usersById(ids) {
  const unique = [...new Set(ids.filter(id => id != null))];
  const users = unique.length ? await User.find({ _id: { $in: unique } }, { name: 1, role: 1 }).lean() : [];
  return new Map(users.map(u => [u._id, u]));
}

/** Active testers and developers, testers first: the people the admin can add to a project. */
export async function listAssignableUsers() {
  const users = await User.find(
    { role: { $in: SIGNUP_ROLES }, status: USER_STATUS.ACTIVE },
    { name: 1, username: 1, role: 1, status: 1 },
  ).sort({ role: -1, name: 1 }).lean();
  return users.map(toPublicUser);
}
