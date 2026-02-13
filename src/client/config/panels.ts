import type { Editor } from 'grapesjs';

/* ── SVG Icons (Lucide-style, 16×16, stroke-based) ── */

const svg = (d: string) =>
  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

const icons = {
  undo: svg('<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>'),
  redo: svg('<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>'),
  outline: svg('<rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="4 2"/>'),
  eye: svg('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'),
  fullscreen: svg('<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>'),
  styles: svg('<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>'),
  settings: svg(
    '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/>' +
    '<line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/>' +
    '<line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>' +
    '<line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/>' +
    '<line x1="17" y1="16" x2="23" y2="16"/>'
  ),
  layers: svg('<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>'),
  blocks: svg('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>'),
};

export function setupPanels(editor: Editor) {
  populateToolbar(editor);
}

function populateToolbar(editor: Editor) {
  const container = document.getElementById('pagesmith-toolbar');
  if (!container) return;

  container.className = 'pagesmith-toolbar';
  container.innerHTML = `
    <div class="pagesmith-toolbar-left">
      <span class="pagesmith-logo">PageSmith</span>
      <button id="ps-open" class="ps-btn" title="Open file">Open</button>
    </div>
    <div class="pagesmith-toolbar-center">
      <span id="ps-filename" class="pagesmith-filename">No file loaded</span>
      <select id="ps-format" title="Document format">
        <option value="desktop">Desktop</option>
        <option value="a4">A4 Page</option>
        <option value="16:9">Slide 16:9</option>
        <option value="4:3">Slide 4:3</option>
      </select>
    </div>
    <div class="pagesmith-toolbar-right">
      <div class="ps-btn-group">
        <button id="ps-undo" class="ps-icon-btn" data-tooltip="Undo (Cmd+Z)">${icons.undo}</button>
        <button id="ps-redo" class="ps-icon-btn" data-tooltip="Redo (Cmd+Shift+Z)">${icons.redo}</button>
      </div>
      <div class="ps-separator"></div>
      <div class="ps-btn-group">
        <button id="ps-sw-visibility" class="ps-icon-btn" data-tooltip="Outlines">${icons.outline}</button>
        <button id="ps-preview" class="ps-icon-btn" data-tooltip="Preview">${icons.eye}</button>
        <button id="ps-fullscreen" class="ps-icon-btn" data-tooltip="Fullscreen">${icons.fullscreen}</button>
      </div>
      <div class="ps-separator"></div>
      <div class="ps-btn-group">
        <button id="ps-open-sm" class="ps-icon-btn" data-tooltip="Styles">${icons.styles}</button>
        <button id="ps-open-tm" class="ps-icon-btn" data-tooltip="Settings">${icons.settings}</button>
        <button id="ps-open-layers" class="ps-icon-btn" data-tooltip="Layers">${icons.layers}</button>
        <button id="ps-open-blocks" class="ps-icon-btn" data-tooltip="Blocks">${icons.blocks}</button>
      </div>
      <div class="ps-separator"></div>
      <div class="ps-btn-group">
        <button id="ps-save" class="ps-btn" title="Save (Cmd+S)">Save</button>
        <button id="ps-save-as" class="ps-btn" title="Save As (Cmd+Shift+S)">Save As</button>
        <button id="ps-export-pdf" class="ps-btn ps-btn-primary" title="Export PDF">Export PDF</button>
      </div>
    </div>
  `;

  // ── File operations ──

  container.querySelector('#ps-open')?.addEventListener('click', () => {
    (window as any).__pagesmith?.showFilePicker();
  });
  container.querySelector('#ps-save')?.addEventListener('click', () => {
    (window as any).__pagesmith?.handleSave();
  });
  container.querySelector('#ps-save-as')?.addEventListener('click', () => {
    (window as any).__pagesmith?.handleSaveAs();
  });
  container.querySelector('#ps-export-pdf')?.addEventListener('click', () => {
    (window as any).__pagesmith?.handleExportPdf();
  });
  container.querySelector('#ps-undo')?.addEventListener('click', () => editor.UndoManager.undo());
  container.querySelector('#ps-redo')?.addEventListener('click', () => editor.UndoManager.redo());

  // ── GrapesJS view toggles (mutually exclusive sidebar panels) ──

  const viewCmds = ['open-sm', 'open-tm', 'open-layers', 'open-blocks'];
  const viewBtns: Record<string, HTMLElement> = {};

  viewCmds.forEach(cmd => {
    const btn = container.querySelector(`#ps-${cmd}`) as HTMLElement;
    if (btn) {
      viewBtns[cmd] = btn;
      btn.addEventListener('click', () => {
        if (btn.classList.contains('active')) {
          editor.stopCommand(cmd);
        } else {
          // Stop the currently active view first — runCommand is a no-op
          // if the same command is already active
          viewCmds.forEach(c => {
            if (c !== cmd) editor.stopCommand(c);
          });
          editor.runCommand(cmd);
        }
      });
    }
  });

  // Sync button active states from GrapesJS events
  viewCmds.forEach(cmd => {
    editor.on(`run:${cmd}`, () => {
      viewCmds.forEach(c => {
        if (c !== cmd && viewBtns[c]) viewBtns[c].classList.remove('active');
      });
      if (viewBtns[cmd]) viewBtns[cmd].classList.add('active');
    });
    editor.on(`stop:${cmd}`, () => {
      if (viewBtns[cmd]) viewBtns[cmd].classList.remove('active');
    });
  });

  // ── Independent toggles (outline, preview, fullscreen) ──

  ['sw-visibility', 'preview', 'fullscreen'].forEach(cmd => {
    const btn = container.querySelector(`#ps-${cmd}`) as HTMLElement;
    if (btn) {
      btn.addEventListener('click', () => {
        if (btn.classList.contains('active')) {
          editor.stopCommand(cmd);
        } else {
          editor.runCommand(cmd);
        }
      });
      editor.on(`run:${cmd}`, () => btn.classList.add('active'));
      editor.on(`stop:${cmd}`, () => btn.classList.remove('active'));
    }
  });

  // Open the blocks panel by default so the sidebar is visible on load
  editor.on('load', () => {
    editor.runCommand('open-blocks');
  });
}
