import type { Editor } from 'grapesjs';

export function setupPanels(editor: Editor) {
  // Top toolbar panel
  editor.Panels.addPanel({
    id: 'top-toolbar',
    el: createToolbar(editor),
  });

  // Left sidebar toggle buttons
  editor.Panels.addPanel({
    id: 'sidebar-toggle',
    buttons: [
      {
        id: 'show-blocks',
        active: true,
        label: '<svg viewBox="0 0 24 24" width="18" height="18"><rect x="3" y="3" width="7" height="7" fill="currentColor"/><rect x="14" y="3" width="7" height="7" fill="currentColor"/><rect x="3" y="14" width="7" height="7" fill="currentColor"/><rect x="14" y="14" width="7" height="7" fill="currentColor"/></svg>',
        command: 'open-blocks',
        togglable: true,
      },
      {
        id: 'show-layers',
        label: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 2L2 7l10 5 10-5L12 2zM2 17l10 5 10-5M2 12l10 5 10-5" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
        command: 'open-layers',
        togglable: true,
      },
      {
        id: 'show-styles',
        active: true,
        label: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 22C6.49 22 2 17.51 2 12S6.49 2 12 2s10 4.04 10 9c0 3.31-2.69 6-6 6h-1.77c-.28 0-.5.22-.5.5 0 .12.05.23.13.33.41.47.64 1.06.64 1.67A2.5 2.5 0 0 1 12 22z" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
        command: 'open-sm',
        togglable: true,
      },
      {
        id: 'show-traits',
        label: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97s-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1s.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.58 1.69-.98l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64L19.43 12.97z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
        command: 'open-traits',
        togglable: true,
      },
    ],
  });

  // Device selector buttons
  editor.Panels.addPanel({
    id: 'devices',
    buttons: [
      { id: 'device-desktop', label: 'Desktop', command: { run: (e: Editor) => e.setDevice('Desktop') }, active: true },
      { id: 'device-tablet', label: 'Tablet', command: { run: (e: Editor) => e.setDevice('Tablet') } },
      { id: 'device-mobile', label: 'Mobile', command: { run: (e: Editor) => e.setDevice('Mobile') } },
      { id: 'device-a4', label: 'A4', command: { run: (e: Editor) => e.setDevice('A4') } },
      { id: 'device-slide', label: '16:9', command: { run: (e: Editor) => e.setDevice('Slide 16:9') } },
    ],
  });
}

function createToolbar(editor: Editor): HTMLElement {
  const toolbar = document.createElement('div');
  toolbar.className = 'pagesmith-toolbar';
  toolbar.innerHTML = `
    <div class="pagesmith-toolbar-left">
      <span class="pagesmith-logo">PageSmith</span>
      <button id="ps-open" title="Open file">Open</button>
    </div>
    <div class="pagesmith-toolbar-center">
      <span id="ps-filename" class="pagesmith-filename">No file loaded</span>
    </div>
    <div class="pagesmith-toolbar-right">
      <button id="ps-undo" title="Undo (Cmd+Z)">Undo</button>
      <button id="ps-redo" title="Redo (Cmd+Shift+Z)">Redo</button>
      <button id="ps-save" title="Save (Cmd+S)">Save</button>
      <button id="ps-save-as" title="Save As (Cmd+Shift+S)">Save As</button>
      <button id="ps-export-pdf" title="Export PDF">Export PDF</button>
    </div>
  `;

  // Wire up buttons after toolbar is in DOM
  setTimeout(() => {
    const ps = (window as any).__pagesmith;
    toolbar.querySelector('#ps-open')?.addEventListener('click', () => ps?.showFilePicker());
    toolbar.querySelector('#ps-save')?.addEventListener('click', () => ps?.handleSave());
    toolbar.querySelector('#ps-save-as')?.addEventListener('click', () => ps?.handleSaveAs());
    toolbar.querySelector('#ps-export-pdf')?.addEventListener('click', () => ps?.handleExportPdf());
    toolbar.querySelector('#ps-undo')?.addEventListener('click', () => editor.UndoManager.undo());
    toolbar.querySelector('#ps-redo')?.addEventListener('click', () => editor.UndoManager.redo());
  }, 100);

  return toolbar;
}
