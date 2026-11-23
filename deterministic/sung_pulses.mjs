// Sung repeats and ad-libs (Jefferson, rough cuts 2 and 4, 22 November 2026). Generic: it takes the scene and a list
// of sung events { text, t (s), display?, source }. Events whose source is 'lyric map' are the lyric's own words and
// are left to their own placed copies (an echo or a pulse never stands in for a lyric-map word, amendment 7).
//
// For every other event (a chant repeat or an ad-lib), in phrases (events under PHRASE_GAP_S apart, amendment 3):
//   1. a word with the same text that is wholly in frame, facing the camera, unoccluded, at least MIN_PULSE_H of the
//      frame high and still, gets the beat pulse on the onset (amendment 9: never a cropped, tiny or hidden word);
//   2. the tokens of the phrase that have no such word are shown as an echo: one new word carrying those tokens in
//      reading order, beside the newest word held in frame (left or above first, so the phrase reads into it). It pops
//      strongly into place on the first token's onset, holds ECHO_HOLD frames at full size, then grows to ECHO_GROW
//      while it fades over ECHO_FADE frames (amendment 2, Fable 22). It ends before the next camera move.
//   3. When the screen is busy (no free spot) or the camera leaves too soon, the repeat is dropped and logged with its
//      reason (Jefferson, 22 November 2026: dropping a word under busyness is fine; ad-libs and repeats go first).
// Echo geometry (amendment 1): the box, cap, font size and padding scale together, the width comes from the font
// metrics, and a floating echo is ECHO_SCREEN_H of the full frame height.
import './interp.js';
import { textWidth, fullyShown, SHOWN_FRAMES } from './shown_gate.mjs';
import { KIT, isJerseyFont } from './style.mjs';

export const SYNC = Object.freeze({ PLACED_BEFORE_S: 3.0, LATE_FRAMES: 2 }); // shared with whole_song_checks.mjs
const HIT_LEAD = 1 / 30;      // the swell starts one frame early so its first visible growth lands on the onset
const MIN_PULSE_GAP_S = 0.2;  // a word already pulsing this close to the onset is left alone
const PHRASE_GAP_S = 0.5;
const MIN_PULSE_H = 0.08;     // share of the frame height
const ECHO_HOLD = 12, ECHO_FADE = 12, ECHO_GROW = 1.3, ECHO_SCREEN_H = 0.22, MIN_ECHO_FRAMES = Math.max(SHOWN_FRAMES, 8);

const add = (a, b) => a.map((x, i) => x + b[i]);
const mul = (a, k) => a.map(x => x * k);
export const normText = t => String(t).toUpperCase().replace(/[^A-Z0-9']/g, '');

const drawnAt = (w, f) => w.on <= f && (w.off == null || w.off > f);
function screenBox(I, w, f, pose, vfov, scale = 1) {
  const X = w.motion?.length ? I.wordXform(w, f) : (p => p);
  const q = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => I.project(X(add(w.C, add(mul(w.R, a * scale * w.w / 2), mul(w.U, b * scale * w.h / 2)))), pose, vfov));
  if (q.some(v => !v)) return null;
  const xs = q.map(v => v.x), ys = q.map(v => v.y);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), depth: q.reduce((s, v) => s + v.depth, 0) / 4 };
}
const overlapArea = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

// The frame of the next camera move that starts after f (Infinity when the camera holds to the end).
function nextMoveFrame(scene, f) {
  const sig = p => JSON.stringify([p.target, p.N, p.dist].flat().map(x => Math.round(x)));
  for (const k of scene.cams) if (k.f0 > f && sig(k.from) !== sig(k.to)) return k.f0;
  return Infinity;
}

