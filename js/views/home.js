// Home page: search, filters, browse by part and group, "What can I make with…",
// "What's for dinner?" and recently viewed.

import * as data from '../data.js';
import * as store from '../storage.js';
import { esc, norm, debounce, isStandalone, dialog } from '../util.js';
import { recipeRow } from './common.js';

export const name = 'home';

// Remembered while the app is open, so going back to the list keeps your search.
const state = { q: '', group: '', appliance: '', favs: false, notes: false, terms: [] };

const COMMON = ['chicken', 'beef', 'pork', 'lamb', 'mince', 'sausage', 'bacon', 'prawn', 'egg', 'rice',
  'pasta', 'noodle', 'potato', 'zucchini', 'carrot', 'tomato', 'mushroom', 'cheese', 'banana', 'chocolate', 'lemon', 'coconut'];

export function render(el, params) {
  const makeMode = !!params.make;
  const settings = store.get('settings');
  const ui = store.get('ui');
  const showTip = !ui.tipDismissed;

  el.innerHTML = `
    <header class="top">
      <div class="top-row">
        <h1 class="brand"><img src="icons/icon.svg" alt="" width="34" height="34"> Baty Recipes</h1>
        <a class="icon-btn" href="#/new" aria-label="Add a recipe" title="Add a recipe">＋</a>
      </div>
      <label class="search">
        <span class="sr-only">Search recipes</span>
        <input type="search" id="q" placeholder="Search titles, ingredients, notes…" value="${esc(state.q)}"
          autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="search">
      </label>
    </header>

    ${showTip ? `<div class="tip">
      <p><strong>Your favourites, notes and lists are saved on this phone only.</strong>
      ${isStandalone() ? 'The Home Screen app and Safari keep <em>separate</em> data, so use the app from here.' :
      'Safari and the Home Screen app keep <em>separate</em> data. Add to Home Screen first (Share → Add to Home Screen), then use the app.'}
      Back up from Settings.</p>
      <button class="icon-btn small" data-act="dismiss-tip" aria-label="Hide tip">✕</button>
    </div>` : ''}

    <div class="chips" role="group" aria-label="Filters">
      <button class="chip" data-act="favs" aria-pressed="${state.favs}">♥ Favourites</button>
      <button class="chip" data-act="notes" aria-pressed="${state.notes}">✎ Has my notes</button>
      <label class="chip select-chip ${state.group ? 'on' : ''}">
        <span class="sr-only">Group</span>
        <select id="group">
          <option value="">All groups</option>
          ${data.parts().map((p) => `<optgroup label="${esc(p.name)}">${p.groups.map((g) =>
            `<option ${g === state.group ? 'selected' : ''}>${esc(g)}</option>`).join('')}</optgroup>`).join('')}
        </select>
      </label>
      ${data.APPLIANCES.map((a) => `<button class="chip" data-act="appliance" data-val="${a}" aria-pressed="${state.appliance === a}">${esc(cap(a))}</button>`).join('')}
    </div>

    <div class="quick">
      <a class="btn ${makeMode ? 'primary' : ''}" href="${makeMode ? '#/' : '#/make'}">🥕 What can I make with…</a>
      <span class="dinner">
        <button class="btn" data-act="random">🎲 What's for dinner?</button>
        <label class="check small"><input type="checkbox" id="mains" ${settings.mainsOnly ? 'checked' : ''}> Mains only</label>
      </span>
    </div>

    ${makeMode ? makePanel() : ''}
    <div id="results"></div>`;

  const results = el.querySelector('#results');

  const draw = () => {
    results.innerHTML = makeMode ? makeResults() : listHtml();
  };

  // ---------- events ----------
  el.querySelector('#q').addEventListener('input', debounce((e) => { state.q = e.target.value; draw(); }, 150));
  el.querySelector('#group').addEventListener('change', (e) => {
    state.group = e.target.value;
    e.target.closest('.chip').classList.toggle('on', !!state.group);
    draw();
  });
  el.querySelector('#mains').addEventListener('change', (e) => {
    store.update('settings', (s) => { s.mainsOnly = e.target.checked; });
  });

  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'favs' || act === 'notes') {
      state[act] = !state[act];
      b.setAttribute('aria-pressed', state[act]);
    } else if (act === 'appliance') {
      state.appliance = state.appliance === b.dataset.val ? '' : b.dataset.val;
      el.querySelectorAll('[data-act="appliance"]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.val === state.appliance));
    } else if (act === 'dismiss-tip') {
      store.update('ui', (u) => { u.tipDismissed = true; });
      b.closest('.tip').remove();
      return;
    } else if (act === 'toggle-term') {
      const t = b.dataset.val;
      state.terms = state.terms.includes(t) ? state.terms.filter((x) => x !== t) : [...state.terms, t];
      b.setAttribute('aria-pressed', state.terms.includes(t));
      renderTerms(el);
    } else if (act === 'remove-term') {
      state.terms = state.terms.filter((x) => x !== b.dataset.val);
      el.querySelectorAll(`[data-act="toggle-term"][data-val="${CSS.escape(b.dataset.val)}"]`).forEach((x) => x.setAttribute('aria-pressed', 'false'));
      renderTerms(el);
    } else if (act === 'clear-filters') {
      Object.assign(state, { q: '', group: '', appliance: '', favs: false, notes: false });
      render(el, params);
      return;
    } else if (act === 'random') {
      return randomPick();
    } else return;
    draw();
  });

  // Remember which parts/groups are open
  el.addEventListener('toggle', (e) => {
    const d = e.target;
    if (!d.dataset?.key) return;
    store.update('ui', (u) => { u.open = u.open || {}; u.open[d.dataset.key] = d.open; });
  }, true);

  if (makeMode) {
    const form = el.querySelector('#make-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = form.querySelector('input');
      for (const t of input.value.split(/[,;]+/).map((x) => norm(x).trim()).filter(Boolean)) {
        if (!state.terms.includes(t)) state.terms.push(t);
      }
      input.value = '';
      el.querySelectorAll('[data-act="toggle-term"]').forEach((x) => x.setAttribute('aria-pressed', state.terms.includes(x.dataset.val)));
      renderTerms(el);
      draw();
    });
    renderTerms(el);
  }

  draw();

  function renderTerms(root) {
    const box = root.querySelector('#terms');
    if (!box) return;
    box.innerHTML = state.terms.length
      ? state.terms.map((t) => `<button class="chip on" data-act="remove-term" data-val="${esc(t)}" aria-label="Remove ${esc(t)}">${esc(t)} ✕</button>`).join('')
      : '<span class="muted">Nothing yet — type or tick a few ingredients.</span>';
    draw();
  }
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/** Apply the filter chips to a list of recipes. */
function filtered(list) {
  const favs = store.get('favs');
  const notes = store.get('notes');
  return list.filter((r) =>
    (!state.group || r.group === state.group) &&
    (!state.appliance || (r.appliances || []).includes(state.appliance)) &&
    (!state.favs || favs[r.id]) &&
    (!state.notes || (notes[r.id] || '').trim()));
}

