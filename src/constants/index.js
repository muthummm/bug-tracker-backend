// ---------- users ----------
export const ROLES = Object.freeze({ TESTER: 'Tester', DEVELOPER: 'Developer', MANAGER: 'Manager' });
export const ROLE_LIST = Object.values(ROLES);
// Managers can do everything a tester can. They oversee the work, so bugs are never assigned to them.
export const FULL_ACCESS_ROLES = [ROLES.TESTER, ROLES.MANAGER];
export const hasFullAccess = role => FULL_ACCESS_ROLES.includes(role);

// ---------- bugs ----------
export const STATUSES = ['Open', 'In Progress', 'Fixed', 'Ready for Retest', 'Reopened', 'Closed', 'Not a Bug'];
export const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
export const PRIORITY_RANK = Object.freeze({ Critical: 0, High: 1, Medium: 2, Low: 3 });

// Statuses a developer may move a bug to. Closing and reopening is the tester's call (they verify the fix).
export const DEV_STATUSES = ['Open', 'In Progress', 'Fixed', 'Ready for Retest', 'Not a Bug'];
// Used for the counts on project cards
export const ACTIVE_STATUSES = ['Open', 'Reopened', 'In Progress'];
export const TO_VERIFY_STATUSES = ['Ready for Retest', 'Fixed'];

// ---------- uploads ----------
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_CSV_BYTES = '5mb';

// ---------- auth ----------
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days

// ---------- messages shared by several modules ----------
export const MESSAGES = Object.freeze({
  SIGN_IN: 'Please sign in.',
  TESTER_ONLY: 'Only testers and managers can do this. Developers can change the status and add notes.',
  PROJECT_NOT_FOUND: 'Project not found, or you have not been added to it.',
  BUG_NOT_FOUND: 'Bug not found.',
});
