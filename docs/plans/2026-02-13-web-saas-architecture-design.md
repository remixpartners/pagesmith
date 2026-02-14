# PageSmith Web SaaS Architecture Design

**Date:** 2026-02-13
**Status:** Draft
**Approach:** Minimal Server (Static Frontend + Thin API)

## Goal

Transform PageSmith from a local CLI tool (`pagesmith --dir ./sample-files`) into a hosted web application on Railway. Users visit a URL, upload HTML files from their machine, edit them visually, and download the results. No accounts, no persistent server storage.

## Requirements

- **Hosted SaaS** deployed on Railway
- **Stateless editing** — upload HTML, edit, download. No user accounts or persistent storage.
- **Browser-side image handling** — File System Access API / object URLs. No image uploads to the server.
- **Server-side PDF export** — Puppeteer-based, same quality as today.
- **EMIR proposal sync** — webhook integration preserved.

---

## High-Level Architecture

```
+---------------------------------------------------+
|                     Browser                        |
|                                                    |
|  +----------------+  +-------------------------+  |
|  | File I/O       |  | GrapesJS Editor          |  |
|  |                |  |                           |  |
|  | - Open HTML    |  | - Edit HTML/CSS           |  |
|  |   (file input  |  | - Image tools (local)     |  |
|  |    or drag)    |  | - Format management       |  |
|  | - Save         |  | - Template preservation   |  |
|  |   (FSAA / dl)  |  |                           |  |
|  | - Images       |  |                           |  |
|  |   (obj URLs)   |  |                           |  |
|  +----------------+  +-------------------------+  |
|                            |                       |
+----------------------------+-----------------------+
                             | Only for PDF + EMIR
                             v
                +-------------------------+
                |  Fastify API (Railway)  |
                |                         |
                |  POST /api/export/pdf   |
                |  POST /api/emir/sync    |
                |                         |
                |  Static frontend served |
                |  from same container    |
                +-------------------------+
```

---

## What Changes

### Removed from Server

| Current | Web Version |
|---------|-------------|
| `GET /api/files` — list HTML files in project dir | Removed. No server-side file listing. |
| `GET /api/files/{path}` — read file from disk | Removed. Files loaded via browser File API. |
| `PUT /api/files/{path}` — write file to disk | Removed. Files saved via FSAA or download. |
| `POST /api/files` — create new file on disk | Removed. Save-as via FSAA or download. |
| `GET /api/assets` — list images from disk | Removed. Images handled browser-side. |
| `POST /api/assets` — upload image to disk | Removed. Images stay local. |
| `--dir` CLI argument | Removed. No project directory concept. |
| Auto-open browser on start | Removed. It's a web app now. |

### Moved to Client

| Component | Current Location | New Location |
|-----------|-----------------|--------------|
| HTML template parsing (`parseHtmlTemplate`) | `src/server/utils/html-combiner.ts` | Client-side module |
| HTML recombination (`recombineHtml`) | `src/server/utils/html-combiner.ts` | Client-side module (partially already there in `main.ts:172-191`) |
| File listing UI | Server-backed sidebar | Browser file picker or drag-and-drop |
| Asset management | Server upload + listing | Browser object URLs from local file picks |

### Kept on Server

| Endpoint | Purpose | Implementation |
|----------|---------|---------------|
| `POST /api/export/pdf` | Render HTML to PDF via Puppeteer | Same as today. Client sends full HTML + format. Server returns PDF blob. |
| `POST /api/emir/sync` | Proxy EMIR webhook | New endpoint. Client sends proposal ID + HTML. Server forwards to EMIR API (avoids CORS). |

### Unchanged

- GrapesJS editor core, toolbar, panels, commands
- Format/device system and auto-detection
- Image tools plugin (resize, crop, container insert)
- CSS style management (`<style id="pagesmith-styles">`)
- Block library and style manager sectors

---

## Detailed Design

### 1. File Loading (Client-Side)

**Current:** User clicks "Open" -> file picker lists server directory files -> `GET /api/files/{path}` fetches content.

**New:** Three ways to load a file:

#### a) File Picker
User clicks "Open" -> browser `<input type="file" accept=".html,.htm">` -> `FileReader.readAsText()` -> content loaded into editor.

#### b) Drag and Drop
User drags an HTML file onto the editor area -> `drop` event -> `FileReader.readAsText()` -> content loaded.

#### c) File System Access API (Chromium only)
User clicks "Open" -> `window.showOpenFilePicker()` -> returns `FileSystemFileHandle` -> `file.text()` -> content loaded. Handle stored for subsequent in-place saves.

