export const STATUSES = ['Open', 'In Progress', 'Fixed', 'Ready for Retest', 'Reopened', 'Closed', 'Not a Bug'];
export const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
export const ROLES = ['Tester', 'Developer'];
// Statuses a developer may move a bug to. Closing and reopening is the tester's call (they verify the fix).
export const DEV_STATUSES = ['Open', 'In Progress', 'Fixed', 'Ready for Retest', 'Not a Bug'];
// Used for the counts on project cards
export const ACTIVE_STATUSES = ['Open', 'Reopened', 'In Progress'];
export const TO_VERIFY_STATUSES = ['Ready for Retest', 'Fixed'];
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
