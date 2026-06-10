/**
 * Parses Google Docs /mobilebasic HTML into a structured document tree.
 *
 * Strategy:
 *  1. Extract all CSS class rules from <style> tags (Google Docs uses generated
 *     class names like c0, c1 for formatting).
 *  2. Walk the DOM, mapping semantic tags (h1-h6, p, ul, ol, li, table, img)
 *     and CSS properties (font-weight, font-style, text-decoration) to our types.
 */

// ──────────────────────────────────────────────
// CSS class parser
// ──────────────────────────────────────────────

function parseStyleSheets(doc) {
  const map = new Map();

  doc.querySelectorAll('style').forEach((styleEl) => {
    const css = styleEl.textContent ?? '';
    const ruleRegex = /\.([\w-]+)\s*\{([^}]+)\}/g;
    let m;

    while ((m = ruleRegex.exec(css)) !== null) {
      const cls = m[1];
      const body = m[2];
      const props = {};

      if (/font-weight\s*:\s*(bold|[6-9]\d{2})/.test(body)) props.bold = true;
      if (/font-style\s*:\s*italic/.test(body)) props.italic = true;
      if (/text-decoration[^:]*:[^;]*underline/.test(body)) props.underline = true;
      if (/text-decoration[^:]*:[^;]*line-through/.test(body)) props.strikethrough = true;

      const fsMatch = body.match(/font-size\s*:\s*([\d.]+)pt/);
      if (fsMatch) props.fontSize = parseFloat(fsMatch[1]);

      const colorMatch = body.match(/(?:^|;)\s*color\s*:\s*(#[0-9a-fA-F]{6})/);
      if (colorMatch) props.color = colorMatch[1];

      const alignMatch = body.match(/text-align\s*:\s*(left|center|right|justify)/);
      if (alignMatch) props.textAlign = alignMatch[1];

      if (Object.keys(props).length > 0) map.set(cls, props);
    }
  });

  return map;
}

function mergePropsFromElement(el, cssMap) {
  let merged = {};

  el.classList.forEach((cls) => {
    const p = cssMap.get(cls);
    if (p) merged = { ...merged, ...p };
  });

  const style = el.getAttribute('style') ?? '';
  if (/font-weight\s*:\s*(bold|[6-9]\d{2})/.test(style)) merged.bold = true;
  if (/font-style\s*:\s*italic/.test(style)) merged.italic = true;
  if (/text-decoration[^;]*underline/.test(style)) merged.underline = true;
  if (/text-decoration[^;]*line-through/.test(style)) merged.strikethrough = true;

  const fsMatch = style.match(/font-size\s*:\s*([\d.]+)pt/);
  if (fsMatch) merged.fontSize = parseFloat(fsMatch[1]);

  const alignMatch = style.match(/text-align\s*:\s*(left|center|right|justify)/);
  if (alignMatch) merged.textAlign = alignMatch[1];

  return merged;
}

// ──────────────────────────────────────────────
// Inline run extractor (walks text + formatting nodes)
// ──────────────────────────────────────────────

function extractRuns(node, cssMap, inherited = {}) {
  const runs = [];

  function walk(n, fmt, inheritedLink) {
    if (n.nodeType === Node.TEXT_NODE) {
      const text = n.textContent ?? '';
      if (!text) return;
      const run = { text };
      if (fmt.bold) run.bold = true;
      if (fmt.italic) run.italic = true;
      if (fmt.underline) run.underline = true;
      if (fmt.strikethrough) run.strikethrough = true;
      if (fmt.color && fmt.color !== '#000000') run.color = fmt.color;
      if (inheritedLink) run.link = inheritedLink;
      runs.push(run);
      return;
    }

    if (n.nodeType !== Node.ELEMENT_NODE) return;

    const el = n;
    const tag = el.tagName.toLowerCase();

    if (tag === 'br') { runs.push({ text: '\n' }); return; }
    if (['script', 'style', 'noscript', 'img', 'table'].includes(tag)) return;

    let newFmt = { ...fmt, ...mergePropsFromElement(el, cssMap) };

    if (tag === 'b' || tag === 'strong') newFmt.bold = true;
    if (tag === 'i' || tag === 'em') newFmt.italic = true;
    if (tag === 'u') newFmt.underline = true;
    if (tag === 's' || tag === 'del' || tag === 'strike') newFmt.strikethrough = true;

    let link = inheritedLink;
    if (tag === 'a') {
      let href = el.getAttribute('href') ?? '';
      if (href.includes('google.com/url')) {
        const qMatch = href.match(/[?&]q=([^&]+)/);
        if (qMatch) href = decodeURIComponent(qMatch[1]);
      }
      if (href && !href.startsWith('javascript')) link = href;
    }

    for (const child of Array.from(n.childNodes)) {
      walk(child, newFmt, link);
    }
  }

  walk(node, inherited);
  return runs;
}

function hasVisibleText(runs) {
  return runs.some((r) => r.text.trim().length > 0);
}

// ──────────────────────────────────────────────
// Heading detection
// ──────────────────────────────────────────────

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

function tagToHeadingLevel(tag) {
  if (HEADING_TAGS.has(tag)) return parseInt(tag[1]);
  return null;
}

function inferHeadingLevel(el, cssMap) {
  const props = mergePropsFromElement(el, cssMap);
  const size = props.fontSize ?? 0;
  if (size >= 22) return 1;
  if (size >= 17) return 2;
  if (size >= 14) return 3;
  return null;
}

// ──────────────────────────────────────────────
// Table cell content extractor
// Handles multi-paragraph cells properly
// ──────────────────────────────────────────────

function extractCellParagraphs(cell, cssMap) {
  const paragraphs = [];

  // Find direct block-level children that carry content
  const blockTags = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'ul', 'ol']);
  const blocks = Array.from(cell.children).filter((c) =>
    blockTags.has(c.tagName.toLowerCase()),
  );

  if (blocks.length === 0) {
    // Plain cell with no block wrappers — treat as single paragraph
    const runs = extractRuns(cell, cssMap);
    if (hasVisibleText(runs)) paragraphs.push(runs);
  } else {
    for (const block of blocks) {
      const runs = extractRuns(block, cssMap);
      if (hasVisibleText(runs)) paragraphs.push(runs);
    }
  }

  // Always have at least one (empty) paragraph so the cell renders in docx
  if (paragraphs.length === 0) paragraphs.push([{ text: '' }]);
  return paragraphs;
}

