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
  // Keep direct refs to injected buttons instead of relying on global IDs
  let addImgBtnRef: HTMLElement | null = null;
  let bgBtnRef: HTMLElement | null = null;

  function addContainerButtons(component: any) {
    removeContainerButtons();

    // Scope to the editor's container, not global document
    const editorEl = editor.getContainer();
    const toolbar = editorEl?.closest('body')?.querySelector('.pagesmith-toolbar-right')
                    ?? document.querySelector('.pagesmith-toolbar-right');
    if (!toolbar) return;

    // "Add Image" button
    const addImgBtn = document.createElement('button');
    addImgBtn.className = 'pagesmith-replace-btn';
    addImgBtnRef = addImgBtn;
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

    // "Add Background" / "Remove Background" toggle button
    const hasBg = !!(component.getStyle()['background-image'] || '').match(/url\(/);
    const bgBtn = document.createElement('button');
    bgBtn.className = 'pagesmith-replace-btn';
    bgBtnRef = bgBtn;
    bgBtn.textContent = hasBg ? 'Remove Background' : 'Add Background';
    bgBtn.addEventListener('click', async () => {
      if (hasBg) {
        // Remove background image
        component.addStyle({
          'background-image': 'none',
          'background-size': '',
          'background-position': '',
          'background-repeat': '',
        });
        showToast('Background removed');
        // Re-render buttons to reflect new state
        addContainerButtons(component);
        return;
      }
      const file = await openFilePicker();
      if (!file) return;
      try {
        const uploadedPath = await api.uploadAsset(file);
        const src = `/project/${encodeURI(uploadedPath)}`;
        component.addStyle({
          'background-image': `url("${src.replace(/"/g, '%22')}")`,
          'background-size': 'cover',
          'background-position': 'center',
          'background-repeat': 'no-repeat',
        });
        // Re-render buttons to show "Remove Background"
        addContainerButtons(component);
      } catch {
        showToast('Background upload failed', true);
      }
    });
    toolbar.prepend(bgBtn);
  }

  function removeContainerButtons() {
    bgBtnRef?.remove();
    bgBtnRef = null;
    addImgBtnRef?.remove();
    addImgBtnRef = null;
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
