import { Router } from 'express';
import { adminOnly, authenticate } from '../../middlewares/auth.middleware.js';
import * as controller from './project.controller.js';

const router = Router();

router.use(authenticate);

// Only the super admin creates, renames or deletes projects
router.route('/')
  .get(controller.listProjects) // the super admin gets every project
  .post(adminOnly, controller.createProject);

router.route('/:id')
  .put(adminOnly, controller.updateProject)
  .delete(adminOnly, controller.deleteProject);

// Only the super admin adds or removes people (testers and developers alike)
router.route('/:id/members')
  .get(controller.listMembers)
  .post(adminOnly, controller.addMember);

router.delete('/:id/members/:userId', adminOnly, controller.removeMember);

export default router;
