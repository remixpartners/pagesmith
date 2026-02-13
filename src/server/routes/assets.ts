import type { FastifyInstance } from 'fastify';
import fs from 'node:fs/promises';
import path from 'node:path';

const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp']);

interface AssetEntry {
  name: string;
  path: string;
}

export function registerAssetRoutes(app: FastifyInstance, projectDir: string) {
  const assetsDir = path.join(projectDir, 'assets');

  app.get('/api/assets', async () => {
    try {
      const entries = await fs.readdir(assetsDir, { withFileTypes: true });
      const assets: AssetEntry[] = entries
        .filter(e => e.isFile() && ALLOWED_EXTENSIONS.has(path.extname(e.name).toLowerCase()))
        .map(e => ({ name: e.name, path: `assets/${e.name}` }));
      return assets;
    } catch {
      return [];
    }
  });

  app.post('/api/assets', async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: 'bad_request', message: 'No file uploaded' });
    }

    const safeName = path.basename(data.filename);
    if (!safeName || safeName === '.' || safeName === '..') {
      return reply.status(400).send({ error: 'bad_request', message: 'Invalid filename' });
    }

    const ext = path.extname(safeName).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return reply.status(400).send({
        error: 'bad_request',
        message: `Unsupported file type: ${ext}. Allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}`,
      });
    }

    await fs.mkdir(assetsDir, { recursive: true });

    const filePath = path.join(assetsDir, safeName);
    const buffer = await data.toBuffer();
    await fs.writeFile(filePath, buffer);

    return reply.status(201).send({ success: true, path: `assets/${safeName}` });
  });
}
