// Entry point: checks settings, connects to MongoDB, starts HTTP, and shuts down cleanly.
import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { env, validateEnv } from './config/env.js';

async function start() {
  validateEnv();

  const connection = await connectDatabase();
  console.log(`[db] connected to "${connection.name}"`);

  const server = createApp().listen(env.port, () => {
    console.log(`[http] Bug Log API (${env.nodeEnv}) listening on port ${env.port}`);
    console.log(`[http] allowed frontend origins: ${env.corsOrigins.join(', ')}`);
  });

  // Hosts send SIGTERM before stopping/redeploying: finish open requests, then close the DB.
  const shutdown = signal => {
    console.log(`[http] ${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref(); // don't hang forever
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', err => {
  console.error('[fatal] unhandled promise rejection:', err);
  process.exit(1);
});

start().catch(err => {
  console.error('[fatal] could not start:', err.message);
  process.exit(1);
});
