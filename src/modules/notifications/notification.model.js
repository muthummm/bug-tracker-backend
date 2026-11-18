// In-app notifications: one row per recipient each time a bug changes, or when someone is added to a project.
import mongoose from 'mongoose';

export const NOTIFICATION_TYPES = ['reported', 'status', 'comment', 'edited', 'notes', 'added_to_project'];
const KEEP_DAYS = 90;

const notificationSchema = new mongoose.Schema({
  user_id: { type: Number, required: true },   // who receives it
  actor_id: { type: Number, default: null },   // who made the change
  project_id: { type: Number, required: true },
  bug_id: { type: Number, default: null, index: true }, // null for project-level notifications
  type: { type: String, enum: NOTIFICATION_TYPES, required: true },
  from_status: { type: String, default: null },
  to_status: { type: String, default: null },
  comment: { type: String, default: '' },
  read: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
}, { versionKey: false });

notificationSchema.index({ user_id: 1, created_at: -1 });
notificationSchema.index({ user_id: 1, read: 1 });
// Old notifications are removed automatically
notificationSchema.index({ created_at: 1 }, { expireAfterSeconds: KEEP_DAYS * 24 * 60 * 60 });

export const Notification = mongoose.model('Notification', notificationSchema, 'notifications');
