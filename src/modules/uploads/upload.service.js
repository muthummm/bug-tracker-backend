import { cloudinary } from '../../config/cloudinary.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { randomHex } from '../../utils/password.js';
import { escapeRegex } from '../../utils/sanitize.js';
import { Upload } from './upload.model.js';

const { cloudName, folder, enabled } = env.cloudinary;

const LEGACY_URL = /^\/uploads\/([a-f0-9]{24})$/;
// Only images this app uploaded to its own Cloudinary folder are accepted as bug screenshots.
const CLOUDINARY_URL = enabled
  ? new RegExp(`^https://res\\.cloudinary\\.com/${escapeRegex(cloudName)}/image/upload/(?:v\\d+/)?${escapeRegex(folder)}/([a-f0-9]{24})\\.(?:png|jpe?g|gif|webp)$`)
  : null;

export const isValidScreenshotUrl = url =>
  typeof url === 'string' && (LEGACY_URL.test(url) || Boolean(CLOUDINARY_URL?.test(url)));

/** Streams an image buffer to Cloudinary and returns the upload result. */
export function uploadBuffer(buffer, { uploadedBy = null } = {}) {
  if (!enabled) return Promise.reject(ApiError.unavailable('Image uploads are not configured on the server.'));

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: randomHex(12),
        resource_type: 'image',
        allowed_formats: ['png', 'jpg', 'gif', 'webp'],
        overwrite: false,
        context: uploadedBy ? { uploaded_by: String(uploadedBy) } : undefined,
      },
      (err, result) => {
        if (err) {
          console.error('[cloudinary] upload failed:', err.message || err);
          return reject(ApiError.badGateway('Could not upload the image. Please try again.'));
        }
        resolve(result);
      },
    );
    stream.end(buffer);
  });
}

/** Uploads a screenshot from multer and returns its public URL. */
export async function uploadScreenshot(file, userId) {
  const result = await uploadBuffer(file.buffer, { uploadedBy: userId });
  return result.secure_url;
}

/**
 * Deletes a screenshot that is no longer used. Never throws: a leftover image
 * must not fail the bug update that replaced it.
 */
export async function removeScreenshot(url) {
  try {
    const legacy = url.match(LEGACY_URL);
    if (legacy) return void await Upload.deleteOne({ _id: legacy[1] });

    const hosted = CLOUDINARY_URL && url.match(CLOUDINARY_URL);
    if (hosted) await cloudinary.uploader.destroy(`${folder}/${hosted[1]}`, { resource_type: 'image', invalidate: true });
  } catch (err) {
    console.error(`[uploads] could not delete ${url}:`, err.message || err);
  }
}

/** LEGACY: an image stored in MongoDB, or null. */
export async function getLegacyUpload(id) {
  if (!/^[a-f0-9]{24}$/.test(id)) return null;
  return Upload.findById(id);
}