// ──────────────────────────────────────────────
// Main parser
// ──────────────────────────────────────────────

export function parseDocument(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const cssMap = parseStyleSheets(doc);

  const rawTitle = doc.title ?? '';
  const title = rawTitle.replace(/\s*[-–]\s*Google Docs\s*$/i, '').trim() || 'document';

  const elements = [];

  function pushParagraphOrHeading(el) {
    const tag = el.tagName.toLowerCase();
    const runs = extractRuns(el, cssMap);
    if (!hasVisibleText(runs)) return;

    const levelFromTag = tagToHeadingLevel(tag);
    if (levelFromTag !== null) {
      elements.push({ type: 'heading', level: levelFromTag, runs });
      return;
    }

    const levelFromCss = inferHeadingLevel(el, cssMap);
    if (levelFromCss !== null) {
      elements.push({ type: 'heading', level: levelFromCss, runs });
      return;
    }

    const alignment = mergePropsFromElement(el, cssMap).textAlign;
    elements.push({ type: 'paragraph', runs, alignment });
  }

  function processListElement(list, style, level) {
    for (const child of Array.from(list.children)) {
      if (child.tagName.toLowerCase() !== 'li') continue;

      const liClone = child.cloneNode(true);
      liClone.querySelectorAll('ul, ol').forEach((n) => n.remove());

      const runs = extractRuns(liClone, cssMap);
      if (hasVisibleText(runs)) {
        elements.push({ type: 'listItem', listStyle: style, level, runs });
      }

      for (const nested of Array.from(child.children)) {
        const nestedTag = nested.tagName.toLowerCase();
        if (nestedTag === 'ul') processListElement(nested, 'bullet', level + 1);
        else if (nestedTag === 'ol') processListElement(nested, 'numbered', level + 1);
      }
    }
  }

  function processTable(table) {
    const rows = [];

    // Use direct row ownership check to avoid picking up nested-table rows
    const allRows = Array.from(table.querySelectorAll('tr')).filter(
      (tr) => tr.closest('table') === table,
    );

    allRows.forEach((tr) => {
      const isHeader =
        tr.closest('thead') !== null ||
        Array.from(tr.children).some((c) => c.tagName.toLowerCase() === 'th');

      // Same ownership check for cells in case of colspan/colspan tricks
      const allCells = Array.from(tr.querySelectorAll('td, th')).filter(
        (cell) => cell.closest('tr') === tr,
      );

      const cells = allCells.map((cell) => ({
        paragraphs: extractCellParagraphs(cell, cssMap),
      }));

      if (cells.length > 0) rows.push({ cells, isHeader });
    });

    if (rows.length > 0) elements.push({ type: 'table', rows });
  }

  function processContainer(container) {
    for (const child of Array.from(container.children)) {
      const tag = child.tagName.toLowerCase();

      if (HEADING_TAGS.has(tag) || tag === 'p') {
        pushParagraphOrHeading(child);
      } else if (tag === 'ul') {
        processListElement(child, 'bullet', 0);
      } else if (tag === 'ol') {
        processListElement(child, 'numbered', 0);
      } else if (tag === 'table') {
        processTable(child);
      } else if (tag === 'img') {
        const src = child.getAttribute('src') ?? '';
        // Skip empty or base64 data URIs (already embedded)
        if (src && !src.startsWith('data:')) {
          const wAttr = child.getAttribute('width');
          const hAttr = child.getAttribute('height');
          elements.push({
            type: 'image',
            src,
            alt: child.getAttribute('alt') ?? undefined,
            naturalWidth: wAttr ? parseInt(wAttr) : undefined,
            naturalHeight: hAttr ? parseInt(hAttr) : undefined,
          });
        }
      } else if (['div', 'section', 'article', 'main', 'figure'].includes(tag)) {
        // Recurse into generic containers; if the only child is <img>, it will be captured above
        processContainer(child);
      }
    }
  }

  processContainer(doc.body);

  return { title, elements };
}
