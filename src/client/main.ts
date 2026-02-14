import { createEditor } from './config/editor.js';
import { applyFormat } from './format-manager.js';
import * as api from './api.js';

type DocFormat = 'desktop' | 'a4' | '16:9' | '4:3';

let currentFile: string | null = null;
let isDirty = false;
let originalHtml = '';
let fileHandle: FileSystemFileHandle | null = null;
let currentFormat: DocFormat = 'desktop';

const editor = createEditor('#gjs');

// --- Format Detection & Control ---

function detectFormat(html: string): DocFormat {
  // Check for slide-like patterns: viewport-sized sections, slide classes
  if (/class="[^"]*slide/i.test(html) || /width:\s*13\.333in/i.test(html)) return '16:9';
  if (/width:\s*10in;\s*height:\s*7\.5in/i.test(html)) return '4:3';
  // Check for A4 patterns: page-break, print styles, A4 dimensions
  if (/page-break/i.test(html) || /210mm/i.test(html) || /class="[^"]*page/i.test(html)) return 'a4';
  return 'desktop';
}

function setFormat(format: DocFormat) {
  currentFormat = format;
  const deviceMap: Record<DocFormat, string> = {
    'desktop': 'Desktop',
    'a4': 'A4',
    '16:9': 'Slide 16:9',
    '4:3': 'Slide 4:3',
  };
  editor.setDevice(deviceMap[format]);
  applyFormat(editor, format);
  const select = document.getElementById('ps-format') as HTMLSelectElement | null;
  if (select && select.value !== format) select.value = format;
}

// --- File Loading ---

function loadHtmlContent(html: string, filename: string) {
  originalHtml = html;

  // Clean up previously injected scripts/styles from the canvas iframe
  const prevIframe = editor.Canvas.getFrameEl();
  if (prevIframe?.contentDocument) {
    prevIframe.contentDocument.querySelectorAll('[data-pagesmithy]').forEach(el => el.remove());
    prevIframe.contentDocument.getElementById('pagesmith-editor-overrides')?.remove();
    prevIframe.contentDocument.getElementById('pagesmith-format-vars')?.remove();
  }

  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const bodyContent = bodyMatch ? bodyMatch[1] : html;

  // Only extract pagesmith-styles (original doc styles stay in head)
  const psMatcher = html.match(/<style\s+id="pagesmith-styles"[^>]*>([\s\S]*?)<\/style>/i);
  const css = psMatcher ? psMatcher[1] : '';

  editor.setComponents(bodyContent);
  editor.setStyle(css);

  // Inject original document styles into the canvas iframe
  const iframe = editor.Canvas.getFrameEl();
  if (iframe?.contentDocument) {
    // Set base URL for relative asset resolution
    let baseEl = iframe.contentDocument.querySelector('base');
    if (!baseEl) {
      baseEl = iframe.contentDocument.createElement('base');
      iframe.contentDocument.head.appendChild(baseEl);
    }
    baseEl.href = '/project/';

    // Inject original <style> and <link> tags so the canvas renders correctly
    const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    if (headMatch) {
      const headContent = headMatch[1];
      // Extract style tags (but not pagesmith-styles) and link tags
      const styleTags = headContent.match(/<style(?!\s+id="pagesmith-styles")[^>]*>[\s\S]*?<\/style>/gi) || [];
      const linkTags = headContent.match(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi) || [];
      for (const tag of [...styleTags, ...linkTags]) {
        const node = iframe.contentDocument.createRange().createContextualFragment(tag);
        // Tag injected head nodes so they can be cleaned up on next file load
        for (const child of node.children) {
          (child as HTMLElement).dataset.pagesmithy = 'injected-head';
        }
        iframe.contentDocument.head.appendChild(node);
      }
    }

    // Override CSS that hides content via JS (e.g., stacked slides with opacity:0).
    // GrapesJS strips scripts, so JS-driven visibility never runs.
    // This makes all elements visible and laid out vertically for editing.
    const editorOverrides = iframe.contentDocument.createElement('style');
    editorOverrides.id = 'pagesmith-editor-overrides';
    editorOverrides.textContent = `
      /* Make stacked/hidden slides visible for editing */
      .slide, [class*="slide"] {
        position: relative !important;
        opacity: 1 !important;
        transform: none !important;
        pointer-events: auto !important;
        display: block !important;
        margin-bottom: 24px !important;
      }
      /* Make hidden elements visible */
      [aria-hidden="true"] {
        display: block !important;
        opacity: 1 !important;
      }
      /* Remove animations that might hide content */
      * { animation: none !important; }
      /* Override JS-driven animation initial states (opacity:0, translateY, etc.)
         so content is visible in the editor where scripts may not run */
      [data-fade-in], [data-split-words],
      [data-fade-in] > *, [data-split-words] .word {
        opacity: 1 !important;
        transform: none !important;
        filter: none !important;
      }
    `;
    iframe.contentDocument.head.appendChild(editorOverrides);

    // Re-inject scripts that GrapesJS stripped so JS-driven content renders.
    // Use DOMParser to safely parse attributes instead of fragile regex.
    const scriptMatches = html.match(/<script[\s\S]*?<\/script>/gi) || [];
    const parser = new DOMParser();
    for (const tag of scriptMatches) {
      const parsed = parser.parseFromString(tag, 'text/html');
      const origScript = parsed.querySelector('script');
      if (!origScript) continue;

      const script = iframe.contentDocument.createElement('script');
      // Copy all attributes from the DOMParser-parsed node
      for (const attr of origScript.attributes) {
        script.setAttribute(attr.name, attr.value);
      }
      // Set inline content if no src attribute
      const rawSrc = script.getAttribute('src')?.trim();
      if (!rawSrc) {
        const inline = origScript.textContent?.trim();
        if (inline) script.textContent = inline;
        else continue;
      }
      script.dataset.pagesmithy = 'injected';
      iframe.contentDocument.body.appendChild(script);
    }
  }

  currentFile = filename;
  isDirty = false;
  updateTitle();

  // Auto-detect and set format
  setFormat(detectFormat(html));
}

