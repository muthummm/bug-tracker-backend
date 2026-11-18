import mongoose from 'mongoose';
import { ROLE_LIST } from '../../constants/index.js';

const userSchema = new mongoose.Schema({
  _id: Number,
  name: { type: String, required: true, trim: true, maxlength: 80 },
  username: { type: String, required: true, trim: true, maxlength: 40 },
  username_lower: { type: String, required: true, unique: true }, // usernames are case-insensitive
  password_hash: { type: String, default: '' }, // '' = placeholder made by a CSV import; the person sets it at sign-up
  role: { type: String, enum: ROLE_LIST, required: true },
  created_at: { type: Date, default: Date.now },
}, { versionKey: false });

export const User = mongoose.model('User', userSchema, 'users');