**Loading flow (all paths converge):**
```
Raw HTML string
    |
    v
parseHtmlTemplate(html)     -- extract head, body attrs, styles
    |
    v
detectFormat(html)           -- auto-detect a4/16:9/4:3/desktop
    |
    v
editor.setComponents(body)   -- load body into GrapesJS
editor.setStyle(css)         -- load pagesmith CSS
    |
    v
injectOriginalStyles(head)   -- inject <link>/<style> into canvas iframe
injectOriginalScripts(body)  -- inject <script> tags into canvas iframe
```

This flow already exists in `main.ts`. The change is replacing the server fetch with browser file reading.

### 2. File Saving (Client-Side)

**Current:** `PUT /api/files/{path}` sends `{html, css}` to server, which recombines and writes to disk.

**New:** Three save paths:

#### a) File System Access API (Chromium — preferred)
If user opened via FSAA and holds a `FileSystemFileHandle`:
```
editor.getHtml() + editor.getCss()
    |
    v
recombineHtml(template, html, css)   -- client-side recombination
    |
    v
fileHandle.createWritable() -> write(recombinedHtml) -> close()
```
This already exists in `main.ts` (`handleSave` FSAA path). It becomes the primary path.

#### b) Download
Fallback for Firefox/Safari or "Save As":
```
recombineHtml(template, html, css)
    |
    v
new Blob([html], {type: 'text/html'})
    |
    v
URL.createObjectURL(blob) -> <a download="filename.html"> -> click()
```

#### c) EMIR Sync (on save)
If the file is a proposal file (`proposal-{id}.html`), also fire:
```
POST /api/emir/sync  { proposalId, html }
```
Server proxies to EMIR API. This replaces the current direct webhook call from the client (avoids CORS issues in the hosted environment where the EMIR server may not allow the PageSmith domain).

### 3. Image Handling (Client-Side)

**Current:** Images uploaded to server via `POST /api/assets`, referenced by `/project/assets/filename` URL.

**New:** Images never leave the browser.

#### Loading images from user's machine:
```
<input type="file" accept="image/*"> or drag-and-drop
    |
    v
URL.createObjectURL(file)    -- creates blob:// URL
    |
    v
Insert into GrapesJS as <img src="blob://...">
```

#### On save/export:
Object URLs are ephemeral (invalid after page close). Two strategies:

**Strategy 1 — Inline on export:** When generating the final HTML for download or PDF export, scan for `blob://` URLs and convert them to base64 data URLs using canvas + `toDataURL()`. This makes the HTML self-contained.

**Strategy 2 — Preserve originals:** If the user opened an HTML file that already has images with relative paths or external URLs, those are preserved as-is. Only newly inserted images (from local picks during editing) get the blob->base64 treatment.

#### Image tools:
The existing resize/crop plugins work on `<img>` elements regardless of src type. No changes needed.

### 4. HTML Template Preservation (Client-Side)

The `html-combiner.ts` utilities need to move client-side. The logic is:

**Parse:** Extract doctype, `<html>` attributes, `<head>` content (minus pagesmith styles), `<body>` attributes from the original HTML string.

**Store:** Keep the parsed template in memory for the editing session.

**Recombine:** On save, rebuild the full HTML from the template + GrapesJS output (body HTML + CSS).

`main.ts` already has a partial client-side recombination (lines 172-191). The server's `html-combiner.ts` has a more robust version. Consolidate into a single client-side module that handles both parsing and recombination.

### 5. PDF Export

**Endpoint:** `POST /api/export/pdf`

**Request:** `{ html: string, format?: 'a4' | '16:9' | '4:3' }`

**Response:** `application/pdf` blob

**Implementation:** Same as current `src/server/routes/export.ts` + `src/server/utils/pdf-renderer.ts`. The client sends the fully recombined HTML (with images inlined as base64 if they were local). The server renders with Puppeteer and returns the PDF.

**Change:** The server no longer injects a `<base>` tag pointing to a project directory (there is none). Images must be self-contained in the HTML. This means the blob->base64 conversion in Section 3 is mandatory before PDF export.

### 6. EMIR Sync Proxy

**New endpoint:** `POST /api/emir/sync`

**Request:** `{ proposalId: string, html: string, emirUrl: string, syncToken: string }`

**Server behavior:** Forward the HTML to `{emirUrl}/api/proposals/{proposalId}/import-html` with the sync token. Return the EMIR response to the client.

**Why proxy:** In the hosted model, the EMIR server likely won't have the PageSmith domain in its CORS allowlist. A server-side proxy avoids this. The current direct-from-client webhook approach won't work.

### 7. Server Structure

The Fastify server shrinks to:

