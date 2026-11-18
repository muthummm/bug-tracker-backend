import { isDatabaseConnected } from '../../config/database.js';
import { DEV_STATUSES, PRIORITIES, STATUSES } from '../../constants/index.js';

export const root = (_req, res) => res.json({ name: 'Bug Log API', health: '/api/health' });

/**
 * Health check, public and cheap (no database query). Used by Render's health check and by the
 * frontend's keep-alive ping every 10 s. 503 while the database is unreachable. Never cached,
 * so every ping really reaches the server.
 */
export function health(_req, res) {
  const db = isDatabaseConnected();
  res.set('Cache-Control', 'no-store');
  res.status(db ? 200 : 503).json({ ok: db, db, uptime: Math.round(process.uptime()), time: new Date().toISOString() });
}

export const meta = (_req, res) => res.json({ statuses: STATUSES, priorities: PRIORITIES, devStatuses: DEV_STATUSES });
