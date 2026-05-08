/**
 * Popup entry point — orchestrates the full extraction, preview & export flow.
 *
 * Flow:
 *  1. "Xem trước" → fetch mobilebasic HTML → parse → fetch images → render preview
 *  2. "Xuất .docx"  → use cached ParsedDocument → build docx → download
 *     (re-fetches if cache is stale, i.e. tab URL changed)
 */

import { parseDocument, ParsedDocument, DocImage, TextRun } from './extractor';
import { buildDocx } from './docxBuilder';

// ──────────────────────────────────────────────
// State: cache the last parsed document so export
// doesn't need to re-fetch when preview was already loaded.
// ──────────────────────────────────────────────

let cachedParsed: ParsedDocument | null = null;
let cachedTabUrl: string | null = null;

// ──────────────────────────────────────────────
// UI helpers
// ──────────────────────────────────────────────

type StatusType = 'idle' | 'loading' | 'success' | 'error';

function setStatus(message: string, type: StatusType = 'idle'): void {
  const box = document.getElementById('statusBox')!;
  const text = document.getElementById('statusText')!;
  const iconEl = box.querySelector('.status-icon') as HTMLElement;

  box.className = `status-box ${type}`;

  const icons: Record<StatusType, string> = {
    idle: '📄',
    loading: '<div class="spinner"></div>',
    success: '✅',
    error: '❌',
  };

  iconEl.innerHTML = icons[type];
  text.textContent = message;
}

function setStep(active: number): void {
  for (let i = 1; i <= 4; i++) {
    const stepEl = document.getElementById(`step${i}`)!;
    const bubble = stepEl.querySelector('.step-bubble') as HTMLElement;
    stepEl.classList.remove('active', 'done');

    if (i < active) {
      stepEl.classList.add('done');
      bubble.innerHTML = '✓';
    } else if (i === active) {
      stepEl.classList.add('active');
      bubble.textContent = String(i);
    } else {
      bubble.textContent = String(i);
    }
  }
  for (let i = 1; i <= 3; i++) {
    document.getElementById(`conn${i}`)!.classList.toggle('done', i < active);
  }
}

function resetSteps(): void {
  for (let i = 1; i <= 4; i++) {
    const stepEl = document.getElementById(`step${i}`)!;
    const bubble = stepEl.querySelector('.step-bubble') as HTMLElement;
    stepEl.classList.remove('active', 'done');
    bubble.textContent = String(i);
  }
  for (let i = 1; i <= 3; i++) {
    document.getElementById(`conn${i}`)!.classList.remove('done');
  }
}

function setExportButtonEnabled(enabled: boolean): void {
  const btn = document.getElementById('exportBtn') as HTMLButtonElement;
  btn.disabled = !enabled;
}

function showPreviewSection(parsed: ParsedDocument): void {
  const section = document.getElementById('previewSection')!;
  const titleEl = document.getElementById('previewTitle')!;
  const statsEl = document.getElementById('previewStats')!;
  const contentEl = document.getElementById('previewContent')!;

  titleEl.textContent = parsed.title;

  // Compute stats
  const counts = { heading: 0, paragraph: 0, listItem: 0, table: 0, image: 0 };
  parsed.elements.forEach((el) => { counts[el.type] = (counts[el.type] ?? 0) + 1; });

  const statParts: string[] = [];
  if (counts.heading)   statParts.push(`${counts.heading} heading(s)`);
  if (counts.paragraph) statParts.push(`${counts.paragraph} paragraph(s)`);
  if (counts.listItem)  statParts.push(`${counts.listItem} list item(s)`);
  if (counts.table)     statParts.push(`${counts.table} table(s)`);
  if (counts.image)     statParts.push(`${counts.image} image(s)`);
  statsEl.textContent = statParts.join(' · ') || 'No content found';

  contentEl.innerHTML = generatePreviewHtml(parsed);
  section.style.display = 'block';
}

function hidePreviewSection(): void {
  document.getElementById('previewSection')!.style.display = 'none';
}

// ──────────────────────────────────────────────
// Preview HTML generator
// (generates sanitised HTML from the parsed tree)
// ──────────────────────────────────────────────

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderRunsHtml(runs: TextRun[]): string {
  return runs
    .map((run) => {
      let text = esc(run.text).replace(/\n/g, '<br>');
      if (!text) return '';
      if (run.color)         text = `<span style="color:${esc(run.color)}">${text}</span>`;
      if (run.strikethrough) text = `<s>${text}</s>`;
      if (run.underline)     text = `<u>${text}</u>`;
      if (run.italic)        text = `<em>${text}</em>`;
      if (run.bold)          text = `<strong>${text}</strong>`;
      if (run.link)          text = `<a href="${esc(run.link)}" target="_blank" rel="noopener">${text}</a>`;
      return text;
    })
    .join('');
}

