import mongoose from 'mongoose';
import { PRIORITIES, STATUSES } from '../../constants/index.js';
import { ISO_DATE } from '../../utils/date.js';

const bugSchema = new mongoose.Schema({
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
  date_reported: { type: String, required: true, match: ISO_DATE }, // calendar date, YYYY-MM-DD
  link: { type: String, default: '' },
  screenshot: { type: String, default: '' }, // Cloudinary URL (or "/uploads/<id>" for older images)
  notes: { type: String, default: '' },
  reporter_id: { type: Number, default: null },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
}, { versionKey: false });

bugSchema.index({ project_id: 1, status: 1 });
bugSchema.index({ project_id: 1, assignee_id: 1 });

export const Bug = mongoose.model('Bug', bugSchema, 'bugs');

export const bugKey = id => `BUG-${String(id).padStart(3, '0')}`;
