import { PRIORITIES, SIGNUP_ROLES, STATUSES, USER_STATUS } from '../../constants/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { ISO_DATE, latestTodayIso, todayIso } from '../../utils/date.js';
import { cleanString, toPositiveInt } from '../../utils/sanitize.js';
import { isMember } from '../projects/member.service.js';
import { isValidScreenshotUrl } from '../uploads/upload.service.js';
import { User } from '../users/user.model.js';

/**
 * Validates the body of a create/edit request and returns the clean bug fields.
 * `currentAssigneeId`: when editing, keeping the existing assignee is always allowed (even if that
 * account was deactivated since), so unrelated edits don't fail.
 */
export async function parseBugInput(body, projectId, currentAssigneeId = null) {
  const bug = {
    panel: cleanString(body.panel, 100),
    module: cleanString(body.module, 200),
    description: cleanString(body.description, 2000),
    steps: cleanString(body.steps),
    expected: cleanString(body.expected),
    actual: cleanString(body.actual),
    status: STATUSES.includes(body.status) ? body.status : 'Open',
    priority: PRIORITIES.includes(body.priority) || body.priority === '' ? body.priority : 'Medium',
    assignee_id: toPositiveInt(body.assignee_id),
    date_reported: ISO_DATE.test(body.date_reported || '') ? body.date_reported : todayIso(),
    link: cleanString(body.link, 1000),
    screenshot: isValidScreenshotUrl(body.screenshot) ? body.screenshot : '',
    notes: cleanString(body.notes),
  };

  if (!bug.module || !bug.description) throw ApiError.badRequest('Module and Description are required.');
  if (bug.date_reported > latestTodayIso()) throw ApiError.badRequest('Date reported cannot be in the future.');
  if (bug.link && !/^https?:\/\//i.test(bug.link))
    throw ApiError.badRequest('Screenshot/Link must start with http:// or https://');
  if (bug.assignee_id && bug.assignee_id !== currentAssigneeId) {
    if (!(await isMember(projectId, bug.assignee_id)))
      throw ApiError.badRequest('The assignee must be a member of this project. Ask the admin to add them in Team.');
    const assignee = await User.findById(bug.assignee_id, { role: 1, status: 1, name: 1 }).lean();
    if (!assignee || !SIGNUP_ROLES.includes(assignee.role))
      throw ApiError.badRequest('Bugs can only be assigned to a developer or tester.');
    if (assignee.status !== USER_STATUS.ACTIVE)
      throw ApiError.badRequest(`${assignee.name}'s account is inactive. Pick someone else.`);
  }

  return bug;
}
