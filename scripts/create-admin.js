// Creates a super admin account, or resets an existing super admin's password.
// Super admins can't sign up in the app; this is the only way to make one.
// Usage: npm run admin:create -- --username admin --name "Super Admin"   (asks for the password)
//        npm run admin:create -- --username admin --name "Super Admin" --password "..."
import readline from 'node:readline/promises';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { validateEnv } from '../src/config/env.js';
import { ROLES, USER_STATUS } from '../src/constants/index.js';
import { nextIds } from '../src/modules/counter/counter.model.js';
import { User } from '../src/modules/users/user.model.js';
import { hashPassword } from '../src/utils/password.js';

const arg = flag => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const username = (arg('--username') || '').trim();
const name = (arg('--name') || 'Super Admin').trim();
let password = arg('--password');

if (!/^[\w.-]{3,40}$/.test(username)) {
  console.error('Usage: npm run admin:create -- --username <username> [--name "Full name"] [--password "..."]');
  console.error('Username: 3+ letters, numbers, dots, dashes or underscores.');
  process.exit(1);
}
if (!password) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  password = await rl.question('Password for the super admin (min 6 characters): ');
  rl.close();
}
if (!password || password.length < 6) {
  console.error('Password must be at least 6 characters.');
  process.exit(1);
}

validateEnv();
await connectDatabase();
try {
  const existing = await User.findOne({ username_lower: username.toLowerCase() }).lean();
  if (existing && existing.role !== ROLES.SUPER_ADMIN) {
    console.error(`"${username}" is already a ${existing.role} account. Pick another username for the admin.`);
    process.exitCode = 1;
  } else if (existing) {
    await User.updateOne({ _id: existing._id }, { password_hash: hashPassword(password), status: USER_STATUS.ACTIVE, name });
    console.log(`Super admin "${username}" already existed: password reset and account active.`);
  } else {
    const id = await nextIds('users');
    await User.create({
      _id: id, name, username, username_lower: username.toLowerCase(),
      password_hash: hashPassword(password), role: ROLES.SUPER_ADMIN, status: USER_STATUS.ACTIVE,
    });
    console.log(`Super admin "${username}" created. Sign in to the app with it.`);
  }
} finally {
  await disconnectDatabase();
}
