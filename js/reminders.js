// Send items to a shared Reminders list.
//
// iPhone doesn't let web apps add reminders directly, so we hand the items to an
// Apple Shortcut you set up once (Settings → Shared Reminders shows how). The
// Shortcut splits the text into lines and adds each line as a reminder in your
// shared list, which iCloud then syncs to everyone the list is shared with.
//
// The hand-over uses the Shortcuts app's link format:
//   shortcuts://run-shortcut?name=Baty%20Reminders&input=text&text=6%20onions%0A2%20L%20milk

import * as store from './storage.js';
import { toast } from './util.js';

export const DEFAULT_SHORTCUT = 'Baty Reminders';

/** Has the user switched this on in Settings? (Buttons stay hidden until they do.) */
export function enabled() {
  return !!store.get('settings').reminders;
}

/** The Shortcuts link for some lines of text, or null if there's nothing to send. */
export function urlFor(lines, name = store.get('settings').remindersShortcut || DEFAULT_SHORTCUT) {
  const clean = lines.map((l) => String(l).replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (!clean.length) return null;
  return `shortcuts://run-shortcut?name=${encodeURIComponent(name)}&input=text&text=${encodeURIComponent(clean.join('\n'))}`;
}

/** Send lines of text to the Shortcut. Returns true if the Shortcuts app was opened. */
export function send(lines) {
  const url = urlFor(lines);
  if (!url) { toast('Nothing to send'); return false; }
  window.location.href = url;
  return true;
}
