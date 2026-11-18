import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getLegacyUpload, uploadScreenshot } from './upload.service.js';

export const uploadImage = asyncHandler(async (req, res) => {
  res.json({ url: await uploadScreenshot(req.file, req.user.id) });
});

/** LEGACY: serves an image stored in MongoDB. Public, since <img> tags can't send the sign-in token. */
export const serveLegacyImage = asyncHandler(async (req, res) => {
  const file = await getLegacyUpload(req.params.id);
  if (!file) throw ApiError.notFound();
  res.set({
    'Content-Type': file.content_type,
    'Cache-Control': 'public, max-age=604800, immutable',
  });
  res.send(file.data);
});
