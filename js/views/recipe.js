// Recipe page: ingredients with serving scaler, method with timers, notes,
// favourite / rating / my notes / made-it log, shopping list, meal plan, share and print.

import * as data from '../data.js';
import * as store from '../storage.js';
import * as shop from '../shoplist.js';
import { esc, toast, dialog, dialogForm, isoDate, fromIso, fmtDate, uid, addDays } from '../util.js';
import { lineHtml } from '../ingredients.js';
import * as book from '../book.js';
import { withTimerButtons } from '../timers.js';
import { recipeText, shareText, fmtK } from '../share.js';
import { backLink } from './common.js';

export const name = 'recipe';

const SCALES = [0.5, 1, 2, 3];
export const LABELS = ['Breakfast', 'Lunch', 'Dinner', 'Baking', 'Snack', 'Other'];

export function render(el, { id }) {
  const r = data.get(id);
  if (!r) {
    el.innerHTML = `<div class="pad">${backLink()}<h1>Recipe not found</h1><p>It may have been renamed or removed.</p></div>`;
    return;
  }

  // Recently viewed
  store.update('recent', (list) => [id, ...list.filter((x) => x !== id)].slice(0, 12));

  let picking = false;     // "choose items" mode for the shopping list
  const picked = new Set();
  let editingAppliances = false;

  const scaleOf = () => store.get('scales')[id] ?? store.get('settings').defaultScale ?? 1;

  function draw() {
    const k = scaleOf();
    const favs = store.get('favs');
    const rating = store.get('ratings')[id] || 0;
    const myNote = store.get('notes')[id] || '';
    const made = store.get('made')[id] || [];
    const linker = (text) => data.linkify(text, r);
    const label = (n) => `Step ${n} · ${r.title}`;
    let lineNo = 0;

    el.innerHTML = `
    <article class="recipe">
      <div class="pad-x no-print">${backLink()}</div>
      <header class="recipe-head pad-x">
        <p class="eyebrow">${esc(r.part)} › ${esc(r.group)}</p>
        <h1>${esc(r.title)}</h1>
        ${r.needsCheck ? '<p><span class="tag warn">Check against the book</span></p>' : ''}
        ${r.custom ? '<p><span class="tag">My recipe</span></p>' : r.edited ? '<p><span class="tag">Edited on this phone</span></p>' : ''}
        ${r.source ? `<p class="source">${esc(r.source)}</p>` : ''}
        ${r.yield || r.time ? `<p class="yield">${r.yield ? `<span>🍽 ${esc(r.yield)}</span>` : ''}${r.time ? ` <span>⏲ ${esc(r.time)}</span>` : ''}</p>` : ''}
      </header>

      ${bookCard(r)}

      <div class="actions no-print" role="toolbar" aria-label="Recipe actions">
        <button class="act ${favs[id] ? 'on' : ''}" data-act="fav" aria-pressed="${!!favs[id]}"><span aria-hidden="true">${favs[id] ? '♥' : '♡'}</span>Favourite</button>
        ${r.steps.length ? `<a class="act" href="#/cook/${esc(id)}"><span aria-hidden="true">👩‍🍳</span>Cook mode</a>` : ''}
        <button class="act" data-act="plan"><span aria-hidden="true">📅</span>Meal plan</button>
        <button class="act" data-act="share"><span aria-hidden="true">⤴︎</span>Share</button>
        <button class="act" data-act="print"><span aria-hidden="true">🖨</span>Print</button>
        <a class="act" href="#/edit/${esc(id)}"><span aria-hidden="true">✎</span>Edit</a>
      </div>

      <div class="pad-x no-print">
        <div class="stars" role="group" aria-label="My rating">
          ${[1, 2, 3, 4, 5].map((n) => `<button data-act="rate" data-val="${n}" aria-label="${n} star${n > 1 ? 's' : ''}" aria-pressed="${rating >= n}">${rating >= n ? '★' : '☆'}</button>`).join('')}
        </div>
        <div class="appliances">
          ${editingAppliances
            ? data.APPLIANCES.map((a) => `<button class="chip" data-act="appl" data-val="${a}" aria-pressed="${(r.appliances || []).includes(a)}">${esc(a)}</button>`).join('') +
              '<button class="chip" data-act="appl-done">Done</button>'
            : (r.appliances || []).map((a) => `<span class="tag">${esc(a)}</span>`).join('') +
              `<button class="linkish small" data-act="appl-edit">${(r.appliances || []).length ? 'Fix appliances' : 'Add appliances'}</button>`}
        </div>
      </div>

      ${r.introNotes?.length ? `<section class="intro pad-x">${r.introNotes.map((n) => `<p>${linker(n)}</p>`).join('')}</section>` : ''}

      ${r.ingredients.length ? `<section class="ingredients pad-x" aria-labelledby="ing-h">
        <div class="section-head">
          <h2 id="ing-h">Ingredients</h2>
          <div class="scaler no-print" role="group" aria-label="Serving scale">
            ${SCALES.map((s) => `<button data-act="scale" data-val="${s}" aria-pressed="${k === s}">×${fmtK(s)}</button>`).join('')}
            <button data-act="scale-custom" aria-pressed="${!SCALES.includes(k)}">${SCALES.includes(k) ? 'Other' : '×' + fmtK(k)}</button>
          </div>
        </div>
        ${k !== 1 ? `<p class="muted small scale-note">Scaled ×${fmtK(k)}. Lines marked <span class="unscaled-mark">◦</span> couldn't be scaled — adjust those by eye.</p>` : ''}
        ${r.ingredients.map((g) => `
          ${g.heading ? `<h3>${linker(g.heading)}</h3>` : ''}
          <ul class="ing-list">
            ${g.items.map((line) => {
              const n = lineNo++;
              const l = lineHtml(line, k, linker);
              const unscaled = k !== 1 && !l.scaled;
              return `<li class="${unscaled ? 'unscaled' : ''}">
                ${picking ? `<label class="pick"><input type="checkbox" data-pick="${n}" ${picked.has(n) ? 'checked' : ''}><span>${l.html}</span></label>` : l.html}
              </li>`;
            }).join('')}
          </ul>`).join('')}
        <div class="row gap no-print">
          ${picking
            ? `<button class="btn primary" data-act="add-picked">Add ${picked.size} ticked</button>
               <button class="btn ghost" data-act="pick-all">Tick all</button>
               <button class="btn ghost" data-act="pick-cancel">Cancel</button>`
            : `<button class="btn primary" data-act="add-all">🛒 Add all to shopping list</button>
               <button class="btn" data-act="pick">Choose items</button>`}
        </div>
      </section>` : ''}

      ${(r.tables || []).map((t) => `
        <section class="pad-x table-wrap">
          <h3>${esc(t.title)}</h3>
          <div class="scroll-x"><table>
            <thead><tr>${t.columns.map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead>
            <tbody>${t.rows.map((row) => `<tr>${row.map((c, i) => i === 0 ? `<th scope="row">${esc(c)}</th>` : `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
          </table></div>
        </section>`).join('')}

      ${r.steps.length ? `<section class="method pad-x" aria-labelledby="m-h">
        <h2 id="m-h">Method</h2>
        ${methodHtml(r, linker, label)}
      </section>` : ''}

      ${r.notes?.length ? `<section class="notes pad-x"><h2>Notes</h2>${r.notes.map((n) => `<p>${linker(n)}</p>`).join('')}</section>` : ''}

      ${r.related?.length ? `<section class="pad-x related"><h2>Linked recipes</h2><ul class="list">
        ${r.related.map(data.get).filter(Boolean).map((x) => `<li><a class="recipe-row" href="#/recipe/${esc(x.id)}"><span class="rr-title">${esc(x.title)}</span></a></li>`).join('')}
      </ul></section>` : ''}

      <section class="pad-x my-notes no-print">
        <h2><label for="my-note">My notes</label></h2>
        <textarea id="my-note" rows="3" placeholder="Tweaks, who liked it, what to try next time…">${esc(myNote)}</textarea>
        <p class="muted small" id="note-saved" aria-live="polite"></p>
      </section>

      <section class="pad-x made no-print">
        <div class="section-head"><h2>Made it</h2><button class="btn" data-act="made">✓ I made it today</button></div>
        ${made.length ? `<ul class="made-list">${[...made].sort().reverse().map((d) =>
          `<li>${esc(fmtDate(fromIso(d), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }))}
            <button class="icon-btn small" data-act="unmade" data-val="${d}" aria-label="Remove ${d}">✕</button></li>`).join('')}</ul>`
          : '<p class="muted">Not logged yet.</p>'}
      </section>

      ${myNote ? `<section class="print-only pad-x"><h2>My notes</h2><p>${esc(myNote)}</p></section>` : ''}
    </article>`;
  }

  draw();

  // ---------- events ----------
  el.addEventListener('change', (e) => {
    const p = e.target.closest('[data-pick]');
    if (p) {
      const n = Number(p.dataset.pick);
      if (p.checked) picked.add(n); else picked.delete(n);
      el.querySelector('[data-act="add-picked"]').textContent = `Add ${picked.size} ticked`;
    }
  });

  let noteTimer;
  el.addEventListener('input', (e) => {
    if (e.target.id !== 'my-note') return;
    clearTimeout(noteTimer);
    const value = e.target.value;
    noteTimer = setTimeout(() => {
      store.update('notes', (n) => { if (value.trim()) n[id] = value; else delete n[id]; });
      const s = el.querySelector('#note-saved'); if (s) s.textContent = 'Saved';
    }, 400);
  });

  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    const k = scaleOf();
    const lines = shop.allLines(r);

    switch (act) {
      case 'fav':
        store.update('favs', (f) => { if (f[id]) delete f[id]; else f[id] = true; });
        break;
      case 'rate': {
        const n = Number(b.dataset.val);
        store.update('ratings', (x) => { if (x[id] === n) delete x[id]; else x[id] = n; });
        break;
      }
      case 'scale':
        store.update('scales', (s) => { s[id] = Number(b.dataset.val); });
        break;
      case 'scale-custom': {
        const { value: v, fields } = await dialogForm(`
          <h2>Custom scale</h2>
          <label class="field">Multiply quantities by
            <input type="text" inputmode="decimal" name="k" value="${fmtNum(k)}" autofocus>
          </label>
          <p class="muted small">For example 1.5, or 0.25 for a quarter.</p>
          <div class="row gap"><button class="btn primary" value="ok">Apply</button><button class="btn ghost" value="">Cancel</button></div>`);
        if (v === 'ok') {
          const n = Number(String(fields.k).replace(',', '.'));
          if (n > 0 && n <= 50) store.update('scales', (s) => { s[id] = Math.round(n * 100) / 100; });
          else toast('Enter a number such as 1.5');
        }
        break;
      }
      case 'add-all': {
        const added = shop.addFromRecipe(r, lines, k);
        toast(`Added ${added.length} items to your shopping list`, { actionLabel: 'Undo', onAction: () => shop.removeUids(added) });
        return;
      }
      case 'pick': picking = true; picked.clear(); break;
      case 'pick-all': lines.forEach((_, i) => picked.add(i)); break;
      case 'pick-cancel': picking = false; break;
      case 'add-picked': {
        if (!picked.size) { toast('Tick the items you need first'); return; }
        const added = shop.addFromRecipe(r, [...picked].sort((a, b) => a - b).map((i) => lines[i]), k);
        picking = false;
        toast(`Added ${added.length} items`, { actionLabel: 'Undo', onAction: () => shop.removeUids(added) });
        break;
      }
      case 'send-book': await book.send(r); break;
      case 'remove-copy': {
        const target = data.bookRecipe(r.sentAs);
        const c = await dialog(`<h2>Remove your phone copy?</h2>
          <p>“${esc(target.title)}” is now in the family book. Your favourite, rating, notes, made-it dates and meal plans
          for this recipe will move across to the book version.</p>
          <div class="stack"><button class="btn primary" value="yes" autofocus>Remove my copy</button>
          <button class="btn ghost" value="">Keep both</button></div>`);
        if (c !== 'yes') return;
        moveSavedData(r.id, target.id);
        store.update('custom', (cu) => { delete cu[r.id]; });
        toast('Done — showing the book version');
        location.hash = `#/recipe/${target.id}`;
        return;
      }
      case 'plan': await addToPlan(r, k); return;
      case 'share': await shareText(r.title, recipeText(r, k)); return;
      case 'print': window.print(); return;
      case 'made':
        store.update('made', (m) => { m[id] = [...new Set([...(m[id] || []), isoDate()])]; });
        toast('Logged for today');
        break;
      case 'unmade':
        store.update('made', (m) => { m[id] = (m[id] || []).filter((d) => d !== b.dataset.val); if (!m[id].length) delete m[id]; });
        break;
      case 'appl-edit': editingAppliances = true; break;
      case 'appl-done': editingAppliances = false; break;
      case 'appl': {
        const a = b.dataset.val;
        const now = new Set(r.appliances || []);
        if (now.has(a)) now.delete(a); else now.add(a);
        r.appliances = data.APPLIANCES.filter((x) => now.has(x));
        saveAppliances(r);
        break;
      }
      default: return;
    }
    const y = window.scrollY;
    draw();
    window.scrollTo(0, y);
  });
}

function fmtNum(k) { return String(+k.toFixed(2)); }

/** The "only on this phone" card for recipes you added or edited. */
function bookCard(r) {
  if (!r.custom && !r.edited) return '';
  const inBook = r.custom && r.sentAs && data.bookRecipe(r.sentAs);
  if (inBook) {
    return `<div class="book-card pad-x no-print"><div class="tip inline ok">
      <p><strong>✓ This recipe is now in the family book.</strong> You can remove your phone copy.</p>
      <div class="row gap wrap"><button class="btn primary small" data-act="remove-copy">Remove my copy</button>
      <a class="btn small" href="#/recipe/${esc(r.sentAs)}">See book version</a></div></div></div>`;
  }
  return `<div class="book-card pad-x no-print"><div class="tip inline">
    <p><strong>${r.custom ? 'This recipe is only on this phone.' : 'Your changes are only on this phone.'}</strong>
    ${r.sentAs ? 'Sent to the book — it will show here once it has been added.' : 'Send it to the family book so everyone gets it.'}</p>
    <button class="btn small" data-act="send-book">📖 ${r.sentAs ? 'Send again' : 'Send to the book'}</button></div></div>`;
}

/** Move favourites, ratings, notes, made-it dates, scale and plans from one recipe id to another. */
function moveSavedData(from, to) {
  for (const key of ['favs', 'ratings', 'notes', 'made', 'scales']) {
    store.update(key, (m) => {
      if (!(from in m)) return;
      if (key === 'made') m[to] = [...new Set([...(m[to] || []), ...m[from]])];
      else if (key === 'notes' && m[to]) m[to] = `${m[to]}\n\n${m[from]}`;
      else if (!(to in m)) m[to] = m[from];
      delete m[from];
    });
  }
  store.update('recent', (list) => [...new Set(list.map((x) => (x === from ? to : x)))]);
  store.update('plan', (p) => { Object.values(p).forEach((day) => day.forEach((e) => { if (e.recipeId === from) e.recipeId = to; })); });
}

/** Appliance fixes are saved as an edit on this phone. */
function saveAppliances(r) {
  if (r.custom) {
    store.update('custom', (c) => { if (c[r.id]) c[r.id].appliances = r.appliances; });
  } else {
    store.update('edits', (e) => { e[r.id] = { ...(e[r.id] || {}), appliances: r.appliances }; });
  }
}

/** Method steps, numbered, with section headings and timer buttons. */
export function methodHtml(r, linker, label) {
  let html = '', section = null, open = false, n = 0;
  for (const st of r.steps) {
    if (st.section !== section) {
      if (open) html += '</ol>';
      section = st.section;
      if (section) html += `<h3>${esc(section)}</h3>`;
      html += `<ol class="steps" start="${n + 1}">`;
      open = true;
    }
    n++;
    html += `<li>${withTimerButtons(st.text, label(n), linker)}</li>`;
  }
  if (open) html += '</ol>';
  return html;
}

/** Ask which day (and meal) to plan this recipe for. */
export async function addToPlan(r, k) {
  const today = new Date();
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const { value: choice, fields } = await dialogForm(`
    <h2>Add to meal plan</h2>
    <p class="muted">${esc(r.title)}${k !== 1 ? ` · ×${fmtK(k)}` : ''}</p>
    <label class="field">Meal
      <select name="label" id="plan-label">${LABELS.map((l) => `<option ${l === defaultLabel(r) ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </label>
    <div class="day-grid">
      ${days.map((d, i) => `<button class="btn day-btn" value="${isoDate(d)}">${i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : esc(fmtDate(d))}</button>`).join('')}
    </div>
    <div class="row gap"><button class="btn ghost" value="">Cancel</button></div>`);
  if (!choice) return;
  const labelSel = fields.label || defaultLabel(r);
  store.update('plan', (p) => {
    p[choice] = p[choice] || [];
    p[choice].push({ uid: uid(), recipeId: r.id, label: labelSel, scale: k });
  });
  toast(`Planned for ${fmtDate(fromIso(choice))}`, { actionLabel: 'View', onAction: () => { location.hash = '#/plan/' + choice; } });
}

export function defaultLabel(r) {
  if (/Baking|Desserts|Breads/.test(r.part)) return 'Baking';
  if (/Breakfast/.test(r.group)) return 'Breakfast';
  return 'Dinner';
}
