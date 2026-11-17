// Bug Log REST API. Response shapes match what the React frontend expects (snake_case fields, numeric ids).
import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { config } from './config.js';
import {
  STATUSES, PRIORITIES, ROLES, DEV_STATUSES, ACTIVE_STATUSES, TO_VERIFY_STATUSES, IMAGE_TYPES, MAX_IMAGE_BYTES,
} from './constants.js';
import { User, Session, Project, Member, Bug, History, Upload, nextIds, isMember, addMember } from './models.js';
import { importCsv, escapeRegex } from './importer.js';

export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// ---------- CORS: the frontend is hosted on a different address ----------
app.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin && (config.corsOrigins.includes('*') || config.corsOrigins.includes(origin))) {
    res.set({
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Max-Age': '600',
    });
    res.vary('Origin');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '1mb' }));

// ---------- helpers ----------
const h = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); // async error -> error handler
const today = () => new Date().toISOString().slice(0, 10);
const str = (v, max = 5000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const bugKey = id => 'BUG-' + String(id).padStart(3, '0');
const NO_PROJECT = 'Project not found, or you have not been added to it.';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(password, salt, 64).toString('hex');
}
function checkPassword(password, stored) {
  const [salt, hash] = (stored || '').split(':');
  if (!salt || !hash) return false;
  return crypto.timingSafeEqual(crypto.scryptSync(password, salt, 64), Buffer.from(hash, 'hex'));
}
async function newSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await Session.create({ _id: token, user_id: userId });
  return token;
}
const publicUser = u => u && { id: u._id, name: u.name, username: u.username, role: u.role };
const projectOut = p => ({ id: p._id, name: p.name, description: p.description, created_by: p.created_by, created_at: p.created_at });

const auth = h(async (req, res, next) => {
  const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const session = token && await Session.findById(token).lean();
  const user = session && await User.findById(session.user_id).lean();
  if (!user) return res.status(401).json({ error: 'Please sign in.' });
  req.user = { ...user, id: user._id };
  req.token = token;
  next();
});

// Only testers report bugs, import sheets and edit every field.
function testerOnly(req, res, next) {
  if (req.user.role !== 'Tester') return res.status(403).json({ error: 'Only testers can do this. Developers can change the status and add notes.' });
  next();
}

/** id -> {name, role} for the given user ids */
async function usersById(ids) {
  const unique = [...new Set(ids.filter(id => id != null))];
  const users = unique.length ? await User.find({ _id: { $in: unique } }, { name: 1, role: 1 }).lean() : [];
  return new Map(users.map(u => [u._id, u]));
}
async function shapeBugs(bugs) {
  const users = await usersById(bugs.flatMap(b => [b.assignee_id, b.reporter_id]));
  return bugs.map(({ _id, ...b }) => ({
    id: _id, ...b, key: bugKey(_id),
    assignee_name: users.get(b.assignee_id)?.name ?? null,
    reporter_name: users.get(b.reporter_id)?.name ?? null,
  }));
}
const oneBug = async id => (await shapeBugs([await Bug.findById(id).lean()]))[0];
const addHistory = (bugId, userId, fromStatus, toStatus, comment, at = new Date()) =>
  History.create({ bug_id: bugId, user_id: userId, from_status: fromStatus, to_status: toStatus, comment, created_at: at });

// Projects (and their bugs) exist only for members. Non-members get the same 404 as a missing
// project, so a developer can't even tell that a project they weren't added to exists.
async function memberProject(req, res, rawId) {
  const id = Number(rawId);
  const project = Number.isInteger(id) && id > 0 ? await Project.findById(id).lean() : null;
  if (!project || !(await isMember(project._id, req.user.id))) { res.status(404).json({ error: NO_PROJECT }); return null; }
  return project;
}
async function memberBug(req, res) {
  const id = Number(req.params.id);
  const bug = Number.isInteger(id) && id > 0 ? await Bug.findById(id).lean() : null;
  if (!bug || !(await isMember(bug.project_id, req.user.id))) { res.status(404).json({ error: 'Bug not found.' }); return null; }
  return bug;
}

