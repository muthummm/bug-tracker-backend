import { Router } from 'express';
import { authenticate, testerOnly } from '../../middlewares/auth.middleware.js';
import * as controller from './project.controller.js';

const router = Router();

router.use(authenticate);

router.route('/')
  .get(controller.listProjects)
  .post(testerOnly, controller.createProject);

router.route('/:id')
  .put(testerOnly, controller.updateProject)
  .delete(testerOnly, controller.deleteProject);

router.route('/:id/members')
  .get(controller.listMembers)
  .post(testerOnly, controller.addMember);

router.delete('/:id/members/:userId', testerOnly, controller.removeMember);

export default router;
