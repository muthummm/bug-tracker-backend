import { asyncHandler } from '../../utils/asyncHandler.js';
import { getProjectForMember } from '../projects/project.service.js';
import { exportProjectCsv } from './csv-export.service.js';
import { importCsv } from './csv-import.service.js';

export const importBugs = asyncHandler(async (req, res) => {
  const project = await getProjectForMember(req.query.project, req.user.id);
  res.json(await importCsv(String(req.body || ''), project._id, req.user.id));
});

export const exportBugs = asyncHandler(async (req, res) => {
  const project = await getProjectForMember(req.query.project, req.user.id);
  const { csv, filename } = await exportProjectCsv(project);
  res.attachment(filename);
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.send(csv);
});
