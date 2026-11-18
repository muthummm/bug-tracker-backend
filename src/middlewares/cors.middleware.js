import cors from 'cors';
import { env } from '../config/env.js';

const allowAll = env.corsOrigins.includes('*');

// The frontend is hosted on a different address, so it needs CORS headers.
export const corsMiddleware = cors({
  origin(origin, callback) {
    callback(null, !origin || allowAll || env.corsOrigins.includes(origin));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type'],
  exposedHeaders: ['Content-Disposition'],
  maxAge: 600,
});
