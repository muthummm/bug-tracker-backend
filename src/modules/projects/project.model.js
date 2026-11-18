import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema({
  _id: Number,
  name: { type: String, required: true, trim: true, maxlength: 120 },
  name_lower: { type: String, required: true, unique: true }, // project names are unique, ignoring case
  description: { type: String, default: '', maxlength: 500 },
  created_by: { type: Number, default: null },
  created_at: { type: Date, default: Date.now },
}, { versionKey: false });

export const Project = mongoose.model('Project', projectSchema, 'projects');
