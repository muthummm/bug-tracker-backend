import { Router } from 'express';
import { authenticate, testerOnly } from '../../middlewares/auth.middleware.js';
import * as controller from './bug.controller.js';

const router = Router();

router.use(authenticate);

router.route('/')
  .get(controller.listBugs) // ?project=ID&status=&priority=&assignee=&panel=&q=&sort=
  .post(testerOnly, controller.createBug);

router.route('/:id')
  .get(controller.getBug)
  .put(testerOnly, controller.updateBug)
  .delete(controller.deleteBug); // reporter only, checked in the service

router.patch('/:id/status', controller.changeStatus);
router.patch('/:id/notes', controller.updateNotes);

export default router;
