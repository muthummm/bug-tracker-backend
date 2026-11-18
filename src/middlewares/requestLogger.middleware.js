import morgan from 'morgan';
import { env } from '../config/env.js';

// Concise coloured logs locally, Apache-style logs in production. Health checks are skipped (noise).
export const requestLogger = morgan(env.isProduction ? 'combined' : 'dev', {
  skip: req => req.originalUrl === '/api/health',
});
