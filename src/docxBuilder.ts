/**
 * Converts a ParsedDocument into a .docx Blob using the official `docx` library.
 *
 * Supports:
 *  - Headings H1–H6
 *  - Bold, italic, underline, strikethrough, color
 *  - Hyperlinks
 *  - Bullet & numbered lists (up to 9 levels)
 *  - Tables with header row styling + multi-paragraph cells
 *  - Inline images (JPEG, PNG, GIF, BMP) with auto-size capping
 *  - Proper page margins and font defaults
 */

import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  Packer,
  Table,
  TableRow,
  TableCell,
  BorderStyle,
  WidthType,
  AlignmentType,
  LevelFormat,
  UnderlineType,
  ExternalHyperlink,
  ShadingType,
  convertInchesToTwip,
  ImageRun,
} from 'docx';

import type {
  ParsedDocument,
  DocElement,
  TextRun as MyTextRun,
  DocTableRow,
  DocImage,
} from './extractor';

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

const BULLET_LIST_REF = 'docs-extractor-bullet';
const NUMBERED_LIST_REF = 'docs-extractor-numbered';

type HeadingLevelValue = (typeof HeadingLevel)[keyof typeof HeadingLevel];
const HEADING_LEVEL_MAP: Record<number, HeadingLevelValue> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
};

type AlignmentValue = (typeof AlignmentType)[keyof typeof AlignmentType];
const ALIGN_MAP: Record<string, AlignmentValue> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
};

/**
 * Max content width at 1.25″ margins = 6.5″ × 914400 EMU/inch ≈ 5,943,600 EMU.
 * We cap images at 5,760,000 EMU (≈6.28″) to keep some safe margin.
 */
const MAX_IMAGE_EMU_WIDTH = 5_760_000;
const PX_TO_EMU = 914400 / 96; // 96 DPI assumed

// ──────────────────────────────────────────────
// Image helpers
// ──────────────────────────────────────────────

/** Detect image format from magic bytes */
function detectImageType(buf: ArrayBuffer): 'jpg' | 'png' | 'gif' | 'bmp' | null {
  const b = new Uint8Array(buf, 0, 4);
  if (b[0] === 0xff && b[1] === 0xd8) return 'jpg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'gif';
  if (b[0] === 0x42 && b[1] === 0x4d) return 'bmp';
  return null;
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  // Strip data URI prefix if present
  const raw = b64.includes(',') ? b64.split(',')[1] : b64;
  const binary = atob(raw);
  const buf = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
  return buf;
}

function pxToEmu(px: number): number {
  return Math.round(px * PX_TO_EMU);
}

/** Scale image dimensions so width ≤ MAX_IMAGE_EMU_WIDTH, preserving aspect ratio */
function scaleImageDimensions(
  wPx: number | undefined,
  hPx: number | undefined,
): { width: number; height: number } {
  const defaultW = 400;
  const defaultH = 300;

  let wEmu = pxToEmu(wPx ?? defaultW);
  let hEmu = pxToEmu(hPx ?? defaultH);

  if (wEmu > MAX_IMAGE_EMU_WIDTH) {
    const ratio = MAX_IMAGE_EMU_WIDTH / wEmu;
    wEmu = MAX_IMAGE_EMU_WIDTH;
    hEmu = Math.round(hEmu * ratio);
  }

  // Sanity: ensure positive dimensions
  return { width: Math.max(wEmu, 914400), height: Math.max(hEmu, 685800) };
}

function buildImageParagraph(img: DocImage): Paragraph | null {
  if (!img.base64) return null;

  try {
    const data = base64ToArrayBuffer(img.base64);
    const imageType = img.imageType ?? detectImageType(data);
    if (!imageType) return null;

    const { width, height } = scaleImageDimensions(img.naturalWidth, img.naturalHeight);

    return new Paragraph({
      children: [
        new ImageRun({
          data,
          transformation: { width, height },
        }),
      ],
    });
  } catch {
    // If image fails to embed, skip silently
    return null;
  }
}

// ──────────────────────────────────────────────
// Text run builder
// ──────────────────────────────────────────────

function buildTextRuns(runs: MyTextRun[]): (TextRun | ExternalHyperlink)[] {
  const result: (TextRun | ExternalHyperlink)[] = [];
  const merged = mergeRuns(runs);

  for (const run of merged) {
    if (run.link) {
      result.push(
        new ExternalHyperlink({
          link: run.link,
          children: [
            new TextRun({
              text: run.text,
              bold: run.bold ?? false,
              italics: run.italic ?? false,
              style: 'Hyperlink',
              underline: { type: UnderlineType.SINGLE },
              color: '1155CC',
            }),
          ],
        }),
      );
    } else {
      result.push(
        new TextRun({
          text: run.text,
          bold: run.bold ?? false,
          italics: run.italic ?? false,
          strike: run.strikethrough ?? false,
          underline: run.underline ? { type: UnderlineType.SINGLE } : undefined,
          color: run.color ? run.color.replace('#', '') : undefined,
        }),
      );
    }
  }

  return result;
}

