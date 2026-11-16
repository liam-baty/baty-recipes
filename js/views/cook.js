// Cook mode: full screen, big text, one step at a time.
// Swipe left/right or use Next/Back. Ingredients are one tap away.
// Tap a step or an ingredient to tick it off. Keeps the screen awake where supported.

import * as data from '../data.js';
import * as store from '../storage.js';
import { esc } from '../util.js';
import { lineHtml } from '../ingredients.js';
import { withTimerButtons } from '../timers.js';
import { fmtK } from '../share.js';

export const name = 'cook';

// Ticks are kept while the app is open (per recipe), so leaving and coming back keeps your place.
const progress = {};

export function render(el, { id }) {
  const r = data.get(id);
  if (!r) { location.replace('#/'); return; }
  if (!r.steps.length) { location.replace(`#/recipe/${id}`); return; } // e.g. table-only recipes
  const k = store.get('scales')[id] ?? store.get('settings').defaultScale ?? 1;
  const p = progress[id] ||= { step: 0, done: new Set(), ticked: new Set() };
  const total = r.steps.length;
  let showIngredients = false;
  let wakeLock = null;
  let wakeMsg = '';

  const linker = (t) => data.linkify(t, r);

  function draw() {
    const st = r.steps[p.step];
    let n = 0;
    el.innerHTML = `
      <div class="cook">
        <header class="cook-top">
          <a class="btn ghost" href="#/recipe/${esc(id)}" aria-label="Leave cook mode">✕ Close</a>
          <h1 class="cook-title">${esc(r.title)}</h1>
          <button class="btn ${showIngredients ? 'primary' : ''}" data-act="ing" aria-expanded="${showIngredients}">Ingredients</button>
        </header>
        ${wakeMsg ? `<p class="cook-wake">${esc(wakeMsg)}</p>` : ''}

        ${showIngredients ? `
          <section class="cook-ing" aria-label="Ingredients">
            ${k !== 1 ? `<p class="muted">Scaled ×${fmtK(k)}</p>` : ''}
            ${r.ingredients.map((g) => `
              ${g.heading ? `<h3>${esc(g.heading)}</h3>` : ''}
              <ul>${g.items.map((line) => {
                const i = n++;
                return `<li class="tickable ${p.ticked.has(i) ? 'ticked' : ''}" data-ing="${i}" role="checkbox" aria-checked="${p.ticked.has(i)}" tabindex="0">${lineHtml(line, k, linker).html}</li>`;
              }).join('')}</ul>`).join('')}
            <button class="btn primary big" data-act="ing">Back to step ${p.step + 1}</button>
          </section>` : `
          <section class="cook-step" aria-live="polite">
            <p class="cook-count">Step ${p.step + 1} of ${total}${st.section ? ` · ${esc(st.section)}` : ''}</p>
            <div class="cook-text tickable ${p.done.has(p.step) ? 'ticked' : ''}" data-stepbox role="checkbox" aria-checked="${p.done.has(p.step)}" tabindex="0">
              ${withTimerButtons(st.text, `Step ${p.step + 1} · ${r.title}`, linker)}
            </div>
            <p class="muted small">Tap the step to tick it off.</p>
            <div class="dots" aria-hidden="true">${r.steps.map((_, i) => `<span class="${i === p.step ? 'cur' : ''} ${p.done.has(i) ? 'done' : ''}"></span>`).join('')}</div>
          </section>`}

        <nav class="cook-nav" aria-label="Steps">
          <button class="btn big" data-act="prev" ${p.step === 0 ? 'disabled' : ''}>‹ Back</button>
          ${p.step < total - 1
            ? '<button class="btn primary big" data-act="next">Next ›</button>'
            : `<a class="btn primary big" href="#/recipe/${esc(id)}">Finished ✓</a>`}
        </nav>
      </div>`;
  }

  function go(delta) {
    const next = Math.min(total - 1, Math.max(0, p.step + delta));
    if (next === p.step) return;
    p.step = next;
    showIngredients = false;
    draw();
  }

  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (b) {
      if (b.dataset.act === 'next') go(1);
      if (b.dataset.act === 'prev') go(-1);
      if (b.dataset.act === 'ing') { showIngredients = !showIngredients; draw(); }
      return;
    }
    if (e.target.closest('a')) return;
    const ing = e.target.closest('[data-ing]');
    if (ing) {
      const i = Number(ing.dataset.ing);
      if (p.ticked.has(i)) p.ticked.delete(i); else p.ticked.add(i);
      ing.classList.toggle('ticked'); ing.setAttribute('aria-checked', p.ticked.has(i));
      return;
    }
    const box = e.target.closest('[data-stepbox]');
    if (box) {
      if (p.done.has(p.step)) p.done.delete(p.step); else p.done.add(p.step);
      draw();
    }
  });

  el.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.tickable')) { e.preventDefault(); e.target.click(); }
  });

  // Swipe left = next, swipe right = back
  let sx = null, sy = null;
  el.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (sx == null || showIngredients) return;
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
    sx = null;
  }, { passive: true });

  const onKey = (e) => {
    if (e.key === 'ArrowRight') go(1);
    if (e.key === 'ArrowLeft') go(-1);
  };
  document.addEventListener('keydown', onKey);

  // ---------- Keep the screen awake ----------
  async function lock() {
    try {
      if ('wakeLock' in navigator) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeMsg = '';
      } else {
        wakeMsg = "This phone can't keep the screen on automatically — tap the screen now and then, or turn Auto-Lock off while cooking.";
      }
    } catch {
      wakeMsg = "Couldn't keep the screen on — tap the screen now and then, or turn Auto-Lock off while cooking.";
    }
  }
  const onVis = () => { if (!document.hidden && el.isConnected) lock().then(draw); };
  document.addEventListener('visibilitychange', onVis);

  // Clean up when leaving cook mode
  const onHash = () => {
    if (el.isConnected && location.hash.startsWith('#/cook/')) return;
    wakeLock?.release?.().catch(() => {});
    document.removeEventListener('visibilitychange', onVis);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('hashchange', onHash);
  };
  window.addEventListener('hashchange', onHash);

  draw();
  lock().then(draw);
}
