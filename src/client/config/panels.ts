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
  chat: svg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
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
        <button id="ps-open-blocks" class="ps-icon-btn" data-tooltip="Blocks">${icons.blocks}</button>
      </div>
      <div class="ps-separator ps-revise-separator" style="display:none"></div>
      <div class="ps-btn-group ps-revise-group" style="display:none">
        <button id="ps-revise" class="ps-icon-btn ps-revise-btn" data-tooltip="Revise with AI">${icons.chat}</button>
      </div>
      <div class="ps-separator"></div>
      <div class="ps-btn-group">
        <button id="ps-save" class="ps-btn" title="Save (Cmd+S)">Save</button>
        <button id="ps-save-as" class="ps-btn" title="Save As (Cmd+Shift+S)">Save As</button>
        <button id="ps-export-pdf" class="ps-btn ps-btn-primary" title="Export PDF">Export PDF</button>
        <button id="ps-finalize" class="ps-btn ps-btn-primary" style="display:none" title="Save this file back to its Google Drive original (revision history kept)">Finalize → Drive</button>
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
  // Remix patch: one-click finalize back to Google Drive (visible only when the
  // host configured PS_FINALIZE_CMD -- see server/routes/finalize.ts).
  const finBtn = container.querySelector('#ps-finalize') as HTMLButtonElement | null;
  if (finBtn) {
    fetch('/api/finalize/status').then(r => r.json()).then(st => {
      if (st.enabled) finBtn.style.display = '';
    }).catch(() => {});
    finBtn.addEventListener('click', async () => {
      const ps = (window as any).__pagesmith;
      const file = ps?.currentFile || ps?.state?.currentFile || '';
      if (!file) { alert('Open a file first.'); return; }
      if (!confirm(`Finalize "${file}" back to Google Drive? This updates the original Drive file in place (revision history kept).`)) return;
      finBtn.disabled = true; const prev = finBtn.textContent; finBtn.textContent = 'Finalizing…';
      try {
        await ps?.handleSave?.();
        const r = await fetch('/api/finalize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: file }) });
        const d = await r.json();
        finBtn.textContent = d.ok ? 'Finalized ✓' : 'Finalize failed';
        if (!d.ok) alert('Finalize failed:\n' + (d.output || d.error || 'unknown'));
      } catch (e) {
        finBtn.textContent = 'Finalize failed'; alert('Finalize failed: ' + e);
      } finally {
        setTimeout(() => { finBtn.textContent = prev; finBtn.disabled = false; }, 4000);
      }
    });
  }
  container.querySelector('#ps-undo')?.addEventListener('click', () => editor.UndoManager.undo());
  container.querySelector('#ps-redo')?.addEventListener('click', () => editor.UndoManager.redo());

  // ── GrapesJS view toggles (mutually exclusive sidebar panels) ──

  const viewCmds = ['open-sm', 'open-blocks'];
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

  // Show "Revise" button only when full EMIR chat context is available
  const reviseBtn = container.querySelector('#ps-revise') as HTMLElement;
  const reviseSep = container.querySelector('.ps-revise-separator') as HTMLElement;
  const reviseGroup = container.querySelector('.ps-revise-group') as HTMLElement;

  const params = new URLSearchParams(window.location.search);
  const emirApi = params.get('emir_api') || sessionStorage.getItem('emir-api-url');
  const file = params.get('file');
  const syncToken = params.get('sync_token') || (file?.match(/proposal-(\d+)/)?.[1] ? sessionStorage.getItem(`emir-sync-token-${file.match(/proposal-(\d+)/)?.[1]}`) : null);
  const hasFullEmirContext = !!(emirApi && file && syncToken && /proposal-\d+\.html/.test(file));

  if (hasFullEmirContext && reviseBtn && reviseSep && reviseGroup) {
    reviseSep.style.display = '';
    reviseGroup.style.display = '';
    reviseBtn.addEventListener('click', () => {
      const chat = (window as any).__emirRevisionChat;
      if (!chat) return; // Plugin not loaded — don't toggle blind state
      chat.toggle();
    });
    // Sync button active state from panel visibility via MutationObserver
    const syncReviseButtonState = () => {
      const panel = document.getElementById('emir-revision-panel');
      const isOpen = panel?.classList.contains('emir-revision-panel-open') ?? false;
      reviseBtn.classList.toggle('active', isOpen);
    };
    // Observe body for panel creation, then narrow to panel node
    let panelObserver: MutationObserver | null = null;
    const bodyObserver = new MutationObserver(() => {
      const panel = document.getElementById('emir-revision-panel');
      if (panel && !panelObserver) {
        // Panel exists — observe it directly and stop watching body
        bodyObserver.disconnect();
        syncReviseButtonState();
        panelObserver = new MutationObserver(syncReviseButtonState);
        panelObserver.observe(panel, { attributes: true, attributeFilter: ['class'] });
      }
    });
    bodyObserver.observe(document.body, { childList: true });
  }

  // Open the blocks panel by default so the sidebar is visible on load
  editor.on('load', () => {
    editor.runCommand('open-blocks');
  });
}
