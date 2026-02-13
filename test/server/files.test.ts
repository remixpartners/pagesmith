import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { registerFileRoutes } from '../../src/server/routes/files.js';

let app: ReturnType<typeof Fastify>;
let tmpDir: string;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pagesmith-test-'));
  await fs.writeFile(path.join(tmpDir, 'test.html'), '<!DOCTYPE html><html><head><title>Test</title></head><body><p>Hello</p></body></html>');
  await fs.mkdir(path.join(tmpDir, 'sub'));
  await fs.writeFile(path.join(tmpDir, 'sub', 'nested.html'), '<html><body>Nested</body></html>');

  app = Fastify();
  registerFileRoutes(app, tmpDir);
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await fs.rm(tmpDir, { recursive: true });
});

describe('GET /api/files', () => {
  it('lists HTML files recursively', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/files' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toBeInstanceOf(Array);
    const names = body.map((f: any) => f.path);
    expect(names).toContain('test.html');
    expect(names).toContain('sub/nested.html');
  });
});

describe('GET /api/files/:path', () => {
  it('reads an HTML file', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/files/test.html' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<p>Hello</p>');
  });

  it('returns 404 for missing file', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/files/nope.html' });
    expect(res.statusCode).toBe(404);
  });

  it('rejects path traversal', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/files/../../../etc/passwd' });
    expect(res.statusCode).toBe(403);
  });
});

describe('PUT /api/files/:path', () => {
  it('overwrites an existing file', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/files/test.html',
      payload: { html: '<p>Updated</p>', css: 'p { color: red; }' },
    });
    expect(res.statusCode).toBe(200);
    const content = await fs.readFile(path.join(tmpDir, 'test.html'), 'utf-8');
    expect(content).toContain('<p>Updated</p>');
    expect(content).toContain('p { color: red; }');
  });
});

describe('POST /api/files', () => {
  it('saves a new file', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/files',
      payload: { filename: 'new-report.html', html: '<p>New</p>', css: '' },
    });
    expect(res.statusCode).toBe(201);
    const exists = await fs.access(path.join(tmpDir, 'new-report.html')).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });
});
