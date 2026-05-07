# DocPort — Docs to Word Exporter

> Export any Google Docs page — including **view-only** documents — to a properly formatted `.docx` file directly from your browser.

**Author:** Quang Huy Tran · [quanghuytran.hust@gmail.com](mailto:quanghuytran.hust@gmail.com)

---

## Features

- **Works on view-only docs** — no edit access required
- **Preserves full formatting**: Headings H1–H6, bold, italic, underline, strikethrough, text color
- **Tables** — multi-paragraph cells, header row styling
- **Images** — fetched with session credentials and embedded in the `.docx`
- **Lists** — bullet & numbered, up to 9 nesting levels
- **Hyperlinks** — Google redirect URLs are unwrapped automatically
- **Live preview** — inspect the parsed content before exporting
- **Minimal permissions** — only `activeTab` + `scripting`, no browsing history access

---

## Requirements

| Tool | Version |
|------|---------|
| Node.js | ≥ 18 |
| npm | ≥ 9 (or yarn) |
| Chrome / Edge | ≥ 88 (Manifest V3) |

---

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Generate icons *(first time only, or when you change the icon design)*

```bash
npm run icons
```

This runs `scripts/generate-icons.js` and writes four PNG files to `src/icons/`:
`icon16.png`, `icon32.png`, `icon48.png`, `icon128.png`.

### 3. Build the extension

```bash
npm run build
```

The compiled extension is written to the **`dist/`** directory:

```
dist/
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── manifest.json
├── popup.html
└── popup.js          ← ~330 KB bundled (includes docx library)
```

### 4. Load into Chrome

1. Open **`chrome://extensions/`**
2. Enable **Developer mode** (top-right toggle)
3. Click **"Load unpacked"**
4. Select the **`dist/`** folder
5. The **DocPort** icon appears in the toolbar

---

## Development Workflow

### Watch mode (auto-rebuild on file change)

```bash
npm run dev
```

Webpack rebuilds `dist/popup.js` whenever you edit any file in `src/`.  
After each rebuild, click the **↺ refresh** button on `chrome://extensions/` to reload the extension.

### Clean build output

```bash
npm run clean && npm run build
```

---

## Project Structure

```
docs-scanner/
│
├── src/                        Source files (TypeScript + HTML)
│   ├── manifest.json           Chrome Extension manifest (MV3)
│   ├── popup.html              Extension popup UI
│   ├── popup.ts                Popup orchestrator — handles all user interactions
│   ├── extractor.ts            HTML parser — converts mobilebasic HTML → document tree
│   └── docxBuilder.ts          DOCX generator — converts document tree → .docx Blob
│
├── scripts/
│   └── generate-icons.js       Generates PNG icons from SVG via sharp
│
├── dist/                       Build output (load this folder into Chrome)
│   └── ...
│
├── package.json
├── tsconfig.json
└── webpack.config.js
```

---

## How It Works

```
[User clicks "Preview" or "Export .docx"]
        │
        ▼
 chrome.tabs.query()           Get active tab ID (no URL — avoids 'tabs' permission)
        │
        ▼
 scripting.executeScript()     Inject into Google Docs tab:
   └─ window.location.href     1. Read current URL
   └─ fetch(/mobilebasic)      2. Fetch simplified HTML using session cookies
   └─ fetch(image URLs)        3. Fetch each image as base64
        │
        ▼
 extractor.ts                  Parse mobilebasic HTML:
   └─ parseStyleSheets()         Extract CSS class rules (.c0, .c1 → bold/italic/…)
   └─ Walk DOM                   h1–h6, p, ul/ol/li, table, img
   └─ extractRuns()              Text runs with formatting (bold, italic, color, link)
   └─ extractCellParagraphs()    Multi-paragraph table cells
        │
        ▼
 docxBuilder.ts                Build .docx:
   └─ buildTextRuns()            TextRun / ExternalHyperlink objects
   └─ buildTable()               Table with borders + header shading
   └─ buildImageParagraph()      ImageRun with auto-scaled dimensions
   └─ Packer.toBlob()            Final Blob
        │
        ▼
 downloadBlob()                Trigger browser download  →  filename.docx
```

**Key insight — why `/mobilebasic`?**  
Google Docs' editor uses a canvas-like renderer (the "kix" engine) which is nearly impossible to scrape reliably. The `/mobilebasic` endpoint returns a lightweight, semantic HTML version of the same document — using real `<h1>`, `<p>`, `<table>`, `<ul>` tags — making parsing straightforward. Because the fetch happens inside the tab's context, it carries the user's existing Google session cookie, so it works for documents the user has access to (including view-only).

---

## Scripts Reference

| Command | Description |
|---------|-------------|
| `npm run build` | Production build → `dist/` |
| `npm run dev` | Watch mode (rebuilds on change) |
| `npm run icons` | Regenerate PNG icons from SVG templates |
| `npm run clean` | Delete `dist/` directory |

---

## Permissions Explained

| Permission | Why it's needed |
|------------|----------------|
| `activeTab` | Grants temporary access to the currently active tab when the user clicks the extension icon |
| `scripting` | Injects the fetch function into the Google Docs tab to retrieve the document HTML and images using the user's session |
| `host_permissions: docs.google.com` | Restricts script injection to Google Docs pages only |

> **No `tabs` permission** — the extension never reads the URL list of your open tabs. The current page URL is obtained by injecting a one-line script (`window.location.href`) into the active tab only.

---

## Publishing to Chrome Web Store

1. Run `npm run build`
2. Zip the **`dist/`** directory (not the project root):
   ```bash
   cd dist && zip -r ../docport-v1.0.0.zip . && cd ..
   ```
3. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
4. Upload `docport-v1.0.0.zip`
5. Add store listing:
   - **Category**: Productivity
   - **Screenshots**: at least one 1280×800 PNG
   - **Privacy policy URL**: required (extension accesses page content)
6. Submit for review

---

## License

MIT © [Quang Huy Tran](mailto:quanghuytran.hust@gmail.com)
