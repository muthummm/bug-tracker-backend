// Sign-in sessions (token -> user). MongoDB deletes them automatically after SESSION_TTL_SECONDS.
import mongoose from 'mongoose';
import { SESSION_TTL_SECONDS } from '../../constants/index.js';

const sessionSchema = new mongoose.Schema({
  _id: String, // random token
  user_id: { type: Number, required: true, index: true },
  created_at: { type: Date, default: Date.now, expires: SESSION_TTL_SECONDS },
}, { versionKey: false });

export const Session = mongoose.model('Session', sessionSchema, 'sessions');
