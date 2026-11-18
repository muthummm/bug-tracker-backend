import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { singleImage } from '../../middlewares/upload.middleware.js';
import { serveLegacyImage, uploadImage } from './upload.controller.js';

/** Mounted under /api: POST /api/upload (multipart, field "file") -> { url } */
export const uploadRoutes = Router();
uploadRoutes.post('/upload', authenticate, singleImage('file'), uploadImage);

/** Mounted at the root: GET /uploads/:id for images stored before Cloudinary. */
export const legacyImageRoutes = Router();
legacyImageRoutes.get('/uploads/:id', serveLegacyImage);
