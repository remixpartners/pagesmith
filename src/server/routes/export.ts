import type { FastifyInstance } from 'fastify';
import { renderPdf } from '../utils/pdf-renderer.js';
import type { PdfExportRequest } from '../../shared/types.js';

export function registerExportRoutes(app: FastifyInstance, port: number) {
  app.post('/api/export/pdf', async (request, reply) => {
    const body = request.body as Partial<PdfExportRequest>;

    if (!body.html) {
      return reply.status(400).send({ error: 'bad_request', message: 'html field is required' });
    }

    try {
      const pdf = await renderPdf(body.html, { format: body.format, serverPort: port });
      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', 'attachment; filename="export.pdf"')
        .send(pdf);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'PDF export failed';
      return reply.status(500).send({ error: 'export_failed', message });
    }
  });
}
