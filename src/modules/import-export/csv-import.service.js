// Imports a bug spreadsheet (CSV exported from Excel / Google Sheets) into a project.
import { ROLES } from '../../constants/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { parseCsv } from '../../utils/csv.js';
import { latestTodayIso, todayIso } from '../../utils/date.js';
import { cleanMultiline, escapeRegex } from '../../utils/sanitize.js';
import { Bug } from '../bugs/bug.model.js';
import { History } from '../bugs/history.model.js';
import { nextIds } from '../counter/counter.model.js';
import { addMember } from '../projects/member.service.js';
import { User } from '../users/user.model.js';
import { HEADER_MAP, mapDate, mapPriority, mapStatus, normalize } from './csv-mapping.js';

/** Finds an assignee by name or username, or creates a placeholder Developer account for them.
 *  Returns null for a manager: bugs are never assigned to managers, so the row is imported unassigned. */
async function findOrCreateAssignee(name, createdUsers) {
  const n = name.trim();
  const existing = await User.findOne(
    { $or: [{ name: new RegExp(`^${escapeRegex(n)}$`, 'i') }, { username_lower: n.toLowerCase() }] },
    { _id: 1, role: 1 },
  ).lean();
  if (existing) return existing.role === ROLES.MANAGER ? null : existing._id;

  let base = n.toLowerCase().replace(/[^a-z0-9._-]+/g, '') || 'user';
  if (base.length < 3) base = `${base}user`.slice(0, 6);
  let username = base;
  for (let k = 2; await User.exists({ username_lower: username }); k++) username = base + k;

  const id = await nextIds('users');
  // Empty password: the real person sets one by registering with this username.
  await User.create({ _id: id, name: n, username, username_lower: username, password_hash: '', role: ROLES.DEVELOPER });
  createdUsers.push({ name: n, username });
  return id;
}

const findHeaderRow = rows => rows.findIndex(r => {
  const headers = r.map(normalize);
  return headers.includes('module') && (headers.includes('description') || headers.includes('bug description'));
});

/** A lone label above the header (e.g. "Agent panel") is the panel for the rows below. */
function panelAbove(rows, headerIdx) {
  for (let i = headerIdx - 1; i >= 0; i--) {
    const filled = rows[i].map(c => c.trim()).filter(Boolean);
    if (filled.length === 1) return filled[0];
  }
  return '';
}

/**
 * @returns {{ imported: number, skipped: number, duplicates: number, createdUsers: {name, username}[], notes: string[] }}
 */
export async function importCsv(text, projectId, reporterId = null) {
  if (!projectId) throw ApiError.badRequest('Pick a project to import into.');

  const rows = parseCsv(text);
  const headerIdx = findHeaderRow(rows);
  if (headerIdx < 0) throw ApiError.badRequest('Could not find a header row with "Module" and "Description" columns.');

  const columns = rows[headerIdx].map(h => HEADER_MAP[normalize(h)] || null);
  const colIndex = field => columns.indexOf(field);

  const result = { imported: 0, skipped: 0, duplicates: 0, createdUsers: [], notes: [] };
  const today = todayIso();
  const latestToday = latestTodayIso();
  const assignees = new Map(); // lower-case name -> user id, so each assignee is looked up once
  const seen = new Set(); // module + description already taken by this import
  const pending = [];
  let panel = panelAbove(rows, headerIdx);
  let module = '';
  let lastDate = null;

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const get = field => (colIndex(field) >= 0 ? row[colIndex(field)] || '' : '');
    const filled = row.map(c => c.trim()).filter(Boolean);
    if (!filled.length) continue;

    const description = cleanMultiline(get('description'));
    // A row with only a label in the first column starts a new panel/section
    if (!description && filled.length === 1 && row[0].trim()) { panel = row[0].trim(); module = ''; continue; }
    if (get('module').trim()) module = cleanMultiline(get('module'));
    if (!description) { result.skipped++; continue; }

    const mod = module || 'General';
    const dupKey = `${mod.toLowerCase()}\n${description}`;
    const exists = seen.has(dupKey)
      || await Bug.exists({ project_id: projectId, module: new RegExp(`^${escapeRegex(mod)}$`, 'i'), description });
    if (exists) { result.duplicates++; continue; }
    seen.add(dupKey);

    // Values the app can't store go into Notes so nothing from the sheet is lost
    const notes = [cleanMultiline(get('notes'))];

    const { status, unknown } = mapStatus(get('status'));
    if (unknown) notes.push(`Status in sheet: ${unknown}`);

    const rawPriority = get('priority').trim();
    const priority = mapPriority(rawPriority);
    if (rawPriority && !priority) notes.push(`Priority in sheet: ${rawPriority}`);

    let link = cleanMultiline(get('link'));
    if (link && !/^https?:\/\//i.test(link)) { notes.push(`Screenshot/Link: ${link}`); link = ''; }

    const rawDate = get('date').trim();
    let date = mapDate(rawDate);
    if (date && date > latestToday) date = null; // future dates aren't allowed
    if (rawDate && !date) notes.push(`Date in sheet: ${rawDate}`);
    date = date || lastDate || today;
    lastDate = date;

    const assigneeName = get('assignee').trim();
    let assigneeId = null;
    if (assigneeName) {
      const key = assigneeName.toLowerCase();
      if (!assignees.has(key)) {
        assignees.set(key, await findOrCreateAssignee(assigneeName, result.createdUsers));
        if (assignees.get(key)) await addMember(projectId, assignees.get(key), reporterId); // assignees need to see the project
      }
      assigneeId = assignees.get(key);
    }

    const sheetStatus = get('status').trim();
    pending.push({
      bug: {
        project_id: projectId, panel, module: mod, description,
        steps: cleanMultiline(get('steps')), expected: cleanMultiline(get('expected')), actual: cleanMultiline(get('actual')),
        status, assignee_id: assigneeId, priority, date_reported: date, link,
        notes: notes.filter(Boolean).join('\n'), reporter_id: reporterId,
      },
      comment: `Imported from spreadsheet${sheetStatus ? ` (status was "${sheetStatus}")` : ''}`,
    });
  }

  if (pending.length) {
    const firstId = await nextIds('bugs', pending.length); // one id range for the whole sheet
    const now = new Date();
    await Bug.insertMany(pending.map((p, i) => ({ _id: firstId + i, ...p.bug, created_at: now, updated_at: now })));
    await History.insertMany(pending.map((p, i) => ({
      bug_id: firstId + i, user_id: reporterId, to_status: p.bug.status, comment: p.comment, created_at: now,
    })));
  }
  result.imported = pending.length;
  return result;
}
