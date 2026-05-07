/**
 * Generate extension PNG icons (16, 32, 48, 128 px) from SVG templates.
 * Run: node scripts/generate-icons.js
 */

'use strict';

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '../src/icons');
fs.mkdirSync(OUT_DIR, { recursive: true });

// ── SVG templates ──────────────────────────────────────────────────────────
// Primary: #1a73e8 (Google Blue)  Accent: #34a853 (Google Green)

/**
 * Full icon (128 / 48): document page + green export badge.
 */
function svgFull(size) {
  const s = size / 128; // scale factor
  const R = (v) => Math.round(v * s * 10) / 10;

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <rect width="${size}" height="${size}" rx="${R(18)}" fill="#1a73e8"/>

  <!-- Document shadow -->
  <rect x="${R(28)}" y="${R(22)}" width="${R(58)}" height="${R(76)}" rx="${R(5)}" fill="#0d5bba" opacity="0.4"/>

  <!-- Document body -->
  <rect x="${R(25)}" y="${R(18)}" width="${R(58)}" height="${R(76)}" rx="${R(5)}" fill="white"/>

  <!-- Folded corner -->
  <polygon points="${R(70)},${R(18)} ${R(83)},${R(18)} ${R(83)},${R(31)} ${R(70)},${R(31)}" fill="#e8f0fe"/>
  <polyline points="${R(70)},${R(18)} ${R(70)},${R(31)} ${R(83)},${R(31)}"
            fill="none" stroke="#c5d8f7" stroke-width="${R(1.5)}"/>

  <!-- Text lines on document -->
  <rect x="${R(33)}" y="${R(42)}" width="${R(36)}" height="${R(3.5)}" rx="${R(1.75)}" fill="#c5d8f7"/>
  <rect x="${R(33)}" y="${R(50)}" width="${R(28)}" height="${R(3.5)}" rx="${R(1.75)}" fill="#c5d8f7"/>
  <rect x="${R(33)}" y="${R(58)}" width="${R(32)}" height="${R(3.5)}" rx="${R(1.75)}" fill="#dde8f7"/>
  <rect x="${R(33)}" y="${R(66)}" width="${R(20)}" height="${R(3.5)}" rx="${R(1.75)}" fill="#eaf0fb"/>

  <!-- Green export badge -->
  <circle cx="${R(93)}" cy="${R(93)}" r="${R(24)}" fill="#34a853"/>

  <!-- Download arrow icon (white) -->
  <path d="M${R(93)} ${R(79)} L${R(93)} ${R(97)}"
        stroke="white" stroke-width="${R(3.5)}" stroke-linecap="round"/>
  <path d="M${R(83.5)} ${R(90)} L${R(93)} ${R(99.5)} L${R(102.5)} ${R(90)}"
        fill="none" stroke="white" stroke-width="${R(3.5)}"
        stroke-linecap="round" stroke-linejoin="round"/>
  <line x1="${R(81)}" y1="${R(106)}" x2="${R(105)}" y2="${R(106)}"
        stroke="white" stroke-width="${R(3)}" stroke-linecap="round"/>
</svg>`;
}

/**
 * Medium icon (32): document + small green dot (no badge detail).
 */
function svgMedium(size) {
  const s = size / 32;
  const R = (v) => Math.round(v * s * 10) / 10;

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" rx="${R(5)}" fill="#1a73e8"/>
  <rect x="${R(7)}" y="${R(4)}" width="${R(14)}" height="${R(19)}" rx="${R(1.5)}" fill="#0d5bba" opacity="0.4"/>
  <rect x="${R(6)}" y="${R(3)}" width="${R(14)}" height="${R(19)}" rx="${R(1.5)}" fill="white"/>
  <!-- Fold corner -->
  <polygon points="${R(16.5)},${R(3)} ${R(20)},${R(3)} ${R(20)},${R(6.5)} ${R(16.5)},${R(6.5)}" fill="#e8f0fe"/>
  <!-- Lines -->
  <rect x="${R(8)}" y="${R(10)}" width="${R(9)}" height="${R(1)}" rx="${R(0.5)}" fill="#c5d8f7"/>
  <rect x="${R(8)}" y="${R(13)}" width="${R(7)}" height="${R(1)}" rx="${R(0.5)}" fill="#c5d8f7"/>
  <rect x="${R(8)}" y="${R(16)}" width="${R(8)}" height="${R(1)}" rx="${R(0.5)}" fill="#dde8f7"/>
  <!-- Green circle badge -->
  <circle cx="${R(24)}" cy="${R(24)}" r="${R(6)}" fill="#34a853"/>
  <path d="M${R(24)} ${R(20.5)} L${R(24)} ${R(26)}"
        stroke="white" stroke-width="${R(1.5)}" stroke-linecap="round"/>
  <path d="M${R(21.5)} ${R(24)} L${R(24)} ${R(27)} L${R(26.5)} ${R(24)}"
        fill="none" stroke="white" stroke-width="${R(1.5)}"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

/**
 * Small icon (16): just the document outline on blue, no text or badge.
 */
function svgSmall(size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
  <rect width="16" height="16" rx="2.5" fill="#1a73e8"/>
  <rect x="3" y="2" width="8" height="11" rx="1" fill="#0d5bba" opacity="0.4"/>
  <rect x="2.5" y="1.5" width="8" height="11" rx="1" fill="white"/>
  <!-- fold corner -->
  <polygon points="8,1.5 10.5,1.5 10.5,4 8,4" fill="#e8f0fe"/>
  <!-- lines -->
  <rect x="4" y="6"  width="5" height="1" rx="0.5" fill="#c5d8f7"/>
  <rect x="4" y="8"  width="4" height="1" rx="0.5" fill="#c5d8f7"/>
  <rect x="4" y="10" width="4.5" height="1" rx="0.5" fill="#dde8f7"/>
  <!-- green dot -->
  <circle cx="12.5" cy="12.5" r="3" fill="#34a853"/>
  <path d="M12.5 10.5 L12.5 13.5" stroke="white" stroke-width="1.2" stroke-linecap="round"/>
  <path d="M11 12.5 L12.5 14 L14 12.5" fill="none" stroke="white" stroke-width="1.2"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

// ── Generation ─────────────────────────────────────────────────────────────

const ICONS = [
  { size: 16,  svg: svgSmall },
  { size: 32,  svg: svgMedium },
  { size: 48,  svg: svgFull },
  { size: 128, svg: svgFull },
];

async function main() {
  for (const { size, svg } of ICONS) {
    const svgStr = svg(size);
    const outPath = path.join(OUT_DIR, `icon${size}.png`);

    await sharp(Buffer.from(svgStr))
      .resize(size, size)
      .png({ compressionLevel: 9 })
      .toFile(outPath);

    console.log(`✓  icon${size}.png  →  ${outPath}`);
  }
  console.log('\nAll icons generated successfully.');
}

main().catch((err) => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});
