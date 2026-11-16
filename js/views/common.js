// Pieces of page layout used on several pages.

import * as store from '../storage.js';
import { esc } from '../util.js';

/** One tappable recipe in a list. */
export function recipeRow(r, { showGroup = false, extra = '' } = {}) {
  const favs = store.get('favs');
  const ratings = store.get('ratings');
  const notes = store.get('notes');
  const badges = [
    favs[r.id] ? '<span class="i-fav" title="Favourite" aria-label="Favourite">♥</span>' : '',
    ratings[r.id] ? `<span class="i-stars" aria-label="${ratings[r.id]} stars">${'★'.repeat(ratings[r.id])}</span>` : '',
    notes[r.id] ? '<span class="i-note" title="Has my notes" aria-label="Has my notes">✎</span>' : '',
    r.needsCheck ? '<span class="tag warn">check against the book</span>' : '',
    r.custom ? '<span class="tag">my recipe</span>' : (r.edited ? '<span class="tag">edited</span>' : '')
  ].join('');
  return `<li><a class="recipe-row" href="#/recipe/${esc(r.id)}">
    <span class="rr-title">${esc(r.title)}</span>
    ${showGroup || extra ? `<span class="rr-sub">${showGroup ? esc(r.group) : ''}${extra}</span>` : ''}
    ${badges ? `<span class="rr-badges">${badges}</span>` : ''}
  </a></li>`;
}

export function backLink(href = '#/', label = 'Recipes') {
  return `<a class="back" href="${href}">‹ ${esc(label)}</a>`;
}
