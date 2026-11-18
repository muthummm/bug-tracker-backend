// Bug history: every status change, comment, notes update and edit.
import mongoose from 'mongoose';

const historySchema = new mongoose.Schema({
  bug_id: { type: Number, required: true, index: true },
  user_id: { type: Number, default: null },
  from_status: { type: String, default: null },
  to_status: { type: String, default: null },
  comment: { type: String, default: '' },
  created_at: { type: Date, default: Date.now },
}, { versionKey: false });

export const History = mongoose.model('History', historySchema, 'history');