async function loadProjectFile(filePath: string) {
  const html = await api.readFile(filePath);
  fileHandle = null; // Server-managed file
  loadHtmlContent(html, filePath);
}

async function openFromDisk() {
  try {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: 'HTML files', accept: { 'text/html': ['.html', '.htm'] } }],
    });
    fileHandle = handle;
    const file = await handle.getFile();
    const html = await file.text();
    loadHtmlContent(html, handle.name);
  } catch {
    // User cancelled the picker
  }
}

// --- HTML Recombination (client-side) ---

function recombineHtml(): string {
  const body = editor.getHtml();
  const css = editor.getCss() ?? '';

  if (originalHtml) {
    let result = originalHtml;
    // Replace body content (preserve body attributes)
    result = result.replace(/(<body[^>]*>)[\s\S]*(<\/body>)/i, `$1\n${body}\n$2`);
    // Remove existing pagesmith-styles
    result = result.replace(/<style\s+id="pagesmith-styles"[^>]*>[\s\S]*?<\/style>\s*/i, '');
    // Insert new pagesmith-styles before </head>
    if (css) {
      result = result.replace(/<\/head>/i, `<style id="pagesmith-styles">\n${css}\n</style>\n</head>`);
    }
    return result;
  }

  // Fallback: build from scratch
  return `<!DOCTYPE html>\n<html>\n<head>\n<style id="pagesmith-styles">${css}</style>\n</head>\n<body>${body}</body>\n</html>`;
}

// --- Save ---

