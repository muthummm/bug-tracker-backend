import { app } from './app.js';
import { config } from './config.js';
import { connectDb } from './db.js';

try {
  const conn = await connectDb();
  console.log(`Connected to MongoDB database "${conn.name}"`);
} catch (e) {
  console.error('Could not connect to MongoDB:', e.message);
  process.exit(1);
}

app.listen(config.port, () => {
  console.log(`Bug Log API running on http://localhost:${config.port}`);
  console.log(`Allowed frontend origins: ${config.corsOrigins.join(', ')}`);
});
