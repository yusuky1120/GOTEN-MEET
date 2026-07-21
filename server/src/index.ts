import { serve } from '@hono/node-server';
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { loadConfig } from './config.js';

const serverDir = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
loadDotenv({ path: resolve(serverDir, '.env') });

let config;
try {
  config = loadConfig();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Failed to load config');
  process.exit(1);
}

const app = createApp(config);

serve(
  {
    fetch: app.fetch,
    port: config.port,
  },
  (info) => {
    console.log(`GOTEN MEET token server listening on http://localhost:${info.port}`);
    console.log(`LiveKit URL: ${config.livekitUrl}`);
    console.log(`LiveKit API Key: ${config.livekitApiKey}`);
  },
);
