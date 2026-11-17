// MongoDB schemas (Mongoose).
// Users, projects and bugs use numeric ids from a counter collection, so bug keys stay BUG-001, BUG-002, ...
// and the frontend can keep using numeric ids in links (#project-2).
import mongoose from 'mongoose';
import { STATUSES, PRIORITIES, ROLES, IMAGE_TYPES } from './constants.js';

const { Schema, model } = mongoose;
const base = { versionKey: false };

// ---------- counters (auto-increment ids) ----------
const counterSchema = new Schema({ _id: String, seq: { type: Number, default: 0 } }, base);
export const Counter = model('Counter', counterSchema, 'counters');

/** Reserves `n` ids for `name` and returns the first one. */
export async function nextIds(name, n = 1) {
  const c = await Counter.findOneAndUpdate({ _id: name }, { $inc: { seq: n } }, { upsert: true, new: true }).lean();
  return c.seq - n + 1;
}

// ---------- users ----------
const userSchema = new Schema({
  _id: Number,
  name: { type: String, required: true, trim: true, maxlength: 80 },
  username: { type: String, required: true, trim: true, maxlength: 40 },
  username_lower: { type: String, required: true, unique: true }, // usernames are case-insensitive
  password_hash: { type: String, default: '' }, // '' = placeholder made by a CSV import; the person sets it at sign-up
  role: { type: String, enum: ROLES, required: true },
  created_at: { type: Date, default: Date.now },
}, base);
export const User = model('User', userSchema, 'users');

// ---------- sign-in sessions (token -> user), removed automatically after 90 days ----------
const sessionSchema = new Schema({
  _id: String, // random token
  user_id: { type: Number, required: true, index: true },
  created_at: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 90 },
}, base);
export const Session = model('Session', sessionSchema, 'sessions');

// ---------- projects ----------
const projectSchema = new Schema({
  _id: Number,
  name: { type: String, required: true, trim: true, maxlength: 120 },
  name_lower: { type: String, required: true, unique: true }, // project names are unique, ignoring case
  description: { type: String, default: '', maxlength: 500 },
  created_by: { type: Number, default: null },
  created_at: { type: Date, default: Date.now },
}, base);
export const Project = model('Project', projectSchema, 'projects');

// ---------- project members (who can see a project) ----------
const memberSchema = new Schema({
  project_id: { type: Number, required: true },
  user_id: { type: Number, required: true, index: true },
  added_by: { type: Number, default: null },
  added_at: { type: Date, default: Date.now },
}, base);
memberSchema.index({ project_id: 1, user_id: 1 }, { unique: true });
export const Member = model('Member', memberSchema, 'project_members');

export const isMember = async (projectId, userId) => !!(await Member.exists({ project_id: projectId, user_id: userId }));
export async function addMember(projectId, userId, addedBy = null) {
  await Member.updateOne({ project_id: projectId, user_id: userId },
    { $setOnInsert: { added_by: addedBy, added_at: new Date() } }, { upsert: true });
}

// ---------- bugs ----------
const bugSchema = new Schema({
  _id: Number,
  project_id: { type: Number, required: true },
  panel: { type: String, default: '' },
  module: { type: String, required: true },
  description: { type: String, required: true },
  steps: { type: String, default: '' },
  expected: { type: String, default: '' },
  actual: { type: String, default: '' },
  status: { type: String, enum: STATUSES, default: 'Open' },
  assignee_id: { type: Number, default: null },
  priority: { type: String, enum: [...PRIORITIES, ''], default: 'Medium' },
  date_reported: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ }, // calendar date, YYYY-MM-DD
  link: { type: String, default: '' },
  screenshot: { type: String, default: '' }, // "/uploads/<upload id>"
  notes: { type: String, default: '' },
  reporter_id: { type: Number, default: null },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
}, base);
bugSchema.index({ project_id: 1, status: 1 });
bugSchema.index({ project_id: 1, assignee_id: 1 });
export const Bug = model('Bug', bugSchema, 'bugs');

// ---------- bug history (status changes, comments, edits) ----------
const historySchema = new Schema({
  bug_id: { type: Number, required: true, index: true },
  user_id: { type: Number, default: null },
  from_status: { type: String, default: null },
  to_status: { type: String, default: null },
  comment: { type: String, default: '' },
  created_at: { type: Date, default: Date.now },
}, base);
export const History = model('History', historySchema, 'history');

// ---------- screenshot images (stored in the database, since free hosts have no permanent disk) ----------
const uploadSchema = new Schema({
  _id: String, // random hex id, used in the image URL
  content_type: { type: String, enum: IMAGE_TYPES, required: true },
  size: { type: Number, required: true },
  data: { type: Buffer, required: true },
  uploaded_by: { type: Number, default: null },
  created_at: { type: Date, default: Date.now },
}, base);
export const Upload = model('Upload', uploadSchema, 'uploads');

export const models = [Counter, User, Session, Project, Member, Bug, History, Upload];
