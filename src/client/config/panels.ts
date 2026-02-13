import type { Editor } from 'grapesjs';

export function setupPanels(editor: Editor) {
  // Populate our custom toolbar (lives outside GrapesJS in the DOM)
  populateToolbar(editor);

  // GrapesJS default panels provide the sidebar views (blocks, layers, styles, traits)
  // and their toggle buttons. We just remove the built-in device selector panel
  // since we have our own format dropdown in the toolbar.
}

function populateToolbar(editor: Editor) {
  const container = document.getElementById('pagesmith-toolbar');
  if (!container) return;

  container.className = 'pagesmith-toolbar';
  container.innerHTML = `
    <div class="pagesmith-toolbar-left">
      <span class="pagesmith-logo">PageSmith</span>
      <button id="ps-open" title="Open file">Open</button>
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
      <button id="ps-undo" title="Undo (Cmd+Z)">Undo</button>
      <button id="ps-redo" title="Redo (Cmd+Shift+Z)">Redo</button>
      <button id="ps-save" title="Save (Cmd+S)">Save</button>
      <button id="ps-save-as" title="Save As (Cmd+Shift+S)">Save As</button>
      <button id="ps-export-pdf" title="Export PDF">Export PDF</button>
    </div>
  `;

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
}
