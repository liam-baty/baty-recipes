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

/**
 * Parts and their groups, in book order (read from recipes.json).
 * With withOther, a part also lists "Other recipes" when one of your own
 * recipes names a group the book doesn't have any more.
 */
export function parts({ withOther = true } = {}) {
  const list = book.parts.map((p) => ({ name: p.name, groups: [...p.groups] }));
  if (withOther) {
    for (const r of all()) {
      if (r.group !== OTHER_GROUP) continue;
      const p = list.find((x) => x.name === r.part);
      if (p && !p.groups.includes(OTHER_GROUP)) p.groups.push(OTHER_GROUP);
    }
  }
  return list;
}

export function allGroups() {
  return book.parts.flatMap((p) => p.groups.map((g) => ({ part: p.name, group: g })));
}

export function bookRecipe(id) {
  return book.recipes.find((r) => r.id === id) || null;
}

// Group names come only from recipes.json's "parts" list, and can change.
// Recipes saved on a phone may name a group the book no longer has:
// - an edited book recipe just uses the book's current group;
// - your own recipe goes in an "Other recipes" group in its part, so it's never hidden.
export const OTHER_GROUP = 'Other recipes';

function isBookGroup(group) {
  return book.parts.some((p) => p.groups.includes(group));
}

function fixGroup(r, bookVersion) {
  if (isBookGroup(r.group)) return r;
  if (bookVersion) return { ...r, group: bookVersion.group, part: bookVersion.part };
  const part = book.parts.find((p) => p.name === r.part) || book.parts[book.parts.length - 1];
  return { ...r, group: OTHER_GROUP, part: part.name };
}

export function all() {
  if (cache) return cache;
  const edits = store.get('edits');
  const custom = store.get('custom');
  const list = book.recipes.map((r) => {
    const e = edits[r.id];
    return e ? fixGroup({ ...r, ...e, id: r.id, edited: true }, r) : r;
  });
  for (const r of Object.values(custom)) list.push(fixGroup({ ...r, custom: true }));
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
      if (ingredientMatch(h.ingredients, w)) s += 3;
      if (h.notes.includes(w) || mine.includes(w)) s += 1;
      if (!s) { ok = false; break; }
      score += s;
    }
    if (ok) results.push({ r, score });
  }
  return results.sort((a, b) => b.score - a.score).map((x) => x.r);
}

// ---------------------------------------------------------------------------
// Matching a word in ingredient lines
// ---------------------------------------------------------------------------

// "minced", "sliced", "diced"… describe how something is cut, so "mince" shouldn't
// find "minced garlic" or "garlic, minced". They still count before a meat
// ("minced beef" is mince).
const MEAT_NEXT = /^\s+(beef|lamb|pork|chicken|turkey|veal|meat|steak|kangaroo|venison|sausage)/;

/**
 * Does `term` (lower case, partial words fine) appear in `text` as an ingredient?
 * `skipIfNext` (optional regex) rejects a match by what follows it,
 * e.g. "chicken stock" doesn't count as chicken.
 */
export function ingredientMatch(text, term, skipIfNext = null) {
  const re = new RegExp(`\\b${reEscape(term)}[a-z]*`, 'g');
  for (const m of text.matchAll(re)) {
    const word = m[0];
    const rest = text.slice(m.index + word.length);
    if (word !== term && word.endsWith('ed') && word !== 'seed' && !MEAT_NEXT.test(rest)) continue;
    if (skipIfNext && skipIfNext.test(rest)) continue;
    return true;
  }
  return false;
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
    const used = clean.filter((t) => lines.some((l) => ingredientMatch(l, t, flavourOnly)));
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
