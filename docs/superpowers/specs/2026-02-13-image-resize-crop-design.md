# Image Resize & Crop — Design Spec

## Context

PageSmith currently supports inserting and replacing images but has no manipulation capabilities. Users need to resize images proportionally and crop them to focus on specific areas.

## Approach

CSS-level, non-destructive manipulation. Resize via width/height with GrapesJS native handles. Crop via `object-fit: cover` + `object-position` with a custom drag overlay.

## Resize

Configure the GrapesJS `image` component type with `resizable: true` and `ratioDefault: true`. Corner handles maintain aspect ratio by default; edge handles allow free stretching. A ratio-lock toggle button appears in the toolbar when an image is selected.

Implementation: override the default image component type in `image-tools.ts` (~15 lines of config).

## Crop

When an image is selected, a "Crop" button appears in the toolbar. Clicking it enters crop mode:

1. A semi-transparent dark mask covers the image with a draggable/resizable bright rectangle showing the visible area
2. Corner handles resize the crop rectangle; the rectangle can be dragged to reposition
3. "Done" button or Enter applies; Escape cancels

Under the hood: `object-fit: cover` + `object-position: X% Y%` + constrained width/height. The overlay is a temporary DOM element inside the canvas iframe, positioned over the selected image. On confirm, the crop rectangle position converts to `object-position` percentages applied via GrapesJS `addStyle()`.

## Files

| File | Change |
|------|--------|
| `src/client/plugins/image-tools.ts` | NEW — replaces image-replace.ts. Image component type override, crop button, Replace Image modal. ~80 lines. |
| `src/client/plugins/crop-overlay.ts` | NEW — CropOverlay class. Overlay DOM in canvas iframe, drag math, CSS conversion. ~120 lines. |
| `src/client/plugins/image-replace.ts` | DELETED — absorbed into image-tools.ts. |
| `src/client/config/editor.ts` | Update import. |
| `src/client/styles/editor.css` | Crop overlay styles (~20 lines). |

## Design Decisions

- Crop overlay lives inside the canvas iframe for correct positioning at any zoom level
- All image state applied via GrapesJS `addStyle()` for persistence and export
- Resize uses GrapesJS native `resizable` — no custom handles needed
- Non-destructive: original image file is never modified

## What This Does NOT Do

- No pixel-level image editing (no Sharp/server processing)
- No filters or effects
- No preset aspect ratio buttons (could be added later)
- No batch operations
