import { User } from './user.model.js';

/** The fields of a user that are safe to send to the browser. */
export const toPublicUser = user => user && { id: user._id, name: user.name, username: user.username, role: user.role };

export const findByUsername = username => User.findOne({ username_lower: username.toLowerCase() }).lean();

/** Map of id -> { name, role } for the given user ids (nulls and duplicates are ignored). */
export async function usersById(ids) {
  const unique = [...new Set(ids.filter(id => id != null))];
  const users = unique.length ? await User.find({ _id: { $in: unique } }, { name: 1, role: 1 }).lean() : [];
  return new Map(users.map(u => [u._id, u]));
}

/** Everyone with an account, testers first; testers use it to pick who to add to a project. */
export async function listUsers() {
  const users = await User.find({}, { name: 1, username: 1, role: 1 }).sort({ role: -1, name: 1 }).lean();
  return users.map(toPublicUser);
}
