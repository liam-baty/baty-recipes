// Settings: theme, text size, default scale, pantry staples, backup (export/import),
// app version and recipe data date.

import * as data from '../data.js';
import * as store from '../storage.js';
import { esc, toast, dialog, isStandalone, isoDate, fromIso, fmtDate } from '../util.js';
import { applySettings, swVersion } from '../app.js';
import { fmtK } from '../share.js';
import * as reminders from '../reminders.js';
import { DEFAULT_SHORTCUT } from '../reminders.js';

export const name = 'settings';

export function render(el) {
  function draw() {
    const s = store.get('settings');
    const pantry = store.get('pantry');
    const overrides = Object.keys(store.get('sectionOverrides')).length;
    const m = data.meta();
    const opt = (name, value, label, current) =>
      `<label class="seg-opt"><input type="radio" name="${name}" value="${value}" ${String(current) === String(value) ? 'checked' : ''}><span>${label}</span></label>`;

    el.innerHTML = `
      <header class="top"><div class="top-row"><h1>Settings</h1></div></header>

      <section class="pad-x card">
        <h2>Appearance</h2>
        <p class="field-label">Theme</p>
        <div class="seg">${opt('theme', 'auto', 'Auto', s.theme)}${opt('theme', 'light', 'Light', s.theme)}${opt('theme', 'dark', 'Dark', s.theme)}</div>
        <p class="field-label">Text size</p>
        <div class="seg">${opt('textSize', 'small', 'A', s.textSize)}${opt('textSize', 'normal', '<span style="font-size:1.15em">A</span>', s.textSize)}${opt('textSize', 'large', '<span style="font-size:1.3em">A</span>', s.textSize)}${opt('textSize', 'xl', '<span style="font-size:1.5em">A</span>', s.textSize)}</div>
      </section>

      <section class="pad-x card">
        <h2>Recipes</h2>
        <p class="field-label">Default serving scale</p>
        <div class="seg">${[0.5, 1, 2, 3].map((k) => opt('defaultScale', k, '×' + fmtK(k), s.defaultScale)).join('')}</div>
        <p class="muted small">Used when you open a recipe you haven't scaled before.</p>
        <label class="check"><input type="checkbox" name="mainsOnly" ${s.mainsOnly ? 'checked' : ''}> “What's for dinner?” picks from Savoury Mains only</label>
      </section>

      <section class="pad-x card">
        <h2>Pantry staples</h2>
        <p class="muted small">Things you always have. They're greyed out (or hidden) on the shopping list.</p>
        <div class="seg">${opt('staples', 'grey', 'Grey out', s.staples)}${opt('staples', 'hide', 'Hide', s.staples)}</div>
        <ul class="chips wrap staple-list">${pantry.map((p) => `<li><button class="chip on" data-act="rm-staple" data-val="${esc(p)}" aria-label="Remove ${esc(p)}">${esc(p)} ✕</button></li>`).join('')}</ul>
        <form id="staple-form" class="row gap">
          <input type="text" name="staple" placeholder="e.g. sesame oil" aria-label="Add a pantry staple" autocomplete="off">
          <button class="btn">Add</button>
        </form>
        ${overrides ? `<p class="small">You've moved ${overrides} item${overrides > 1 ? 's' : ''} to different shop sections.
          <button class="linkish" data-act="reset-sections">Reset</button></p>` : ''}
      </section>

      <section class="pad-x card" id="reminders">
        <h2>Shared Reminders</h2>
        <p class="small">Send the shopping list, a recipe's ingredients or a week's shopping to a <strong>shared Reminders list</strong>.
          Reminders syncs through iCloud, so everyone sharing the list sees the items and can tick them off.</p>
        <label class="check"><input type="checkbox" name="reminders" ${s.reminders ? 'checked' : ''}> Show “Send to Reminders” buttons</label>
        <label class="field">Shortcut name
          <input type="text" name="remindersShortcut" value="${esc(s.remindersShortcut || DEFAULT_SHORTCUT)}" autocomplete="off" autocapitalize="words">
        </label>
        <p><button class="btn" data-act="test-reminders">Send a test item</button></p>
        <details class="howto">
          <summary><strong>How to set it up (once, about 5 minutes)</strong></summary>
          <p class="small muted">iPhone doesn't let web apps add reminders themselves, so a small Shortcut does it for us.</p>
          <h3>1. Make a shared list</h3>
          <ol>
            <li>Open the <strong>Reminders</strong> app and tap <strong>Add List</strong>. Call it e.g. <em>Shopping</em>, then tap <strong>Done</strong>.</li>
            <li>Open the list, tap the <strong>Share</strong> button (person icon or ⋯ → Share List), and invite the people you shop with.</li>
          </ol>
          <h3>2. Make the Shortcut</h3>
          <ol>
            <li>Open the <strong>Shortcuts</strong> app and tap <strong>＋</strong> (top right).</li>
            <li>Tap the name at the top → <strong>Rename</strong> → type <strong>${esc(s.remindersShortcut || DEFAULT_SHORTCUT)}</strong> exactly.</li>
            <li>Tap <strong>Search Actions</strong>, find <strong>Split Text</strong> and tap it.</li>
            <li>In that action, tap the blue <strong>Text</strong> and choose <strong>Shortcut Input</strong>. It should read <em>Split Shortcut Input by New Lines</em>.
              (A “Receive … input” line may appear at the top — that's fine.)</li>
            <li>Search for <strong>Repeat with Each</strong> and add it. It should read <em>Repeat with each item in Split Text</em>.</li>
            <li>Search for <strong>Add New Reminder</strong> and add it. Drag it <strong>up</strong> so it sits between <em>Repeat with each</em> and <em>End Repeat</em>.</li>
            <li>In <em>Add New Reminder</em>: tap the blue <strong>Reminder</strong> word and choose <strong>Repeat Item</strong>; tap the list name and choose your shared list.</li>
            <li>Tap <strong>Done</strong>.</li>
          </ol>
          <h3>3. Try it</h3>
          <ol>
            <li>Tick <strong>Show “Send to Reminders” buttons</strong> above, then tap <strong>Send a test item</strong>.</li>
            <li>The Shortcuts app opens. The first time, tap <strong>Allow</strong> when it asks to use Reminders.</li>
            <li>Check your shared list for “Baty Recipes test”, delete it, and swipe back to the app.</li>
          </ol>
          <p class="small muted">“Shortcut not found”? Check the name above matches the Shortcut's name exactly (capitals and spaces count).</p>
        </details>
      </section>

      <section class="pad-x card">
        <h2>Backup &amp; moving phones</h2>
        <div class="tip inline"><p><strong>Your data is saved on this phone only.</strong>
          Safari and the Home Screen app keep separate data, so pick one (the Home Screen app is best) and back up now and then.
          ${isStandalone() ? '<br>You are using the Home Screen app.' : '<br>You are using Safari.'}</p></div>
        <p>Export saves favourites, ratings, notes, made-it dates, your edits and recipes, shopping list, meal plans, pantry staples and settings to a file.
          On a new phone, open the app and use Import.</p>
        <div class="row gap wrap">
          <button class="btn primary" data-act="export">Export my data</button>
          <label class="btn">Import a backup<input type="file" id="import" accept="application/json,.json" hidden></label>
        </div>
        <p><button class="btn danger" data-act="clear">Clear all my data…</button></p>
        ${store.storageOk() ? '' : '<p class="warn-text">⚠︎ This browser is not saving data (Private Browsing?). Changes will be lost when you close it.</p>'}
      </section>

      <section class="pad-x card">
        <h2>About</h2>
        <dl class="about">
          <dt>App version</dt><dd data-app-version>${esc(swVersion || '—')}</dd>
          <dt>Recipes</dt><dd>${m.count} in the book${data.all().length > m.count ? `, plus ${data.all().length - m.count} of your own` : ''}</dd>
          <dt>Recipe data updated</dt><dd>${m.generated ? esc(fmtDate(fromIso(m.generated), { day: 'numeric', month: 'long', year: 'numeric' })) : '—'} (version ${esc(m.version ?? '—')})</dd>
        </dl>
        <p class="muted small">The app works offline after your first visit. When a new version is published you'll see “Update now”.</p>
      </section>`;

    el.querySelector('#staple-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = e.target.staple.value.trim().toLowerCase();
      if (!v) return;
      store.update('pantry', (p) => { if (!p.includes(v)) p.push(v); });
      draw();
    });

    el.querySelector('#import').addEventListener('change', importFile);
  }

  el.addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'remindersShortcut') {
      store.update('settings', (s) => { s.remindersShortcut = t.value.trim() || DEFAULT_SHORTCUT; });
      draw();
      return;
    }
    if (t.type === 'radio' || t.name === 'mainsOnly' || t.name === 'reminders') {
      store.update('settings', (s) => {
        if (t.name === 'mainsOnly') s.mainsOnly = t.checked;
        else if (t.name === 'reminders') s.reminders = t.checked;
        else if (t.name === 'defaultScale') s.defaultScale = Number(t.value);
        else s[t.name] = t.value;
      });
      applySettings();
    }
  });

  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'rm-staple') {
      store.update('pantry', (p) => p.filter((x) => x !== b.dataset.val));
    } else if (act === 'reset-sections') {
      store.set('sectionOverrides', {});
    } else if (act === 'test-reminders') {
      reminders.send(['Baty Recipes test']);
      return;
    } else if (act === 'export') {
      return exportData();
    } else if (act === 'clear') {
      const c = await dialog(`<h2>Clear all your data?</h2>
        <p>This removes favourites, ratings, notes, made-it dates, your edits and recipes, shopping list, meal plans, pantry staples and settings from this ${isStandalone() ? 'app' : 'browser'}.
        The recipes themselves stay. <strong>Export a backup first</strong> if you might want it back.</p>
        <div class="stack"><button class="btn danger" value="yes">Clear everything</button><button class="btn ghost" value="" autofocus>Cancel</button></div>`);
      if (c !== 'yes') return;
      store.clearAll();
      applySettings();
      toast('All your data has been cleared');
    } else return;
    draw();
  });

  async function importFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    let backup;
    try {
      backup = JSON.parse(await file.text());
      if (backup.app !== 'baty-recipes') throw new Error('not ours');
    } catch {
      toast("That file isn't a Baty Recipes backup.");
      return;
    }
    const when = backup.exportedAt ? new Date(backup.exportedAt).toLocaleString('en-AU') : 'unknown date';
    const c = await dialog(`<h2>Restore this backup?</h2>
      <p>Backup from <strong>${esc(when)}</strong>.</p>
      <p>It will <strong>replace</strong> the data on this ${isStandalone() ? 'app' : 'browser'}.</p>
      <div class="stack"><button class="btn primary" value="yes">Restore</button><button class="btn ghost" value="">Cancel</button></div>`);
    if (c !== 'yes') return;
    try {
      store.importAll(backup);
      applySettings();
      toast('Backup restored');
      draw();
    } catch (err) {
      toast(err.message);
    }
  }

  draw();
}

/** Save a backup file. On iPhone the share sheet lets you "Save to Files"; otherwise it downloads. */
export async function exportData() {
  const backup = store.exportAll(swVersion);
  const json = JSON.stringify(backup, null, 2);
  const filename = `baty-recipes-backup-${isoDate()}.json`;
  const file = new File([json], filename, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Baty Recipes backup' });
      return;
    } catch (e) {
      if (e?.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast('Backup downloaded');
}
