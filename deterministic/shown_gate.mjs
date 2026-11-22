// A shown word is shown whole (Jefferson, rough cut 4, 22 November 2026, condensed: "When a word is revealed, it
// should be revealed fully ... It should never appear but not be fully visible ... Either show it or don't show it.")
// Generic; no song names.
//
// Gate (hard; no severity fallback, demotion or ruling waives it), on the focused word only: from the frame a sung
// word comes to rest (appearanceFrame) through its sung onset, and for at least SHOWN_FRAMES, it is wholly in frame:
// all four corners in front of the camera and inside the frame, facing the camera, switched on, not faded, and with
// ink the viewer can draw (inkOk). Before it comes to rest it may sweep in (a rail or a camera move carrying it), but
// it may not sit still partly in frame. Words that had their moment may be cropped later; nothing here judges them.
// A word that is wholly out of frame is not a gate failure: it is a dropped word (allowed when the screen is busy,
// Jefferson's correction of 22 November 2026), logged, and the repair still tries to show it.
//
// Repair (the planner changes the plan until the gate holds): for each failing word, in onset order,
//   0. a word without entrance motion switches on later, when the frame has room, by its onset at the latest;
//   1. if the next camera move frames it, that move starts earlier so it lands when the word appears, by at most
//      PICKUP_CAP frames (the 0.5 s pickup cap), keeping MIN_STILL still frames on the outgoing hold;
//   2. if it appears whole but the camera leaves too soon, the next move starts later (shorter, never under
//      MIN_MOVE frames) or a cut is held back a few frames;
//   3. otherwise the hold it appears in is reframed to fit every word that appears or is sung in it, riders included,
//      as tightly as the 0.94 x 0.90 reading margins allow (tight composition).
// A repair is kept only when it lowers the cost (a partly shown word costs 1000, a dropped word 1).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './interp.js';

export const SHOWN_FRAMES = 6, ONSET_SLACK = 2, PICKUP_CAP = 15, MIN_STILL = 8, MIN_MOVE = 4;
const add = (a, b) => a.map((x, i) => x + b[i]);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const mul = (a, k) => a.map(x => x * k);
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

const opacityAt = (w, f) => {
  let v = 1;
  for (const [k, x] of w.opacity ?? []) if (k <= f) v = x;
  return v;
};
// Posed corners of w at frame f (motion applied), or null when it is not drawn.
function cornersAt(w, f) {
  const I = globalThis.KT_INTERP;
  if (!(w.on <= f) || (w.off != null && f >= w.off) || opacityAt(w, f) <= 0.05) return null;
  const X = I.wordXform(w, f);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => X(add(w.C, add(mul(w.R, a * w.w / 2), mul(w.U, b * w.h / 2)))));
}
// Ink check with viewer.html's texture maths (wordTexture): the canvas is w x h at px = 220 / cap, the glyphs are
// fontPx * px high with their cap line at canvas mid-height + cap * px / 2. The letters fit the texture only when the
// box is at least one cap high and as wide as the text. A word that fails draws blank or cut (the rough cut 4 echoes:
// cap 222.7 on a box 56.4 high), so it is not shown, whatever its on and off frames say.
const METRICS = JSON.parse(fs.readFileSync(process.env.KTE_METRICS ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '../fonts/room-for-one-variety.metrics.json'), 'utf8')).fonts;
export function textWidth(text, font, fontPx) {
  const m = METRICS[font] ?? METRICS.anton;
  let a = 0;
  for (const ch of String(text)) a += m.adv[ch] ?? m.fallback;
  return a * fontPx;
}
export function inkOk(w) {
  if (!(w.cap > 0) || !(w.h > 0) || !(w.w > 0)) return false;
  if (w.h < w.cap * 0.999) return false;
  if (w.jersey) return true; // the jersey face is fitted to the box by the viewer
  return !(w.fontPx > 0) || textWidth(w.text, w.font, w.fontPx) <= w.w * 1.02;
}
export function fullyShown(w, f, pose, vfov) {
  const I = globalThis.KT_INTERP;
  if (!inkOk(w)) return false;
  const cs = cornersAt(w, f);
  if (!cs) return false;
  for (const c of cs) {
    const q = I.project(c, pose, vfov);
    if (!q || Math.abs(q.x) > 1 || Math.abs(q.y) > 1) return false;
  }
  const sgn = Math.sign(dot(cross(w.R, w.U), w.N)) || 1;
  const Nt = mul(cross(sub(cs[1], cs[0]), sub(cs[3], cs[0])), sgn);
  const mid = mul(add(cs[0], cs[2]), 0.5);
  return dot(Nt, sub(pose.position, mid)) > 0;
}

