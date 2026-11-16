// Shopping list logic shared by the recipe page, the meal planner and the
// shopping page. Each saved entry keeps the original ingredient text and the
// scale it was added at; merging and sorting happen when the list is shown.

import * as store from './storage.js';
import { uid } from './util.js';
import { parseLine, nameOf, combine, sectionFor, isStaple, SECTIONS } from './ingredients.js';

/** Add ingredient lines from a recipe. Returns the uids added (for Undo). */
export function addFromRecipe(recipe, lines, scale = 1) {
  const added = [];
  store.update('shopping', (list) => {
    for (const line of lines) {
      if (!nameOf(line)) continue; // skip notes such as "(or any vegetables)"
      const item = { uid: uid(), line, scale, recipeId: recipe.id, recipeTitle: recipe.title, checked: false };
      list.push(item);
      added.push(item.uid);
    }
  });
  return added;
}

export function addCustom(text) {
  const t = text.trim();
  if (!t) return null;
  const item = { uid: uid(), line: t, scale: 1, recipeId: null, recipeTitle: null, checked: false, custom: true };
  store.update('shopping', (list) => { list.push(item); });
  return item.uid;
}

export function removeUids(uids) {
  const set = new Set(uids);
  store.update('shopping', (list) => list.filter((i) => !set.has(i.uid)));
}

/** Every ingredient line of a recipe, flattened. */
export function allLines(recipe) {
  return recipe.ingredients.flatMap((g) => g.items);
}

/**
 * Build the list for display:
 * [{ section, label, rows: [{ key, name, lines: [{ text, members, merged }], checked, staple }] }]
 * Lines with the same ingredient name are kept together; where units match they are
 * added up into one line, otherwise they are listed together.
 */
export function build() {
  const items = store.get('shopping');
  const overrides = store.get('sectionOverrides');
  const staples = store.get('pantry');

  const byName = new Map();
  for (const it of items) {
    const parsed = parseLine(it.line);
    const name = parsed.name || it.line.toLowerCase();
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push({ ...it, parsed });
  }

  const sections = Object.fromEntries(SECTIONS.map(([k, label]) => [k, { section: k, label, rows: [] }]));
  const stapleRows = [];
  for (const [name, members] of byName) {
    const row = {
      key: name,
      name,
      lines: combine(members),
      members,
      checked: members.every((m) => m.checked),
      staple: isStaple(members[0].parsed, staples),
      section: sectionFor(members[0].parsed, overrides)
    };
    if (row.staple) stapleRows.push(row);
    else sections[row.section].rows.push(row);
  }
  const out = Object.values(sections).filter((s) => s.rows.length);
  for (const s of out) s.rows.sort((a, b) => a.checked - b.checked || a.name.localeCompare(b.name));
  return { sections: out, staples: stapleRows, count: items.length };
}

/** Plain text for sharing (ticked and staple items left off). */
export function asText() {
  const { sections } = build();
  const out = ['Shopping list'];
  for (const s of sections) {
    const rows = s.rows.filter((r) => !r.checked);
    if (!rows.length) continue;
    out.push('', s.label.toUpperCase());
    for (const r of rows) for (const l of r.lines) out.push(`☐ ${l.text}`);
  }
  return out.join('\n');
}
