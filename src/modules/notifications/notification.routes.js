import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware.js';
import * as controller from './notification.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', controller.list);                 // ?unread=1 for unread only
router.get('/unread-count', controller.count);    // polled by the bell in the header
router.post('/read-all', controller.markAllRead); // ?bug=ID to mark only one bug's notifications
router.patch('/:id/read', controller.markRead);

export default router;
