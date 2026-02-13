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
