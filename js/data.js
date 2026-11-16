// Loads recipes.json, applies your on-device edits and added recipes,
// and provides search and "What can I make with…".

import * as store from './storage.js';
import { norm, esc, reEscape } from './util.js';

let book = null;       // recipes.json as loaded
let cache = null;      // merged list (book + your edits + your recipes)

export async function load(url = 'recipes.json') {
  // The service worker serves this from cache when offline.
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load recipes.json (${res.status})`);
  book = await res.json();
  invalidate();
  return book;
}

/** Call after edits so the merged list is rebuilt. */
export function invalidate() { cache = null; }

export function meta() {
  return { title: book?.title, version: book?.version, generated: book?.generated, count: book?.recipes.length };
}

/** Parts and their groups, in book order. Your own recipes may add a "My recipes" group. */
export function parts() {
  const list = book.parts.map((p) => ({ name: p.name, groups: [...p.groups] }));
  return list;
}

export function allGroups() {
  return book.parts.flatMap((p) => p.groups.map((g) => ({ part: p.name, group: g })));
}

export function bookRecipe(id) {
  return book.recipes.find((r) => r.id === id) || null;
}

export function all() {
  if (cache) return cache;
  const edits = store.get('edits');
  const custom = store.get('custom');
  const list = book.recipes.map((r) => {
    const e = edits[r.id];
    return e ? { ...r, ...e, id: r.id, edited: true } : r;
  });
  for (const r of Object.values(custom)) list.push({ ...r, custom: true });
  // Pre-compute lower-case text for fast searching
  for (const r of list) {
    Object.defineProperty(r, '_hay', {
      enumerable: false, configurable: true,
      value: {
        title: norm(r.title),
        group: norm(`${r.group} ${r.part}`),
        ingredients: norm(r.ingredients.flatMap((g) => [g.heading || '', ...g.items]).join(' \n ')),
        notes: norm([...(r.introNotes || []), ...(r.notes || [])].join(' \n '))
      }
    });
  }
  cache = list;
  return list;
}

export function get(id) {
  return all().find((r) => r.id === id) || null;
}

export function byGroup(group) {
  return all().filter((r) => r.group === group);
}

// ---------------------------------------------------------------------------
// Search: every word you type must appear somewhere (partial words are fine).
// Title matches rank highest, then groups, ingredients, notes.
// ---------------------------------------------------------------------------

export function search(query, list = all()) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return list;
  const myNotes = store.get('notes');
  const results = [];
  for (const r of list) {
    const h = r._hay;
    const mine = norm(myNotes[r.id] || '');
    let score = 0, ok = true;
    for (const w of words) {
      let s = 0;
      if (h.title.includes(w)) s += h.title.startsWith(w) || h.title.includes(' ' + w) ? 12 : 8;
      if (h.group.includes(w)) s += 4;
      if (h.ingredients.includes(w)) s += 3;
      if (h.notes.includes(w) || mine.includes(w)) s += 1;
      if (!s) { ok = false; break; }
      score += s;
    }
    if (ok) results.push({ r, score });
  }
  return results.sort((a, b) => b.score - a.score).map((x) => x.r);
}

// ---------------------------------------------------------------------------
// What can I make with…
// ---------------------------------------------------------------------------

export function makeWith(terms) {
  const clean = terms.map((t) => norm(t).trim()).filter(Boolean);
  if (!clean.length) return [];
  const res = [];
  // "chicken stock" or "beef stock powder" shouldn't count as having chicken or beef
  // …nor should "rice vinegar", "rice paper" or "rice noodles" count as rice
  const flavourOnly = /^\s*(stock|broth|powder|salt|cube|seasoning|bouillon|gravy|flavour|vinegar|wine|paper|flour|noodle|malt|bran)/;
  for (const r of all()) {
    const lines = r.ingredients.flatMap((g) => g.items).map(norm);
    const used = clean.filter((t) => {
      const re = new RegExp(`\\b${reEscape(t)}[a-z]*`, 'g');
      return lines.some((l) => [...l.matchAll(re)].some((m) => !flavourOnly.test(l.slice(m.index + m[0].length))));
    });
    if (used.length) {
      const total = r.ingredients.reduce((n, g) => n + g.items.length, 0);
      res.push({ r, used, total });
    }
  }
  return res.sort((a, b) => b.used.length - a.used.length || a.total - b.total);
}

// ---------------------------------------------------------------------------
// "(see recipe)" links
// ---------------------------------------------------------------------------

/**
 * Turn "chocolate icing (see recipe)" into a tappable link.
 * We look at the words just before the mention and pick the best-matching
 * recipe, preferring the ones listed in this recipe's `related`.
 */
export function linkify(text, recipe) {
  const safe = esc(text);
  if (!/see recipe/i.test(text)) return safe;
  return safe.replace(/\(([^()]*?)see recipe\)/gi, (whole, inner, offset) => {
    const before = norm(safe.slice(Math.max(0, offset - 60), offset) + ' ' + inner);
    const target = bestMatch(before, recipe);
    if (!target) return whole;
    return `(<a href="#/recipe/${target.id}">${inner}see recipe</a>)`;
  });
}

function bestMatch(context, recipe) {
  const words = new Set(context.replace(/&[a-z#0-9]+;/g, ' ').split(/[^a-z]+/).filter((w) => w.length > 2));
  const pool = [
    ...(recipe.related || []).map(get).filter(Boolean),
    ...all().filter((r) => r.id !== recipe.id)
  ];
  let best = null, bestScore = 0;
  pool.forEach((r, i) => {
    const tw = norm(r.title).split(/[^a-z]+/).filter((w) => w.length > 2);
    const hits = tw.filter((w) => words.has(w) || words.has(w.replace(/s$/, ''))).length;
    const score = hits / tw.length + (i < (recipe.related || []).length ? 0.5 : 0);
    if (hits && score > bestScore) { best = r; bestScore = score; }
  });
  return best;
}

export const APPLIANCES = ['oven', 'microwave', 'breadmaker', 'slow cooker', 'steamer', 'pie maker', 'air fryer'];
