// Users, projects and bugs use numeric ids from this counter collection, so bug keys stay
// BUG-001, BUG-002, ... and the frontend can use short numeric ids in links.
import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema(
  { _id: String, seq: { type: Number, default: 0 } },
  { versionKey: false },
);

export const Counter = mongoose.model('Counter', counterSchema, 'counters');

/** Reserves `n` ids for `name` and returns the first one. */
export async function nextIds(name, n = 1) {
  const counter = await Counter.findOneAndUpdate(
    { _id: name }, { $inc: { seq: n } }, { upsert: true, new: true },
  ).lean();
  return counter.seq - n + 1;
}
