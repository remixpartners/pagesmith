import puppeteer from 'puppeteer';

interface PdfOptions {
  format?: 'a4' | '16:9' | '4:3';
  serverPort?: number;
}

const FORMAT_OPTIONS = {
  'a4': { format: 'A4' as const, printBackground: true },
  '16:9': { width: '13.333in', height: '7.5in', printBackground: true },
  '4:3': { width: '10in', height: '7.5in', printBackground: true },
};

export async function renderPdf(html: string, options: PdfOptions = {}): Promise<Buffer> {
  const format = options.format || 'a4';
  const pdfOptions = FORMAT_OPTIONS[format];
  const serverPort = options.serverPort || 3000;

  const baseTag = `<base href="http://127.0.0.1:${serverPort}/project/">`;
  const htmlWithBase = html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);

  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(htmlWithBase, { waitUntil: 'networkidle0', timeout: 25000 });
    const pdf = await page.pdf(pdfOptions);
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