async function readBugBody(body, projectId) {
  const assignee = Number(body.assignee_id);
  const bug = {
    panel: str(body.panel, 100),
    module: str(body.module, 200),
    description: str(body.description, 2000),
    steps: str(body.steps),
    expected: str(body.expected),
    actual: str(body.actual),
    status: STATUSES.includes(body.status) ? body.status : 'Open',
    priority: PRIORITIES.includes(body.priority) || body.priority === '' ? body.priority : 'Medium',
    assignee_id: Number.isInteger(assignee) && assignee > 0 ? assignee : null,
    date_reported: /^\d{4}-\d{2}-\d{2}$/.test(body.date_reported || '') ? body.date_reported : today(),
    link: str(body.link, 1000),
    screenshot: /^\/uploads\/[a-f0-9]{24}$/.test(body.screenshot || '') ? body.screenshot : '',
    notes: str(body.notes),
  };
  if (!bug.module || !bug.description) return { error: 'Module and Description are required.' };
  // Latest "today" anywhere on Earth (UTC+14), so users ahead of the server's timezone aren't blocked
  const latestToday = new Date(Date.now() + 14 * 3600 * 1000).toISOString().slice(0, 10);
  if (bug.date_reported > latestToday) return { error: 'Date reported cannot be in the future.' };
  if (bug.link && !/^https?:\/\//i.test(bug.link)) return { error: 'Screenshot/Link must start with http:// or https://' };
  if (bug.assignee_id && !(await isMember(projectId, bug.assignee_id)))
    return { error: 'The assignee must be a member of this project. Add them in Team first.' };
  return { bug };
}

// ---------- health (for the host's uptime check) ----------
app.get('/api/health', (_req, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1 }));
app.get('/', (_req, res) => res.json({ name: 'Bug Log API', health: '/api/health' }));

