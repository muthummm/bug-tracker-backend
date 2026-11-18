// How spreadsheet columns and values map to bug fields. Kept separate so it's easy to extend.

// Sheet column name (lower case) -> bug field
export const HEADER_MAP = {
  'panel': 'panel',
  'module': 'module',
  'description': 'description', 'bug description': 'description', 'summary': 'description',
  'steps to reproduce': 'steps', 'steps': 'steps',
  'expected result': 'expected', 'expected': 'expected',
  'actual result': 'actual', 'actual': 'actual',
  'status': 'status',
  'assignee': 'assignee', 'assigned to': 'assignee',
  'priority': 'priority',
  'date reported': 'date', 'date': 'date', 'reported date': 'date',
  'screenshot/link': 'link', 'screenshot': 'link', 'link': 'link',
  'notes': 'notes', 'remarks': 'notes', 'comments': 'notes',
};

const STATUS_MAP = {
  'done': 'Fixed', 'fixed': 'Fixed', 'resolved': 'Fixed', 'completed': 'Fixed',
  'not done': 'Open', 'open': 'Open', 'new': 'Open', 'pending': 'Open', 'todo': 'Open', 'to do': 'Open',
  're-test': 'Ready for Retest', 'retest': 'Ready for Retest', 're test': 'Ready for Retest', 'ready for retest': 'Ready for Retest',
  'in progress': 'In Progress', 'inprogress': 'In Progress', 'wip': 'In Progress',
  'reopened': 'Reopened', 'reopen': 'Reopened', 're-open': 'Reopened', 're-opened': 'Reopened',
  'closed': 'Closed', 'verified': 'Closed',
  'not a bug': 'Not a Bug', 'invalid': 'Not a Bug', 'rejected': 'Not a Bug', 'duplicate': 'Not a Bug',
};

const PRIORITY_MAP = {
  p0: 'Critical', p1: 'Critical', p2: 'High', p3: 'Medium', p4: 'Low', p5: 'Low',
  critical: 'Critical', blocker: 'Critical', high: 'High', major: 'High',
  medium: 'Medium', normal: 'Medium', low: 'Low', minor: 'Low', trivial: 'Low',
};

/** Collapses whitespace and lower-cases, for matching headers and values. */
export const normalize = s => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** { status } or { status: 'Open', unknown: <original> } when the sheet's value isn't recognised. */
export function mapStatus(raw) {
  const s = normalize(raw);
  if (!s) return { status: 'Open' };
  return STATUS_MAP[s] ? { status: STATUS_MAP[s] } : { status: 'Open', unknown: raw.trim() };
}

/** A known priority, or '' when not recognised. */
export const mapPriority = raw => PRIORITY_MAP[normalize(raw).replace(/\s/g, '')] || '';

/** Dates like 17/11/2026 (day first, as in Indian/UK sheets), 2026-11-17, or 17-11-2026. Returns YYYY-MM-DD or null. */
export function mapDate(raw) {
  const s = (raw || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;

  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    let [, a, b, y] = m;
    if (y.length === 2) y = `20${y}`;
    let day = +a;
    let month = +b;
    if (month > 12 && day <= 12) [day, month] = [month, day]; // clearly month-first
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31)
      return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return null;
}