export function addSungPulses(scene, events) {
  const I = globalThis.KT_INTERP, fps = scene.meta.fps ?? 30, vfov = scene.meta.vfov ?? 40;
  const words = scene.words.filter(w => !w.replaced_by && !w.reveal_copy_of && !w.echo);
  const added = [], skipped = [], echoes = [];
  const repeats = [...events].filter(e => e.source !== 'lyric map' && normText(e.text)).sort((a, b) => a.t - b.t);
  const phrases = [];
  for (const ev of repeats) {
    const last = phrases.at(-1);
    const same = last && (last.at(-1).source ?? '') === (ev.source ?? '') && (last.at(-1).line ?? null) === (ev.line ?? null);
    if (same && ev.t - last.at(-1).t < PHRASE_GAP_S) last.push(ev); else phrases.push([ev]);
  }
  const pulseTarget = (key, f) => {
    const pose = I.poseAt(scene.cams, f);
    const cands = words.filter(w => normText(w.text) === key && w.on < f - 1 && drawnAt(w, f + 8)
      && !I.wordMoving(w, f) && fullyShown(w, f, pose, vfov) && fullyShown(w, f + 8, I.poseAt(scene.cams, f + 8), vfov));
    const ok = [];
    for (const w of cands) {
      const b = screenBox(I, w, f, pose, vfov);
      if (!b || (b.y1 - b.y0) / 2 < MIN_PULSE_H) continue;
      const area = (b.x1 - b.x0) * (b.y1 - b.y0);
      const hidden = scene.words.some(o => o !== w && !o.reveal_copy_of && drawnAt(o, f) && (() => {
        const ob = screenBox(I, o, f, pose, vfov);
        return ob && ob.depth < b.depth - 1e-6 && overlapArea(ob, b) >= 0.3 * area;
      })());
      if (!hidden) ok.push(w);
    }
    return ok.sort((a, b) => b.on - a.on)[0] ?? null;
  };
  for (const ph of phrases) {
    const missing = [];
    for (const ev of ph) {
      const f = Math.round(ev.t * fps), key = normText(ev.text);
      const w = pulseTarget(key, f);
      if (!w) { missing.push(ev); continue; }
      const tp = ev.t - HIT_LEAD;
      if ((w.pulses ?? []).some(p => Math.abs(p - tp) < MIN_PULSE_GAP_S)) continue; // already pulses there (a hand-timed chant)
      w.pulses = [...(w.pulses ?? []), tp].sort((a, b) => a - b);
      added.push({ id: w.id, text: w.text, t: +ev.t.toFixed(3), frame: f, source: ev.source ?? 'repeat', treatment: 'pulse' });
    }
    // Contiguous missing tokens become one echo phrase.
    const runs = [];
    for (const ev of missing) {
      const r = runs.at(-1);
      if (r && ph.indexOf(ev) === ph.indexOf(r.at(-1)) + 1) r.push(ev); else runs.push([ev]);
    }
    for (const run of runs) {
      const f = Math.round(run[0].t * fps);
      const e = addEcho(scene, run, f, words, echoes);
      const label = run.map(e2 => e2.display ?? e2.text).join(' ');
      if (e?.id) { echoes.push(e); added.push({ id: e.id, text: e.text, t: +run[0].t.toFixed(3), frame: f, source: run[0].source ?? 'repeat', treatment: `echo, ${e.off - e.on} frames` }); }
      else skipped.push(`dropped: ${label} at ${run[0].t.toFixed(2)} s, not on screen and ${e?.why ?? 'no room for an echo'}`);
    }
  }
  scene.words.push(...echoes);
  return { added, skipped, echoes: echoes.length };
}

function addEcho(scene, run, f, words, echoes) {
  const I = globalThis.KT_INTERP, vfov = scene.meta.vfov ?? 40;
  const pose = I.poseAt(scene.cams, f);
  const end = Math.min(f + ECHO_HOLD + ECHO_FADE, nextMoveFrame(scene, f), scene.meta.whole_song?.revealF0 ?? Infinity);
  if (end - f < MIN_ECHO_FRAMES) return { why: `the camera moves ${end - f} frames after the onset (too dense: under ${MIN_ECHO_FRAMES})` };
  const text = run.map(e => e.display ?? e.text).join(' ');
  const held = words.filter(w => drawnAt(w, f) && w.on < f && fullyShown(w, f, pose, vfov)).sort((a, b) => b.on - a.on)[0];
  if (!held) return { why: 'no word is held whole in frame to place it beside' };
  const A = held;
  const near = [...words.filter(w => drawnAt(w, f) || (w.on > f && w.on < end)), ...echoes.filter(e => e.on < end && e.off > f)];
  const boxes = list => list.map(x => screenBox(I, x, Math.max(f, x.on), pose, vfov, x.echo ? ECHO_GROW : 1)).filter(Boolean);
  let busy = boxes(near);
  const echoFont = isJerseyFont(A.font) && normText(text) !== normText(A.text) ? KIT.accent : A.font;
  const geometry = (C, h) => {
    const k = h / A.h, fontPx = A.fontPx * k, pad = (A.pad ?? 0.08 * A.cap) * k;
    return { C, h, cap: A.cap * k, fontPx, pad, font: echoFont, w: textWidth(text, echoFont, fontPx) + 2 * pad };
  };
  const fits = g => {
    const probe = { ...A, ...g, motion: [] };
    const core = screenBox(I, probe, f, pose, vfov), big = screenBox(I, probe, f, pose, vfov, ECHO_GROW);
    if (!core || !big || core.x0 < -0.95 || core.x1 > 0.95 || core.y0 < -0.95 || core.y1 > 0.95) return false;
    return !busy.some(o => big.x0 < o.x1 && o.x0 < big.x1 && big.y0 < o.y1 && o.y0 < big.y1);
  };
  // Beside the held word at its own size: left, above (reading into it), then right, below, diagonals.
  const spots = [[-1, 0], [0, 1], [1, 0], [0, -1], [-1, 1], [1, 1], [-1, -1], [1, -1]];
  for (const [sx, sy] of spots) {
    const g0 = geometry(A.C, A.h), gap = 0.25 * A.h;
    const dx = sx * ((A.w + g0.w) / 2 + gap), dy = sy * (A.h + gap);
    const g = geometry(A.C.map((x, i) => x + A.R[i] * dx + A.U[i] * dy), A.h);
    if (fits(g)) return makeEcho(A, run, f, end, g, text);
  }
  // The held word fills the shot: float the echo just in front of it at a free screen spot, ECHO_SCREEN_H of the
  // frame height (the full height is 2 * depth * tan(vfov / 2)). It may cover the held word (which has had its
  // moment), never another word.
  busy = boxes(near.filter(x => x !== A));
  const v = Math.tan((vfov * Math.PI / 180) / 2), aspect = 16 / 9;
  const cam = pose.position;
  const P0 = A.C.map((x, i) => x + A.N[i] * 0.3 * A.h);
  for (const [sx, sy] of [[-0.5, 0.6], [0, 0.65], [0.5, 0.6], [-0.5, -0.6], [0, -0.65], [0.5, -0.6]]) {
    const dir = pose.N.map((n, i) => -n + pose.R[i] * sx * v * aspect + pose.U[i] * sy * v);
    const den = dir.reduce((a, x, i) => a + x * A.N[i], 0);
    if (Math.abs(den) < 1e-6) continue;
    const tHit = P0.map((x, i) => x - cam[i]).reduce((a, x, i) => a + x * A.N[i], 0) / den;
    if (!(tHit > 0)) continue;
    const C = cam.map((x, i) => x + dir[i] * tHit);
    const g = geometry(C, 2 * tHit * v * ECHO_SCREEN_H);
    if (fits(g)) return makeEcho(A, run, f, end, g, text);
  }
  return { why: 'no free spot beside the held word (screen busy)' };
}

