import { parseDocument } from './extractor.js';

// ──────────────────────────────────────────────
// URL utilities
// ──────────────────────────────────────────────

export function extractDocId(url) {
  const m = url.match(/^https?:\/\/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

function toMobileBasicUrl(docId) {
  return `https://docs.google.com/document/d/${docId}/mobilebasic?pagesize=1000`;
}

/**
 * Gets the active tab's ID and URL.
 * Uses the activeTab permission to safely read the URL.
 */
export async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('Active tab not found.');

  return { id: tab.id, url: tab.url || '' };
}

// ──────────────────────────────────────────────
// Tab-injected functions
// (serialised & run inside the Google Docs tab, keeping session cookies)
// ──────────────────────────────────────────────

/** Fetches the mobilebasic HTML from the tab context */
function fetchMobileBasicHtml(mobileUrl) {
  return fetch(mobileUrl, { credentials: 'include' }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status} – could not load document`);
    return r.text();
  });
}

/** Fetches multiple image URLs and returns a map of {url → base64 data URI} */
function fetchImagesAsBase64(urls) {
  return Promise.all(
    urls.map((url) =>
      fetch(url, { credentials: 'include' })
        .then((r) => r.blob())
        .then(
          (blob) =>
            new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            }),
        )
        .catch(() => null),
    ),
  ).then((results) => {
    const map = {};
    urls.forEach((url, i) => { if (results[i]) map[url] = results[i]; });
    return map;
  });
}

// ──────────────────────────────────────────────
// Core: fetch + parse + (optionally) fetch images
// ──────────────────────────────────────────────

export async function fetchAndParse(tabId, tabUrl) {
  const docId = extractDocId(tabUrl);
  if (!docId) throw new Error('Could not extract Document ID from URL.');

  const mobileUrl = toMobileBasicUrl(docId);

  // Fetch mobilebasic HTML from tab context
  const htmlResults = await chrome.scripting.executeScript({
    target: { tabId },
    func: fetchMobileBasicHtml,
    args: [mobileUrl],
  });
  const html = htmlResults[0]?.result;
  if (!html) throw new Error('Script returned no HTML.');

  const parsed = parseDocument(html);
  if (parsed.elements.length === 0) {
    throw new Error('Document has no extractable content.');
  }

  // Fetch images if any
  const imgElements = parsed.elements.filter(
    (el) => el.type === 'image',
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
      const b64Map = imgResults[0]?.result;

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
