import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as service from './push.service.js';

const router = Router();

router.get('/public-key', (_req, res) => res.json(service.publicKey()));
router.post('/subscribe', authenticate, asyncHandler(async (req, res) => res.json(await service.subscribe(req.user.id, req.body))));
router.post('/unsubscribe', authenticate, asyncHandler(async (req, res) => res.json(await service.unsubscribe(req.user.id, req.body))));

export default router;
