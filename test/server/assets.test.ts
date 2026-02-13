import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { registerAssetRoutes } from '../../src/server/routes/assets.js';

let app: ReturnType<typeof Fastify>;
let tmpDir: string;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pagesmith-assets-'));
  await fs.mkdir(path.join(tmpDir, 'assets'));
  await fs.writeFile(path.join(tmpDir, 'assets', 'logo.png'), 'fake-png-data');

  app = Fastify();
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
  registerAssetRoutes(app, tmpDir);
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await fs.rm(tmpDir, { recursive: true });
});

describe('GET /api/assets', () => {
  it('lists images in assets directory', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/assets' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toContainEqual(expect.objectContaining({ name: 'logo.png' }));
  });

  it('returns empty array when no assets dir exists', async () => {
    const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pagesmith-empty-'));
    const tempApp = Fastify();
    await tempApp.register(multipart);
    registerAssetRoutes(tempApp, emptyDir);
    await tempApp.ready();

    const res = await tempApp.inject({ method: 'GET', url: '/api/assets' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);

    await tempApp.close();
    await fs.rm(emptyDir, { recursive: true });
  });
});

describe('POST /api/assets', () => {
  it('uploads an image file', async () => {
    const boundary = '----FormBoundary';
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="photo.jpg"',
      'Content-Type: image/jpeg',
      '',
      'fake-jpg-data',
      `--${boundary}--`,
    ].join('\r\n');

    const res = await app.inject({
      method: 'POST',
      url: '/api/assets',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
    expect(res.statusCode).toBe(201);
    const exists = await fs.access(path.join(tmpDir, 'assets', 'photo.jpg')).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  it('rejects unsupported file types', async () => {
    const boundary = '----FormBoundary';
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="script.exe"',
      'Content-Type: application/octet-stream',
      '',
      'bad-data',
      `--${boundary}--`,
    ].join('\r\n');

    const res = await app.inject({
      method: 'POST',
      url: '/api/assets',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
    expect(res.statusCode).toBe(400);
  });
});
