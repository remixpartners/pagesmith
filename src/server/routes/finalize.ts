import type { FastifyInstance } from 'fastify';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { resolveSafePath } from '../utils/path-guard.js';

/**
 * Remix patch: one-click "Finalize -> Drive" from the editor toolbar.
 *
 * Enabled only when the host sets PS_FINALIZE_CMD (e.g. pagesmith-serve on the
 * Buzz droplet points it at /opt/kirby/feedback/finalize.sh). The command is
 * invoked as: CMD <absolute-file-path> <PS_FINALIZE_SLUG>. The command itself
 * owns safety (brand check, update-only Drive write, channel announce); this
 * route only guards the path and relays output.
 */
export function registerFinalizeRoutes(app: FastifyInstance, baseDir: string) {
  const cmd = process.env.PS_FINALIZE_CMD || '';
  const slug = process.env.PS_FINALIZE_SLUG || '';

  app.get('/api/finalize/status', async () => ({ enabled: Boolean(cmd), slug }));

  app.post<{ Body: { path?: string } }>('/api/finalize', async (request, reply) => {
    if (!cmd) return reply.code(404).send({ error: 'finalize not configured' });
    const rel = request.body?.path || '';
    let abs: string;
    try {
      abs = resolveSafePath(baseDir, rel);
    } catch {
      return reply.code(400).send({ error: 'bad path' });
    }
    return await new Promise((resolve) => {
      execFile(cmd, [abs, slug], { timeout: 120_000 }, (err, stdout, stderr) => {
        const output = `${stdout || ''}${stderr || ''}`.slice(-1500);
        if (err) {
          resolve(reply.code(500).send({ ok: false, output, error: String(err.code ?? err.message) }));
        } else {
          resolve({ ok: true, output, file: path.basename(abs) });
        }
      });
    });
  });
}
