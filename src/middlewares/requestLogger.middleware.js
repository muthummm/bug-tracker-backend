import morgan from 'morgan';
import { env } from '../config/env.js';

// Concise coloured logs locally, Apache-style logs in production. Health checks and keep-alive pings
// (every 10 s from each open browser tab) are skipped: they would drown out the real requests.
export const requestLogger = morgan(env.isProduction ? 'combined' : 'dev', {
  skip: req => req.originalUrl.split('?')[0] === '/api/health',
});
