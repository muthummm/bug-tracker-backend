import { Router } from 'express';
import { health, meta } from './system.controller.js';

const router = Router();

router.get('/health', health);
router.get('/meta', meta);

export default router;
