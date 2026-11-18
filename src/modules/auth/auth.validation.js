import { ROLE_LIST } from '../../constants/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { cleanString } from '../../utils/sanitize.js';

export function parseRegisterInput(body) {
  const name = cleanString(body.name, 80);
  const username = cleanString(body.username, 40);
  const password = body.password;
  const role = ROLE_LIST.includes(body.role) ? body.role : null;

  if (!name || !username || !role) throw ApiError.badRequest('Name, username and role are required.');
  if (!/^[\w.-]{3,40}$/.test(username))
    throw ApiError.badRequest('Username: 3+ letters, numbers, dots, dashes or underscores.');
  if (typeof password !== 'string' || password.length < 6)
    throw ApiError.badRequest('Password must be at least 6 characters.');

  return { name, username, password, role };
}

export function parseLoginInput(body) {
  return { username: cleanString(body.username, 40), password: String(body.password || '') };
}
