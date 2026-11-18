// Every setting comes from environment variables: `.env` locally, the host's dashboard in production.
// Nothing else in the codebase should read `process.env` directly.
import fs from 'node:fs';

// Local development: load the project's .env if there is one. On a host like Render there is no .env;
// the variables come from its dashboard. Values already set in the environment always win.
const ENV_FILE = new URL('../../.env', import.meta.url);
if (fs.existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

const nodeEnv = process.env.NODE_ENV || 'development';

const list = value =>
  (value || '').split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);

/**
 * Cloudinary credentials, either as one CLOUDINARY_URL (cloudinary://<key>:<secret>@<cloud_name>,
 * copied from the Cloudinary dashboard) or as three separate variables.
 */
function readCloudinary() {
  let cloudName = process.env.CLOUDINARY_CLOUD_NAME || '';
  let apiKey = process.env.CLOUDINARY_API_KEY || '';
  let apiSecret = process.env.CLOUDINARY_API_SECRET || '';

  if (process.env.CLOUDINARY_URL) {
    try {
      const url = new URL(process.env.CLOUDINARY_URL);
      cloudName = url.hostname;
      apiKey = decodeURIComponent(url.username);
      apiSecret = decodeURIComponent(url.password);
    } catch {
      throw new Error('CLOUDINARY_URL must look like cloudinary://<api_key>:<api_secret>@<cloud_name>');
    }
  }

  return {
    cloudName,
    apiKey,
    apiSecret,
    folder: (process.env.CLOUDINARY_FOLDER || 'bug-tracker/screenshots').replace(/^\/+|\/+$/g, ''),
    enabled: Boolean(cloudName && apiKey && apiSecret),
  };
}

export const env = Object.freeze({
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: Number(process.env.PORT) || 3001,
  mongo: Object.freeze({
    uri: process.env.MONGODB_URI || '',
    dbName: process.env.MONGODB_DB || 'bugtracker',
  }),
  // Frontend origins allowed to call the API. "*" allows any origin.
  corsOrigins: list(process.env.CORS_ORIGIN || 'http://localhost:5173'),
  cloudinary: Object.freeze(readCloudinary()),
  // Desktop push notifications. Generate keys once with: npx web-push generate-vapid-keys
  push: Object.freeze({
    publicKey: process.env.VAPID_PUBLIC_KEY || '',
    privateKey: process.env.VAPID_PRIVATE_KEY || '',
    subject: process.env.VAPID_SUBJECT || 'mailto:admin@example.com', // contact for the push services
    enabled: Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
  }),
});

/** Fails fast at startup instead of on the first request. */
export function validateEnv() {
  const problems = [];
  if (!env.mongo.uri) problems.push('MONGODB_URI is not set.');
  if (env.isProduction && env.corsOrigins.includes('*'))
    console.warn('[env] CORS_ORIGIN is "*": any website can call this API.');
  if (!env.cloudinary.enabled)
    console.warn('[env] Cloudinary is not configured: screenshot uploads will return 503.');
  if (!env.push.enabled)
    console.warn('[env] VAPID keys are not set: desktop push notifications are off (in-app notifications still work).');
  if (problems.length)
    throw new Error(`Invalid environment:\n  - ${problems.join('\n  - ')}\n`
      + 'Locally: copy .env.example to .env and fill it in. On Render: add it under the service\'s Environment tab.');
}