async function handleSave() {
  if (fileHandle) {
    // Save back via File System Access API
    try {
      const html = recombineHtml();
      const writable = await fileHandle.createWritable();
      await writable.write(html);
      await writable.close();
      originalHtml = html;
      isDirty = false;
      updateTitle();
      showToast('Saved');
    } catch (err) {
      showToast('Save failed', true);
    }
  } else if (currentFile) {
    // Save via server
    const html = editor.getHtml();
    const css = editor.getCss() ?? '';
    await api.saveFile(currentFile, { html, css });
    isDirty = false;
    updateTitle();
    showToast('Saved');

    // Sync back to EMIR if this is a proposal file with valid sync context
    const proposalMatch = currentFile?.match(/proposal-(\d+)\.html/);
    if (proposalMatch) {
      const proposalId = proposalMatch[1];
      const emirUrl = sessionStorage.getItem('emir-api-url');
      const syncToken = sessionStorage.getItem(`emir-sync-token-${proposalId}`);
      if (emirUrl && syncToken && isValidEmirUrl(emirUrl)) {
        const combinedHtml = recombineHtml();
        fetch('/api/files/emir-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: `${emirUrl}/api/proposals/${proposalId}/import-html`,
            html: combinedHtml,
            sync_token: syncToken,
          }),
        })
          .then(res => {
            if (res.ok) showToast('Synced to EMIR');
            else showToast('EMIR sync: auth failed', true);
          })
          .catch(() => showToast('EMIR sync failed (offline?)', true));
      }
    }
  }
}

async function handleSaveAs() {
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: currentFile || 'untitled.html',
        types: [{ description: 'HTML files', accept: { 'text/html': ['.html'] } }],
      });
      fileHandle = handle;
      const html = recombineHtml();
      const writable = await handle.createWritable();
      await writable.write(html);
      await writable.close();
      originalHtml = html;
      currentFile = handle.name;
      isDirty = false;
      updateTitle();
      showToast(`Saved as ${handle.name}`);
    } catch {
      // User cancelled
    }
  } else {
    // Fallback: download
    const html = recombineHtml();
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentFile || 'untitled.html';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Downloaded');
  }
}

// --- PDF Export ---

async function handleExportPdf() {
  const fullHtml = recombineHtml();
  const exportFormat = currentFormat === 'desktop' ? 'a4' : currentFormat;

  showToast('Exporting PDF...');
  try {
    const blob = await api.exportPdf({ html: fullHtml, format: exportFormat as 'a4' | '16:9' | '4:3' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (currentFile?.replace(/\.html?$/i, '') || 'export') + '.pdf';
    a.click();
    URL.revokeObjectURL(url);
    showToast('PDF exported');
  } catch {
    showToast('PDF export failed', true);
  }
}

// --- Dirty State ---

editor.on('change:changesCount', () => {
  isDirty = true;
  updateTitle();
});

window.addEventListener('beforeunload', (e) => {
  if (isDirty) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// --- Keyboard Shortcuts ---

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault();
    if (e.shiftKey) {
      handleSaveAs();
    } else {
      handleSave();
    }
  }
});

// --- UI Helpers ---

function updateTitle() {
  const name = currentFile || 'PageSmith';
  document.title = `${isDirty ? '\u25cf ' : ''}${name} \u2014 PageSmith`;
  const el = document.getElementById('ps-filename');
  if (el) el.textContent = `${isDirty ? '\u25cf ' : ''}${currentFile || 'No file loaded'}`;
}

function showToast(message: string, isError = false) {
  const existing = document.querySelector('.pagesmith-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'pagesmith-toast' + (isError ? ' pagesmith-toast-error' : '');
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function askUnsavedChanges(filename: string): Promise<'save' | 'discard' | 'cancel'> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'pagesmith-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'pagesmith-modal';

    const heading = document.createElement('h3');
    heading.textContent = 'Unsaved Changes';
    modal.appendChild(heading);

    const msg = document.createElement('p');
    msg.textContent = `Save changes to ${filename}?`;
    msg.style.margin = '0 0 20px';
    msg.style.color = '#ccc';
    modal.appendChild(msg);

    const actions = document.createElement('div');
    actions.className = 'pagesmith-modal-actions';
    actions.style.justifyContent = 'flex-end';
    actions.style.gap = '8px';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'pagesmith-modal-cancel';
    cancelBtn.textContent = 'Cancel';

    const discardBtn = document.createElement('button');
    discardBtn.className = 'pagesmith-modal-cancel';
    discardBtn.textContent = 'Discard';
    discardBtn.style.color = '#e74c3c';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'pagesmith-modal-cancel';
    saveBtn.textContent = 'Save';
    saveBtn.style.background = 'rgba(212, 175, 55, 0.15)';
    saveBtn.style.borderColor = '#D4AF37';
    saveBtn.style.color = '#D4AF37';

    const cleanup = (result: 'save' | 'discard' | 'cancel') => {
      overlay.remove();
      resolve(result);
    };

    cancelBtn.addEventListener('click', () => cleanup('cancel'));
    discardBtn.addEventListener('click', () => cleanup('discard'));
    saveBtn.addEventListener('click', () => cleanup('save'));

    actions.appendChild(cancelBtn);
    actions.appendChild(discardBtn);
    actions.appendChild(saveBtn);
    modal.appendChild(actions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  });
}

// --- File Picker ---

async function showFilePicker() {
  if (isDirty && currentFile) {
    const choice = await askUnsavedChanges(currentFile);
    if (choice === 'cancel') return;
    if (choice === 'save') await handleSave();
  }

  // Use native file picker (File System Access API)
  if ('showOpenFilePicker' in window) {
    await openFromDisk();
    return;
  }

  // Fallback: show project files list
  const files = await api.listFiles();
  if (files.length === 0) {
    showToast('No HTML files found', true);
    return;
  }
  const choice = prompt(
    'Choose a file:\n' + files.map((f, i) => `${i + 1}. ${f.path}`).join('\n'),
    '1'
  );
  if (choice) {
    const index = parseInt(choice, 10) - 1;
    if (index >= 0 && index < files.length) {
      await loadProjectFile(files[index].path);
    }
  }
}

// --- Init ---

// Wire up format selector
const formatSelect = document.getElementById('ps-format') as HTMLSelectElement | null;
formatSelect?.addEventListener('change', () => {
  setFormat(formatSelect.value as DocFormat);
});

// --- EMIR Integration ---

/** Validate EMIR API URL: require https (allow http only for localhost in dev). */
function isValidEmirUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    const isLocal = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    return u.protocol === 'https:' || (isLocal && u.protocol === 'http:');
  } catch {
    return false;
  }
}

