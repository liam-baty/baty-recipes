// Cooking timers.
// - findDurations() spots "10 minutes", "1–2 minutes", "2 hours", "30 sec" in a step.
// - Timers store their finish time, so they stay correct if the app is closed and reopened.
// - When one finishes: full-screen alert, beeping (Web Audio) and vibration where supported.
//   Note: iPhone pauses web apps when the screen locks or you switch apps, so the beep
//   can only sound while the app is open. Cook mode keeps the screen awake to help.

import { esc } from './util.js';
import { getRaw, setRaw } from './storage.js';

const UNIT_SECS = { h: 3600, hr: 3600, hrs: 3600, hour: 3600, hours: 3600, min: 60, mins: 60, minute: 60, minutes: 60, sec: 1, secs: 1, second: 1, seconds: 1 };
const NUMW = '(\\d+(?:\\.\\d+)?|½|an?|one)';
const DUR_RE = new RegExp(`\\b${NUMW}(?:\\s*(?:–|—|-|to)\\s*(\\d+(?:\\.\\d+)?))?\\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\\b`, 'gi');

function num(s) {
  s = s.toLowerCase();
  if (s === 'a' || s === 'an' || s === 'one') return 1;
  if (s === '½') return 0.5;
  return parseFloat(s);
}

/** Find durations in text: [{ index, length, text, min, max }] (seconds) */
export function findDurations(text) {
  const out = [];
  for (const m of text.matchAll(DUR_RE)) {
    const unit = UNIT_SECS[m[3].toLowerCase()];
    const a = num(m[1]) * unit;
    const b = m[2] ? num(m[2]) * unit : null;
    if (!a) continue;
    out.push({ index: m.index, length: m[0].length, text: m[0], min: a, max: b });
  }
  return out;
}

/**
 * Wrap durations in a step with tap-to-start timer buttons.
 * `html` must already be escaped; `raw` is the plain text used to find positions.
 * Ranges start with the shorter time — use "+1 min" on the running timer if needed.
 */
export function withTimerButtons(raw, label, toHtml = esc) {
  const found = findDurations(raw);
  if (!found.length) return toHtml(raw);
  let out = '', pos = 0;
  for (const f of found) {
    out += toHtml(raw.slice(pos, f.index));
    out += `<button type="button" class="timer-chip" data-timer="${f.min}" data-timer-label="${esc(label)}"` +
      ` aria-label="Start a ${esc(f.text)} timer">⏱ ${esc(f.text)}</button>`;
    pos = f.index + f.length;
  }
  return out + toHtml(raw.slice(pos));
}

// ---------------------------------------------------------------------------
// Running timers
// ---------------------------------------------------------------------------

let timers = getRaw('timers', []); // [{ id, label, duration, endAt, pausedLeft }]
let tick = null;
let audio = null;
let ringing = null;

function save() { setRaw('timers', timers); }

export function fmtClock(secs) {
  secs = Math.max(0, Math.ceil(secs));
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

function left(t) {
  return t.pausedLeft != null ? t.pausedLeft : (t.endAt - Date.now()) / 1000;
}

export function start(seconds, label) {
  unlockAudio(); // must happen during the tap so iPhone allows sound later
  timers.push({ id: Math.random().toString(36).slice(2), label, duration: seconds, endAt: Date.now() + seconds * 1000, pausedLeft: null });
  save();
  run();
}

export function addTime(id, seconds) {
  const t = timers.find((x) => x.id === id);
  if (!t) return;
  if (t.pausedLeft != null) t.pausedLeft += seconds; else t.endAt += seconds * 1000;
  save(); render();
}

export function togglePause(id) {
  const t = timers.find((x) => x.id === id);
  if (!t) return;
  if (t.pausedLeft != null) { t.endAt = Date.now() + t.pausedLeft * 1000; t.pausedLeft = null; }
  else t.pausedLeft = left(t);
  save(); render();
}

export function cancel(id) {
  timers = timers.filter((x) => x.id !== id);
  save(); render();
}

function run() {
  render();
  if (!tick && timers.length) tick = setInterval(check, 500);
}

function check() {
  const done = timers.filter((t) => t.pausedLeft == null && left(t) <= 0);
  for (const t of done) {
    timers = timers.filter((x) => x !== t);
    ring(t);
  }
  if (done.length) save();
  if (!timers.length) { clearInterval(tick); tick = null; }
  render();
}

function render() {
  const tray = document.getElementById('timer-tray');
  if (!tray) return;
  tray.hidden = !timers.length;
  document.body.classList.toggle('has-timers', timers.length > 0);
  tray.innerHTML = timers.map((t) => `
    <div class="timer ${t.pausedLeft != null ? 'paused' : ''}">
      <button type="button" class="timer-main" data-t-pause="${t.id}" aria-label="${t.pausedLeft != null ? 'Resume' : 'Pause'} timer">
        <span class="timer-time">${fmtClock(left(t))}</span>
        <span class="timer-label">${esc(t.label)}</span>
      </button>
      <button type="button" class="timer-btn" data-t-add="${t.id}" aria-label="Add one minute">+1m</button>
      <button type="button" class="timer-btn" data-t-cancel="${t.id}" aria-label="Cancel timer">✕</button>
    </div>`).join('');
}

// ---------------------------------------------------------------------------
// Alarm: sound + vibration + full-screen message
// ---------------------------------------------------------------------------

function unlockAudio() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    // Play a silent blip so iOS treats audio as user-started
    const o = audio.createOscillator(), g = audio.createGain();
    g.gain.value = 0; o.connect(g).connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.01);
  } catch { audio = null; }
}

function beep() {
  if (!audio) return;
  try {
    if (audio.state === 'suspended') audio.resume();
    const now = audio.currentTime;
    for (let i = 0; i < 3; i++) {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'square'; o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, now + i * 0.3);
      g.gain.exponentialRampToValueAtTime(0.25, now + i * 0.3 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.3 + 0.2);
      o.connect(g).connect(audio.destination);
      o.start(now + i * 0.3); o.stop(now + i * 0.3 + 0.22);
    }
  } catch { /* sound not available */ }
}

function ring(t) {
  const box = document.getElementById('alarm');
  document.getElementById('alarm-text').textContent = `${t.label} (${fmtClock(t.duration)})`;
  box.hidden = false;
  clearInterval(ringing);
  const pulse = () => { beep(); navigator.vibrate?.([300, 150, 300]); };
  pulse();
  ringing = setInterval(pulse, 1500);
  // Stop by itself after 2 minutes
  setTimeout(stopAlarm, 120000);
}

export function stopAlarm() {
  clearInterval(ringing); ringing = null;
  const box = document.getElementById('alarm');
  if (box) box.hidden = true;
}

/** Wire up the tray buttons and timer chips. Called once from app.js. */
export function init() {
  document.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-timer]');
    if (chip) {
      e.preventDefault(); e.stopPropagation();
      start(Number(chip.dataset.timer), chip.dataset.timerLabel || 'Timer');
      return;
    }
    const p = e.target.closest('[data-t-pause]'); if (p) return togglePause(p.dataset.tPause);
    const a = e.target.closest('[data-t-add]'); if (a) return addTime(a.dataset.tAdd, 60);
    const c = e.target.closest('[data-t-cancel]'); if (c) return cancel(c.dataset.tCancel);
  }, true);
  document.getElementById('alarm-stop').addEventListener('click', stopAlarm);
  // Coming back to the app: catch any timers that finished while away
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  run();
  if (timers.length) check();
}
