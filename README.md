# PageSmith

A WYSIWYG HTML/CSS editor for visually editing AI-generated websites, reports, and slide decks.

## Quick Start

```bash
npx pagesmith --dir ./my-project
```

Or install globally:

```bash
npm install -g pagesmith
pagesmith --dir ./my-project
```

## Features

- Load and edit any HTML file visually
- Inline text editing, image replacement, drag-and-drop sections
- Full CSS style manager (layout, spacing, typography, decorations)
- PDF export (A4 reports, 16:9 and 4:3 slide decks)
- Block library (sections, columns, tables, callouts, dividers)
- Keyboard shortcuts: Save (Cmd/Ctrl+S), Save As (Cmd/Ctrl+Shift+S), Undo/Redo

## Development

```bash
git clone <repo>
cd pagesmith
npm install
npm run dev
```

## CLI Options

- `--dir <path>` — Project directory (default: current directory)
- `--port <number>` — Server port (default: 3000)
- `--host <address>` — Address to bind (default: 127.0.0.1). Use this to reach
  PageSmith from another device — e.g. `--host 0.0.0.0` to serve on the local
  network, or a Tailscale address to serve just over the tailnet. The bound
  address is added to the CORS allowlist automatically. Only bind beyond
  loopback on a network you trust; PageSmith has no authentication.
