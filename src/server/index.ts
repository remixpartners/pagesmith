#!/usr/bin/env node
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import fastifyCors from '@fastify/cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerFileRoutes } from './routes/files.js';
import { registerAssetRoutes } from './routes/assets.js';
import { registerExportRoutes } from './routes/export.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const dirIndex = args.indexOf('--dir');
const projectDir = dirIndex !== -1 ? path.resolve(args[dirIndex + 1]) : path.resolve('.');
const portIndex = args.indexOf('--port');
const port = portIndex !== -1 ? parseInt(args[portIndex + 1], 10) : 3000;

const app = Fastify({ logger: true });

async function start() {
  // Plugins
  await app.register(fastifyCors, { origin: true });
  await app.register(fastifyMultipart, { limits: { fileSize: 10 * 1024 * 1024 } });

  // Serve project directory files (for CSS, images, etc. referenced in HTML)
  await app.register(fastifyStatic, {
    root: projectDir,
    prefix: '/project/',
    decorateReply: false,
  });

  // Serve built client (production mode)
  const clientDir = path.resolve(__dirname, '../client');
  try {
    await app.register(fastifyStatic, {
      root: clientDir,
      prefix: '/',
      decorateReply: false,
    });
  } catch {
    // Client not built yet (dev mode) — Vite serves instead
  }

  // Routes
  registerFileRoutes(app, projectDir);
  registerAssetRoutes(app, projectDir);
  registerExportRoutes(app, port);

  await app.listen({ port, host: '127.0.0.1' });
  console.log(`\nPageSmith running at http://127.0.0.1:${port}`);
  console.log(`Project directory: ${projectDir}\n`);

  // Auto-open browser (only if not in test)
  if (process.env.NODE_ENV !== 'test') {
    const open = (await import('open')).default;
    await open(`http://127.0.0.1:${port}`);
  }
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});

export { app, projectDir };
