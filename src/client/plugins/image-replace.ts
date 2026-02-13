import type { Editor } from 'grapesjs';
import * as api from '../api.js';

export function imageReplacePlugin(editor: Editor) {
  editor.on('component:selected', (component) => {
    if (component.get('type') === 'image' || component.get('tagName') === 'img') {
      addReplaceButton(editor, component);
    } else {
      removeReplaceButton();
    }
  });

  editor.on('component:deselected', () => {
    removeReplaceButton();
  });

  editor.on('run:open-assets', () => {
    openImagePicker(editor);
    return false;
  });
}

function addReplaceButton(editor: Editor, component: any) {
  removeReplaceButton();

  const btn = document.createElement('button');
  btn.id = 'ps-replace-image';
  btn.className = 'pagesmith-replace-btn';
  btn.textContent = 'Replace Image';
  btn.addEventListener('click', () => openImagePicker(editor, component));

  const toolbar = document.querySelector('.pagesmith-toolbar-right');
  if (toolbar) {
    toolbar.prepend(btn);
  }
}

function removeReplaceButton() {
  document.getElementById('ps-replace-image')?.remove();
}

async function openImagePicker(editor: Editor, component?: any) {
  const target = component || editor.getSelected();
  if (!target) return;

  const assets = await api.listAssets();

  const overlay = document.createElement('div');
  overlay.className = 'pagesmith-modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'pagesmith-modal';
  modal.innerHTML = `
    <h3>Replace Image</h3>
    <div class="pagesmith-image-grid">
      ${assets.map(a => `
        <div class="pagesmith-image-option" data-path="/project/${a.path}">
          <img src="/project/${a.path}" alt="${a.name}" />
          <span>${a.name}</span>
        </div>
      `).join('')}
    </div>
    <div class="pagesmith-modal-actions">
      <label class="pagesmith-upload-label">
        Upload New
        <input type="file" accept="image/*" style="display:none" />
      </label>
      <button class="pagesmith-modal-cancel">Cancel</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  modal.querySelectorAll('.pagesmith-image-option').forEach(el => {
    el.addEventListener('click', () => {
      const imgPath = (el as HTMLElement).dataset.path;
      if (imgPath && target) {
        target.set('src', imgPath);
        target.addAttributes({ src: imgPath });
      }
      overlay.remove();
    });
  });

  const fileInput = modal.querySelector('input[type="file"]') as HTMLInputElement;
  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const uploadedPath = await api.uploadAsset(file);
      if (target) {
        const src = `/project/${uploadedPath}`;
        target.set('src', src);
        target.addAttributes({ src });
      }
      overlay.remove();
    } catch {
      alert('Upload failed');
    }
  });

  modal.querySelector('.pagesmith-modal-cancel')?.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}
