# Image Resize & Crop Implementation Plan

> **For Claude:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CSS-level image resize (via GrapesJS native handles) and crop (via custom drag overlay using object-fit/object-position) to PageSmith.

**Architecture:** Override the GrapesJS `image` component type to enable `resizable` with aspect-ratio locking. Add a crop mode that overlays a draggable crop rectangle on the selected image inside the canvas iframe, converting the user's selection into `object-fit: cover` + `object-position` CSS. All manipulation is non-destructive.

**Tech Stack:** GrapesJS component API, vanilla DOM for crop overlay, CSS object-fit/object-position.

**Spec:** `docs/superpowers/specs/2026-02-13-image-resize-crop-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/client/plugins/image-tools.ts` | NEW — GrapesJS plugin: image component type override (resizable), toolbar buttons (Replace, Crop), crop mode orchestration, image picker modal (moved from image-replace.ts) |
| `src/client/plugins/crop-overlay.ts` | NEW — CropOverlay class: creates/manages crop UI inside canvas iframe, handles drag/resize of crop rect, converts crop rect to object-position CSS |
| `src/client/plugins/image-replace.ts` | DELETE — all functionality absorbed into image-tools.ts |
| `src/client/config/editor.ts` | MODIFY line 7, 80 — update import from image-replace to image-tools |
| `src/client/styles/editor.css` | MODIFY — add ~25 lines of crop overlay + crop button styles at end of file |

---

## Chunk 1: Crop Overlay Module

### Task 1: Create crop-overlay.ts

**Files:**
- Create: `src/client/plugins/crop-overlay.ts`

This is the core crop interaction. The CropOverlay class injects a crop UI into the canvas iframe over the selected image. It shows a dark semi-transparent mask with a bright draggable/resizable rectangle. The user drags the rectangle to select the visible area, then confirms or cancels.

- [ ] **Step 1: Create crop-overlay.ts with the CropOverlay class**

