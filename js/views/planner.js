// Meal planner: Monday–Sunday, several labelled recipes per day,
// move between weeks, copy last week, add the week to the shopping list, share.

import * as data from '../data.js';
import * as store from '../storage.js';
import * as shop from '../shoplist.js';
import { esc, toast, dialog, dialogForm, isoDate, fromIso, addDays, weekStart, fmtDate, uid, norm } from '../util.js';
import { shareText, fmtK } from '../share.js';
import { LABELS, defaultLabel } from './recipe.js';

export const name = 'plan';

export function render(el, { id }) {
  let start = weekStart(id ? fromIso(id) : new Date());

  function days() { return Array.from({ length: 7 }, (_, i) => addDays(start, i)); }

  function draw() {
    const plan = store.get('plan');
    const today = isoDate();
    const end = addDays(start, 6);
    const thisWeek = isoDate(weekStart()) === isoDate(start);
    const entries = days().flatMap((d) => plan[isoDate(d)] || []);

    el.innerHTML = `
      <header class="top"><div class="top-row"><h1>Meal plan</h1></div>
        <div class="week-nav">
          <button class="icon-btn" data-act="prev" aria-label="Previous week">‹</button>
          <div class="week-label">
            <strong>${esc(fmtDate(start, { day: 'numeric', month: 'short' }))} – ${esc(fmtDate(end, { day: 'numeric', month: 'short', year: 'numeric' }))}</strong>
            ${thisWeek ? '<span class="muted small">This week</span>' : '<button class="linkish small" data-act="today">Go to this week</button>'}
          </div>
          <button class="icon-btn" data-act="next" aria-label="Next week">›</button>
        </div>
      </header>

      <div class="toolbar pad-x">
        <button class="btn primary" data-act="to-shop" ${entries.length ? '' : 'disabled'}>🛒 Add week to shopping list</button>
        <button class="btn" data-act="share" ${entries.length ? '' : 'disabled'}>⤴︎ Share week</button>
        <button class="btn ghost" data-act="copy-last">Copy last week</button>
      </div>

      <ol class="week">
        ${days().map((d) => {
          const key = isoDate(d);
          const list = plan[key] || [];
          return `<li class="day ${key === today ? 'today' : ''}">
            <div class="day-head">
              <h2>${esc(fmtDate(d, { weekday: 'long' }))} <span class="muted">${esc(fmtDate(d, { day: 'numeric', month: 'short' }))}</span></h2>
              <button class="btn small" data-act="add" data-day="${key}" aria-label="Add a recipe to ${esc(fmtDate(d, { weekday: 'long' }))}">＋ Add</button>
            </div>
            ${list.length ? `<ul class="day-list">${list.map((e) => entryHtml(key, e)).join('')}</ul>` : ''}
          </li>`;
        }).join('')}
      </ol>`;
  }

  function entryHtml(day, e) {
    const r = data.get(e.recipeId);
    return `<li class="plan-entry">
      <button class="label-btn" data-act="label" data-day="${day}" data-uid="${e.uid}" aria-label="Change meal label">${esc(e.label || 'Dinner')}</button>
      ${r ? `<a href="#/recipe/${esc(r.id)}" class="plan-title">${esc(r.title)}</a>` : '<span class="plan-title muted">(recipe removed)</span>'}
      <button class="scale-btn" data-act="scale" data-day="${day}" data-uid="${e.uid}" aria-label="Serving scale ×${fmtK(e.scale || 1)}, tap to change">×${fmtK(e.scale || 1)}</button>
      <button class="icon-btn small" data-act="remove" data-day="${day}" data-uid="${e.uid}" aria-label="Remove">✕</button>
    </li>`;
  }

  el.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-act]');
    if (!b) return;
    const { act, day, uid: entryId } = b.dataset;

    if (act === 'prev') start = addDays(start, -7);
    else if (act === 'next') start = addDays(start, 7);
    else if (act === 'today') start = weekStart();
    else if (act === 'add') {
      const picked = await pickRecipe();
      if (!picked) return;
      const r = data.get(picked.id);
      const scale = store.get('scales')[r.id] ?? store.get('settings').defaultScale ?? 1;
      store.update('plan', (p) => { (p[day] ||= []).push({ uid: uid(), recipeId: r.id, label: picked.label || defaultLabel(r), scale }); });
    } else if (act === 'remove') {
      const before = store.get('plan');
      store.update('plan', (p) => { p[day] = (p[day] || []).filter((x) => x.uid !== entryId); if (!p[day].length) delete p[day]; });
      toast('Removed', { actionLabel: 'Undo', onAction: () => { store.set('plan', before); draw(); } });
    } else if (act === 'label') {
      const choice = await dialog(`<h2>Meal</h2><div class="stack">${LABELS.map((l) => `<button class="btn" value="${l}">${l}</button>`).join('')}</div><button class="btn ghost" value="">Cancel</button>`);
      if (!choice) return;
      store.update('plan', (p) => { const e = (p[day] || []).find((x) => x.uid === entryId); if (e) e.label = choice; });
    } else if (act === 'scale') {
      const choice = await dialog(`<h2>Serving scale</h2><div class="stack">${[0.5, 1, 1.5, 2, 3, 4].map((k) => `<button class="btn" value="${k}">×${fmtK(k)}</button>`).join('')}</div><button class="btn ghost" value="">Cancel</button>`);
      if (!choice) return;
      store.update('plan', (p) => { const e = (p[day] || []).find((x) => x.uid === entryId); if (e) e.scale = Number(choice); });
    } else if (act === 'copy-last') {
      const plan = store.get('plan');
      const last = days().map((d) => plan[isoDate(addDays(d, -7))] || []);
      if (!last.some((l) => l.length)) { toast('Nothing planned last week'); return; }
      const hasThis = days().some((d) => (plan[isoDate(d)] || []).length);
      if (hasThis) {
        const c = await dialog(`<h2>Copy last week?</h2><p>This week already has meals planned.</p>
          <div class="stack"><button class="btn primary" value="add">Add to this week</button>
          <button class="btn danger" value="replace">Replace this week</button>
          <button class="btn ghost" value="">Cancel</button></div>`);
        if (!c) return;
        if (c === 'replace') days().forEach((d) => { delete plan[isoDate(d)]; });
      }
      days().forEach((d, i) => {
        if (!last[i].length) return;
        const key = isoDate(d);
        plan[key] = [...(plan[key] || []), ...last[i].map((e) => ({ ...e, uid: uid() }))];
      });
      store.set('plan', plan);
      toast("Copied last week's plan");
    } else if (act === 'to-shop') {
      const plan = store.get('plan');
      let added = [];
      for (const d of days()) {
        for (const e of plan[isoDate(d)] || []) {
          const r = data.get(e.recipeId);
          if (r) added = added.concat(shop.addFromRecipe(r, shop.allLines(r), e.scale || 1));
        }
      }
      toast(`Added ${added.length} items (pantry staples are greyed out on the list)`, {
        actionLabel: 'Undo', onAction: () => shop.removeUids(added)
      });
      return;
    } else if (act === 'share') {
      return shareText('Meal plan', weekText());
    } else return;
    draw();
  });

  function weekText() {
    const plan = store.get('plan');
    const out = [`Meal plan: week of ${fmtDate(start, { day: 'numeric', month: 'long', year: 'numeric' })}`];
    for (const d of days()) {
      const list = plan[isoDate(d)] || [];
      out.push('', fmtDate(d, { weekday: 'long', day: 'numeric', month: 'short' }));
      if (!list.length) out.push('  —');
      for (const e of list) {
        const r = data.get(e.recipeId);
        out.push(`  ${e.label || 'Dinner'}: ${r ? r.title : '(removed)'}${e.scale && e.scale !== 1 ? ` (×${fmtK(e.scale)})` : ''}`);
      }
    }
    return out.join('\n');
  }

  draw();
}

