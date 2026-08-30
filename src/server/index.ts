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
import { registerFinalizeRoutes } from './routes/finalize.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const dirIndex = args.indexOf('--dir');
const projectDir = dirIndex !== -1 ? path.resolve(args[dirIndex + 1]) : path.resolve('.');
const portIndex = args.indexOf('--port');
const port = portIndex !== -1 ? parseInt(args[portIndex + 1], 10) : 3000;

const app = Fastify({ logger: true });

async function start() {
  // Plugins
  await app.register(fastifyCors, {
    origin: [
      `http://127.0.0.1:${port}`,
      `http://localhost:${port}`,
      ...(process.env.HOST ? [`http://${process.env.HOST}:${port}`, `http://buzz:${port}`] : []),
      'http://127.0.0.1:5173',
      'http://localhost:5173',
    ],
  });
  await app.register(fastifyMultipart, { limits: { fileSize: 10 * 1024 * 1024 } });

  // Serve project directory files (for CSS, images, etc. referenced in HTML)
  await app.register(fastifyStatic, {
    root: projectDir,
    prefix: '/project/',
    decorateReply: false,
  });

  // Serve extracted_assets at root level — HTML templates reference these
  // as relative paths like "extracted_assets/logo.png" which resolve to
  // /extracted_assets/logo.png in the GrapesJS canvas iframe.
  const extractedAssetsDir = path.join(projectDir, 'extracted_assets');
  await app.register(fastifyStatic, {
    root: extractedAssetsDir,
    prefix: '/extracted_assets/',
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
  registerFinalizeRoutes(app, projectDir);

  const host = process.env.HOST || '127.0.0.1';
  await app.listen({ port, host });
  console.log(`\nPageSmith running at http://127.0.0.1:${port}`);
  console.log(`Project directory: ${projectDir}\n`);

  // Auto-open browser (skip in test and dev mode where Vite serves the frontend)
  const isDevBackend = process.env.npm_lifecycle_event === 'dev:server';
  if (process.env.NODE_ENV !== 'test' && !isDevBackend) {
    const open = (await import('open')).default;
    await open(`http://127.0.0.1:${port}`);
  }
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});

export { app, projectDir };
