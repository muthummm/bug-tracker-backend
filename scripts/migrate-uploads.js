// One-time move of screenshots stored in MongoDB (`uploads` collection) to Cloudinary.
// Each bug's screenshot URL is updated, then the MongoDB copy is deleted. Safe to re-run.
// Usage: npm run migrate:uploads
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { env, validateEnv } from '../src/config/env.js';
import { Bug } from '../src/modules/bugs/bug.model.js';
import { Upload } from '../src/modules/uploads/upload.model.js';
import { uploadBuffer } from '../src/modules/uploads/upload.service.js';

validateEnv();
if (!env.cloudinary.enabled) {
  console.error('Set the Cloudinary variables in .env first.');
  process.exit(1);
}

await connectDatabase();
let moved = 0;
let failed = 0;
try {
  for await (const file of Upload.find().cursor()) {
    try {
      const { secure_url: url } = await uploadBuffer(file.data, { uploadedBy: file.uploaded_by });
      const { modifiedCount } = await Bug.updateMany({ screenshot: `/uploads/${file._id}` }, { screenshot: url });
      await Upload.deleteOne({ _id: file._id });
      moved++;
      console.log(`moved ${file._id} -> ${url} (${modifiedCount} bug(s) updated)`);
    } catch (err) {
      failed++;
      console.error(`failed ${file._id}: ${err.message}`);
    }
  }
  console.log(`Done. Moved ${moved}, failed ${failed}.`);
} finally {
  await disconnectDatabase();
}
