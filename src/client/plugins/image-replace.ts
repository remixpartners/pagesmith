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

  const heading = document.createElement('h3');
  heading.textContent = 'Replace Image';
  modal.appendChild(heading);

  const grid = document.createElement('div');
  grid.className = 'pagesmith-image-grid';

  for (const a of assets) {
    const imgPath = `/project/${a.path}`;
    const option = document.createElement('div');
    option.className = 'pagesmith-image-option';
    option.dataset.path = imgPath;

    const img = document.createElement('img');
    img.src = imgPath;
    img.alt = a.name;
    option.appendChild(img);

    const label = document.createElement('span');
    label.textContent = a.name;
    option.appendChild(label);

    option.addEventListener('click', () => {
      if (target) {
        target.set('src', imgPath);
        target.addAttributes({ src: imgPath });
      }
      overlay.remove();
    });

    grid.appendChild(option);
  }
  modal.appendChild(grid);

  const actions = document.createElement('div');
  actions.className = 'pagesmith-modal-actions';

  const uploadLabel = document.createElement('label');
  uploadLabel.className = 'pagesmith-upload-label';
  uploadLabel.textContent = 'Upload New';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.style.display = 'none';
  uploadLabel.appendChild(fileInput);
  actions.appendChild(uploadLabel);

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'pagesmith-modal-cancel';
  cancelBtn.textContent = 'Cancel';
  actions.appendChild(cancelBtn);

  modal.appendChild(actions);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  fileInput.addEventListener('change', async () => {
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

  cancelBtn.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}
