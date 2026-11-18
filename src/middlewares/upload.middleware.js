import multer from 'multer';
import { IMAGE_TYPES, MAX_IMAGE_BYTES } from '../constants/index.js';
import { ApiError } from '../utils/ApiError.js';

// Files stay in memory: they are streamed straight to Cloudinary, never written to disk.
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, IMAGE_TYPES.includes(file.mimetype)),
});

/** Accepts one image in the multipart field `field`; puts it on `req.file`. */
export const singleImage = field => (req, res, next) => {
  imageUpload.single(field)(req, res, err => {
    if (err) {
      const tooBig = err.code === 'LIMIT_FILE_SIZE';
      return next(ApiError.badRequest(tooBig ? 'Image must be under 5 MB.' : 'Upload failed.'));
    }
    if (!req.file) return next(ApiError.badRequest('Only PNG, JPG, GIF or WebP images are allowed.'));
    next();
  });
};
