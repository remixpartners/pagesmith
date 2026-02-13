export interface HtmlTemplate {
  doctype: string;
  htmlAttributes: string;
  head: string;
  bodyAttributes: string;
}

export function parseHtmlTemplate(html: string): HtmlTemplate {
  const doctypeMatch = html.match(/^(<!DOCTYPE[^>]*>)/i);
  const doctype = doctypeMatch ? doctypeMatch[1] : '';

  const htmlAttrMatch = html.match(/<html([^>]*)>/i);
  const htmlAttributes = htmlAttrMatch ? htmlAttrMatch[1].trim() : '';

  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  let head = headMatch ? headMatch[1] : '';

  // Remove any existing pagesmith-styles block from the stored head
  head = head.replace(/<style\s+id="pagesmith-styles"[^>]*>[\s\S]*?<\/style>/i, '').trim();

  const bodyAttrMatch = html.match(/<body([^>]*)>/i);
  const bodyAttributes = bodyAttrMatch ? bodyAttrMatch[1].trim() : '';

  return { doctype, htmlAttributes, head, bodyAttributes };
}

export function recombineHtml(
  template: HtmlTemplate,
  bodyHtml: string,
  css: string
): string {
  const htmlAttr = template.htmlAttributes ? ` ${template.htmlAttributes}` : '';
  const bodyAttr = template.bodyAttributes ? ` ${template.bodyAttributes}` : '';
  const styleBlock = css
    ? `\n<style id="pagesmith-styles">\n${css}\n</style>`
    : '';

  const lines = [
    template.doctype,
    `<html${htmlAttr}>`,
    '<head>',
    template.head,
    styleBlock,
    '</head>',
    `<body${bodyAttr}>`,
    bodyHtml,
    '</body>',
    '</html>',
  ].filter(Boolean);

  return lines.join('\n') + '\n';
}
