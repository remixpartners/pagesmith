import grapesjs, { type Editor } from 'grapesjs';
import blocksBasic from 'grapesjs-blocks-basic';
import styleBg from 'grapesjs-style-bg';
import { devices } from './devices.js';
import { setupPanels } from './panels.js';
import { setupBlocks } from './blocks.js';
import { imageReplacePlugin } from '../plugins/image-replace.js';

export function createEditor(container: string): Editor {
  const editor = grapesjs.init({
    container,
    height: '100%',
    width: 'auto',
    fromElement: false,
    storageManager: false,
    deviceManager: { devices },
    plugins: [blocksBasic, styleBg],
    pluginsOpts: {
      [blocksBasic as any]: {
        flexGrid: true,
      },
    },
    canvas: {
      styles: [],
      scripts: [],
    },
    styleManager: {
      sectors: [
        {
          name: 'Layout',
          open: true,
          properties: [
            'display', 'position', 'top', 'right', 'bottom', 'left',
            'flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'align-content',
            'order', 'flex-basis', 'flex-grow', 'flex-shrink', 'align-self',
          ],
        },
        {
          name: 'Spacing',
          open: false,
          properties: [
            'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
            'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
          ],
        },
        {
          name: 'Dimensions',
          open: false,
          properties: ['width', 'min-width', 'max-width', 'height', 'min-height', 'max-height', 'overflow'],
        },
        {
          name: 'Typography',
          open: false,
          properties: [
            'font-family', 'font-size', 'font-weight', 'letter-spacing',
            'color', 'line-height', 'text-align', 'text-decoration', 'text-transform',
          ],
        },
        {
          name: 'Decorations',
          open: false,
          properties: [
            'background-color', 'border', 'border-radius', 'box-shadow', 'opacity',
          ],
        },
      ],
    },
  });

  // Clean up default GrapesJS panels we don't need
  // (keep views and views-container — they hold blocks/styles/layers/traits)
  editor.Panels.removeButton('options', 'export-template');
  editor.Panels.removeButton('options', 'gjs-open-import-webpage');

  // Remove the default device selector (we use our own dropdown)
  const devicesPanel = editor.Panels.getPanel('devices-c');
  if (devicesPanel) editor.Panels.removePanel('devices-c');

  // Setup custom toolbar, blocks, and plugins
  setupPanels(editor);
  setupBlocks(editor);
  imageReplacePlugin(editor);

  return editor;
}