function mergeRuns(runs: MyTextRun[]): MyTextRun[] {
  if (runs.length === 0) return [];
  const out: MyTextRun[] = [{ ...runs[0] }];
  for (let i = 1; i < runs.length; i++) {
    const prev = out[out.length - 1];
    const cur = runs[i];
    if (
      prev.bold === cur.bold &&
      prev.italic === cur.italic &&
      prev.underline === cur.underline &&
      prev.strikethrough === cur.strikethrough &&
      prev.color === cur.color &&
      prev.link === cur.link
    ) {
      prev.text += cur.text;
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

// ──────────────────────────────────────────────
// Numbering config (bullet + numbered, 9 levels)
// ──────────────────────────────────────────────

const BULLET_CHARS = ['•', '◦', '▪', '•', '◦', '▪', '•', '◦', '▪'];

function buildNumberingConfig() {
  return {
    config: [
      {
        reference: BULLET_LIST_REF,
        levels: Array.from({ length: 9 }, (_, i) => ({
          level: i,
          format: LevelFormat.BULLET,
          text: BULLET_CHARS[i],
          alignment: AlignmentType.LEFT,
          style: {
            paragraph: {
              indent: {
                left: convertInchesToTwip(0.5 * (i + 1)),
                hanging: convertInchesToTwip(0.25),
              },
            },
          },
        })),
      },
      {
        reference: NUMBERED_LIST_REF,
        levels: Array.from({ length: 9 }, (_, i) => ({
          level: i,
          format: LevelFormat.DECIMAL,
          text: `%${i + 1}.`,
          alignment: AlignmentType.LEFT,
          style: {
            paragraph: {
              indent: {
                left: convertInchesToTwip(0.5 * (i + 1)),
                hanging: convertInchesToTwip(0.25),
              },
            },
          },
        })),
      },
    ],
  };
}

// ──────────────────────────────────────────────
// Table builder
// ──────────────────────────────────────────────

function buildTable(rows: DocTableRow[]): Table {
  const tableRows = rows.map(
    (row) =>
      new TableRow({
        tableHeader: row.isHeader,
        children: row.cells.map(
          (cell) =>
            new TableCell({
              children: cell.paragraphs.map(
                (runs) => new Paragraph({ children: buildTextRuns(runs) }),
              ),
              shading: row.isHeader
                ? { type: ShadingType.SOLID, color: 'F1F3F4', fill: 'F1F3F4' }
                : undefined,
            }),
        ),
      }),
  );

  return new Table({
    rows: tableRows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top:             { style: BorderStyle.SINGLE, size: 1, color: 'DADCE0' },
      bottom:          { style: BorderStyle.SINGLE, size: 1, color: 'DADCE0' },
      left:            { style: BorderStyle.SINGLE, size: 1, color: 'DADCE0' },
      right:           { style: BorderStyle.SINGLE, size: 1, color: 'DADCE0' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'DADCE0' },
      insideVertical:   { style: BorderStyle.SINGLE, size: 1, color: 'DADCE0' },
    },
  });
}

// ──────────────────────────────────────────────
// Main builder
// ──────────────────────────────────────────────

export async function buildDocx(parsed: ParsedDocument): Promise<Blob> {
  const children: (Paragraph | Table)[] = [];

  for (const el of parsed.elements) {
    switch (el.type) {
      case 'heading': {
        children.push(
          new Paragraph({
            heading: HEADING_LEVEL_MAP[el.level] ?? HeadingLevel.HEADING_1,
            children: buildTextRuns(el.runs),
          }),
        );
        break;
      }

      case 'paragraph': {
        children.push(
          new Paragraph({
            children: buildTextRuns(el.runs),
            alignment: el.alignment ? ALIGN_MAP[el.alignment] : undefined,
          }),
        );
        break;
      }

      case 'listItem': {
        children.push(
          new Paragraph({
            numbering: {
              reference: el.listStyle === 'bullet' ? BULLET_LIST_REF : NUMBERED_LIST_REF,
              level: Math.min(el.level, 8),
            },
            children: buildTextRuns(el.runs),
          }),
        );
        break;
      }

      case 'table': {
        children.push(buildTable(el.rows));
        children.push(new Paragraph({ children: [] }));
        break;
      }

      case 'image': {
        const imgPara = buildImageParagraph(el as DocImage);
        if (imgPara) {
          children.push(imgPara);
        }
        break;
      }
    }
  }

  const doc = new Document({
    numbering: buildNumberingConfig(),
    sections: [
      {
        properties: {
          page: {
            margin: {
              top:    convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left:   convertInchesToTwip(1.25),
              right:  convertInchesToTwip(1.25),
            },
          },
        },
        children,
      },
    ],
    styles: {
      default: {
        document: {
          run: { font: 'Arial', size: 22 },
        },
      },
    },
  });

  return Packer.toBlob(doc);
}
