// Whole-song checks on the joined scene (Jefferson, rough cuts 2 and 4, 22 November 2026). Generic. Every test reads
// visible ink (shown_gate.mjs: the viewer's texture maths, the camera projection, front-facing), never on/off alone.
//   checkSync: each lyric-map word is matched to its own placed word (same text, same sung time, each word used
//     once). It is late when it switches on more than SYNC.LATE_FRAMES after its onset. A word that is never wholly
//     in frame from 2 frames before to 8 frames after its onset is listed as dropped (allowed under busyness; logged).
//   checkHolds (the idleness gate, hard): every sung event must fall within MAX_HOLD_S after visible activity: a word
//     appearing whole in frame, a visible camera move, a picture element arriving, or a pulse. A pulse counts for a
//     sung event only when the pulsed word has the event's own text, or when nothing is being sung (an instrumental
//     beat pulse). A pulse on a held word never stands in for a different sung word.
import './interp.js';
import { normText, SYNC } from './sung_pulses.mjs';
import { fullyShown, inkOk, appearanceFrame } from './shown_gate.mjs';

export const LATE_FRAMES = SYNC.LATE_FRAMES, MAX_HOLD_S = 2.0;
const PULSE_MATCH = 3;     // frames between a sung onset and a pulse on its own text
const SING_NEAR = 6;       // a pulse within this many frames of any sung onset is not an instrumental pulse
const MOVE_VISIBLE = 0.004; // camera moves below this share of the frame per frame are not visible activity

export function checkSync(scene, events) {
  const I = globalThis.KT_INTERP, fps = scene.meta.fps ?? 30, vfov = scene.meta.vfov ?? 40;
  const lyric = scene.words.filter(w => !w.reveal_copy_of && !w.echo && w.t != null);
  const used = new Set(), late = [], dropped = [];
  for (const ev of [...events].filter(e => e.source === 'lyric map').sort((a, b) => a.t - b.t)) {
    const k = normText(ev.text), f = Math.round(ev.t * fps);
    if (!k) continue;
    const w = lyric.filter(x => !used.has(x.id) && normText(x.text) === k && Math.abs(x.t - ev.t) < 0.05).sort((a, b) => Math.abs(a.t - ev.t) - Math.abs(b.t - ev.t))[0];
    if (!w) {
      const el = scene.words.find(x => x.replaced_by && normText(x.text) === k);
      if (!el) dropped.push(`${ev.text} sung at ${ev.t.toFixed(2)} s (frame ${f}): no placed word`);
      continue;
    }
    used.add(w.id);
    if (w.on > f + LATE_FRAMES) late.push(`${w.id} ${w.text}: switches on at frame ${w.on}, sung at ${f} (${w.on - f} frames late)`);
    let shown = false;
    for (let g = f - 2; g <= f + 8 && !shown; g++) shown = fullyShown(w, g, I.poseAt(scene.cams, g), vfov);
    if (!shown) dropped.push(`${w.id} ${w.text} sung at ${ev.t.toFixed(2)} s (frame ${f}): never wholly in frame around its onset`);
  }
  return { late, dropped, pass: !late.length };
}

export function checkHolds(scene, events, { until = Infinity } = {}) {
  const I = globalThis.KT_INTERP, fps = scene.meta.fps ?? 30, vfov = scene.meta.vfov ?? 40;
  const sungF = events.map(e => ({ f: Math.round(e.t * fps), k: normText(e.text), e })).filter(x => x.k && x.f < until).sort((a, b) => a.f - b.f);
  const act = new Set();
  // Words appearing whole, with ink that renders.
  for (const w of scene.words.filter(x => !x.reveal_copy_of && x.on < until)) {
    if (!inkOk(w)) continue;
    const A = appearanceFrame(w);
    if (fullyShown(w, A, I.poseAt(scene.cams, A), vfov)) for (let f = w.on; f <= A; f++) act.add(f);
  }
  // Visible camera moves: the frame centre or the scale changes by more than MOVE_VISIBLE of the frame per frame.
  const tv = Math.tan(((scene.meta.vfov ?? 40) * Math.PI) / 360);
  for (const c of scene.cams) {
    if (c.f1 === c.f0) { act.add(c.f0); continue; } // a cut is a visible change
    for (let f = Math.max(c.f0, 1); f <= c.f1; f++) {
      const a = I.poseAt(scene.cams, f - 1), b = I.poseAt(scene.cams, f);
      const shift = Math.hypot(...b.target.map((x, i) => x - a.target[i])) / (2 * a.dist * tv);
      const zoom = Math.abs(Math.log(b.dist / a.dist));
      const turn = Math.acos(Math.min(1, a.N.reduce((s, x, i) => s + x * b.N[i], 0)));
      if (shift > MOVE_VISIBLE || zoom > MOVE_VISIBLE || turn > 0.0035) act.add(f);
    }
  }
  for (const e of scene.elements ?? []) if (e.on != null) act.add(e.on);
  // Pulses: instrumental ones are general activity; others count only for a sung event with their own text.
  const ownPulse = new Map(); // text -> frames
  for (const w of scene.words.filter(x => !x.reveal_copy_of)) for (const t of w.pulses ?? []) {
    const p = Math.round(t * fps);
    if (!fullyShown(w, p, I.poseAt(scene.cams, p), vfov)) continue;
    const k = normText(w.text);
    (ownPulse.get(k) ?? ownPulse.set(k, []).get(k)).push(p);
    if (!sungF.some(s => Math.abs(s.f - p) <= SING_NEAR)) for (let f = p; f < p + 9; f++) act.add(f);
  }
  const frames = [...act].sort((a, b) => a - b);
  const lastBefore = f => { let lo = 0, hi = frames.length - 1, r = -Infinity; while (lo <= hi) { const m = (lo + hi) >> 1; if (frames[m] <= f) { r = frames[m]; lo = m + 1; } else hi = m - 1; } return r; };
  const idle = [];
  for (const s of sungF) {
    if ((ownPulse.get(s.k) ?? []).some(p => Math.abs(p - s.f) <= PULSE_MATCH)) continue;
    const last = lastBefore(s.f);
    if (s.f - last > MAX_HOLD_S * fps) idle.push({ f: s.f, text: s.e.text, since: last, seconds: +((s.f - last) / fps).toFixed(2) });
  }
  // Group idle events into stretches for the report.
  const holds = [];
  for (const x of idle) {
    const h = holds.at(-1);
    if (h && h.since === x.since) { h.to = x.f; h.seconds = x.seconds; h.sungInside++; h.words.push(x.text); }
    else holds.push({ from: x.since, since: x.since, to: x.f, seconds: x.seconds, sungInside: 1, words: [x.text] });
  }
  const longest = holds.reduce((m, h) => (h.seconds > (m?.seconds ?? 0) ? h : m), null);
  return { holds, longest, pass: !holds.length };
}
