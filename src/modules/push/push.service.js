// Desktop (Windows/macOS/Android) notifications through the browsers' free Web Push services.
import webpush from 'web-push';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { PushSubscription } from './push.model.js';

if (env.push.enabled) webpush.setVapidDetails(env.push.subject, env.push.publicKey, env.push.privateKey);

const MAX_PER_USER = 10; // browsers/devices per person
const isHttpsUrl = s => typeof s === 'string' && /^https:\/\/\S+$/.test(s) && s.length <= 1000;

export const publicKey = () => ({ enabled: env.push.enabled, publicKey: env.push.publicKey || null });

/** Saves the browser's subscription for this user (a browser belongs to whoever signed in last). */
export async function subscribe(userId, body) {
  if (!env.push.enabled) throw ApiError.unavailable('Desktop notifications are not set up on the server.');
  const sub = body?.subscription ?? body;
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  if (!isHttpsUrl(sub?.endpoint) || typeof p256dh !== 'string' || typeof auth !== 'string' || p256dh.length > 200 || auth.length > 100)
    throw ApiError.badRequest('Invalid push subscription.');

  await PushSubscription.updateOne(
    { endpoint: sub.endpoint },
    { $set: { keys: { p256dh, auth }, user_id: userId, created_at: new Date() } },
    { upsert: true },
  );
  // Keep only the newest few per person
  const extra = await PushSubscription.find({ user_id: userId }, { _id: 1 }).sort({ created_at: -1 }).skip(MAX_PER_USER).lean();
  if (extra.length) await PushSubscription.deleteMany({ _id: { $in: extra.map(e => e._id) } });
  return { ok: true };
}

export async function unsubscribe(userId, body) {
  const endpoint = body?.endpoint;
  if (typeof endpoint === 'string') await PushSubscription.deleteOne({ endpoint, user_id: userId });
  return { ok: true };
}

/**
 * Sends one desktop notification to every browser of each user. Never throws: push is best effort.
 * Subscriptions the push service says are gone (404/410) are deleted.
 * @param {Array<{ userId: number, payload: { title: string, body: string, url: string, tag: string } }>} messages
 */
export async function sendToUsers(messages) {
  if (!env.push.enabled || !messages.length) return;
  try {
    const subs = await PushSubscription.find({ user_id: { $in: [...new Set(messages.map(m => m.userId))] } }).lean();
    const gone = [];
    await Promise.all(messages.flatMap(({ userId, payload }) => subs
      .filter(s => s.user_id === userId)
      .map(s => webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload), { TTL: 60 * 60 * 24 })
        .catch(err => {
          if (err.statusCode === 404 || err.statusCode === 410) gone.push(s._id);
          else console.error('[push] send failed:', err.statusCode || '', err.body || err.message);
        }))));
    if (gone.length) await PushSubscription.deleteMany({ _id: { $in: gone } });
  } catch (err) {
    console.error('[push] could not send:', err.message || err);
  }
}
