import { PRIORITIES, ROLES, STATUSES } from '../../constants/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { ISO_DATE, latestTodayIso, todayIso } from '../../utils/date.js';
import { cleanString, toPositiveInt } from '../../utils/sanitize.js';
import { isMember } from '../projects/member.service.js';
import { isValidScreenshotUrl } from '../uploads/upload.service.js';
import { User } from '../users/user.model.js';

/** Validates the body of a create/edit request and returns the clean bug fields. */
export async function parseBugInput(body, projectId) {
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
  if (bug.assignee_id && !(await isMember(projectId, bug.assignee_id)))
    throw ApiError.badRequest('The assignee must be a member of this project. Add them in Team first.');
  if (bug.assignee_id && (await User.exists({ _id: bug.assignee_id, role: ROLES.MANAGER })))
    throw ApiError.badRequest('Bugs cannot be assigned to a manager. Pick a developer or tester.');

  return bug;
}
