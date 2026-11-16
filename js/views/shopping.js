// Shopping list: merged by ingredient, sorted into supermarket sections,
// pantry staples greyed out (or hidden), tick off, add your own, share.

import * as store from '../storage.js';
import * as shop from '../shoplist.js';
import { esc, toast, dialog } from '../util.js';
import { SECTIONS } from '../ingredients.js';
import { shareText, copyText } from '../share.js';
import * as reminders from '../reminders.js';

export const name = 'shopping';

export function render(el) {
  let showSources = false;

  function draw() {
    const { sections, staples, count } = shop.build();
    const mode = store.get('settings').staples;
    const ticked = store.get('shopping').filter((i) => i.checked).length;

    el.innerHTML = `
      <header class="top"><div class="top-row"><h1>Shopping list</h1></div>
        <form id="add-form" class="row gap">
          <input type="text" name="item" placeholder="Add an item, e.g. 2 L milk" aria-label="Add an item" enterkeyhint="done" autocomplete="off">
          <button class="btn primary">Add</button>
        </form>
      </header>

      ${count ? `
      <div class="toolbar pad-x">
        ${reminders.enabled() ? '<button class="btn primary" data-act="reminders">☑︎ Send to shared Reminders</button>' : ''}
        <button class="btn" data-act="share">⤴︎ Send list</button>
        <button class="btn" data-act="copy">Copy list</button>
        <button class="btn ghost" data-act="sources" aria-pressed="${showSources}">${showSources ? 'Hide' : 'Show'} recipes</button>
      </div>` : ''}

      ${!count ? `<div class="empty pad">
        <p><strong>Your list is empty.</strong></p>
        <p>Open a recipe and tap “Add all to shopping list”, or add a whole week from the Meal plan.</p>
      </div>` : ''}

      ${sections.map((s) => `
        <section class="shop-section pad-x" aria-labelledby="s-${s.section}">
          <h2 id="s-${s.section}">${esc(s.label)}</h2>
          <ul class="shop-list">${s.rows.map((row) => rowHtml(row, showSources)).join('')}</ul>
        </section>`).join('')}

      ${staples.length && mode !== 'hide' ? `
        <section class="shop-section staples pad-x">
          <h2>Pantry staples <span class="muted small">— you usually have these</span></h2>
          <ul class="shop-list">${staples.map((row) => rowHtml(row, showSources)).join('')}</ul>
        </section>` : ''}
      ${staples.length && mode === 'hide' ? `<p class="pad-x muted small">${staples.length} pantry staple${staples.length > 1 ? 's' : ''} hidden (change in Settings).</p>` : ''}

      ${count && !reminders.enabled() ? `<p class="pad-x muted small">Shopping together? You can send this list to a shared Reminders list that syncs between phones —
        <a href="#/settings">set it up in Settings</a>.</p>` : ''}

      ${count ? `
      <div class="toolbar pad-x end">
        <button class="btn" data-act="clear-ticked" ${ticked ? '' : 'disabled'}>Clear ticked (${ticked})</button>
        <button class="btn danger" data-act="clear-all">Clear all</button>
      </div>` : ''}`;

    el.querySelector('#add-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = e.target.item;
      const parts = input.value.split(/\n/).map((x) => x.trim()).filter(Boolean);
      parts.forEach(shop.addCustom);
      input.value = '';
      draw();
      el.querySelector('#add-form input').focus();
    });
  }

  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    const key = b.dataset.key;

    if (act === 'tick') {
      const row = shop.build();
      const all = [...row.sections.flatMap((s) => s.rows), ...row.staples].find((r) => r.key === key);
      const value = !all.checked;
      const uids = new Set(all.members.map((m) => m.uid));
      store.update('shopping', (list) => { list.forEach((i) => { if (uids.has(i.uid)) i.checked = value; }); });
    } else if (act === 'remove') {
      const before = store.get('shopping');
      const row = findRow(key);
      shop.removeUids(row.members.map((m) => m.uid));
      toast('Removed', { actionLabel: 'Undo', onAction: () => { store.set('shopping', before); draw(); } });
    } else if (act === 'move') {
      const choice = await dialog(`
        <h2>Move “${esc(key)}” to…</h2>
        <div class="stack">${SECTIONS.map(([k, label]) => `<button class="btn" value="${k}">${esc(label)}</button>`).join('')}</div>
        <button class="btn ghost" value="">Cancel</button>`);
      if (!choice) return;
      store.update('sectionOverrides', (o) => { o[key] = choice; });
      toast('Moved — the app will remember this');
    } else if (act === 'sources') {
      showSources = !showSources;
    } else if (act === 'reminders') {
      const lines = shop.pendingLines();
      if (!reminders.send(lines.map((l) => l.text))) return;
      // Offer to tick off what was sent, so it isn't sent twice
      const c = await dialog(`<h2>Sent ${lines.length} item${lines.length === 1 ? '' : 's'} to Reminders</h2>
        <p>Tick them off here so they aren't sent again? (Pantry staples and ticked items weren't sent.)</p>
        <div class="stack"><button class="btn primary" value="tick" autofocus>Tick them off here</button>
        <button class="btn ghost" value="">Keep them as they are</button></div>`);
      if (c === 'tick') {
        const uids = new Set(lines.flatMap((l) => l.uids));
        store.update('shopping', (list) => { list.forEach((i) => { if (uids.has(i.uid)) i.checked = true; }); });
      }
    } else if (act === 'share') {
      return shareText('Shopping list', shop.asText());
    } else if (act === 'copy') {
      return copyText(shop.asText());
    } else if (act === 'clear-ticked') {
      const before = store.get('shopping');
      store.set('shopping', before.filter((i) => !i.checked));
      toast('Cleared ticked items', { actionLabel: 'Undo', onAction: () => { store.set('shopping', before); draw(); } });
    } else if (act === 'clear-all') {
      const before = store.get('shopping');
      store.set('shopping', []);
      toast('Shopping list cleared', { actionLabel: 'Undo', onAction: () => { store.set('shopping', before); draw(); } });
    } else return;
    const y = window.scrollY;
    draw();
    window.scrollTo(0, y);
  });

  draw();
}

