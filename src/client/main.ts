import { createEditor } from './config/editor.js';
import * as api from './api.js';

let currentFile: string | null = null;
let isDirty = false;
let originalHead = '';

const editor = createEditor('#gjs');

// --- File Loading ---

async function loadFile(filePath: string) {
  if (isDirty && currentFile) {
    const save = confirm(`Save changes to ${currentFile}?`);
    if (save) {
      await handleSave();
    } else {
      const discard = confirm('Discard unsaved changes?');
      if (!discard) return;
    }
  }

  const html = await api.readFile(filePath);

  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const bodyContent = bodyMatch ? bodyMatch[1] : html;

  // Store original head for use in PDF export (preserves external CSS, fonts, meta)
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  originalHead = headMatch ? headMatch[1] : '';

  // Only extract the pagesmith-styles block (written by previous saves).
  // Original document styles are preserved in <head> by the server and
  // should not be loaded into the GrapesJS style manager to avoid duplication.
  const psMatcher = html.match(/<style\s+id="pagesmith-styles"[^>]*>([\s\S]*?)<\/style>/i);
  const css = psMatcher ? psMatcher[1] : '';

  editor.setComponents(bodyContent);
  editor.setStyle(css);

  const iframe = editor.Canvas.getFrameEl();
  if (iframe?.contentDocument) {
    let baseEl = iframe.contentDocument.querySelector('base');
    if (!baseEl) {
      baseEl = iframe.contentDocument.createElement('base');
      iframe.contentDocument.head.appendChild(baseEl);
    }
    baseEl.href = '/project/';
  }

  currentFile = filePath;
  isDirty = false;
  updateTitle();
}

// --- Save ---

async function handleSave() {
  if (!currentFile) return;
  const html = editor.getHtml();
  const css = editor.getCss() ?? '';
  await api.saveFile(currentFile, { html, css });
  isDirty = false;
  updateTitle();
  showToast('Saved');
}

async function handleSaveAs() {
  const filename = prompt('Save as filename:', 'untitled.html');
  if (!filename) return;
  const html = editor.getHtml();
  const css = editor.getCss() ?? '';
  const path = await api.saveAsFile({ filename, html, css });
  currentFile = path;
  isDirty = false;
  updateTitle();
  showToast(`Saved as ${filename}`);
}

// --- PDF Export ---

async function handleExportPdf() {
  const fullHtml = buildFullHtml();
  const format = prompt('Export format (a4, 16:9, 4:3):', 'a4') as 'a4' | '16:9' | '4:3' | null;
  if (!format) return;

  showToast('Exporting PDF...');
  try {
    const blob = await api.exportPdf({ html: fullHtml, format });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (currentFile?.replace('.html', '') || 'export') + '.pdf';
    a.click();
    URL.revokeObjectURL(url);
    showToast('PDF exported');
  } catch (err) {
    showToast('PDF export failed', true);
  }
}

function buildFullHtml(): string {
  const body = editor.getHtml();
  const css = editor.getCss() ?? '';
  // Strip any existing pagesmith-styles from stored head to avoid duplication
  const cleanHead = originalHead.replace(/<style\s+id="pagesmith-styles"[^>]*>[\s\S]*?<\/style>/i, '');
  return `<!DOCTYPE html>
<html>
<head>
${cleanHead}
<style id="pagesmith-styles">${css}</style>
</head>
<body>${body}</body>
</html>`;
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
  document.title = `${isDirty ? '● ' : ''}${name} — PageSmith`;
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

// --- File Picker (initial load) ---

async function showFilePicker() {
  const files = await api.listFiles();
  if (files.length === 0) {
    showToast('No HTML files found in project directory', true);
    return;
  }
  if (files.length === 1) {
    await loadFile(files[0].path);
  } else {
    const choice = prompt(
      'Choose a file to open:\n' + files.map((f, i) => `${i + 1}. ${f.path}`).join('\n'),
      '1'
    );
    if (choice) {
      const index = parseInt(choice, 10) - 1;
      if (index >= 0 && index < files.length) {
        await loadFile(files[index].path);
      }
    }
  }
}

// --- Init ---

showFilePicker();

// Export for use by plugins
(window as any).__pagesmith = {
  editor,
  handleSave,
  handleSaveAs,
  handleExportPdf,
  loadFile,
  showFilePicker,
};
