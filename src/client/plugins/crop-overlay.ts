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

  // Parent positioning state (restored on destroy)
  private parentEl: HTMLElement | null = null;
  private previousParentPosition: string | null = null;

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
    // Guard against double-show without destroy
    if (this.container) this.destroy();

    const rect = this.imgEl.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 20) return;

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
    doneBtn.type = 'button';
    doneBtn.textContent = 'Done';
    doneBtn.className = 'ps-crop-btn ps-crop-btn-done';
    doneBtn.addEventListener('click', () => this.confirm());

    const cancelBtn = this.iframeDoc.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'ps-crop-btn ps-crop-btn-cancel';
    cancelBtn.addEventListener('click', () => this.cancel());

    actions.appendChild(cancelBtn);
    actions.appendChild(doneBtn);
    this.cropRect.appendChild(actions);

    // box-shadow on cropRect provides the dark mask; container is transparent + non-interactive
    this.container.style.pointerEvents = 'none';
    this.cropRect.style.pointerEvents = 'auto';

    this.container.appendChild(this.cropRect);

    // Insert into the iframe body
    const parent = (this.imgEl.offsetParent || this.iframeDoc.body) as HTMLElement;
    this.parentEl = parent;
    const computed = this.iframeDoc.defaultView?.getComputedStyle(parent);
    if (computed && computed.position === 'static') {
      this.previousParentPosition = parent.style.position;
      parent.style.position = 'relative';
    }
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
    if (this.parentEl && this.previousParentPosition !== null) {
      this.parentEl.style.position = this.previousParentPosition;
    }
    this.parentEl = null;
    this.previousParentPosition = null;
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
        const rightEdge = this.startLeft + this.startW;
        newL = Math.max(0, Math.min(this.startLeft + dx, rightEdge - 40));
        newW = rightEdge - newL;
      }
      if (dir.includes('s')) newH = Math.max(40, Math.min(this.startH + dy, maxH - this.startTop));
      if (dir.includes('n')) {
        const bottomEdge = this.startTop + this.startH;
        newT = Math.max(0, Math.min(this.startTop + dy, bottomEdge - 40));
        newH = bottomEdge - newT;
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
    const cropW = this.cropRect.clientWidth;
    const cropH = this.cropRect.clientHeight;

    // Convert crop rect to object-position percentages
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
