import type { FastifyInstance } from 'fastify';
import fs from 'node:fs/promises';
import path from 'node:path';
import dns from 'node:dns/promises';
import { resolveSafePath } from '../utils/path-guard.js';
import { parseHtmlTemplate, recombineHtml } from '../utils/html-combiner.js';
import type { FileEntry, SaveRequest, SaveAsRequest } from '../../shared/types.js';

const templates = new Map<string, ReturnType<typeof parseHtmlTemplate>>();

const FETCH_TIMEOUT_MS = 15_000;
const AI_REVISION_TIMEOUT_MS = 120_000; // 2 min — AI revision calls send full HTML to Claude
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_CONCURRENT_REVISIONS = 3;
const IS_DEV = process.env.NODE_ENV === 'development';

/** Allowed EMIR API origins. Set via EMIR_ALLOWED_ORIGINS env (comma-separated) or allow any validated HTTPS in dev. */
const EMIR_ALLOWED_ORIGINS: Set<string> | null = (() => {
  const raw = process.env.EMIR_ALLOWED_ORIGINS;
  if (!raw) return null; // null = no allowlist enforcement (validates URL structure only)
  return new Set(raw.split(',').map(s => s.trim().replace(/\/+$/, '').toLowerCase()));
})();

let activeRevisions = 0;

/** Check if an IP address is in a private/reserved range. */
function isPrivateIp(ip: string): boolean {
  // IPv4 private/reserved ranges
  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|0\.|127\.)/.test(ip)) return true;
  // IPv6 loopback, link-local, unique-local
  if (/^(::1|fe80:|fc00:|fd00:|::ffff:(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|0\.))/.test(ip)) return true;
  return false;
}

/** Validate that a URL is an allowed external HTTPS origin (blocks SSRF). */
async function validateExternalUrl(raw: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('Invalid URL');
  }
  const isLocalDev = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';

  // Only allow localhost in dev mode
  if (isLocalDev && !IS_DEV) {
    throw new Error('Localhost URLs are only allowed in development mode');
  }

  // Require https in production; allow http only for localhost in dev
  if (parsed.protocol !== 'https:' && !(isLocalDev && parsed.protocol === 'http:')) {
    throw new Error('Only HTTPS URLs are allowed');
  }

  // Resolve all DNS records and block if any resolve to private/reserved IPs
  if (!isLocalDev) {
    try {
      const results = await dns.lookup(parsed.hostname, { all: true, verbatim: true });
      if (results.length === 0) throw new Error(`DNS resolution failed for ${parsed.hostname}`);
      for (const { address } of results) {
        if (isPrivateIp(address)) {
          throw new Error('URLs resolving to private/internal IPs are not allowed');
        }
      }
    } catch (err: any) {
      if (err.message.includes('private') || err.message.includes('internal') || err.message.includes('DNS resolution')) throw err;
      throw new Error(`DNS resolution failed for ${parsed.hostname}`);
    }
  }

  return parsed;
}

/** Fetch with timeout, redirect blocking, and size limit. */
async function safeFetch(url: string, init?: RequestInit, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      redirect: 'error', // Block redirects to prevent SSRF bypass
    });
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

/** Read response body as text with a byte-size limit (streams to avoid buffering). */
async function safeReadText(res: Response): Promise<string> {
  if (!res.body) return res.text();
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_RESPONSE_BYTES) {
        reader.cancel();
        throw new Error('Response too large');
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode()); // flush
  } finally {
    reader.releaseLock();
  }
  return chunks.join('');
}