function findRow(key) {
  const b = shop.build();
  return [...b.sections.flatMap((s) => s.rows), ...b.staples].find((r) => r.key === key);
}

function rowHtml(row, showSources) {
  const sources = row.members.filter((m) => m.recipeTitle);
  const many = row.lines.length > 1;
  return `<li class="shop-row ${row.checked ? 'checked' : ''} ${row.staple ? 'staple' : ''}">
    <button class="tick" data-act="tick" data-key="${esc(row.key)}" role="checkbox" aria-checked="${row.checked}">
      <span class="box" aria-hidden="true">${row.checked ? '✓' : ''}</span>
      <span class="shop-text">
        ${row.lines.map((l) => `<span class="shop-line">${esc(l.text)}${many && l.members[0].recipeTitle ? ` <span class="from">— ${esc([...new Set(l.members.map((m) => m.recipeTitle).filter(Boolean))].join(', '))}</span>` : ''}</span>`).join('')}
        ${showSources && sources.length && !many ? `<span class="from">${sources.map((m) => `${esc(m.recipeTitle)}: ${esc(m.line)}${m.scale !== 1 ? ` (×${m.scale})` : ''}`).join('<br>')}</span>` : ''}
        ${showSources && many ? `<span class="from">${sources.map((m) => `${esc(m.recipeTitle)}: ${esc(m.line)}`).join('<br>')}</span>` : ''}
      </span>
    </button>
    <button class="icon-btn small" data-act="move" data-key="${esc(row.key)}" aria-label="Move to another section" title="Move section">⇄</button>
    <button class="icon-btn small" data-act="remove" data-key="${esc(row.key)}" aria-label="Remove">✕</button>
  </li>`;
}
