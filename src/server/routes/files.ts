import type { FastifyInstance } from 'fastify';
import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveSafePath } from '../utils/path-guard.js';
import { parseHtmlTemplate, recombineHtml } from '../utils/html-combiner.js';
import type { FileEntry, SaveRequest, SaveAsRequest } from '../../shared/types.js';

const templates = new Map<string, ReturnType<typeof parseHtmlTemplate>>();

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
    const { url, filename } = request.body as { url: string; filename: string };
    if (!url || !filename) {
      return reply.status(400).send({ error: 'bad_request', message: 'url and filename required' });
    }

    let resolved: string;
    try {
      resolved = resolveSafePath(projectDir, filename);
    } catch {
      return reply.status(403).send({ error: 'forbidden', message: 'Path outside project directory' });
    }

    try {
      const res = await fetch(url);
      if (!res.ok) {
        return reply.status(502).send({ error: 'fetch_failed', message: `Remote returned ${res.status}` });
      }
      const content = await res.text();
      await fs.writeFile(resolved, content, 'utf-8');
      templates.set(filename, parseHtmlTemplate(content));
      return { success: true, path: filename };
    } catch (err: any) {
      return reply.status(502).send({ error: 'fetch_failed', message: err.message });
    }
  });

  // Proxy sync to EMIR API (avoids CORS — server-to-server request)
  app.post('/api/files/emir-sync', async (request, reply) => {
    const { url, html, sync_token } = request.body as { url: string; html: string; sync_token: string };
    if (!url || !html || !sync_token) {
      return reply.status(400).send({ error: 'bad_request', message: 'url, html, and sync_token required' });
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html, sync_token }),
      });
      if (!res.ok) {
        const body = await res.text();
        return reply.status(res.status).send({ error: 'emir_error', message: body });
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