// ---------- auth ----------
app.post('/api/auth/register', h(async (req, res) => {
  const name = str(req.body.name, 80), username = str(req.body.username, 40), password = req.body.password || '';
  const role = ROLES.includes(req.body.role) ? req.body.role : null;
  if (!name || !username || !role) return res.status(400).json({ error: 'Name, username and role are required.' });
  if (!/^[\w.-]{3,40}$/.test(username)) return res.status(400).json({ error: 'Username: 3+ letters, numbers, dots, dashes or underscores.' });
  if (typeof password !== 'string' || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  const lower = username.toLowerCase();
  const existing = await User.findOne({ username_lower: lower }).lean();
  let userId;
  if (existing && existing.password_hash === '') {
    // A placeholder made by the spreadsheet import (e.g. an assignee): the real person claims it
    await User.updateOne({ _id: existing._id }, { name, password_hash: hashPassword(password), role });
    userId = existing._id;
  } else if (existing) {
    return res.status(409).json({ error: 'That username is taken.' });
  } else {
    userId = await nextIds('users');
    try {
      await User.create({ _id: userId, name, username, username_lower: lower, password_hash: hashPassword(password), role });
    } catch (e) {
      if (e.code === 11000) return res.status(409).json({ error: 'That username is taken.' });
      throw e;
    }
  }
  const user = await User.findById(userId).lean();
  res.status(201).json({ token: await newSession(userId), user: publicUser(user) });
}));

app.post('/api/auth/login', h(async (req, res) => {
  const user = await User.findOne({ username_lower: str(req.body.username, 40).toLowerCase() }).lean();
  if (user && user.password_hash === '')
    return res.status(401).json({ error: 'This account has no password yet. Use "Create an account" with this username to set one.' });
  if (!user || !checkPassword(String(req.body.password || ''), user.password_hash))
    return res.status(401).json({ error: 'Wrong username or password.' });
  res.json({ token: await newSession(user._id), user: publicUser(user) });
}));

app.post('/api/auth/logout', auth, h(async (req, res) => {
  await Session.deleteOne({ _id: req.token });
  res.json({ ok: true });
}));

app.get('/api/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));

// Everyone with an account; testers use it to pick who to add to a project.
app.get('/api/users', auth, testerOnly, h(async (_req, res) => {
  const users = await User.find({}, { name: 1, username: 1, role: 1 }).sort({ role: -1, name: 1 }).lean();
  res.json(users.map(publicUser));
}));

app.get('/api/meta', (_req, res) => res.json({ statuses: STATUSES, priorities: PRIORITIES, devStatuses: DEV_STATUSES }));

// ---------- projects ----------
// Only the projects this person is a member of, with bug counts
app.get('/api/projects', auth, h(async (req, res) => {
  const me = req.user.id;
  const ids = (await Member.find({ user_id: me }, { project_id: 1 }).lean()).map(m => m.project_id);
  const [projects, stats, memberCounts] = await Promise.all([
    Project.find({ _id: { $in: ids } }).lean(),
    Bug.aggregate([
      { $match: { project_id: { $in: ids } } },
      { $group: {
        _id: '$project_id',
        total: { $sum: 1 },
        active: { $sum: { $cond: [{ $in: ['$status', ACTIVE_STATUSES] }, 1, 0] } },
        to_verify: { $sum: { $cond: [{ $in: ['$status', TO_VERIFY_STATUSES] }, 1, 0] } },
        mine: { $sum: { $cond: [{ $and: [{ $eq: ['$assignee_id', me] }, { $in: ['$status', ACTIVE_STATUSES] }] }, 1, 0] } },
        last_activity: { $max: '$updated_at' },
      } },
    ]),
    Member.aggregate([{ $match: { project_id: { $in: ids } } }, { $group: { _id: '$project_id', n: { $sum: 1 } } }]),
  ]);
  const byId = new Map(stats.map(s => [s._id, s]));
  const members = new Map(memberCounts.map(m => [m._id, m.n]));
  const out = projects.map(p => {
    const s = byId.get(p._id) || {};
    return {
      ...projectOut(p), members: members.get(p._id) || 0,
      total: s.total || 0, active: s.active || 0, to_verify: s.to_verify || 0, mine: s.mine || 0, last_activity: s.last_activity || null,
    };
  });
  out.sort((a, b) => new Date(b.last_activity || b.created_at) - new Date(a.last_activity || a.created_at));
  res.json(out);
}));

app.post('/api/projects', auth, testerOnly, h(async (req, res) => {
  const name = str(req.body.name, 120), description = str(req.body.description, 500);
  if (!name) return res.status(400).json({ error: 'Give the project a name.' });
  const taken = { error: 'A project with that name already exists.' };
  if (await Project.exists({ name_lower: name.toLowerCase() })) return res.status(409).json(taken);
  const id = await nextIds('projects');
  try {
    await Project.create({ _id: id, name, name_lower: name.toLowerCase(), description, created_by: req.user.id });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json(taken);
    throw e;
  }
  await addMember(id, req.user.id, req.user.id);
  res.status(201).json({ project: projectOut(await Project.findById(id).lean()) });
}));

app.put('/api/projects/:id', auth, testerOnly, h(async (req, res) => {
  const p = await memberProject(req, res, req.params.id);
  if (!p) return;
  const name = str(req.body.name, 120) || p.name;
  if (name.toLowerCase() !== p.name_lower && await Project.exists({ name_lower: name.toLowerCase() }))
    return res.status(409).json({ error: 'A project with that name already exists.' });
  const description = typeof req.body.description === 'string' ? str(req.body.description, 500) : p.description;
  await Project.updateOne({ _id: p._id }, { name, name_lower: name.toLowerCase(), description });
  res.json({ project: projectOut(await Project.findById(p._id).lean()) });
}));

app.delete('/api/projects/:id', auth, testerOnly, h(async (req, res) => {
  const p = await memberProject(req, res, req.params.id);
  if (!p) return;
  if (await Bug.exists({ project_id: p._id })) return res.status(400).json({ error: 'Only empty projects can be deleted.' });
  await Promise.all([Project.deleteOne({ _id: p._id }), Member.deleteMany({ project_id: p._id })]);
  res.json({ ok: true });
}));

// ---------- project members ("Team") ----------
async function listMembers(projectId) {
  const rows = await Member.find({ project_id: projectId }).lean();
  const users = await User.find({ _id: { $in: rows.map(r => r.user_id) } }).lean();
  const adders = await usersById(rows.map(r => r.added_by));
  const byId = new Map(users.map(u => [u._id, u]));
  return rows.filter(r => byId.has(r.user_id)).map(r => {
    const u = byId.get(r.user_id);
    return { id: u._id, name: u.name, username: u.username, role: u.role, pending: u.password_hash === '',
      added_at: r.added_at, added_by_name: adders.get(r.added_by)?.name ?? null };
  }).sort((a, b) => b.role.localeCompare(a.role) || a.name.localeCompare(b.name));
}

app.get('/api/projects/:id/members', auth, h(async (req, res) => {
  const p = await memberProject(req, res, req.params.id);
  if (p) res.json(await listMembers(p._id));
}));

app.post('/api/projects/:id/members', auth, testerOnly, h(async (req, res) => {
  const p = await memberProject(req, res, req.params.id);
  if (!p) return;
  const user = Number(req.body.user_id) > 0
    ? await User.findById(Number(req.body.user_id)).lean()
    : await User.findOne({ username_lower: str(req.body.username, 40).toLowerCase() }).lean();
  if (!user) return res.status(404).json({ error: 'No account with that username. Ask them to create an account first.' });
  if (await isMember(p._id, user._id)) return res.status(409).json({ error: `${user.name} is already in this project.` });
  await addMember(p._id, user._id, req.user.id);
  res.status(201).json({ added: publicUser(user), members: await listMembers(p._id) });
}));

app.delete('/api/projects/:id/members/:userId', auth, testerOnly, h(async (req, res) => {
  const p = await memberProject(req, res, req.params.id);
  if (!p) return;
  const userId = Number(req.params.userId);
  if (!(await isMember(p._id, userId))) return res.status(404).json({ error: 'That person is not in this project.' });
  const others = (await Member.find({ project_id: p._id, user_id: { $ne: userId } }, { user_id: 1 }).lean()).map(m => m.user_id);
  if (!(await User.exists({ _id: { $in: others }, role: 'Tester' })))
    return res.status(400).json({ error: 'A project needs at least one tester. Add another tester before removing this one.' });
  await Member.deleteOne({ project_id: p._id, user_id: userId });
  // Their bugs in this project become unassigned so nothing is stuck with someone who can't see it
  const { modifiedCount } = await Bug.updateMany({ project_id: p._id, assignee_id: userId }, { assignee_id: null });
  res.json({ ok: true, unassigned: modifiedCount, members: await listMembers(p._id) });
}));

// ---------- bugs ----------
const PRIORITY_RANK = { Critical: 0, High: 1, Medium: 2 };

app.get('/api/bugs', auth, h(async (req, res) => {
  const project = await memberProject(req, res, req.query.project);
  if (!project) return;
  const filter = { project_id: project._id };
  if (STATUSES.includes(req.query.status)) filter.status = req.query.status;
  if (req.query.panel) filter.panel = str(req.query.panel, 100);
  if (PRIORITIES.includes(req.query.priority)) filter.priority = req.query.priority;
  if (req.query.assignee === 'none') filter.assignee_id = null;
  else if (Number(req.query.assignee) > 0) filter.assignee_id = Number(req.query.assignee);
  const q = str(req.query.q, 200);
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    const idMatch = q.match(/^bug-?0*(\d+)$/i);
    filter.$or = ['panel', 'module', 'description', 'steps', 'actual', 'notes'].map(f => ({ [f]: rx }));
    if (idMatch) filter.$or.push({ _id: Number(idMatch[1]) });
  }
  const sort = { old: { _id: 1 }, updated: { updated_at: -1 } }[req.query.sort] || { _id: -1 };
  let rows = await Bug.find(filter).sort(sort).lean();
  if (req.query.sort === 'priority')
    rows.sort((a, b) => (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3) || b._id - a._id);
  const [statusCounts, panels] = await Promise.all([
    Bug.aggregate([{ $match: { project_id: project._id } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    Bug.distinct('panel', { project_id: project._id, panel: { $ne: '' } }),
  ]);
  res.json({
    project: projectOut(project),
    bugs: await shapeBugs(rows),
    counts: Object.fromEntries(statusCounts.map(c => [c._id, c.n])),
    panels: panels.sort(),
  });
}));

app.get('/api/bugs/:id', auth, h(async (req, res) => {
  const bug = await memberBug(req, res);
  if (!bug) return;
  const history = await History.find({ bug_id: bug._id }).sort({ created_at: -1, _id: -1 }).lean();
  const users = await usersById(history.map(x => x.user_id));
  res.json({
    bug: (await shapeBugs([bug]))[0],
    history: history.map(({ _id, ...x }) => ({ id: String(_id), ...x, user_name: users.get(x.user_id)?.name ?? null, user_role: users.get(x.user_id)?.role ?? null })),
  });
}));

app.post('/api/bugs', auth, testerOnly, h(async (req, res) => {
  const project = await memberProject(req, res, req.body.project_id);
  if (!project) return;
  const { bug, error } = await readBugBody(req.body, project._id);
  if (error) return res.status(400).json({ error });
  const id = await nextIds('bugs');
  const t = new Date();
  await Bug.create({ _id: id, project_id: project._id, ...bug, reporter_id: req.user.id, created_at: t, updated_at: t });
  await addHistory(id, req.user.id, null, bug.status, 'Bug reported', t);
  res.status(201).json({ bug: await oneBug(id) });
}));

app.put('/api/bugs/:id', auth, testerOnly, h(async (req, res) => {
  const old = await memberBug(req, res);
  if (!old) return;
  const { bug, error } = await readBugBody(req.body, old.project_id);
  if (error) return res.status(400).json({ error });
  await Bug.updateOne({ _id: old._id }, { ...bug, updated_at: new Date() });
  const changed = bug.status !== old.status;
  await addHistory(old._id, req.user.id, changed ? old.status : null, changed ? bug.status : null, 'Edited bug details');
  if (old.screenshot && old.screenshot !== bug.screenshot) await removeUpload(old.screenshot);
  res.json({ bug: await oneBug(old._id) });
}));

// Quick status change (the main thing developers and testers do)
app.patch('/api/bugs/:id/status', auth, h(async (req, res) => {
  const old = await memberBug(req, res);
  if (!old) return;
  const status = req.body.status, comment = str(req.body.comment, 1000);
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Unknown status.' });
  if (status === old.status && !comment) return res.status(400).json({ error: 'Pick a new status or add a comment.' });
  if (status !== old.status && req.user.role === 'Developer' && !DEV_STATUSES.includes(status))
    return res.status(403).json({ error: `Only a tester can set a bug to ${status}. Mark it Fixed or Ready for Retest and the tester will verify it.` });
  await Bug.updateOne({ _id: old._id }, { status, updated_at: new Date() });
  const changed = status !== old.status;
  await addHistory(old._id, req.user.id, changed ? old.status : null, changed ? status : null, comment);
  res.json({ bug: await oneBug(old._id) });
}));

// Notes can be edited by anyone in the project (developers add root cause, build numbers, etc.)
app.patch('/api/bugs/:id/notes', auth, h(async (req, res) => {
  const old = await memberBug(req, res);
  if (!old) return;
  const notes = str(req.body.notes);
  if (notes === old.notes) return res.status(400).json({ error: 'Notes are unchanged.' });
  await Bug.updateOne({ _id: old._id }, { notes, updated_at: new Date() });
  await addHistory(old._id, req.user.id, null, null, 'Updated notes');
  res.json({ bug: await oneBug(old._id) });
}));

app.delete('/api/bugs/:id', auth, h(async (req, res) => {
  const old = await memberBug(req, res);
  if (!old) return;
  if (old.reporter_id !== req.user.id) return res.status(403).json({ error: 'Only the person who reported this bug can delete it.' });
  await Promise.all([Bug.deleteOne({ _id: old._id }), History.deleteMany({ bug_id: old._id })]);
  if (old.screenshot) await removeUpload(old.screenshot);
  res.json({ ok: true });
}));

// ---------- CSV export (opens in Excel) ----------
app.get('/api/export.csv', auth, h(async (req, res) => {
  const project = await memberProject(req, res, req.query.project);
  if (!project) return;
  const cols = [['ID', 'key'], ['Panel', 'panel'], ['Module', 'module'], ['Description', 'description'], ['Steps to Reproduce', 'steps'],
    ['Expected Result', 'expected'], ['Actual Result', 'actual'], ['Status', 'status'], ['Assignee', 'assignee_name'],
    ['Priority', 'priority'], ['Date Reported', 'date_reported'], ['Screenshot/Link', 'link'], ['Notes', 'notes'],
    ['Reported By', 'reporter_name']];
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const rows = await shapeBugs(await Bug.find({ project_id: project._id }).sort({ _id: 1 }).lean());
  const csv = '﻿' + [cols.map(c => q(c[0])).join(','), ...rows.map(b => cols.map(([, f]) => q(b[f])).join(','))].join('\r\n');
  const safeName = project.name.replace(/[^\w.-]+/g, '-').replace(/^-|-$/g, '') || 'bugs';
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${safeName}-${today()}.csv"`);
  res.send(csv);
}));

// ---------- CSV import (CSV text in the body) ----------
app.post('/api/import', auth, testerOnly, express.text({ type: '*/*', limit: '5mb' }), h(async (req, res) => {
  const project = await memberProject(req, res, req.query.project);
  if (!project) return;
  try {
    res.json(await importCsv(String(req.body || ''), project._id, req.user.id));
  } catch (e) {
    if (e instanceof mongoose.Error || e.name?.startsWith('Mongo')) throw e;
    res.status(400).json({ error: e.message });
  }
}));

// ---------- screenshots (stored in MongoDB) ----------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES },
  fileFilter: (_req, file, cb) => cb(null, IMAGE_TYPES.includes(file.mimetype)),
});
app.post('/api/upload', auth, (req, res, next) => {
  upload.single('file')(req, res, err => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Image must be under 5 MB.' : 'Upload failed.' });
    if (!req.file) return res.status(400).json({ error: 'Only PNG, JPG, GIF or WebP images are allowed.' });
    const id = crypto.randomBytes(12).toString('hex');
    Upload.create({ _id: id, content_type: req.file.mimetype, size: req.file.size, data: req.file.buffer, uploaded_by: req.user.id })
      .then(() => res.json({ url: '/uploads/' + id }), next);
  });
});
// Public like before (image tags can't send the sign-in token); ids are random and unguessable.
app.get('/uploads/:id', h(async (req, res) => {
  if (!/^[a-f0-9]{24}$/.test(req.params.id)) return res.status(404).end();
  const file = await Upload.findById(req.params.id);
  if (!file) return res.status(404).end();
  res.set({ 'Content-Type': file.content_type, 'Cache-Control': 'public, max-age=604800, immutable', 'X-Content-Type-Options': 'nosniff' });
  res.send(file.data);
}));
async function removeUpload(url) {
  const id = url.split('/').pop();
  if (/^[a-f0-9]{24}$/.test(id)) await Upload.deleteOne({ _id: id });
}

// ---------- fallbacks ----------
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});
