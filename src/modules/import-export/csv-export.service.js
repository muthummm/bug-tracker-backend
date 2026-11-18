import { toCsv } from '../../utils/csv.js';
import { todayIso } from '../../utils/date.js';
import { Bug } from '../bugs/bug.model.js';
import { shapeBugs } from '../bugs/bug.service.js';

// [column header, bug field]
const COLUMNS = [
  ['ID', 'key'], ['Panel', 'panel'], ['Module', 'module'], ['Description', 'description'],
  ['Steps to Reproduce', 'steps'], ['Expected Result', 'expected'], ['Actual Result', 'actual'],
  ['Status', 'status'], ['Assignee', 'assignee_name'], ['Priority', 'priority'],
  ['Date Reported', 'date_reported'], ['Screenshot/Link', 'link'], ['Notes', 'notes'], ['Reported By', 'reporter_name'],
];

/** All of a project's bugs as a CSV that opens in Excel, plus a download file name. */
export async function exportProjectCsv(project) {
  const bugs = await shapeBugs(await Bug.find({ project_id: project._id }).sort({ _id: 1 }).lean());
  const csv = toCsv([
    COLUMNS.map(([header]) => header),
    ...bugs.map(bug => COLUMNS.map(([, field]) => bug[field])),
  ]);
  const safeName = project.name.replace(/[^\w.-]+/g, '-').replace(/^-|-$/g, '') || 'bugs';
  return { csv, filename: `${safeName}-${todayIso()}.csv` };
}
