import mongoose from 'mongoose';
import { ROLE_LIST, USER_STATUS, USER_STATUS_LIST } from '../../constants/index.js';

const userSchema = new mongoose.Schema({
  _id: Number,
  name: { type: String, required: true, trim: true, maxlength: 80 },
  username: { type: String, required: true, trim: true, maxlength: 40 },
  username_lower: { type: String, required: true, unique: true }, // usernames are case-insensitive
  password_hash: { type: String, required: true },
  role: { type: String, enum: ROLE_LIST, required: true },
  // New sign-ups wait as "pending" until the super admin approves or rejects them
  status: { type: String, enum: USER_STATUS_LIST, default: USER_STATUS.PENDING, index: true },
  reviewed_by: { type: Number, default: null }, // admin who last approved/rejected/(de)activated the account
  reviewed_at: { type: Date, default: null },
  created_at: { type: Date, default: Date.now },
}, { versionKey: false });

export const User = mongoose.model('User', userSchema, 'users');