/** A searchable list of recipes in a dialog. Resolves with { id, label } or null. */
function pickRecipe() {
  return new Promise((resolve) => {
    const favs = store.get('favs');
    const all = data.all();
    const sorted = [...all.filter((r) => favs[r.id]), ...all.filter((r) => !favs[r.id])];
    let chosen = null;
    const p = dialogForm(`
      <h2>Choose a recipe</h2>
      <label class="field">Meal
        <select name="label"><option value="">(automatic)</option>${LABELS.map((l) => `<option>${l}</option>`).join('')}</select>
      </label>
      <input type="search" class="pick-search" placeholder="Search…" aria-label="Search recipes" autocomplete="off">
      <ul class="pick-list">${sorted.map((r) => `<li data-hay="${esc(norm(r.title + ' ' + r.group))}">
        <button class="pick-item" value="${esc(r.id)}">${favs[r.id] ? '♥ ' : ''}${esc(r.title)}<span class="muted small">${esc(r.group)}</span></button></li>`).join('')}</ul>
      <button class="btn ghost" value="">Cancel</button>`, { className: 'tall' });
    const d = document.querySelector('dialog.sheet.tall');
    d.querySelector('.pick-search').addEventListener('input', (e) => {
      const q = norm(e.target.value).split(/\s+/).filter(Boolean);
      d.querySelectorAll('.pick-list li').forEach((li) => { li.hidden = !q.every((w) => li.dataset.hay.includes(w)); });
    });
    // Enter in the search box shouldn't pick the first recipe by accident
    d.querySelector('.pick-search').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
    p.then(({ value, fields }) => {
      chosen = value ? { id: value, label: fields.label } : null;
      resolve(chosen);
    });
  });
}