function generatePreviewHtml(parsed: ParsedDocument): string {
  const parts: string[] = [];
  const BULLET_CHARS = ['•', '◦', '▪'];

  for (const el of parsed.elements) {
    switch (el.type) {
      case 'heading': {
        const tag = `h${el.level}`;
        parts.push(`<${tag}>${renderRunsHtml(el.runs)}</${tag}>`);
        break;
      }
      case 'paragraph': {
        const align = el.alignment ? ` style="text-align:${el.alignment}"` : '';
        const content = renderRunsHtml(el.runs);
        parts.push(`<p${align}>${content || '&nbsp;'}</p>`);
        break;
      }
      case 'listItem': {
        const bullet =
          el.listStyle === 'bullet'
            ? BULLET_CHARS[el.level % 3]
            : `${el.level + 1}.`;
        const indent = el.level * 16;
        parts.push(
          `<div class="pv-li" style="padding-left:${indent + 18}px">` +
          `<span class="pv-bullet">${esc(bullet)}</span>` +
          `<span>${renderRunsHtml(el.runs)}</span>` +
          `</div>`,
        );
        break;
      }
      case 'table': {
        let t = '<table class="pv-table">';
        for (const row of el.rows) {
          t += row.isHeader ? '<thead><tr>' : '<tr>';
          for (const cell of row.cells) {
            const cellTag = row.isHeader ? 'th' : 'td';
            const content = cell.paragraphs
              .map((runs) => renderRunsHtml(runs))
              .join('<br>');
            t += `<${cellTag}>${content}</${cellTag}>`;
          }
          t += row.isHeader ? '</tr></thead>' : '</tr>';
        }
        t += '</table>';
        parts.push(t);
        break;
      }
      case 'image': {
        const label = el.alt
          ? esc(el.alt)
          : esc(el.src.split('/').pop()?.split('?')[0] ?? 'Image');
        const dims =
          el.naturalWidth ? ` <span class="pv-img-dims">${el.naturalWidth}×${el.naturalHeight}px</span>` : '';
        // If we have base64 data, show a real thumbnail
        const thumb = el.base64
          ? `<img src="${esc(el.base64)}" class="pv-img-thumb" alt="${esc(el.alt ?? '')}">`
          : `<span class="pv-img-icon">🖼</span>`;
        parts.push(
          `<div class="pv-img">${thumb}<span class="pv-img-label">${label}${dims}</span></div>`,
        );
        break;
      }
    }
  }

  return parts.join('') || '<p class="pv-empty">No content found.</p>';
}

// ──────────────────────────────────────────────
// URL utilities
// ──────────────────────────────────────────────

function extractDocId(url: string): string | null {
  const m = url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

function toMobileBasicUrl(docId: string): string {
  return `https://docs.google.com/document/d/${docId}/mobilebasic?pagesize=1000`;
}

/**
 * Gets the active tab's ID and URL.
 * Uses the activeTab permission to safely read the URL.
 */
async function getActiveTab(): Promise<{ id: number; url: string }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('Active tab not found.');

  return { id: tab.id, url: tab.url || '' };
}

// ──────────────────────────────────────────────
// Tab-injected functions
// (serialised & run inside the Google Docs tab, keeping session cookies)
// ──────────────────────────────────────────────

/** Fetches the mobilebasic HTML from the tab context */
function fetchMobileBasicHtml(mobileUrl: string): string {
  return fetch(mobileUrl, { credentials: 'include' }).then((r: Response) => {
    if (!r.ok) throw new Error(`HTTP ${r.status} – could not load document`);
    return r.text();
  }) as unknown as string;
}

/** Fetches multiple image URLs and returns a map of {url → base64 data URI} */
function fetchImagesAsBase64(urls: string[]): Record<string, string> {
  return Promise.all(
    urls.map((url) =>
      fetch(url, { credentials: 'include' })
        .then((r: Response) => r.blob())
        .then(
          (blob: Blob) =>
            new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            }),
        )
        .catch(() => null as unknown as string),
    ),
  ).then((results: (string | null)[]) => {
    const map: Record<string, string> = {};
    urls.forEach((url, i) => { if (results[i]) map[url] = results[i] as string; });
    return map;
  }) as unknown as Record<string, string>;
}

// ──────────────────────────────────────────────
// Core: fetch + parse + (optionally) fetch images
// ──────────────────────────────────────────────

async function fetchAndParse(tabId: number, tabUrl: string): Promise<ParsedDocument> {
  const docId = extractDocId(tabUrl);
  if (!docId) throw new Error('Could not extract Document ID from URL.');

  const mobileUrl = toMobileBasicUrl(docId);

  // Fetch mobilebasic HTML from tab context
  const htmlResults = await chrome.scripting.executeScript({
    target: { tabId },
    func: fetchMobileBasicHtml,
    args: [mobileUrl],
  });
  const html = htmlResults[0]?.result as unknown as string;
  if (!html) throw new Error('Script returned no HTML.');

  const parsed = parseDocument(html);
  if (parsed.elements.length === 0) {
    throw new Error('Document has no extractable content.');
  }

  // Fetch images if any
  const imgElements = parsed.elements.filter(
    (el): el is DocImage => el.type === 'image',
  );

  if (imgElements.length > 0) {
    const MAX_IMAGES = 20; // cap to avoid huge payloads
    const urls = imgElements.slice(0, MAX_IMAGES).map((img) => img.src);

    try {
      const imgResults = await chrome.scripting.executeScript({
        target: { tabId },
        func: fetchImagesAsBase64,
        args: [urls],
      });
      const b64Map = imgResults[0]?.result as unknown as Record<string, string> | null;

      if (b64Map) {
        imgElements.forEach((img) => {
          if (b64Map[img.src]) {
            img.base64 = b64Map[img.src];
            // Detect type from data URI header
            const header = img.base64.split(';')[0];
            if (header.includes('jpeg') || header.includes('jpg')) img.imageType = 'jpg';
            else if (header.includes('png'))  img.imageType = 'png';
            else if (header.includes('gif'))  img.imageType = 'gif';
            else if (header.includes('bmp'))  img.imageType = 'bmp';
          }
        });
      }
    } catch {
      // Image fetch failure is non-fatal; images will be skipped in docx
    }
  }

  return parsed;
}