// Sung words of a scene: { w, onsetF }. `onsetOf(w)` returns the onset frame or null for words that are not sung.
export function sungWords(scene, onsetOf) {
  return scene.words.filter(w => !w.reveal_copy_of && !w.echo && !w.replaced_by)
    .map(w => ({ w, onsetF: onsetOf(w) })).filter(x => x.onsetF != null);
}
export function gateFailures(scene, onsetOf, { until = Infinity } = {}) {
  const I = globalThis.KT_INTERP, vfov = scene.meta.vfov ?? 40;
  const poseCache = new Map(), poseAt = f => poseCache.get(f) ?? poseCache.set(f, I.poseAt(scene.cams, f)).get(f);
  const out = [];
  for (const { w, onsetF } of sungWords(scene, onsetOf)) {
    if (onsetF >= until) continue;
    const A = appearanceFrame(w);
    const why = [];
    // When it is sung relative to its appearance is the sync checks' business (13.1.9, checkSync), not this gate's.
    // The focused word stays whole from its appearance through its sung moment, and for at least SHOWN_FRAMES.
    const last = Math.max(A + SHOWN_FRAMES - 1, onsetF);
    let whole = 0, part = 0;
    for (let f = A; f <= last; f++) { if (fullyShown(w, f, poseAt(f), vfov)) whole++; else if (partlyShown(w, f, poseAt(f), vfov)) part++; }
    if (whole < last - A + 1) why.push(`whole on ${whole}, partly shown on ${part} of the ${last - A + 1} frames from its appearance at ${A} through its onset`);
    // Before it comes to rest a word may sweep in (word or camera moving); it may never sit still partly in frame.
    let stuck = 0;
    for (let f = w.on; f < A; f++) {
      if (!partlyShown(w, f, poseAt(f), vfov)) continue;
      const camMoving = f > 0 && poseAt(f - 1) && JSON.stringify(poseAt(f - 1).target) !== JSON.stringify(poseAt(f).target);
      if (!I.wordMoving(w, f) && !camMoving) stuck++;
    }
    if (stuck > 1) why.push(`sits still partly out of frame on ${stuck} frames before it comes to rest`);
    // Partly shown while focused is the hard failure; wholly out of frame is a dropped word (allowed under busyness,
    // logged, and the repair still tries to show it).
    if (why.length) out.push({ id: w.id, text: w.text, onsetF, appear: A, kind: part > 0 || stuck > 1 ? 'partial' : 'unshown', why: why.join('; ') });
  }
  return out;
}
// The frame a word comes to rest: its switch-on frame, or the end of its entrance (a pivot-carried word rests when
// the turn lands).
export function appearanceFrame(w) {
  const j = w.joint;
  if (!j || ['pop', 'travel', 'echo'].includes(j.prim) || !(j.f1 > w.on)) return w.on;
  return j.f1;
}
function partlyShown(w, f, pose, vfov) {
  const I = globalThis.KT_INTERP;
  const cs = cornersAt(w, f);
  if (!cs) return false;
  const q = cs.map(c => I.project(c, pose, vfov));
  if (q.every(x => !x)) return false;
  const v = q.filter(Boolean);
  const inside = Math.min(...v.map(x => x.x)) < 1 && Math.max(...v.map(x => x.x)) > -1 && Math.min(...v.map(x => x.y)) < 1 && Math.max(...v.map(x => x.y)) > -1;
  return inside && !fullyShown(w, f, pose, vfov);
}

// Pose with the same orientation that fits the posed corners of `ws` (each at its own frame) with reading margins.
function fitPose(pose, pts, vfov, mx = 0.94, my = 0.90) {
  const tv = Math.tan((vfov * Math.PI) / 360), th = tv * 16 / 9;
  const loc = pts.map(p => { const d = sub(p, pose.target); return [dot(d, pose.R), dot(d, pose.U), dot(d, pose.N)]; });
  const u0 = Math.min(...loc.map(l => l[0])), u1 = Math.max(...loc.map(l => l[0]));
  const v0 = Math.min(...loc.map(l => l[1])), v1 = Math.max(...loc.map(l => l[1]));
  const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2;
  let dist = 0;
  for (const [u, v, n] of loc) dist = Math.max(dist, Math.abs(u - uc) / (mx * th) + n, Math.abs(v - vc) / (my * tv) + n);
  const target = add(pose.target, add(mul(pose.R, uc), mul(pose.U, vc)));
  return { target, R: pose.R, U: pose.U, N: pose.N, dist };
}
const samePose = (a, b) => a && b && Math.abs(a.dist - b.dist) < 1e-6 && a.target.every((x, i) => Math.abs(x - b.target[i]) < 1e-6);