function listHtml() {
  const filtering = state.q.trim() || state.group || state.appliance || state.favs || state.notes;
  if (filtering) {
    const list = filtered(data.search(state.q));
    return `<div class="pad-x">
      <p class="muted result-count">${list.length} recipe${list.length === 1 ? '' : 's'}
        · <button class="linkish" data-act="clear-filters">Clear</button></p>
      ${list.length ? `<ul class="list">${list.map((r) => recipeRow(r, { showGroup: true })).join('')}</ul>`
        : '<p class="empty">No recipes match. Try fewer or shorter words.</p>'}
    </div>`;
  }

  // Browse: recently viewed, then parts → groups → recipes
  const open = store.get('ui').open || {};
  const recent = store.get('recent').map(data.get).filter(Boolean).slice(0, 8);
  const custom = data.all().filter((r) => r.custom);
  return `
    ${recent.length ? `<section class="recent pad-x"><h2 class="h-small">Recently viewed</h2>
      <div class="hscroll">${recent.map((r) => `<a class="card-link" href="#/recipe/${esc(r.id)}">${esc(r.title)}</a>`).join('')}</div></section>` : ''}
    ${data.parts().map((p) => {
      const key = 'p:' + p.name;
      const count = p.groups.reduce((n, g) => n + data.byGroup(g).length, 0);
      return `<details class="part" data-key="${esc(key)}" ${open[key] !== false ? 'open' : ''}>
        <summary><h2>${esc(p.name)}</h2><span class="count">${count}</span></summary>
        ${p.groups.map((g) => {
          const gk = 'g:' + g;
          const recipes = data.byGroup(g);
          return `<details class="group" data-key="${esc(gk)}" ${open[gk] ? 'open' : ''}>
            <summary><h3>${esc(g)}</h3><span class="count">${recipes.length}</span></summary>
            <ul class="list">${recipes.map((r) => recipeRow(r)).join('')}</ul>
          </details>`;
        }).join('')}
      </details>`;
    }).join('')}
    ${custom.length ? `<p class="pad-x muted small">Your own recipes appear in the group you chose for them.</p>` : ''}`;
}

function makePanel() {
  return `<section class="panel pad-x" aria-labelledby="make-h">
    <h2 id="make-h">What can I make with…</h2>
    <form id="make-form" class="row gap">
      <input type="text" placeholder="e.g. chicken, rice" aria-label="Ingredients you have" enterkeyhint="done">
      <button class="btn primary">Add</button>
    </form>
    <div class="chips wrap" role="group" aria-label="Common ingredients">
      ${COMMON.map((t) => `<button class="chip" data-act="toggle-term" data-val="${t}" aria-pressed="${state.terms.includes(t)}">${t}</button>`).join('')}
    </div>
    <p class="h-small">Using:</p>
    <div class="chips wrap" id="terms"></div>
  </section>`;
}

function makeResults() {
  if (!state.terms.length) return '';
  const res = data.makeWith(state.terms).filter((x) => filtered([x.r]).length);
  if (!res.length) return '<p class="empty pad-x">No recipes use those ingredients.</p>';
  return `<div class="pad-x"><p class="muted result-count">${res.length} recipes, best matches first</p>
    <ul class="list">${res.map(({ r, used }) => recipeRow(r, {
      extra: `<span class="uses">uses ${used.length} of ${state.terms.length}: ${used.map(esc).join(', ')}</span>`
    })).join('')}</ul></div>`;
}

async function randomPick(exclude) {
  const mainsOnly = store.get('settings').mainsOnly;
  let pool = data.all().filter((r) => !mainsOnly || r.part === 'Savoury Mains');
  if (exclude && pool.length > 1) pool = pool.filter((r) => r.id !== exclude);
  const r = pool[Math.floor(Math.random() * pool.length)];
  const choice = await dialog(`
    <p class="muted">${mainsOnly ? 'How about…' : 'From the whole book…'}</p>
    <h2 class="big-title">${esc(r.title)}</h2>
    <p class="muted">${esc(r.group)}</p>
    <div class="row gap">
      <button class="btn primary" value="open" autofocus>Open recipe</button>
      <button class="btn" value="again">🎲 Another</button>
      <button class="btn ghost" value="">Close</button>
    </div>`);
  if (choice === 'open') location.hash = `#/recipe/${r.id}`;
  if (choice === 'again') randomPick(r.id);
}