/** Validate that an EMIR API origin is on the allowlist (if configured). */
async function validateEmirOrigin(raw: string): Promise<URL> {
  const parsed = await validateExternalUrl(raw);
  if (EMIR_ALLOWED_ORIGINS) {
    const origin = `${parsed.protocol}//${parsed.host}`.toLowerCase();
    if (!EMIR_ALLOWED_ORIGINS.has(origin)) {
      throw new Error('EMIR API origin not in allowlist');
    }
  }
  return parsed;
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
        { doctype: '<!DOCTYPE html>', htmlAttributes: '', head: '', bodyAttributes: '', bodyScripts: '' },
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
      await validateExternalUrl(url);
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
      const content = await safeReadText(res);
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
      await validateExternalUrl(url);
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
        const errBody = await safeReadText(res).catch(() => 'Unknown error');
        return reply.status(res.status).send({ error: 'emir_error', message: errBody.slice(0, 1000) });
      }
      return { success: true };
    } catch (err: any) {
      return reply.status(502).send({ error: 'sync_failed', message: err.message });
    }
  });

  // Proxy revision request to EMIR API (avoids CORS — server-to-server request)
  // Accepts structured inputs; constructs EMIR URL server-side to prevent open-proxy abuse.
  app.post('/api/files/emir-revise', async (request, reply) => {
    if (activeRevisions >= MAX_CONCURRENT_REVISIONS) {
      return reply.status(429).send({ error: 'too_many_requests', message: 'Too many concurrent revision requests' });
    }
    const body = request.body as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return reply.status(400).send({ error: 'bad_request', message: 'JSON body required' });
    }
    const { emir_api, proposal_id, html, message, sync_token } = body as {
      emir_api: string; proposal_id: string; html: string; message: string; sync_token: string;
    };
    if (!emir_api || !proposal_id || !html || !message || !sync_token) {
      return reply.status(400).send({
        error: 'bad_request',
        message: 'emir_api, proposal_id, html, message, and sync_token required',
      });
    }

    try {
      await validateEmirOrigin(emir_api);
    } catch (err: any) {
      return reply.status(400).send({ error: 'bad_request', message: err.message });
    }

    const url = `${emir_api.replace(/\/+$/, '')}/api/proposals/${encodeURIComponent(proposal_id)}/revise-html`;

    activeRevisions++;
    try {
      const res = await safeFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html, message, sync_token }),
      }, AI_REVISION_TIMEOUT_MS);
      if (!res.ok) {
        const errBody = await safeReadText(res).catch(() => 'Unknown error');
        return reply.status(res.status).send({ error: 'emir_error', message: errBody.slice(0, 1000) });
      }
      const result = await res.json();
      return result;
    } catch (err: any) {
      return reply.status(502).send({ error: 'revision_failed', message: err.message });
    } finally {
      activeRevisions--;
    }
  });

  // Proxy section-level revision to EMIR API
  app.post('/api/files/emir-revise-section', async (request, reply) => {
    if (activeRevisions >= MAX_CONCURRENT_REVISIONS) {
      return reply.status(429).send({ error: 'too_many_requests', message: 'Too many concurrent revision requests' });
    }
    const body = request.body as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return reply.status(400).send({ error: 'bad_request', message: 'JSON body required' });
    }
    const { emir_api, proposal_id, section_html, message, sync_token } = body as {
      emir_api: string; proposal_id: string; section_html: string; message: string; sync_token: string;
    };
    if (!emir_api || !proposal_id || !section_html || !message || !sync_token) {
      return reply.status(400).send({
        error: 'bad_request',
        message: 'emir_api, proposal_id, section_html, message, and sync_token required',
      });
    }

    try {
      await validateEmirOrigin(emir_api);
    } catch (err: any) {
      return reply.status(400).send({ error: 'bad_request', message: err.message });
    }

    const url = `${emir_api.replace(/\/+$/, '')}/api/proposals/${encodeURIComponent(proposal_id)}/revise-html-section`;

    activeRevisions++;
    try {
      const res = await safeFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section_html, message, sync_token }),
      }, AI_REVISION_TIMEOUT_MS);
      if (!res.ok) {
        const errBody = await safeReadText(res).catch(() => 'Unknown error');
        return reply.status(res.status).send({ error: 'emir_error', message: errBody.slice(0, 1000) });
      }
      const result = await res.json();
      return result;
    } catch (err: any) {
      return reply.status(502).send({ error: 'section_revision_failed', message: err.message });
    } finally {
      activeRevisions--;
    }
  });

  // Proxy message fetch to EMIR API (avoids CORS)
  // Accepts structured inputs; constructs EMIR URL server-side.
  app.post('/api/files/emir-messages', async (request, reply) => {
    const body = request.body as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return reply.status(400).send({ error: 'bad_request', message: 'JSON body required' });
    }
    const { emir_api, proposal_id, sync_token } = body as {
      emir_api: string; proposal_id: string; sync_token: string;
    };
    if (!emir_api || !proposal_id || !sync_token) {
      return reply.status(400).send({ error: 'bad_request', message: 'emir_api, proposal_id, and sync_token required' });
    }

    try {
      await validateEmirOrigin(emir_api);
    } catch (err: any) {
      return reply.status(400).send({ error: 'bad_request', message: err.message });
    }

    const url = `${emir_api.replace(/\/+$/, '')}/api/proposals/${encodeURIComponent(proposal_id)}/messages/external?sync_token=${encodeURIComponent(sync_token)}&phase=revision`;

    try {
      const res = await safeFetch(url);
      if (!res.ok) {
        const errBody = await safeReadText(res).catch(() => 'Unknown error');
        return reply.status(res.status).send({ error: 'emir_error', message: errBody.slice(0, 1000) });
      }
      const result = await res.json();
      return result;
    } catch (err: any) {
      return reply.status(502).send({ error: 'fetch_failed', message: err.message });
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
      { doctype: '<!DOCTYPE html>', htmlAttributes: '', head: '', bodyAttributes: '', bodyScripts: '' },
      html,
      css
    );

    await fs.writeFile(resolved, output, 'utf-8');
    templates.set(filename, parseHtmlTemplate(output));
    return reply.status(201).send({ success: true, path: filename });
  });
}
