// src/client/plugins/image-tools.ts
import type { Editor } from 'grapesjs';
import { CropOverlay } from './crop-overlay.js';
import type { CropResult } from './crop-overlay.js';
import * as api from '../api.js';

let activeCrop: CropOverlay | null = null;

export function imageToolsPlugin(editor: Editor) {
  // --- Override image component to enable resizable ---
  editor.DomComponents.addType('image', {
    model: {
      defaults: {
        resizable: {
          ratioDefault: true,
        },
      },
    },
  });

  // --- Toolbar buttons on image select ---
  editor.on('component:selected', (component) => {
    if (component.get('type') === 'image' || component.get('tagName') === 'img') {
      addImageButtons(editor, component);
    } else {
      removeImageButtons();
      cancelCrop();
    }
  });

  editor.on('component:deselected', () => {
    removeImageButtons();
    cancelCrop();
  });

  editor.on('run:open-assets', () => {
    openImagePicker(editor);
    return false;
  });
}

// --- Toolbar button management ---

function addImageButtons(editor: Editor, component: any) {
  removeImageButtons();

  const toolbar = document.querySelector('.pagesmith-toolbar-right');
  if (!toolbar) return;

  // Crop button
  const cropBtn = document.createElement('button');
  cropBtn.id = 'ps-crop-image';
  cropBtn.className = 'pagesmith-replace-btn';
  cropBtn.textContent = 'Crop';
  cropBtn.addEventListener('click', () => enterCropMode(editor, component));
  toolbar.prepend(cropBtn);

  // Replace button
  const replaceBtn = document.createElement('button');
  replaceBtn.id = 'ps-replace-image';
  replaceBtn.className = 'pagesmith-replace-btn';
  replaceBtn.textContent = 'Replace';
  replaceBtn.addEventListener('click', () => openImagePicker(editor, component));
  toolbar.prepend(replaceBtn);
}

function removeImageButtons() {
  document.getElementById('ps-replace-image')?.remove();
  document.getElementById('ps-crop-image')?.remove();
}

// --- Crop mode ---

function enterCropMode(editor: Editor, component: any) {
  cancelCrop();

  const iframe = editor.Canvas.getFrameEl();
  const doc = iframe?.contentDocument;
  if (!doc) return;

  // Find the actual <img> element in the iframe
  const imgEl = component.getEl() as HTMLImageElement | null;
  if (!imgEl || imgEl.tagName !== 'IMG') return;

  activeCrop = new CropOverlay(imgEl, doc, (result: CropResult | null) => {
    activeCrop = null;
    if (!result) return;

    // Apply crop as CSS on the GrapesJS component
    component.addStyle({
      'object-fit': 'cover',
      'object-position': result.objectPosition,
      width: result.width,
      height: result.height,
    });
  });

  activeCrop.show();
}

function cancelCrop() {
  if (activeCrop) {
    activeCrop.destroy();
    activeCrop = null;
  }
}

// --- Image picker modal (moved from image-replace.ts) ---

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
