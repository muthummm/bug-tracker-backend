// Every API route, mounted under /api in app.js.
import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes.js';
import bugRoutes from '../modules/bugs/bug.routes.js';
import importExportRoutes from '../modules/import-export/import-export.routes.js';
import notificationRoutes from '../modules/notifications/notification.routes.js';
import projectRoutes from '../modules/projects/project.routes.js';
import pushRoutes from '../modules/push/push.routes.js';
import systemRoutes from '../modules/system/system.routes.js';
import { uploadRoutes } from '../modules/uploads/upload.routes.js';
import userRoutes from '../modules/users/user.routes.js';

const router = Router();

router.use('/', systemRoutes);       // /health, /meta
router.use('/auth', authRoutes);     // /auth/register, /auth/login, /auth/logout
router.use('/', userRoutes);         // /me, /users
router.use('/projects', projectRoutes);
router.use('/bugs', bugRoutes);
router.use('/notifications', notificationRoutes);
router.use('/push', pushRoutes);
router.use('/', importExportRoutes); // /import, /export.csv
router.use('/', uploadRoutes);       // /upload

export default router;
