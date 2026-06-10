/**
 * Popup entry point — orchestrates the full extraction, preview & export flow.
 */

import { getActiveTab, extractDocId, fetchAndParse } from './api.js';
import { buildDocx } from './docxBuilder.js';
import {
  setStatus,
  setStep,
  resetSteps,
  setExportButtonEnabled,
  showPreviewSection,
  hidePreviewSection,
} from './ui.js';

// ──────────────────────────────────────────────
// State: cache the last parsed document so export
// doesn't need to re-fetch when preview was already loaded.
// ──────────────────────────────────────────────

let cachedParsed = null;
let cachedTabUrl = null;

// ──────────────────────────────────────────────
// Download helper
// ──────────────────────────────────────────────

function downloadBlob(blob, filename) {
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

async function handlePreview() {
  const previewBtn = document.getElementById('previewBtn');
  const exportBtn  = document.getElementById('exportBtn');

  previewBtn.disabled = true;
  exportBtn.disabled  = true;
  cachedParsed = null;
  resetSteps();
  hidePreviewSection();

  try {
    setStep(1);
    setStatus('Checking active tab…', 'loading');

    const { id: tabId, url: tabUrl } = await getActiveTab();

    if (!tabUrl.startsWith('https://docs.google.com/document/')) {
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
    setStatus(`Error: ${err.message}`, 'error');
    console.error('[DocPort]', err);
  } finally {
    previewBtn.disabled = false;
  }
}

// ──────────────────────────────────────────────
// Event: "Xuất ra .docx"
// ──────────────────────────────────────────────

async function handleExport() {
  const exportBtn = document.getElementById('exportBtn');
  exportBtn.disabled = true;

  try {
    let parsed = cachedParsed;

    if (!parsed) {
      setStep(1);
      setStatus('Fetching document…', 'loading');

      const { id: tabId, url: tabUrl } = await getActiveTab();
      if (!tabUrl.startsWith('https://docs.google.com/document/')) {
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
    const filename = /\.(docx|doc)$/i.test(safeTitle) ? safeTitle : `${safeTitle}.docx`;
    downloadBlob(blob, filename);

    setStatus(`Downloaded "${filename}" successfully!`, 'success');
  } catch (err) {
    setStatus(`Export error: ${err.message}`, 'error');
    console.error('[DocPort]', err);
  } finally {
    exportBtn.disabled = false;
  }
}

// ──────────────────────────────────────────────
// Event listeners
// ──────────────────────────────────────────────

document.getElementById('previewBtn').addEventListener('click', handlePreview);
document.getElementById('exportBtn').addEventListener('click', handleExport);

document.getElementById('openMobileBtn').addEventListener('click', async () => {
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
    setStatus(`Error: ${err.message}`, 'error');
  }
});

document.getElementById('closePreviewBtn').addEventListener('click', () => {
  hidePreviewSection();
});

document.getElementById('copyPreviewBtn').addEventListener('click', () => {
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
    setStatus(`Copy failed: ${err.message}`, 'error');
  }
});
