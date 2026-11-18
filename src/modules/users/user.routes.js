import { Router } from 'express';
import { authenticate, testerOnly } from '../../middlewares/auth.middleware.js';
import { getMe, getUsers } from './user.controller.js';

const router = Router();

router.get('/me', authenticate, getMe);
router.get('/users', authenticate, testerOnly, getUsers);

export default router;
