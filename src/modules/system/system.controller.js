import { isDatabaseConnected } from '../../config/database.js';
import { DEV_STATUSES, PRIORITIES, STATUSES } from '../../constants/index.js';

export const root = (_req, res) => res.json({ name: 'Bug Log API', health: '/api/health' });

/** Used by the host's health check: 503 while the database is unreachable. */
export function health(_req, res) {
  const db = isDatabaseConnected();
  res.status(db ? 200 : 503).json({ ok: db, db, uptime: Math.round(process.uptime()) });
}

export const meta = (_req, res) => res.json({ statuses: STATUSES, priorities: PRIORITIES, devStatuses: DEV_STATUSES });