```typescript
// src/client/plugins/crop-overlay.ts

export interface CropResult {
  objectPosition: string;  // e.g. "30% 20%"
  width: string;           // e.g. "400px"
  height: string;          // e.g. "300px"
}

export class CropOverlay {
  private container: HTMLDivElement | null = null;
  private cropRect: HTMLDivElement | null = null;
  private imgEl: HTMLImageElement;
  private iframeDoc: Document;
  private onDone: (result: CropResult | null) => void;

  // Drag state
  private dragging = false;
  private resizing = false;
  private resizeDir = '';
  private startX = 0;
  private startY = 0;
  private startLeft = 0;
  private startTop = 0;
  private startW = 0;
  private startH = 0;

  constructor(
    imgEl: HTMLImageElement,
    iframeDoc: Document,
    onDone: (result: CropResult | null) => void,
  ) {
    this.imgEl = imgEl;
    this.iframeDoc = iframeDoc;
    this.onDone = onDone;
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  show(): void {
    const rect = this.imgEl.getBoundingClientRect();

    // Container covers the image
    this.container = this.iframeDoc.createElement('div');
    this.container.className = 'ps-crop-container';
    Object.assign(this.container.style, {
      position: 'absolute',
      left: `${this.imgEl.offsetLeft}px`,
      top: `${this.imgEl.offsetTop}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      zIndex: '10000',
    });

    // Dark mask (the container background)
    this.container.style.background = 'rgba(0, 0, 0, 0.5)';

    // Bright crop rectangle — starts at 80% of image, centered
    this.cropRect = this.iframeDoc.createElement('div');
    this.cropRect.className = 'ps-crop-rect';
    const cropW = rect.width * 0.8;
    const cropH = rect.height * 0.8;
    const cropL = (rect.width - cropW) / 2;
    const cropT = (rect.height - cropH) / 2;
    Object.assign(this.cropRect.style, {
      position: 'absolute',
      left: `${cropL}px`,
      top: `${cropT}px`,
      width: `${cropW}px`,
      height: `${cropH}px`,
      border: '2px solid #D4AF37',
      background: 'transparent',
      cursor: 'move',
      boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
    });

    // Corner handles
    for (const dir of ['nw', 'ne', 'sw', 'se']) {
      const handle = this.iframeDoc.createElement('div');
      handle.className = 'ps-crop-handle';
      handle.dataset.dir = dir;
      const isTop = dir.includes('n');
      const isLeft = dir.includes('w');
      Object.assign(handle.style, {
        position: 'absolute',
        width: '10px',
        height: '10px',
        background: '#D4AF37',
        borderRadius: '2px',
        [isTop ? 'top' : 'bottom']: '-5px',
        [isLeft ? 'left' : 'right']: '-5px',
        cursor: `${dir}-resize`,
      });
      this.cropRect.appendChild(handle);
    }

    // Action buttons bar
    const actions = this.iframeDoc.createElement('div');
    actions.className = 'ps-crop-actions';
    Object.assign(actions.style, {
      position: 'absolute',
      bottom: '-36px',
      right: '0',
      display: 'flex',
      gap: '6px',
    });

    const doneBtn = this.iframeDoc.createElement('button');
    doneBtn.textContent = 'Done';
    doneBtn.className = 'ps-crop-btn ps-crop-btn-done';
    doneBtn.addEventListener('click', () => this.confirm());

    const cancelBtn = this.iframeDoc.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'ps-crop-btn ps-crop-btn-cancel';
    cancelBtn.addEventListener('click', () => this.cancel());

    actions.appendChild(cancelBtn);
    actions.appendChild(doneBtn);
    this.cropRect.appendChild(actions);

    // Remove the dark mask background since box-shadow handles it
    this.container.style.background = 'transparent';
    this.container.style.pointerEvents = 'none';
    this.cropRect.style.pointerEvents = 'auto';

    this.container.appendChild(this.cropRect);

    // Insert into the iframe body
    const parent = this.imgEl.offsetParent || this.iframeDoc.body;
    (parent as HTMLElement).style.position = 'relative';
    parent.appendChild(this.container);

    // Bind events on the iframe document
    this.iframeDoc.addEventListener('mousedown', this.handleMouseDown);
    this.iframeDoc.addEventListener('mousemove', this.handleMouseMove);
    this.iframeDoc.addEventListener('mouseup', this.handleMouseUp);
    this.iframeDoc.addEventListener('keydown', this.handleKeyDown);
  }

  destroy(): void {
    this.iframeDoc.removeEventListener('mousedown', this.handleMouseDown);
    this.iframeDoc.removeEventListener('mousemove', this.handleMouseMove);
    this.iframeDoc.removeEventListener('mouseup', this.handleMouseUp);
    this.iframeDoc.removeEventListener('keydown', this.handleKeyDown);
    this.container?.remove();
    this.container = null;
    this.cropRect = null;
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Enter') this.confirm();
    if (e.key === 'Escape') this.cancel();
  }

  private handleMouseDown(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (!this.cropRect) return;

    // Check if clicking a resize handle
    if (target.classList.contains('ps-crop-handle')) {
      this.resizing = true;
      this.resizeDir = target.dataset.dir || '';
      this.startX = e.clientX;
      this.startY = e.clientY;
      this.startW = this.cropRect.offsetWidth;
      this.startH = this.cropRect.offsetHeight;
      this.startLeft = this.cropRect.offsetLeft;
      this.startTop = this.cropRect.offsetTop;
      e.preventDefault();
      return;
    }

    // Check if clicking the crop rect itself (drag)
    if (target === this.cropRect) {
      this.dragging = true;
      this.startX = e.clientX;
      this.startY = e.clientY;
      this.startLeft = this.cropRect.offsetLeft;
      this.startTop = this.cropRect.offsetTop;
      e.preventDefault();
    }
  }

  private handleMouseMove(e: MouseEvent): void {
    if (!this.cropRect || !this.container) return;
    const dx = e.clientX - this.startX;
    const dy = e.clientY - this.startY;
    const maxW = this.container.offsetWidth;
    const maxH = this.container.offsetHeight;

    if (this.dragging) {
      let newLeft = Math.max(0, Math.min(this.startLeft + dx, maxW - this.cropRect.offsetWidth));
      let newTop = Math.max(0, Math.min(this.startTop + dy, maxH - this.cropRect.offsetHeight));
      this.cropRect.style.left = `${newLeft}px`;
      this.cropRect.style.top = `${newTop}px`;
    }

    if (this.resizing) {
      const dir = this.resizeDir;
      let newW = this.startW;
      let newH = this.startH;
      let newL = this.startLeft;
      let newT = this.startTop;

      if (dir.includes('e')) newW = Math.max(40, Math.min(this.startW + dx, maxW - this.startLeft));
      if (dir.includes('w')) {
        newW = Math.max(40, this.startW - dx);
        newL = Math.max(0, this.startLeft + (this.startW - newW));
      }
      if (dir.includes('s')) newH = Math.max(40, Math.min(this.startH + dy, maxH - this.startTop));
      if (dir.includes('n')) {
        newH = Math.max(40, this.startH - dy);
        newT = Math.max(0, this.startTop + (this.startH - newH));
      }

      this.cropRect.style.width = `${newW}px`;
      this.cropRect.style.height = `${newH}px`;
      this.cropRect.style.left = `${newL}px`;
      this.cropRect.style.top = `${newT}px`;
    }
  }

  private handleMouseUp(): void {
    this.dragging = false;
    this.resizing = false;
  }

  private confirm(): void {
    if (!this.cropRect || !this.container) {
      this.onDone(null);
      this.destroy();
      return;
    }
    const containerW = this.container.offsetWidth;
    const containerH = this.container.offsetHeight;
    const cropL = this.cropRect.offsetLeft;
    const cropT = this.cropRect.offsetTop;
    const cropW = this.cropRect.offsetWidth;
    const cropH = this.cropRect.offsetHeight;

    // Convert crop rect to object-position percentages
    // object-position maps where the image center aligns within the element
    // We need to map the crop rectangle center to a percentage of the full image
    const centerX = cropL + cropW / 2;
    const centerY = cropT + cropH / 2;
    const posX = containerW > 0 ? Math.round((centerX / containerW) * 100) : 50;
    const posY = containerH > 0 ? Math.round((centerY / containerH) * 100) : 50;

    const result: CropResult = {
      objectPosition: `${posX}% ${posY}%`,
      width: `${cropW}px`,
      height: `${cropH}px`,
    };
    this.destroy();
    this.onDone(result);
  }

  private cancel(): void {
    this.destroy();
    this.onDone(null);
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/client/plugins/crop-overlay.ts
git commit -m "feat: add CropOverlay class for image crop interaction"
```

---

## Chunk 2: Image Tools Plugin

### Task 2: Create image-tools.ts (replaces image-replace.ts)

**Files:**
- Create: `src/client/plugins/image-tools.ts`
- Delete: `src/client/plugins/image-replace.ts`
- Modify: `src/client/config/editor.ts:7,80`

This plugin does three things:
1. Overrides the GrapesJS `image` component type to enable `resizable` with ratio locking
2. Adds "Replace" and "Crop" toolbar buttons when an image is selected
3. Orchestrates crop mode (creates CropOverlay, applies result to component)

- [ ] **Step 1: Create image-tools.ts**

```typescript
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
```

- [ ] **Step 2: Delete image-replace.ts**

```bash
rm src/client/plugins/image-replace.ts
```

- [ ] **Step 3: Update editor.ts import**

In `src/client/config/editor.ts`, change:
- Line 7: `import { imageReplacePlugin } from '../plugins/image-replace.js';` → `import { imageToolsPlugin } from '../plugins/image-tools.js';`
- Line 80: `imageReplacePlugin(editor);` → `imageToolsPlugin(editor);`

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/client/plugins/image-tools.ts src/client/config/editor.ts
git rm src/client/plugins/image-replace.ts
git commit -m "feat: add image-tools plugin with resize and crop support"
```

---

## Chunk 3: Crop Overlay CSS

### Task 3: Add crop overlay styles to editor.css

**Files:**
- Modify: `src/client/styles/editor.css` (append after existing styles)

- [ ] **Step 1: Add crop overlay and button CSS**

Append the following after the `.pagesmith-replace-btn` block at the end of `editor.css`:

```css
/* ── Crop overlay (injected into canvas iframe via JS) ── */

.ps-crop-btn {
  padding: 4px 12px;
  border: 1px solid #555;
  border-radius: 3px;
  font-size: 12px;
  font-family: system-ui, -apple-system, sans-serif;
  cursor: pointer;
  background: #222;
  color: #fff;
}

.ps-crop-btn-done {
  background: rgba(212, 175, 55, 0.2);
  border-color: #D4AF37;
  color: #D4AF37;
}

.ps-crop-btn-cancel:hover {
  border-color: #999;
}

.ps-crop-btn-done:hover {
  background: rgba(212, 175, 55, 0.35);
}
```

Note: Most crop overlay styles are set inline by `crop-overlay.ts` because the overlay lives inside the canvas iframe (which doesn't load editor.css). The CSS above is for the action buttons which are also inline-styled in JS. This block exists as documentation and can be used if we later inject a stylesheet into the iframe.

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/client/styles/editor.css
git commit -m "feat: add crop overlay button styles"
```

---

## Chunk 4: Verification

### Task 4: Live verification with Puppeteer

**Files:**
- Create (temporary): `verify-image-tools.mjs`

- [ ] **Step 1: Write Puppeteer verification script**

Create `verify-image-tools.mjs` that:
1. Opens the editor at `http://localhost:5173`
2. Waits for an image to load in the canvas
3. Clicks on an image component to select it
4. Verifies "Replace" and "Crop" buttons appear in the toolbar
5. Checks that the image component has resize handles (GrapesJS adds `.gjs-resizer` elements)
6. Takes screenshots at each step

- [ ] **Step 2: Run verification**

Run: `node verify-image-tools.mjs`
Expected: All checks pass, screenshots show resize handles and crop/replace buttons

- [ ] **Step 3: Clean up verification script**

```bash
rm verify-image-tools.mjs verify-image-tools-*.png
```

- [ ] **Step 4: Final commit and push**

```bash
git push origin master
```
