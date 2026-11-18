import express, { Router } from 'express';
import { MAX_CSV_BYTES } from '../../constants/index.js';
import { authenticate, testerOnly } from '../../middlewares/auth.middleware.js';
import { exportBugs, importBugs } from './import-export.controller.js';

const router = Router();

// POST /api/import?project=ID   body: raw CSV text
router.post('/import', authenticate, testerOnly, express.text({ type: '*/*', limit: MAX_CSV_BYTES }), importBugs);
// GET /api/export.csv?project=ID
router.get('/export.csv', authenticate, exportBugs);

export default router;
