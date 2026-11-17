// All settings come from environment variables (.env locally, the host's dashboard in production).
export const config = {
  port: Number(process.env.PORT) || 3001,
  mongoUri: process.env.MONGODB_URI || '',
  dbName: process.env.MONGODB_DB || 'bugtracker',
  // Frontend origins allowed to call the API. "*" allows any origin.
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean),
};
