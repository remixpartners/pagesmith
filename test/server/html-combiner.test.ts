import { describe, it, expect } from 'vitest';
import { parseHtmlTemplate, recombineHtml } from '../../src/server/utils/html-combiner.js';

describe('parseHtmlTemplate', () => {
  it('extracts head content from a full HTML document', () => {
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Test</title></head>
<body><h1>Hello</h1></body></html>`;
    const template = parseHtmlTemplate(html);
    expect(template.head).toContain('<meta charset="utf-8">');
    expect(template.head).toContain('<title>Test</title>');
    expect(template.doctype).toBe('<!DOCTYPE html>');
  });

  it('preserves external link and script tags in head', () => {
    const html = `<!DOCTYPE html>
<html><head><link rel="stylesheet" href="styles.css"><script src="app.js"></script></head>
<body><p>Content</p></body></html>`;
    const template = parseHtmlTemplate(html);
    expect(template.head).toContain('<link rel="stylesheet" href="styles.css">');
    expect(template.head).toContain('<script src="app.js"></script>');
  });

  it('handles HTML with no doctype', () => {
    const html = `<html><head><title>No doctype</title></head><body><p>Hi</p></body></html>`;
    const template = parseHtmlTemplate(html);
    expect(template.doctype).toBe('');
    expect(template.head).toContain('<title>No doctype</title>');
  });
});

describe('recombineHtml', () => {
  it('recombines body and CSS into a self-contained HTML file', () => {
    const originalHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Report</title></head>
<body><h1>Old content</h1></body></html>`;
    const template = parseHtmlTemplate(originalHtml);
    const newBody = '<h1>New content</h1><p>Updated paragraph</p>';
    const newCss = 'h1 { color: red; }';

    const result = recombineHtml(template, newBody, newCss);
    expect(result).toContain('<!DOCTYPE html>');
    expect(result).toContain('<meta charset="utf-8">');
    expect(result).toContain('<title>Report</title>');
    expect(result).toContain('<style id="pagesmith-styles">');
    expect(result).toContain('h1 { color: red; }');
    expect(result).toContain('<h1>New content</h1>');
    expect(result).not.toContain('Old content');
  });

  it('replaces existing pagesmith-styles block on re-save', () => {
    const originalHtml = `<!DOCTYPE html>
<html><head><title>Test</title><style id="pagesmith-styles">old { color: blue; }</style></head>
<body><p>Content</p></body></html>`;
    const template = parseHtmlTemplate(originalHtml);
    const result = recombineHtml(template, '<p>Content</p>', 'new { color: green; }');
    expect(result).toContain('new { color: green; }');
    expect(result).not.toContain('old { color: blue; }');
    expect(result.match(/<style/g)?.length).toBe(1);
  });

  it('preserves html and body attributes', () => {
    const originalHtml = `<!DOCTYPE html>
<html lang="en"><head><title>Test</title></head>
<body class="dark"><p>Hi</p></body></html>`;
    const template = parseHtmlTemplate(originalHtml);
    const result = recombineHtml(template, '<p>New</p>', '');
    expect(result).toContain('<html lang="en">');
    expect(result).toContain('<body class="dark">');
  });

  it('handles HTML with no head styles gracefully', () => {
    const originalHtml = `<!DOCTYPE html><html><head><title>Plain</title></head><body><p>Hi</p></body></html>`;
    const template = parseHtmlTemplate(originalHtml);
    const result = recombineHtml(template, '<p>Hi</p>', 'p { margin: 0; }');
    expect(result).toContain('<style id="pagesmith-styles">');
    expect(result).toContain('p { margin: 0; }');
  });
});
