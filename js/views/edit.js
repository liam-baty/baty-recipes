// Edit a recipe, or add a new one. Saved on this phone only and included in Export.
// Book recipes keep their original in recipes.json; "Revert to book" removes your changes.
//
// Text format in the big boxes: one item per line. Start a line with "## " to make a
// sub-heading, e.g. "## Sauce" in ingredients or "## A: Make dough" in the method.

import * as data from '../data.js';
import * as store from '../storage.js';
import { esc, toast, dialog, slugify } from '../util.js';
import { backLink } from './common.js';

export const name = 'edit';

export function render(el, { id, isNew }) {
  const r = isNew ? null : data.get(id);
  if (!isNew && !r) { location.replace('#/'); return; }
  const groups = data.allGroups();

  const ingText = r ? r.ingredients.map((g) => (g.heading ? `## ${g.heading}\n` : '') + g.items.join('\n')).join('\n') : '';
  let lastSection = null;
  const stepText = r ? r.steps.map((s) => {
    let out = '';
    if ((s.section || null) !== lastSection) { lastSection = s.section || null; if (s.section) out += `## ${s.section}\n`; }
    return out + s.text;
  }).join('\n') : '';

  el.innerHTML = `
    <div class="pad-x">${backLink(r ? `#/recipe/${esc(r.id)}` : '#/', r ? 'Recipe' : 'Recipes')}</div>
    <form class="edit pad-x" id="edit-form">
      <h1>${r ? 'Edit recipe' : 'New recipe'}</h1>
      ${r && !r.custom ? '<p class="muted small">Your changes are saved on this phone. The book version is kept, and you can go back to it any time.</p>' : ''}
      <label class="field">Title <input name="title" required value="${esc(r?.title)}"></label>
      <label class="field">Group
        <select name="group">${data.parts().map((p) => `<optgroup label="${esc(p.name)}">${p.groups.map((g) =>
          `<option ${g === r?.group ? 'selected' : ''}>${esc(g)}</option>`).join('')}</optgroup>`).join('')}</select>
      </label>
      <label class="field">Source <input name="source" value="${esc(r?.source)}" placeholder="Where it came from"></label>
      <div class="row gap">
        <label class="field grow">Serves / makes <input name="yield" value="${esc(r?.yield)}"></label>
        <label class="field grow">Time <input name="time" value="${esc(r?.time)}"></label>
      </div>
      <label class="field">Notes before the ingredients <span class="muted small">(one per line)</span>
        <textarea name="introNotes" rows="2">${esc((r?.introNotes || []).join('\n'))}</textarea></label>
      <label class="field">Ingredients <span class="muted small">(one per line; “## Sauce” for a sub-heading)</span>
        <textarea name="ingredients" rows="10">${esc(ingText)}</textarea></label>
      <label class="field">Method <span class="muted small">(one step per line; “## A: Make dough” for a section)</span>
        <textarea name="steps" rows="10">${esc(stepText)}</textarea></label>
      <label class="field">Notes after the method <span class="muted small">(one per line)</span>
        <textarea name="notes" rows="3">${esc((r?.notes || []).join('\n'))}</textarea></label>
      <fieldset class="field"><legend>Appliances</legend>
        <div class="chips wrap">${data.APPLIANCES.map((a) => `<label class="chip check-chip"><input type="checkbox" name="appl" value="${a}" ${(r?.appliances || []).includes(a) ? 'checked' : ''}> ${esc(a)}</label>`).join('')}</div>
      </fieldset>
      <div class="row gap wrap">
        <button class="btn primary big">Save</button>
        ${r?.edited ? '<button type="button" class="btn" data-act="revert">Revert to book</button>' : ''}
        ${r?.custom ? '<button type="button" class="btn danger" data-act="delete">Delete recipe</button>' : ''}
      </div>
    </form>`;

  const form = el.querySelector('#edit-form');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const lines = (name) => String(f.get(name) || '').split('\n').map((x) => x.trim()).filter(Boolean);
    const group = String(f.get('group'));
    const part = groups.find((g) => g.group === group)?.part;

    const ingredients = [];
    for (const line of lines('ingredients')) {
      if (line.startsWith('## ')) ingredients.push({ heading: line.slice(3).trim(), items: [] });
      else {
        if (!ingredients.length) ingredients.push({ heading: null, items: [] });
        ingredients[ingredients.length - 1].items.push(line);
      }
    }
    const steps = [];
    let section = null;
    for (const line of lines('steps')) {
      if (line.startsWith('## ')) { section = line.slice(3).trim(); continue; }
      steps.push(section ? { text: line, section } : { text: line });
    }

    const fields = {
      title: String(f.get('title')).trim(),
      group, part,
      source: String(f.get('source')).trim() || null,
      yield: String(f.get('yield')).trim() || null,
      time: String(f.get('time')).trim() || null,
      introNotes: lines('introNotes'),
      ingredients: ingredients.filter((g) => g.items.length),
      steps,
      notes: lines('notes'),
      appliances: f.getAll('appl').map(String)
    };

    if (!r || r.custom) {
      const newId = r?.id || uniqueId(fields.title);
      store.update('custom', (c) => { c[newId] = { ...(c[newId] || {}), ...fields, id: newId, needsCheck: false }; });
      toast('Saved on this phone');
      location.hash = `#/recipe/${newId}`;
    } else {
      // Only keep fields that differ from the book, so future book updates still show through
      const book = data.bookRecipe(r.id);
      const changed = {};
      for (const [k, v] of Object.entries(fields)) {
        if (JSON.stringify(v) !== JSON.stringify(book[k] ?? (Array.isArray(v) ? [] : null))) changed[k] = v;
      }
      store.update('edits', (ed) => { if (Object.keys(changed).length) ed[r.id] = changed; else delete ed[r.id]; });
      toast('Saved on this phone');
      location.hash = `#/recipe/${r.id}`;
    }
  });

  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'revert') {
      const c = await dialog(`<h2>Revert to the book version?</h2><p>Your changes to this recipe will be removed.</p>
        <div class="stack"><button class="btn danger" value="yes">Revert</button><button class="btn ghost" value="">Cancel</button></div>`);
      if (c !== 'yes') return;
      store.update('edits', (ed) => { delete ed[r.id]; });
      location.hash = `#/recipe/${r.id}`;
    }
    if (b.dataset.act === 'delete') {
      const c = await dialog(`<h2>Delete “${esc(r.title)}”?</h2><p>This can't be undone (unless you have a backup).</p>
        <div class="stack"><button class="btn danger" value="yes">Delete</button><button class="btn ghost" value="">Cancel</button></div>`);
      if (c !== 'yes') return;
      store.update('custom', (cu) => { delete cu[r.id]; });
      location.hash = '#/';
    }
  });
}

function uniqueId(title) {
  const base = 'my-' + slugify(title);
  let id = base, n = 2;
  while (data.get(id)) id = `${base}-${n++}`;
  return id;
}