// Read query params — use sessionStorage (not localStorage) for tokens
(() => {
  const params = new URLSearchParams(window.location.search);
  const syncToken = params.get('sync_token');
  const emirApi = params.get('emir_api');
  const file = params.get('file');

  if (syncToken && file) {
    const idMatch = file.match(/proposal-(\d+)\.html/);
    if (idMatch) {
      sessionStorage.setItem(`emir-sync-token-${idMatch[1]}`, syncToken);
    }
  }
  if (emirApi && isValidEmirUrl(emirApi)) {
    sessionStorage.setItem('emir-api-url', emirApi);
  }
})();

// Auto-load: prefer ?file= query param, fallback to first project file
(async () => {
  const params = new URLSearchParams(window.location.search);
  const requestedFile = params.get('file');

  if (requestedFile) {
    try {
      await loadProjectFile(requestedFile);
      return;
    } catch (err: any) {
      // Only attempt EMIR remote fetch on 404 (file not found), not other errors
      const is404 = err?.status === 404;
      if (is404) {
        const emirApi = params.get('emir_api') || sessionStorage.getItem('emir-api-url');
        const syncToken = params.get('sync_token');
        const match = requestedFile.match(/proposal-(\d+)\.html/);

        if (emirApi && syncToken && match && isValidEmirUrl(emirApi)) {
          const proposalId = match[1];
          const fetchUrl = `${emirApi}/api/proposals/${proposalId}/export/html-raw?sync_token=${encodeURIComponent(syncToken)}`;
          try {
            await api.fetchRemoteFile(fetchUrl, requestedFile);
            await loadProjectFile(requestedFile);
            return;
          } catch (fetchErr) {
            console.warn('Failed to fetch from EMIR API:', fetchErr);
          }
        }
      }

      console.warn(`Could not load requested file: ${requestedFile}`);
    }
  }

  const files = await api.listFiles();
  if (files.length > 0) {
    await loadProjectFile(files[0].path);
  }
})();

// Export for use by toolbar buttons and plugins
(window as any).__pagesmith = {
  editor,
  handleSave,
  handleSaveAs,
  handleExportPdf,
  loadFile: loadProjectFile,
  loadHtmlContent,
  recombineHtml,
  showFilePicker,
};
