// "Send to the book": turn a recipe you added or edited on this phone into the
// exact format recipes.json uses, and send it (share sheet / copy) to whoever
// looks after the app. On the computer, tools/add_to_book.py slots it into
// recipes.json. Once the book has it, the app tidies up the phone-only copy.

import * as data from './data.js';
import * as store from './storage.js';
import { slugify } from './util.js';
import { shareText } from './share.js';

export const BEGIN = '-----BEGIN BATY RECIPE-----';
export const END = '-----END BATY RECIPE-----';

// Field order matches recipes.json, so the file stays tidy.
const FIELDS = ['id', 'title', 'part', 'group', 'source', 'yield', 'time', 'introNotes',
  'ingredients', 'steps', 'notes', 'appliances', 'related', 'tables', 'needsCheck'];

/** The id this recipe should have in the book. */
export function bookId(r) {
  if (!r.custom) return r.id; // an edited book recipe keeps its id
  if (r.sentAs) return r.sentAs; // already sent once: keep the same id
  const base = slugify(r.title);
  let id = base, n = 2;
  while (data.bookRecipe(id)) id = `${base}-${n++}`;
  return id;
}

/** The recipe as a recipes.json entry. */
export function bookEntry(r) {
  const groups = data.allGroups();
  const out = {};
  for (const k of FIELDS) {
    if (k === 'id') out.id = bookId(r);
    else if (k === 'part') out.part = groups.find((g) => g.group === r.group)?.part || r.part;
    else if (k === 'needsCheck') out.needsCheck = false;
    else if (k === 'related' || k === 'tables') { if (r[k]?.length) out[k] = r[k]; }
    else if (['introNotes', 'ingredients', 'steps', 'notes', 'appliances'].includes(k)) out[k] = r[k] || [];
    else out[k] = r[k] ?? null;
  }
  // Steps: only keep "section" when there is one
  out.steps = out.steps.map((s) => (s.section ? { text: s.text, section: s.section } : { text: s.text }));
  return out;
}

/** The text that gets sent: a short note for people, then the recipe between markers. */
export function bookText(r) {
  const entry = bookEntry(r);
  const action = r.custom ? 'add' : 'replace';
  const payload = { bookRecipe: 1, action, recipe: entry };
  return [
    `Baty Recipes — ${action === 'add' ? 'new recipe for the book' : 'changes to a book recipe'}`,
    `${entry.title} (${entry.group})`,
    '',
    'To add it: save this whole message as a .txt file in the "tools/inbox" folder of the',
    'Baty recipes app project and run tools/add_to_book.py (see README).',
    '',
    BEGIN,
    JSON.stringify(payload, null, 1),
    END
  ].join('\n');
}

/** Send it, and remember the id it was sent as (so the phone copy can be tidied later). */
export async function send(r) {
  const id = bookId(r);
  if (r.custom) {
    store.update('custom', (c) => { if (c[r.id]) c[r.id].sentAs = id; });
    r.sentAs = id; // so the page shows "Sent" straight away
  }
  await shareText(`Recipe for the book: ${r.title}`, bookText(r));
}

/**
 * Housekeeping after recipes.json loads:
 * - edits that now match the book exactly are removed (the book caught up);
 * - your own recipes that the book now contains are flagged, so the recipe page
 *   can offer to remove the phone copy.
 * Returns the ids of your own recipes that are now in the book.
 */
export function tidy() {
  const edits = store.get('edits');
  let changed = false;
  for (const [id, fields] of Object.entries(edits)) {
    const b = data.bookRecipe(id);
    if (!b) continue;
    for (const [k, v] of Object.entries(fields)) {
      if (JSON.stringify(v) === JSON.stringify(b[k] ?? (Array.isArray(v) ? [] : null))) { delete fields[k]; changed = true; }
    }
    if (!Object.keys(fields).length) { delete edits[id]; changed = true; }
  }
  if (changed) store.set('edits', edits);

  return Object.values(store.get('custom'))
    .filter((c) => (c.sentAs && data.bookRecipe(c.sentAs)))
    .map((c) => c.id);
}
