// LEGACY: screenshots uploaded before the move to Cloudinary were stored in MongoDB.
// Kept read-only so those images still load. `npm run migrate:uploads` moves them to Cloudinary.
import mongoose from 'mongoose';
import { IMAGE_TYPES } from '../../constants/index.js';

const uploadSchema = new mongoose.Schema({
  _id: String, // random hex id, used in the image URL
  content_type: { type: String, enum: IMAGE_TYPES, required: true },
  size: { type: Number, required: true },
  data: { type: Buffer, required: true },
  uploaded_by: { type: Number, default: null },
  created_at: { type: Date, default: Date.now },
}, { versionKey: false });

export const Upload = mongoose.model('Upload', uploadSchema, 'uploads');
