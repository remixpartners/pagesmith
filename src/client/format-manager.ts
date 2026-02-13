import type { Editor } from 'grapesjs';
import { formatMeta } from './config/devices.js';

type DocFormat = 'desktop' | 'a4' | '16:9' | '4:3';

const FORMAT_TO_DEVICE: Record<DocFormat, string> = {
  desktop: 'desktop',
  a4: 'a4',
  '16:9': 'slide-16-9',
  '4:3': 'slide-4-3',
};

// Track the current format per editor so the frame:load hook can re-inject vars
type PendingFormat = { format: DocFormat; deviceId: string };
const pendingFormats = new WeakMap<Editor, PendingFormat>();
const hookedEditors = new WeakSet<Editor>();

/** Main entry point — call after editor.setDevice() */
export function applyFormat(editor: Editor, format: DocFormat): void {
  const deviceId = FORMAT_TO_DEVICE[format];
  const meta = formatMeta[deviceId];
  if (!meta) return;

  pendingFormats.set(editor, { format, deviceId });

  applyCanvasFraming(editor, format, meta.framed);
  injectFormatVars(editor, format, meta);
  fitCanvasToFormat(editor);

  // Hook into frame load so vars are re-injected if iframe wasn't ready
  if (!hookedEditors.has(editor)) {
    hookedEditors.add(editor);
    editor.on('canvas:frame:load', () => {
      const pending = pendingFormats.get(editor);
      if (!pending) return;
      const m = formatMeta[pending.deviceId];
      if (m) injectFormatVars(editor, pending.format, m);
    });
  }
}

/** Toggle framing class + data attribute on the canvas wrapper */
function applyCanvasFraming(editor: Editor, format: DocFormat, framed: boolean): void {
  const canvasEl = editor.Canvas.getElement();
  if (!canvasEl) return;

  canvasEl.classList.toggle('ps-canvas-framed', framed);
  if (framed) {
    canvasEl.setAttribute('data-ps-format', format);
  } else {
    canvasEl.removeAttribute('data-ps-format');
  }
}

/** Inject CSS custom properties into the iframe for content-aware styling */
function injectFormatVars(editor: Editor, format: DocFormat, meta: typeof formatMeta[string]): void {
  const iframe = editor.Canvas.getFrameEl();
  const doc = iframe?.contentDocument;
  if (!doc) return;

  // Remove previous injection
  doc.getElementById('pagesmith-format-vars')?.remove();

  const style = doc.createElement('style');
  style.id = 'pagesmith-format-vars';
  style.textContent = `
    :root {
      --ps-format: "${format}";
      --ps-format-width: ${meta.widthPx}px;
      --ps-format-height: ${meta.heightPx ? `${meta.heightPx}px` : 'auto'};
      --ps-format-aspect: ${meta.aspect || 'auto'};
    }
  `;
  doc.head.appendChild(style);

  // Also set data attribute on the iframe body for CSS selectors
  doc.documentElement.setAttribute('data-ps-format', format);
}

/** Auto-zoom and center the frame after device resize settles */
function fitCanvasToFormat(editor: Editor): void {
  // GrapesJS needs a tick for the device resize to apply
  setTimeout(() => {
    try {
      (editor.Canvas as any).fitViewport({ gap: 40 });
    } catch {
      // fitViewport may not exist in older GrapesJS versions — silently skip
    }
  }, 100);
}
