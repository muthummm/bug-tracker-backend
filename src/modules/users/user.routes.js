import { Router } from 'express';
import { adminOnly, authenticate } from '../../middlewares/auth.middleware.js';
import { getMe, getUsers } from './user.controller.js';

const router = Router();

router.get('/me', authenticate, getMe);
// Active testers and developers, for the admin's "add to project" picker
router.get('/users', authenticate, adminOnly, getUsers);

export default router;
