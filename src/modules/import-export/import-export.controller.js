import { asyncHandler } from '../../utils/asyncHandler.js';
import { getProjectForUser } from '../projects/project.service.js';
import { exportProjectCsv } from './csv-export.service.js';
import { importCsv } from './csv-import.service.js';

export const importBugs = asyncHandler(async (req, res) => {
  const project = await getProjectForUser(req.query.project, req.user);
  res.json(await importCsv(String(req.body || ''), project._id, req.user.id));
});

export const exportBugs = asyncHandler(async (req, res) => {
  const project = await getProjectForUser(req.query.project, req.user);
  const { csv, filename } = await exportProjectCsv(project);
  res.attachment(filename);
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.send(csv);
});
