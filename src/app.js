// Builds the Express app. Kept separate from server.js so it can be imported by tests without listening.
import compression from 'compression';
import express from 'express';
import helmet from 'helmet';
import { corsMiddleware } from './middlewares/cors.middleware.js';
import { errorHandler, notFound } from './middlewares/error.middleware.js';
import { requestLogger } from './middlewares/requestLogger.middleware.js';
import { root } from './modules/system/system.controller.js';
import { legacyImageRoutes } from './modules/uploads/upload.routes.js';
import apiRoutes from './routes/index.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // behind the host's load balancer (Render, Railway, ...)

  // ---------- security & platform ----------
  // Images are loaded by the frontend from another origin, so allow cross-origin resource loading.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(corsMiddleware);
  app.use(compression());
  app.use(requestLogger);
  app.use(express.json({ limit: '1mb' }));

  // ---------- routes ----------
  app.get('/', root);
  app.use('/api', apiRoutes);
  app.use('/', legacyImageRoutes);

  // ---------- errors ----------
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
