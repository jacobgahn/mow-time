import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from backend directory
config({ path: join(__dirname, '..', '.env') });

import app from './app.js';
import { resolvePort } from './config/environment.js';

const port = resolvePort();

const server = app.listen(port, () => {
  console.log(`Mow Time API listening on port ${port}`);
});

const shutdown = () => {
  server.close(() => {
    console.log('Mow Time API shut down gracefully');
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

