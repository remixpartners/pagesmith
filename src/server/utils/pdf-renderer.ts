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
  const origin = `http://127.0.0.1:${serverPort}`;

  // Inject <base> for HTML elements (img src, a href, etc.)
  const baseTag = `<base href="${origin}/project/">`;
  let prepared = html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);

  // CSS url() values in <style> blocks are NOT affected by <base> —
  // they resolve relative to the document URL, which is about:blank
  // when using setContent(). Rewrite /project/ URLs to absolute,
  // but only within <style> blocks and style="" attributes.
  prepared = prepared.replace(
    /(<style[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (_match, open, css, close) => {
      let rewritten = css.replace(/url\(\s*(['"]?)\/project\//g, `url($1${origin}/project/`);
      rewritten = rewritten.replace(/url\(\s*(['"]?)extracted_assets\//g, `url($1${origin}/extracted_assets/`);
      return open + rewritten + close;
    }
  );
  prepared = prepared.replace(
    /style="([^"]*)"/gi,
    (_match, styleVal) => {
      let rewritten = styleVal.replace(/url\(\s*(['"]?)\/project\//g, `url($1${origin}/project/`);
      rewritten = rewritten.replace(/url\(\s*(['"]?)extracted_assets\//g, `url($1${origin}/extracted_assets/`);
      return `style="${rewritten}"`;
    }
  );
  prepared = prepared.replace(
    /style='([^']*)'/gi,
    (_match, styleVal) => {
      let rewritten = styleVal.replace(/url\(\s*(['"]?)\/project\//g, `url($1${origin}/project/`);
      rewritten = rewritten.replace(/url\(\s*(['"]?)extracted_assets\//g, `url($1${origin}/extracted_assets/`);
      return `style='${rewritten}'`;
    }
  );

  // Rewrite <img src="extracted_assets/..."> to absolute
  prepared = prepared.replace(
    /src=(['"])extracted_assets\//gi,
    `src=$1${origin}/extracted_assets/`
  );

  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(prepared, { waitUntil: 'networkidle0', timeout: 25000 });
    const pdf = await page.pdf(pdfOptions);
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
