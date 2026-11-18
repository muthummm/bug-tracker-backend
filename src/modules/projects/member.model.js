// Project members: who can see which project.
import mongoose from 'mongoose';

const memberSchema = new mongoose.Schema({
  project_id: { type: Number, required: true },
  user_id: { type: Number, required: true, index: true },
  added_by: { type: Number, default: null },
  added_at: { type: Date, default: Date.now },
}, { versionKey: false });

memberSchema.index({ project_id: 1, user_id: 1 }, { unique: true });

export const Member = mongoose.model('Member', memberSchema, 'project_members');
