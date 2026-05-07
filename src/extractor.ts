/**
 * Parses Google Docs /mobilebasic HTML into a structured document tree.
 *
 * Strategy:
 *  1. Extract all CSS class rules from <style> tags (Google Docs uses generated
 *     class names like c0, c1 for formatting).
 *  2. Walk the DOM, mapping semantic tags (h1-h6, p, ul, ol, li, table, img)
 *     and CSS properties (font-weight, font-style, text-decoration) to our types.
 */

export interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  link?: string;
  color?: string;
}

export interface DocHeading {
  type: 'heading';
  level: 1 | 2 | 3 | 4 | 5 | 6;
  runs: TextRun[];
}

export interface DocParagraph {
  type: 'paragraph';
  runs: TextRun[];
  alignment?: 'left' | 'center' | 'right' | 'justify';
}

export interface DocListItem {
  type: 'listItem';
  listStyle: 'bullet' | 'numbered';
  level: number;
  runs: TextRun[];
}

export interface DocTableCell {
  /** Each entry is one paragraph inside the cell */
  paragraphs: TextRun[][];
}

export interface DocTableRow {
  cells: DocTableCell[];
  isHeader: boolean;
}

export interface DocTable {
  type: 'table';
  rows: DocTableRow[];
}

export interface DocImage {
  type: 'image';
  src: string;
  alt?: string;
  naturalWidth?: number;
  naturalHeight?: number;
  /** Populated in popup.ts after fetching from tab context */
  base64?: string;
  imageType?: 'jpg' | 'png' | 'gif' | 'bmp';
}

export type DocElement = DocHeading | DocParagraph | DocListItem | DocTable | DocImage;

export interface ParsedDocument {
  title: string;
  elements: DocElement[];
}

// ──────────────────────────────────────────────
// CSS class parser
// ──────────────────────────────────────────────

interface CSSProps {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  color?: string;
  fontSize?: number;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
}

function parseStyleSheets(doc: Document): Map<string, CSSProps> {
  const map = new Map<string, CSSProps>();

  doc.querySelectorAll('style').forEach((styleEl) => {
    const css = styleEl.textContent ?? '';
    const ruleRegex = /\.([\w-]+)\s*\{([^}]+)\}/g;
    let m: RegExpExecArray | null;

    while ((m = ruleRegex.exec(css)) !== null) {
      const cls = m[1];
      const body = m[2];
      const props: CSSProps = {};

      if (/font-weight\s*:\s*(bold|[6-9]\d{2})/.test(body)) props.bold = true;
      if (/font-style\s*:\s*italic/.test(body)) props.italic = true;
      if (/text-decoration[^:]*:[^;]*underline/.test(body)) props.underline = true;
      if (/text-decoration[^:]*:[^;]*line-through/.test(body)) props.strikethrough = true;

      const fsMatch = body.match(/font-size\s*:\s*([\d.]+)pt/);
      if (fsMatch) props.fontSize = parseFloat(fsMatch[1]);

      const colorMatch = body.match(/(?:^|;)\s*color\s*:\s*(#[0-9a-fA-F]{6})/);
      if (colorMatch) props.color = colorMatch[1];

      const alignMatch = body.match(/text-align\s*:\s*(left|center|right|justify)/);
      if (alignMatch) props.textAlign = alignMatch[1] as CSSProps['textAlign'];

      if (Object.keys(props).length > 0) map.set(cls, props);
    }
  });

  return map;
}

function mergePropsFromElement(el: Element, cssMap: Map<string, CSSProps>): CSSProps {
  let merged: CSSProps = {};

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
  if (alignMatch) merged.textAlign = alignMatch[1] as CSSProps['textAlign'];

  return merged;
}

// ──────────────────────────────────────────────
// Inline run extractor (walks text + formatting nodes)
// ──────────────────────────────────────────────

function extractRuns(
  node: Node,
  cssMap: Map<string, CSSProps>,
  inherited: CSSProps = {},
): TextRun[] {
  const runs: TextRun[] = [];

  function walk(n: Node, fmt: CSSProps, inheritedLink?: string): void {
    if (n.nodeType === Node.TEXT_NODE) {
      const text = n.textContent ?? '';
      if (!text) return;
      const run: TextRun = { text };
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

    const el = n as Element;
    const tag = el.tagName.toLowerCase();

    if (tag === 'br') { runs.push({ text: '\n' }); return; }
    if (['script', 'style', 'noscript', 'img', 'table'].includes(tag)) return;

    let newFmt: CSSProps = { ...fmt, ...mergePropsFromElement(el, cssMap) };

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

function hasVisibleText(runs: TextRun[]): boolean {
  return runs.some((r) => r.text.trim().length > 0);
}

// ──────────────────────────────────────────────
// Heading detection
// ──────────────────────────────────────────────

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

function tagToHeadingLevel(tag: string): 1 | 2 | 3 | 4 | 5 | 6 | null {
  if (HEADING_TAGS.has(tag)) return parseInt(tag[1]) as 1 | 2 | 3 | 4 | 5 | 6;
  return null;
}

function inferHeadingLevel(
  el: Element,
  cssMap: Map<string, CSSProps>,
): 1 | 2 | 3 | 4 | 5 | 6 | null {
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

function extractCellParagraphs(cell: Element, cssMap: Map<string, CSSProps>): TextRun[][] {
  const paragraphs: TextRun[][] = [];

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

export function parseDocument(html: string): ParsedDocument {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const cssMap = parseStyleSheets(doc);

  const rawTitle = doc.title ?? '';
  const title = rawTitle.replace(/\s*[-–]\s*Google Docs\s*$/i, '').trim() || 'document';

  const elements: DocElement[] = [];

  function pushParagraphOrHeading(el: Element): void {
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

  function processListElement(
    list: Element,
    style: 'bullet' | 'numbered',
    level: number,
  ): void {
    for (const child of Array.from(list.children)) {
      if (child.tagName.toLowerCase() !== 'li') continue;

      const liClone = child.cloneNode(true) as Element;
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

  function processTable(table: Element): void {
    const rows: DocTableRow[] = [];

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

      const cells: DocTableCell[] = allCells.map((cell) => ({
        paragraphs: extractCellParagraphs(cell, cssMap),
      }));

      if (cells.length > 0) rows.push({ cells, isHeader });
    });

    if (rows.length > 0) elements.push({ type: 'table', rows });
  }

  function processContainer(container: Element): void {
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
