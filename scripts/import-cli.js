// Imports a bug spreadsheet from the command line.
// Usage: npm run import -- "path/to/bugs.csv" --project "Project name"
import fs from 'node:fs';
import path from 'node:path';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { validateEnv } from '../src/config/env.js';
import { importCsv } from '../src/modules/import-export/csv-import.service.js';
import { findOrCreateProjectByName } from '../src/modules/projects/project.service.js';

const args = process.argv.slice(2);
const projectFlag = args.indexOf('--project');
const projectName = projectFlag >= 0 ? args.splice(projectFlag, 2)[1] : null;
const file = args[0];

if (!file) {
  console.error('Usage: npm run import -- "path/to/bugs.csv" --project "Project name"');
  process.exit(1);
}

const name = (projectName || path.basename(file, path.extname(file))).trim();

validateEnv();
await connectDatabase();
try {
  const result = await importCsv(fs.readFileSync(file, 'utf8'), await findOrCreateProjectByName(name));
  console.log(`Project "${name}": imported ${result.imported} bug(s). Skipped ${result.skipped} row(s) without a description. ${result.duplicates} already existed.`);
  if (result.unmatchedAssignees.length)
    console.log(`Not on the project team, left unassigned (noted on each bug): ${result.unmatchedAssignees.join(', ')}`);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