```
src/server/
  index.ts              -- Fastify setup, static file serving, 2 routes
  routes/
    export.ts           -- POST /api/export/pdf (unchanged)
    emir-sync.ts        -- POST /api/emir/sync (new)
  utils/
    pdf-renderer.ts     -- Puppeteer PDF generation (unchanged)
```

**Removed files:**
- `src/server/routes/files.ts`
- `src/server/routes/assets.ts`
- `src/server/utils/html-combiner.ts` (moved to client)
- `src/server/utils/path-guard.ts` (no server-side file paths to guard)

**Static serving:** The built client (`dist/client/`) is served by Fastify as static files. Single entry point at `/` for the SPA.

### 8. Client Structure Changes

```
src/client/
  main.ts               -- Editor lifecycle (modified: remove server file ops)
  api.ts                 -- Slimmed: only exportPdf() and emirSync()
  file-io.ts             -- NEW: browser file loading/saving
  html-combiner.ts       -- MOVED from server: template parse/recombine
  image-inliner.ts       -- NEW: blob URL -> base64 conversion
  format-manager.ts      -- Unchanged
  config/                -- Unchanged
  plugins/               -- Unchanged
  styles/                -- Unchanged
```

### 9. Landing State

**Current:** Editor loads empty, shows file list from server directory.

**New:** Editor loads with a welcome/empty state:
- Prominent "Open HTML File" button (centered)
- Drag-and-drop zone covering the editor area
- Brief instructions: "Drop an HTML file here or click to open"
- Once a file is loaded, the editor activates normally

Alternatively, load one of the sample files as a demo that users can immediately edit and download.

### 10. Deployment (Railway)

**Dockerfile:**
```dockerfile
FROM node:20-slim

# Install Puppeteer dependencies (Chromium)
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist/ ./dist/

EXPOSE 3001
CMD ["node", "dist/server/index.js"]
```

**Railway config:**
- Single service: Node.js container with Chromium
- Port: 3001
- No persistent volumes needed
- Health check: `GET /` returns the SPA

**Environment variables:**
- `PORT` — Railway assigns this; server should respect it
- `NODE_ENV=production`

### 11. Build Pipeline

**Development:**
```
npm run dev        -- Vite dev server (frontend) + Fastify (API) via concurrently
```
Same as today, but the Fastify server only handles `/api/export/pdf` and `/api/emir/sync`.

**Production build:**
```
npm run build      -- vite build (client) + tsup (server)
```
Same as today. Output: `dist/client/` (static) + `dist/server/index.js` (API).

**Deploy:**
Railway builds from Dockerfile, deploys container.

---

## Migration Summary

### Files to Remove
- `src/server/routes/files.ts`
- `src/server/routes/assets.ts`
- `src/server/utils/html-combiner.ts`
- `src/server/utils/path-guard.ts`
- `test/server/files.test.ts`
- `test/server/assets.test.ts`
- `test/server/html-combiner.test.ts`
- `test/server/path-guard.test.ts`

### Files to Create
- `src/client/file-io.ts` — browser file loading/saving logic
- `src/client/html-combiner.ts` — template parsing/recombination (port from server)
- `src/client/image-inliner.ts` — blob URL to base64 conversion
- `src/server/routes/emir-sync.ts` — EMIR proxy endpoint
- `Dockerfile`

### Files to Modify
- `src/server/index.ts` — remove file/asset routes, remove `--dir` arg, add PORT env var, serve static files
- `src/client/main.ts` — replace server file ops with browser file I/O, add drag-and-drop, add welcome state
- `src/client/api.ts` — remove file/asset functions, add `emirSync()`
- `src/client/config/panels.ts` — update Open button to use file picker instead of server file list
- `package.json` — update dev scripts, add Dockerfile-related config
- `vite.config.ts` — remove `/project/` proxy, update API proxy

### Files Unchanged
- `src/client/config/editor.ts`
- `src/client/config/blocks.ts`
- `src/client/config/devices.ts`
- `src/client/format-manager.ts`
- `src/client/plugins/*`
- `src/client/styles/editor.css`
- `src/server/routes/export.ts`
- `src/server/utils/pdf-renderer.ts`
- `src/shared/types.ts`
- `test/server/export.test.ts`

---

## Open Questions

1. **Sample files as demos:** Should the welcome state include a "Try a demo" button that loads one of the sample HTML files (bundled into the client build)?
2. **File size limits:** Should there be a max HTML file size for loading? Large files with many embedded images could strain the browser.
3. **Rate limiting:** Should the PDF export endpoint be rate-limited to prevent abuse (since Puppeteer is resource-intensive)?
4. **Custom domain:** Will PageSmith get a custom domain (e.g. pagesmith.app) or use the Railway-assigned URL?
