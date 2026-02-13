import type { Editor } from 'grapesjs';

export function setupBlocks(editor: Editor) {
  const bm = editor.BlockManager;

  bm.add('section', {
    label: 'Section',
    category: 'Layout',
    content: '<section class="ps-section"><h2>Section Title</h2><p>Content goes here.</p></section>',
    attributes: { class: 'gjs-fonts gjs-f-b1' },
  });

  bm.add('two-columns', {
    label: '2 Columns',
    category: 'Layout',
    content: `<div class="ps-row" style="display:flex;gap:24px;">
      <div class="ps-col" style="flex:1;"><p>Column 1</p></div>
      <div class="ps-col" style="flex:1;"><p>Column 2</p></div>
    </div>`,
  });

  bm.add('three-columns', {
    label: '3 Columns',
    category: 'Layout',
    content: `<div class="ps-row" style="display:flex;gap:24px;">
      <div class="ps-col" style="flex:1;"><p>Column 1</p></div>
      <div class="ps-col" style="flex:1;"><p>Column 2</p></div>
      <div class="ps-col" style="flex:1;"><p>Column 3</p></div>
    </div>`,
  });

  bm.add('heading', {
    label: 'Heading',
    category: 'Content',
    content: '<h1>Heading</h1>',
  });

  bm.add('text-block', {
    label: 'Text',
    category: 'Content',
    content: '<p>Write your text here. Double-click to edit.</p>',
  });

  bm.add('image-block', {
    label: 'Image',
    category: 'Content',
    content: { type: 'image' },
  });

  bm.add('divider', {
    label: 'Divider',
    category: 'Content',
    content: '<hr style="border:none;border-top:1px solid #ccc;margin:24px 0;">',
  });

  bm.add('spacer', {
    label: 'Spacer',
    category: 'Content',
    content: '<div style="height:40px;"></div>',
  });

  bm.add('table-2x3', {
    label: 'Table',
    category: 'Content',
    content: `<table style="width:100%;border-collapse:collapse;">
      <thead><tr><th style="border:1px solid #ddd;padding:8px;">Header 1</th><th style="border:1px solid #ddd;padding:8px;">Header 2</th></tr></thead>
      <tbody>
        <tr><td style="border:1px solid #ddd;padding:8px;">Cell</td><td style="border:1px solid #ddd;padding:8px;">Cell</td></tr>
        <tr><td style="border:1px solid #ddd;padding:8px;">Cell</td><td style="border:1px solid #ddd;padding:8px;">Cell</td></tr>
      </tbody>
    </table>`,
  });

  bm.add('callout', {
    label: 'Callout',
    category: 'Content',
    content: `<div style="background:#f0f7ff;border-left:4px solid #4fc3f7;padding:16px;border-radius:4px;margin:16px 0;">
      <strong>Note:</strong> Important information goes here.
    </div>`,
  });
}
