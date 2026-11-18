// Small, idempotent data fixes that run on every start. Each one does nothing once it has been applied.
import { ROLES, USER_STATUS } from '../constants/index.js';
import { User } from '../modules/users/user.model.js';

export async function runMigrations() {
  const users = User.collection; // raw driver: these documents may not match the current schema yet

  // 1. Accounts made before sign-up approval existed were already in use: keep them active.
  const { modifiedCount: activated } = await users.updateMany(
    { status: { $exists: false } }, { $set: { status: USER_STATUS.ACTIVE } },
  );

  // 2. The Manager role was replaced by Super Admin.
  const { modifiedCount: promoted } = await users.updateMany(
    { role: 'Manager' }, { $set: { role: ROLES.SUPER_ADMIN, status: USER_STATUS.ACTIVE } },
  );

  // 3. Placeholder accounts from old CSV imports (no password) can't sign in: mark them inactive.
  const { modifiedCount: placeholders } = await users.updateMany(
    { password_hash: '', status: USER_STATUS.ACTIVE }, { $set: { status: USER_STATUS.INACTIVE } },
  );

  if (activated) console.log(`[migrate] marked ${activated} existing account(s) active`);
  if (promoted) console.log(`[migrate] changed ${promoted} Manager account(s) to Super Admin`);
  if (placeholders) console.log(`[migrate] marked ${placeholders} password-less placeholder account(s) inactive`);
}
