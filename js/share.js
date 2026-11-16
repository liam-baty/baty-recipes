// Sharing: uses the iPhone share sheet (Web Share API) when available,
// otherwise offers Copy and Email buttons.

import { esc, toast, dialog } from './util.js';
import { scaleLine } from './ingredients.js';

/** Plain-text version of a recipe at a given scale. */
export function recipeText(r, k = 1) {
  const out = [r.title.toUpperCase()];
  const meta = [r.group, r.source].filter(Boolean).join(' · ');
  if (meta) out.push(meta);
  if (r.yield) out.push(`Serves/makes: ${r.yield}${k !== 1 ? ` (scaled ×${fmtK(k)})` : ''}`);
  if (r.time) out.push(`Time: ${r.time}`);
  if (r.introNotes?.length) out.push('', ...r.introNotes);
  out.push('', `INGREDIENTS${k !== 1 ? ` (×${fmtK(k)})` : ''}`);
  for (const g of r.ingredients) {
    if (g.heading) out.push('', `${g.heading}:`);
    for (const line of g.items) {
      const s = scaleLine(line, k);
      out.push(`• ${s.text}${s.note ? ` [${s.note}]` : ''}`);
    }
  }
  out.push('', 'METHOD');
  let n = 0, section = null;
  for (const st of r.steps) {
    if (st.section && st.section !== section) { section = st.section; out.push('', `${section}:`); }
    out.push(`${++n}. ${st.text}`);
  }
  if (r.tables?.length) {
    for (const t of r.tables) {
      out.push('', t.title.toUpperCase(), t.columns.join(' | '));
      for (const row of t.rows) out.push(row.join(' | '));
    }
  }
  if (r.notes?.length) out.push('', 'NOTES', ...r.notes.map((x) => `• ${x}`));
  out.push('', `From Baty Recipes: ${location.href.split('#')[0]}#/recipe/${r.id}`);
  return out.join('\n');
}

export function fmtK(k) {
  return ({ 0.5: '½', 0.25: '¼', 0.75: '¾', 1.5: '1½' })[k] || String(+k.toFixed(2));
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied');
    return true;
  } catch {
    // Older fallback
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
    toast(ok ? 'Copied' : 'Could not copy — select the text and copy it by hand');
    return ok;
  }
}

/**
 * Share text via the share sheet; if that isn't available (or fails), show a
 * small sheet with Copy and Email options and the text itself.
 */
export async function shareText(title, text) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return; // you closed the share sheet
    }
  }
  const mailto = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}`;
  const choice = await dialog(`
    <h2>${esc(title)}</h2>
    <textarea class="share-text" readonly rows="10">${esc(text)}</textarea>
    <div class="row gap">
      <button class="btn primary" value="copy" autofocus>Copy</button>
      <a class="btn" href="${esc(mailto)}">Email</a>
      <button class="btn ghost" value="">Close</button>
    </div>`);
  if (choice === 'copy') copyText(text);
}
