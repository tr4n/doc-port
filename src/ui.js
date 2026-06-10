/**
 * UI helpers and preview rendering logic for the extension popup.
 */

export function setStatus(message, type = 'idle') {
  const box = document.getElementById('statusBox');
  const text = document.getElementById('statusText');
  const iconEl = box.querySelector('.status-icon');

  box.className = `status-box ${type}`;

  const icons = {
    idle: '📄',
    loading: '<div class="spinner"></div>',
    success: '✅',
    error: '❌',
  };

  iconEl.innerHTML = icons[type];
  text.textContent = message;
}

export function setStep(active) {
  for (let i = 1; i <= 4; i++) {
    const stepEl = document.getElementById(`step${i}`);
    const bubble = stepEl.querySelector('.step-bubble');
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
    document.getElementById(`conn${i}`).classList.toggle('done', i < active);
  }
}

export function resetSteps() {
  for (let i = 1; i <= 4; i++) {
    const stepEl = document.getElementById(`step${i}`);
    const bubble = stepEl.querySelector('.step-bubble');
    stepEl.classList.remove('active', 'done');
    bubble.textContent = String(i);
  }
  for (let i = 1; i <= 3; i++) {
    document.getElementById(`conn${i}`).classList.remove('done');
  }
}

export function setExportButtonEnabled(enabled) {
  const btn = document.getElementById('exportBtn');
  if (btn) btn.disabled = !enabled;
}

export function showPreviewSection(parsed) {
  const section = document.getElementById('previewSection');
  const titleEl = document.getElementById('previewTitle');
  const statsEl = document.getElementById('previewStats');
  const contentEl = document.getElementById('previewContent');

  titleEl.textContent = parsed.title;

  // Compute stats
  const counts = { heading: 0, paragraph: 0, listItem: 0, table: 0, image: 0 };
  parsed.elements.forEach((el) => { counts[el.type] = (counts[el.type] ?? 0) + 1; });

  const statParts = [];
  if (counts.heading)   statParts.push(`${counts.heading} heading(s)`);
  if (counts.paragraph) statParts.push(`${counts.paragraph} paragraph(s)`);
  if (counts.listItem)  statParts.push(`${counts.listItem} list item(s)`);
  if (counts.table)     statParts.push(`${counts.table} table(s)`);
  if (counts.image)     statParts.push(`${counts.image} image(s)`);
  statsEl.textContent = statParts.join(' · ') || 'No content found';

  contentEl.innerHTML = generatePreviewHtml(parsed);
  section.style.display = 'block';
}

export function hidePreviewSection() {
  document.getElementById('previewSection').style.display = 'none';
}

// ──────────────────────────────────────────────
// Preview HTML generator
// (generates sanitised HTML from the parsed tree)
// ──────────────────────────────────────────────

export function esc(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderRunsHtml(runs) {
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

export function generatePreviewHtml(parsed) {
  const parts = [];
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
