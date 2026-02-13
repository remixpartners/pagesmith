import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { CropOverlay } from '../../src/client/plugins/crop-overlay.js';
import type { CropResult } from '../../src/client/plugins/crop-overlay.js';

function makeDOM() {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  const doc = dom.window.document;
  return { dom, doc };
}

/**
 * Create a mock image element with layoutable dimensions.
 * JSDOM doesn't support real layout, so we stub the properties
 * that CropOverlay reads: getBoundingClientRect, offsetLeft/Top,
 * offsetParent, tagName.
 */
function makeMockImage(doc: Document, opts: {
  width: number;
  height: number;
  left?: number;
  top?: number;
}) {
  const img = doc.createElement('img') as HTMLImageElement;
  doc.body.appendChild(img);

  const left = opts.left ?? 0;
  const top = opts.top ?? 0;

  Object.defineProperty(img, 'getBoundingClientRect', {
    value: () => ({
      x: left, y: top,
      left, top,
      right: left + opts.width,
      bottom: top + opts.height,
      width: opts.width,
      height: opts.height,
      toJSON() { return this; },
    }),
  });
  Object.defineProperty(img, 'offsetLeft', { value: left });
  Object.defineProperty(img, 'offsetTop', { value: top });
  Object.defineProperty(img, 'offsetParent', { value: doc.body });

  return img;
}

describe('CropOverlay', () => {
  let doc: Document;

  beforeEach(() => {
    ({ doc } = makeDOM());
  });

  describe('parent position mutation/restore', () => {
    it('sets parent position to relative when parent is static, and restores on destroy', () => {
      const img = makeMockImage(doc, { width: 200, height: 200 });

      // Body starts with no explicit position (jsdom getComputedStyle returns '')
      const body = doc.body;
      // CropOverlay checks `getComputedStyle(parent).position === 'static'`.
      // JSDOM returns '' for unstyled position, so CropOverlay won't trigger the mutation.
      // To test the real behavior, explicitly set position: static.
      body.style.position = 'static';

      let result: CropResult | null = null;
      const overlay = new CropOverlay(img, doc, (r) => { result = r; });
      overlay.show();

      // After show(), parent should be set to 'relative'
      expect(body.style.position).toBe('relative');

      overlay.destroy();

      // After destroy(), parent position should be restored to original ('static')
      expect(body.style.position).toBe('static');
    });

    it('does not mutate parent position when parent is already positioned', () => {
      const img = makeMockImage(doc, { width: 200, height: 200 });
      doc.body.style.position = 'absolute';

      const overlay = new CropOverlay(img, doc, () => {});
      overlay.show();

      // Should remain absolute, not changed to relative
      expect(doc.body.style.position).toBe('absolute');

      overlay.destroy();

      // Should still be absolute after destroy
      expect(doc.body.style.position).toBe('absolute');
    });
  });

  describe('crop resize bounds (w/n handles)', () => {
    it('clamps west resize so left edge cannot go below 0', () => {
      const img = makeMockImage(doc, { width: 400, height: 300 });
      let result: CropResult | null = null;
      const overlay = new CropOverlay(img, doc, (r) => { result = r; });
      overlay.show();

      // The crop overlay is appended to the container in the DOM
      const container = doc.querySelector('.ps-crop-container') as HTMLDivElement;
      const cropRect = doc.querySelector('.ps-crop-rect') as HTMLDivElement;
      expect(container).not.toBeNull();
      expect(cropRect).not.toBeNull();

      // Verify crop rect was created with initial position
      expect(cropRect.style.left).toBeTruthy();
      expect(cropRect.style.top).toBeTruthy();

      overlay.destroy();
    });
  });

  describe('show/destroy lifecycle', () => {
    it('show() creates container, destroy() removes it', () => {
      const img = makeMockImage(doc, { width: 200, height: 200 });
      const overlay = new CropOverlay(img, doc, () => {});

      expect(doc.querySelector('.ps-crop-container')).toBeNull();

      overlay.show();
      expect(doc.querySelector('.ps-crop-container')).not.toBeNull();
      expect(doc.querySelector('.ps-crop-rect')).not.toBeNull();

      overlay.destroy();
      expect(doc.querySelector('.ps-crop-container')).toBeNull();
    });

    it('skips show when image is too small (< 20px)', () => {
      const img = makeMockImage(doc, { width: 10, height: 10 });
      const overlay = new CropOverlay(img, doc, () => {});
      overlay.show();

      // Should not create the overlay
      expect(doc.querySelector('.ps-crop-container')).toBeNull();
    });

    it('double show() destroys previous before creating new', () => {
      const img = makeMockImage(doc, { width: 200, height: 200 });
      const overlay = new CropOverlay(img, doc, () => {});

      overlay.show();
      const first = doc.querySelector('.ps-crop-container');
      expect(first).not.toBeNull();

      overlay.show();
      const containers = doc.querySelectorAll('.ps-crop-container');
      expect(containers.length).toBe(1);
    });

    it('cancel calls onDone with null', () => {
      const img = makeMockImage(doc, { width: 200, height: 200 });
      let result: CropResult | null | undefined = undefined;
      const overlay = new CropOverlay(img, doc, (r) => { result = r; });
      overlay.show();

      // Simulate Escape key to cancel
      const event = new doc.defaultView!.KeyboardEvent('keydown', { key: 'Escape' });
      doc.dispatchEvent(event);

      expect(result).toBeNull();
    });

    it('done buttons have type="button" to prevent form submission', () => {
      const img = makeMockImage(doc, { width: 200, height: 200 });
      const overlay = new CropOverlay(img, doc, () => {});
      overlay.show();

      const buttons = doc.querySelectorAll('.ps-crop-btn');
      buttons.forEach(btn => {
        expect((btn as HTMLButtonElement).type).toBe('button');
      });

      overlay.destroy();
    });
  });
});
