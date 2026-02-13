import Fastify from 'fastify';
import path from 'node:path';
import { registerFileRoutes } from './routes/files.js';

const args = process.argv.slice(2);
const dirIndex = args.indexOf('--dir');
const projectDir = dirIndex !== -1 ? path.resolve(args[dirIndex + 1]) : path.resolve('.');
const portIndex = args.indexOf('--port');
const port = portIndex !== -1 ? parseInt(args[portIndex + 1], 10) : 3000;

const app = Fastify({ logger: true });

registerFileRoutes(app, projectDir);

async function start() {
  await app.listen({ port, host: '127.0.0.1' });
  console.log(`PageSmith running at http://127.0.0.1:${port}`);
  console.log(`Project directory: ${projectDir}`);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});

export { app };
