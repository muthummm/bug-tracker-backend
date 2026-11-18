import { Router } from 'express';
import { adminOnly, authenticate } from '../../middlewares/auth.middleware.js';
import * as controller from './admin.controller.js';

const router = Router();

router.use(authenticate, adminOnly);

router.get('/summary', controller.summary);                  // { counts: { pending, active, inactive, rejected, all } }
router.get('/users', controller.listUsers);                  // ?status=pending|active|inactive|rejected&role=&q=
router.post('/users/:id/approve', controller.approveUser);   // pending/rejected -> active
router.post('/users/:id/reject', controller.rejectUser);     // pending -> rejected
router.patch('/users/:id/status', controller.setUserStatus); // { status: "active" | "inactive" }

export default router;