// ──────────────────────────────────────────────
// Download helper
// ──────────────────────────────────────────────

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ──────────────────────────────────────────────
// Event: "Xem trước tài liệu"
// ──────────────────────────────────────────────

async function handlePreview(): Promise<void> {
  const previewBtn = document.getElementById('previewBtn') as HTMLButtonElement;
  const exportBtn  = document.getElementById('exportBtn')  as HTMLButtonElement;

  previewBtn.disabled = true;
  exportBtn.disabled  = true;
  cachedParsed = null;
  resetSteps();
  hidePreviewSection();

  try {
    setStep(1);
    setStatus('Checking active tab…', 'loading');

    const { id: tabId, url: tabUrl } = await getActiveTab();

    if (!tabUrl.includes('docs.google.com/document/')) {
      setStatus('Not a Google Docs page. Please open a document first.', 'error');
      return;
    }

    setStep(2);
    setStatus('Fetching document content…', 'loading');

    const parsed = await fetchAndParse(tabId, tabUrl);

    setStep(3);
    setStatus('Rendering preview…', 'loading');

    cachedParsed = parsed;
    cachedTabUrl = tabUrl;

    setStep(4);
    showPreviewSection(parsed);
    setExportButtonEnabled(true);
    setStatus(
      `Preview ready. Click "Export .docx" to download.`,
      'success',
    );
  } catch (err) {
    setStatus(`Error: ${(err as Error).message}`, 'error');
    console.error('[DocPort]', err);
  } finally {
    previewBtn.disabled = false;
  }
}

// ──────────────────────────────────────────────
// Event: "Xuất ra .docx"
// ──────────────────────────────────────────────

async function handleExport(): Promise<void> {
  const exportBtn = document.getElementById('exportBtn') as HTMLButtonElement;
  exportBtn.disabled = true;

  try {
    let parsed = cachedParsed;

    if (!parsed) {
      setStep(1);
      setStatus('Fetching document…', 'loading');

      const { id: tabId, url: tabUrl } = await getActiveTab();
      if (!tabUrl.includes('docs.google.com/document/')) {
        setStatus('Not a Google Docs page.', 'error');
        return;
      }

      setStep(2);
      parsed = await fetchAndParse(tabId, tabUrl);
      cachedParsed = parsed;
      cachedTabUrl = tabUrl;
    }

    setStep(3);
    setStatus('Building .docx file…', 'loading');
    const blob = await buildDocx(parsed);

    setStep(4);
    const safeTitle = parsed.title.replace(/[/\\:*?"<>|]/g, '_').slice(0, 200);
    downloadBlob(blob, `${safeTitle}.docx`);

    setStatus(`Downloaded "${safeTitle}.docx" successfully!`, 'success');
  } catch (err) {
    setStatus(`Export error: ${(err as Error).message}`, 'error');
    console.error('[DocPort]', err);
  } finally {
    exportBtn.disabled = false;
  }
}

// ──────────────────────────────────────────────
// Event listeners
// ──────────────────────────────────────────────

document.getElementById('previewBtn')!.addEventListener('click', handlePreview);
document.getElementById('exportBtn')!.addEventListener('click', handleExport);

document.getElementById('openMobileBtn')!.addEventListener('click', async () => {
  try {
    const { url } = await getActiveTab();
    const docId = extractDocId(url);
    if (docId) {
      chrome.tabs.create({
        url: `https://docs.google.com/document/d/${docId}/mobilebasic`,
      });
    } else {
      setStatus('Not a valid Google Docs URL.', 'error');
    }
  } catch (err) {
    setStatus(`Error: ${(err as Error).message}`, 'error');
  }
});

document.getElementById('closePreviewBtn')!.addEventListener('click', () => {
  hidePreviewSection();
});

document.getElementById('copyPreviewBtn')!.addEventListener('click', () => {
  const content = document.getElementById('previewContent');
  if (!content) return;
  
  try {
    const range = document.createRange();
    range.selectNode(content);
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand('copy');
      selection.removeAllRanges();
      setStatus('Copied to clipboard successfully!', 'success');
    }
  } catch (err) {
    setStatus(`Copy failed: ${(err as Error).message}`, 'error');
  }
});