function makeEcho(A, run, f, end, g, text) {
  const growF0 = Math.min(f + ECHO_HOLD, end - 1);
  const opacity = [];
  for (let k = growF0; k <= end; k++) opacity.push([k, +(1 - (k - growF0) / Math.max(1, end - growF0)).toFixed(3)]);
  return {
    ...structuredClone(A), id: `${A.id}e${f}`, text, echo: true, echo_of_events: run.map(e => e.t), ...g,
    on: f, off: end, stamp: false, reveal_on: null, reveal_stamp: false, t: undefined,
    joint: { prim: 'echo', family: 'echo', mode: 'land', f0: f, f1: f },
    motion: end - growF0 > 1 ? [{ f0: growF0, f1: end, ease: { a: 1, b: 1, x0: 0.5 }, kind: 'scale', P: g.C, from: 1, to: ECHO_GROW }] : [],
    clip: [], opacity, pulses: undefined, pre_offset: undefined, style: 'white', colours: {}, stripes: undefined, jersey: undefined,
  };
}

// Instrumental beat pulses (Jefferson, rough cut 4, 22 November 2026: a pulse on visible words is filler for when no
// new word can be shown, and pulsing on the beat is better than nothing). In every stretch of INSTRUMENTAL_GAP_S or
// more with no sung event, the newest word held whole in frame and still pulses on every second beat (beats 1 and 3
// of the bar, so it never turns frantic), keeping BEAT_CLEAR_S clear of the sung onsets either side.
const INSTRUMENTAL_GAP_S = 2.0, BEAT_CLEAR_S = 0.4;
export function addBeatPulses(scene, events, beats, { until = Infinity } = {}) {
  const I = globalThis.KT_INTERP, fps = scene.meta.fps ?? 30, vfov = scene.meta.vfov ?? 40;
  const sung = events.map(e => e.t).sort((a, b) => a - b);
  const words = scene.words.filter(w => !w.reveal_copy_of && !w.replaced_by);
  const added = [];
  for (const b of beats) {
    if (!(b.beat_in_bar === 1 || b.beat_in_bar === 3)) continue;
    const f = Math.round(b.t * fps);
    if (f >= until) break;
    const prev = sung.filter(t => t <= b.t).at(-1) ?? -Infinity, next = sung.find(t => t > b.t) ?? Infinity;
    if (next - prev < INSTRUMENTAL_GAP_S || b.t - prev < BEAT_CLEAR_S || next - b.t < BEAT_CLEAR_S) continue;
    const pose = I.poseAt(scene.cams, f), pose2 = I.poseAt(scene.cams, f + 8);
    const w = words.filter(x => x.on < f - 1 && drawnAt(x, f + 8) && !I.wordMoving(x, f) && fullyShown(x, f, pose, vfov) && fullyShown(x, f + 8, pose2, vfov))
      .sort((a, c) => c.on - a.on)[0];
    if (!w) continue;
    const tp = b.t - HIT_LEAD;
    if ((w.pulses ?? []).some(p => Math.abs(p - tp) < MIN_PULSE_GAP_S)) continue;
    w.pulses = [...(w.pulses ?? []), tp].sort((a, c) => a - c);
    added.push({ id: w.id, text: w.text, t: +b.t.toFixed(3), frame: f });
  }
  return added;
}
