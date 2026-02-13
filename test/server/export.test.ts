import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { registerExportRoutes } from '../../src/server/routes/export.js';

let app: ReturnType<typeof Fastify>;

beforeAll(async () => {
  app = Fastify();
  registerExportRoutes(app, 3099);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('POST /api/export/pdf', () => {
  it('returns a PDF binary for valid HTML', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/export/pdf',
      payload: {
        html: '<!DOCTYPE html><html><head><title>Test</title></head><body><h1>Hello PDF</h1></body></html>',
        format: 'a4',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toContain('attachment');
    // PDF files start with %PDF
    expect(res.body.startsWith('%PDF')).toBe(true);
  }, 30000);

  it('defaults to A4 format when format is omitted', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/export/pdf',
      payload: {
        html: '<!DOCTYPE html><html><head><title>Test</title></head><body><p>Default format</p></body></html>',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
  }, 30000);

  it('returns 400 when html is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/export/pdf',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});
