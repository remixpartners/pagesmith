// src/client/plugins/container-image.ts
import type { Editor } from 'grapesjs';
import * as api from '../api.js';

const CONTAINER_TAGS = new Set([
  'div', 'section', 'article', 'aside', 'main', 'header', 'footer', 'nav', 'figure',
]);

function isContainer(component: any): boolean {
  const tag = (component.get('tagName') || '').toLowerCase();
  return CONTAINER_TAGS.has(tag);
}

function openFilePicker(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.addEventListener('change', () => {
      const file = input.files?.[0] ?? null;
      input.remove();
      resolve(file);
    });

    // Handle cancel — focus returns to window without a change event
    window.addEventListener('focus', function onFocus() {
      window.removeEventListener('focus', onFocus);
      setTimeout(() => {
        if (!input.files?.length) {
          input.remove();
          resolve(null);
        }
      }, 300);
    });

    input.click();
  });
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

export function containerImagePlugin(editor: Editor) {
  function addContainerButtons(component: any) {
    removeContainerButtons();

    const toolbar = document.querySelector('.pagesmith-toolbar-right');
    if (!toolbar) return;

    // "Add Image" button
    const addImgBtn = document.createElement('button');
    addImgBtn.id = 'ps-add-image';
    addImgBtn.className = 'pagesmith-replace-btn';
    addImgBtn.textContent = 'Add Image';
    addImgBtn.addEventListener('click', async () => {
      const file = await openFilePicker();
      if (!file) return;
      try {
        const uploadedPath = await api.uploadAsset(file);
        const src = `/project/${uploadedPath}`;
        const added = component.append({
          type: 'image',
          attributes: { src },
          style: { 'max-width': '100%', height: 'auto' },
        });
        if (added?.[0]) {
          editor.select(added[0]);
        }
      } catch {
        showToast('Image upload failed', true);
      }
    });
    toolbar.prepend(addImgBtn);

    // "Add Background" button
    const bgBtn = document.createElement('button');
    bgBtn.id = 'ps-add-background';
    bgBtn.className = 'pagesmith-replace-btn';
    bgBtn.textContent = 'Add Background';
    bgBtn.addEventListener('click', async () => {
      const file = await openFilePicker();
      if (!file) return;
      try {
        const uploadedPath = await api.uploadAsset(file);
        const src = `/project/${uploadedPath}`;
        component.addStyle({
          'background-image': `url('${src}')`,
          'background-size': 'cover',
          'background-position': 'center',
          'background-repeat': 'no-repeat',
        });
      } catch {
        showToast('Background upload failed', true);
      }
    });
    toolbar.prepend(bgBtn);
  }

  function removeContainerButtons() {
    document.getElementById('ps-add-background')?.remove();
    document.getElementById('ps-add-image')?.remove();
  }

  editor.on('component:selected', (component) => {
    if (isContainer(component)) {
      addContainerButtons(component);
    } else {
      removeContainerButtons();
    }
  });

  editor.on('component:deselected', () => {
    removeContainerButtons();
  });
}