export function repairShown(scene, onsetOf, { until = Infinity } = {}) {
  const I = globalThis.KT_INTERP, vfov = scene.meta.vfov ?? 40;
  const log = [];
  const cost = fl => fl.reduce((s, x) => s + (x.kind === 'partial' ? 1000 : 1), 0);
  const partials = fl => fl.filter(x => x.kind === 'partial').length;
  let fails = gateFailures(scene, onsetOf, { until });
  const before = partials(fails), beforeUnshown = fails.length - before;
  const sung = sungWords(scene, onsetOf);
  const tried = new Set();
  for (let guard = 0; guard < 400 && fails.length; guard++) {
    const fw = fails.find(x => !tried.has(x.id));
    if (!fw) break;
    tried.add(fw.id);
    const w = scene.words.find(x => x.id === fw.id), o = fw.onsetF, A = appearanceFrame(w);
    const keys = scene.cams;
    const last = Math.max(A + SHOWN_FRAMES - 1, o); // the word must stay whole from A through this frame
    // k: the last key that has finished by the appearance frame (the hold the word appears in follows it).
    let k = -1;
    for (let i = 0; i < keys.length; i++) if (keys[i].f1 <= A) k = i;
    const n = k + 1 < keys.length ? k + 1 : -1;
    // The reveal (and anything from `until` on) is never touched: Jefferson approved its shape on rough cut 4.
    if (n >= 0 && keys[n].f0 >= until) continue;
    const n0 = cost(fails);
    const snapshot = JSON.stringify(scene.cams), onBefore = w.on;
    let done = null;
    const wholeFrom = s => { for (let f = s; f <= Math.max(s + SHOWN_FRAMES - 1, o); f++) if (!fullyShown(w, f, I.poseAt(scene.cams, f), vfov)) return false; return true; };
    // 0. A word with no entrance motion: switch it on later, when the frame has room for it, inside the sync window.
    if (A === w.on && !(w.motion ?? []).length) {
      for (let s = w.on + 1; s <= o; s++) if (wholeFrom(s)) { w.on = s; done = `${w.id} ${w.text}: switched on at ${s} instead of ${onBefore}, when it fits whole`; break; }
    }
    // 1. Start the next move earlier, so the camera is on the word's landing when it appears.
    if (!done && n >= 0 && k >= 0) {
      const N = keys[n];
      const shift = N.f1 - A;
      const to = { ...N.to, position: add(N.to.target, mul(N.to.N, N.to.dist)) };
      if (shift > 0 && shift <= PICKUP_CAP && N.f0 - shift - keys[k].f1 >= MIN_STILL && fullyShown(w, Math.max(A, N.f1), to, vfov)) {
        N.f0 -= shift; N.f1 -= shift;
        done = `${w.id} ${w.text}: camera move ${N.f0 + shift}-${N.f1 + shift} starts ${shift} frames earlier, landing at ${N.f1} when the word appears (onset ${o})`;
      }
    }
    // 2. The word appears whole, but the camera leaves too soon: start the next move later and keep its landing (a
    //    shorter move, never under MIN_MOVE frames), or hold a cut back by a few frames.
    if (!done && n >= 0) {
      const N = keys[n], need = last + 1 - N.f0;
      const whole = fullyShown(w, A, I.poseAt(keys, A), vfov);
      if (need > 0 && whole && N.verb !== 'cut' && N.f1 > N.f0 && N.f1 - (N.f0 + need) >= MIN_MOVE) {
        N.f0 += need;
        done = `${w.id} ${w.text}: camera move to ${N.f1} starts ${need} frames later (at ${N.f0}), so the word stays whole through frame ${last}`;
      } else if (need > 0 && whole && N.f1 === N.f0 && need <= ONSET_SLACK + 2) {
        N.f0 += need; N.f1 += need;
        done = `${w.id} ${w.text}: cut moved ${need} frames later (to ${N.f0}), so the word stays whole through frame ${last}`;
      }
    }
    // 3. Reframe the hold so every word that appears or is sung during it fits together (riders included), as
    //    tightly as the reading margins allow (tight composition: no empty band is kept around them).
    if (!done && k >= 0) {
      const K = keys[k], holdEnd = n >= 0 ? keys[n].f0 : Infinity;
      const group = sung.filter(s => { const a = appearanceFrame(s.w); return ((a >= K.f1 && a < holdEnd) || (s.onsetF >= K.f1 && s.onsetF < holdEnd)) && s.onsetF < until; });
      if (!group.some(s => s.w === w)) group.push({ w, onsetF: o });
      const pts = [];
      for (const s of group) { const f = Math.min(holdEnd - 1, Math.max(appearanceFrame(s.w), K.f1) + SHOWN_FRAMES - 1); const cs = cornersAt(s.w, f) ?? cornersAt(s.w, appearanceFrame(s.w)); if (cs) pts.push(...cs); }
      if (pts.length) {
        const P = fitPose(K.to, pts, vfov);
        if (P.dist > 0) {
          const old = K.to;
          K.to = P;
          if (n >= 0 && samePose(keys[n].from, old)) keys[n].from = P;
          done = `${w.id} ${w.text}: hold after key ${K.f0}-${K.f1} reframed to fit the ${group.length} words that appear in it (${group.map(s => s.w.text).join(' ')}), distance ${old.dist.toFixed(0)} -> ${P.dist.toFixed(0)}`;
        }
      }
    }
    if (!done) continue;
    const after = gateFailures(scene, onsetOf, { until });
    if (cost(after) < n0) { fails = after; log.push(done); tried.clear(); }
    else { scene.cams = JSON.parse(snapshot); w.on = onBefore; }
  }
  return { before, after: partials(fails), beforeUnshown, afterUnshown: fails.length - partials(fails), log,
    remaining: fails.filter(x => x.kind === 'partial'), dropped: fails.filter(x => x.kind !== 'partial') };
}
