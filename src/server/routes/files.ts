import type { FastifyInstance } from 'fastify';
import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveSafePath } from '../utils/path-guard.js';
import { parseHtmlTemplate, recombineHtml } from '../utils/html-combiner.js';
import type { FileEntry, SaveRequest, SaveAsRequest } from '../../shared/types.js';

const templates = new Map<string, ReturnType<typeof parseHtmlTemplate>>();

const FETCH_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024; // 10 MB

/** Validate that a URL is an allowed external HTTPS origin (blocks SSRF). */
function validateExternalUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('Invalid URL');
  }
  // Require https in production; allow http only for localhost in dev
  const isLocalDev = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (parsed.protocol !== 'https:' && !(isLocalDev && parsed.protocol === 'http:')) {
    throw new Error('Only HTTPS URLs are allowed');
  }
  // Block private/internal IPs (metadata endpoints, internal networks)
  const blocked = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|0\.|127\.)/;
  if (!isLocalDev && blocked.test(parsed.hostname)) {
    throw new Error('Internal network URLs are not allowed');
  }
  return parsed;
}

/** Fetch with timeout and size limit. */
async function safeFetch(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    // Check Content-Length if available
    const cl = res.headers.get('content-length');
    if (cl && parseInt(cl, 10) > MAX_RESPONSE_BYTES) {
      throw new Error('Response too large');
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function listHtmlFiles(dir: string, base: string = ''): Promise<FileEntry[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const results: FileEntry[] = [];

  for (const entry of entries) {
    const relativePath = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
      const children = await listHtmlFiles(path.join(dir, entry.name), relativePath);
      results.push(...children);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      results.push({ name: entry.name, path: relativePath, isDirectory: false });
    }
  }

  return results;
}

export function registerFileRoutes(app: FastifyInstance, projectDir: string) {
  // Add an onRequest hook to catch path traversal attempts that get normalized by HTTP layer
  app.addHook('onRequest', async (request, reply) => {
    const url = request.url;
    // If a request is outside /api/files but matches system paths that likely came from
    // a traversal attempt (e.g., /api/files/../../../etc/passwd -> /etc/passwd),
    // reject it with 403
    if (url !== '/api/files' && !url.startsWith('/api/files/') && url.match(/^\/(etc|var|tmp|home|root|sys|proc|dev|usr|lib|bin)\b/i)) {
      return reply.status(403).send({ error: 'forbidden', message: 'Path outside project directory' });
    }
  });

  app.get('/api/files', async () => {
    return listHtmlFiles(projectDir);
  });

  app.get('/api/files/*', async (request, reply) => {
    const filePath = (request.params as { '*': string })['*'];

    let resolved: string;
    try {
      resolved = resolveSafePath(projectDir, filePath);
    } catch {
      return reply.status(403).send({ error: 'forbidden', message: 'Path outside project directory' });
    }

    try {
      const content = await fs.readFile(resolved, 'utf-8');
      templates.set(filePath, parseHtmlTemplate(content));
      return reply.type('text/html').send(content);
    } catch {
      return reply.status(404).send({ error: 'not_found', message: 'File not found' });
    }
  });

  app.put('/api/files/*', async (request, reply) => {
    const filePath = (request.params as { '*': string })['*'];

    let resolved: string;
    try {
      resolved = resolveSafePath(projectDir, filePath);
    } catch {
      return reply.status(403).send({ error: 'forbidden', message: 'Path outside project directory' });
    }

    const { html, css } = request.body as SaveRequest;
    const template = templates.get(filePath);

    let output: string;
    if (template) {
      output = recombineHtml(template, html, css);
    } else {
      output = recombineHtml(
        { doctype: '<!DOCTYPE html>', htmlAttributes: '', head: '', bodyAttributes: '' },
        html,
        css
      );
    }

    await fs.writeFile(resolved, output, 'utf-8');
    templates.set(filePath, parseHtmlTemplate(output));
    return { success: true };
  });

  // Fetch remote HTML and save to project directory (for EMIR integration)
  app.post('/api/files/fetch-remote', async (request, reply) => {
    const body = request.body as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return reply.status(400).send({ error: 'bad_request', message: 'JSON body required' });
    }
    const { url, filename } = body as { url: string; filename: string };
    if (!url || !filename) {
      return reply.status(400).send({ error: 'bad_request', message: 'url and filename required' });
    }

    try {
      validateExternalUrl(url);
    } catch (err: any) {
      return reply.status(400).send({ error: 'bad_request', message: err.message });
    }

    let resolved: string;
    try {
      resolved = resolveSafePath(projectDir, filename);
    } catch {
      return reply.status(403).send({ error: 'forbidden', message: 'Path outside project directory' });
    }

    try {
      const res = await safeFetch(url);
      if (!res.ok) {
        return reply.status(502).send({ error: 'fetch_failed', message: `Remote returned ${res.status}` });
      }
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
        return reply.status(400).send({ error: 'bad_request', message: 'Response is not HTML' });
      }
      const content = await res.text();
      if (content.length > MAX_RESPONSE_BYTES) {
        return reply.status(400).send({ error: 'bad_request', message: 'Response too large' });
      }
      await fs.writeFile(resolved, content, 'utf-8');
      templates.set(filename, parseHtmlTemplate(content));
      return { success: true, path: filename };
    } catch (err: any) {
      return reply.status(502).send({ error: 'fetch_failed', message: err.message });
    }
  });

  // Proxy sync to EMIR API (avoids CORS — server-to-server request)
  app.post('/api/files/emir-sync', async (request, reply) => {
    const body = request.body as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return reply.status(400).send({ error: 'bad_request', message: 'JSON body required' });
    }
    const { url, html, sync_token } = body as { url: string; html: string; sync_token: string };
    if (!url || !html || !sync_token) {
      return reply.status(400).send({ error: 'bad_request', message: 'url, html, and sync_token required' });
    }

    try {
      validateExternalUrl(url);
    } catch (err: any) {
      return reply.status(400).send({ error: 'bad_request', message: err.message });
    }

    try {
      const res = await safeFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html, sync_token }),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => 'Unknown error');
        return reply.status(res.status).send({ error: 'emir_error', message: errBody.slice(0, 1000) });
      }
      return { success: true };
    } catch (err: any) {
      return reply.status(502).send({ error: 'sync_failed', message: err.message });
    }
  });

  app.post('/api/files', async (request, reply) => {
    const { filename, html, css } = request.body as SaveAsRequest;
    let resolved: string;
    try {
      resolved = resolveSafePath(projectDir, filename);
    } catch {
      return reply.status(403).send({ error: 'forbidden', message: 'Path outside project directory' });
    }

    const output = recombineHtml(
      { doctype: '<!DOCTYPE html>', htmlAttributes: '', head: '', bodyAttributes: '' },
      html,
      css
    );

    await fs.writeFile(resolved, output, 'utf-8');
    templates.set(filename, parseHtmlTemplate(output));
    return reply.status(201).send({ success: true, path: filename });
  });
}
