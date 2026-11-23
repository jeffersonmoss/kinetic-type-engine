// Composition passes on the joined scene (engine fix brief 3, Fable's rough cut 3 items 17 and 18, 22 November 2026).
// Generic; no song names.
//   tightenLone: a focus word alone in its hold (no other word whole in frame) has letters at least LONE_MIN of the
//     frame height, centred; the hold is reframed closer when that keeps every gate as good as before.
//   hideEdgeClutter: during a camera hold, a word that is not in its focus window and is less than half in frame is
//     hidden for that hold (opacity 0, restored when the hold ends). It never touches a focused word.
import './interp.js';
import { appearanceFrame, sungWords, letterHeight, fullyShown, cornersAt, fitPose, samePose, gateFailures, SIZE_DELAY } from './shown_gate.mjs';
import { scanOverlap } from './overlap_gate.mjs';

export const LONE_MIN = 0.22, LONE_WIDTH = 0.8, FOCUS_READ = 15;
const add = (a, b) => a.map((x, i) => x + b[i]);
const mul = (a, k) => a.map(x => x * k);
const complete = p => ({ ...p, position: add(p.target, mul(p.N, p.dist)) });

// Holds: [start, end) between camera keys, with the key index that lands each one (-1 for the opening hold).
export function holds(scene, until = scene.meta.frames) {
  const keys = scene.cams, out = [];
  let start = 0, k = -1;
  for (let i = 0; i <= keys.length; i++) {
    const end = Math.min(i < keys.length ? keys[i].f0 : scene.meta.frames, until);
    if (end - start >= 3) out.push({ start, end, k, n: i < keys.length ? i : -1 });
    if (i < keys.length) { start = Math.max(start, keys[i].f1); k = i; }
    if (start >= until) break;
  }
  return out;
}

const cost = fl => fl.reduce((s, x) => s + (x.kind === 'partial' ? 1000 : x.kind === 'unshown' ? 10 : 5), 0);

export function tightenLone(scene, onsetOf, { until = scene.meta.frames } = {}) {
  const I = globalThis.KT_INTERP, vfov = scene.meta.vfov ?? 40, log = [];
  const sung = sungWords(scene, onsetOf);
  let base = cost(gateFailures(scene, onsetOf, { until }));
  for (const h of holds(scene, until)) {
    if (h.k < 0 || h.n < 0) continue;
    const group = sung.filter(s => { const a = appearanceFrame(s.w); return (a >= h.start && a < h.end) || (s.onsetF >= h.start && s.onsetF < h.end); });
    if (group.length !== 1) continue;
    const { w, onsetF } = group[0];
    const D = Math.min(h.end - 1, Math.max(onsetF, appearanceFrame(w), h.start) + SIZE_DELAY);
    const pose = I.poseAt(scene.cams, D);
    if (!fullyShown(w, D, pose, vfov)) continue;
    const others = scene.words.some(x => x !== w && !x.reveal_copy_of && fullyShown(x, D, pose, vfov));
    const size = letterHeight(w, D, pose, vfov);
    if (others || size == null || size >= LONE_MIN) continue;
    const K = scene.cams[h.k], cs = cornersAt(w, D);
    if (!cs) continue;
    // Centre on the word, then come in until its letters reach LONE_MIN (never past the reading margins of fitPose).
    const fit = fitPose(K.to, cs, vfov, LONE_WIDTH, 0.9);
    const atFit = letterHeight(w, D, complete(fit), vfov);
    if (!atFit) continue;
    const dist = Math.max(fit.dist, fit.dist * atFit / LONE_MIN);
    if (!(dist < K.to.dist)) continue;
    const old = K.to, oldNext = scene.cams[h.n].from, snapshot = JSON.stringify(scene.cams);
    const P = { ...fit, dist };
    K.to = P;
    if (samePose(scene.cams[h.n].from, old)) scene.cams[h.n].from = P;
    const from = scene.cams[h.k].f0, to = Math.min(until, scene.cams[h.n].f1 + 1);
    const ovBefore = scanOverlap(JSON.parse(JSON.stringify({ ...scene, cams: JSON.parse(snapshot) })), { from, until: to }).overlaps.length;
    const ovAfter = scanOverlap(scene, { from, until: to }).overlaps.length;
    const c = cost(gateFailures(scene, onsetOf, { until }));
    if (c <= base && ovAfter <= ovBefore) {
      base = c;
      log.push(`${w.id} ${w.text}: lone in hold ${h.start}-${h.end}, letters ${(100 * size).toFixed(1)}% -> ${(100 * letterHeight(w, D, I.poseAt(scene.cams, D), vfov)).toFixed(1)}% of the frame height, centred`);
    } else { scene.cams = JSON.parse(snapshot); void oldNext; }
  }
  return { log };
}

// Share of the word box inside the frame, by a 9 x 3 grid of sample points.
function inFrameShare(w, f, pose, vfov) {
  const I = globalThis.KT_INTERP;
  const X = I.wordXform(w, f);
  let inside = 0, total = 0;
  for (let i = 0; i < 9; i++) for (let j = 0; j < 3; j++) {
    const u = -1 + (2 * i + 1) / 9, v = -1 + (2 * j + 1) / 3;
    const q = I.project(X(add(w.C, add(mul(w.R, u * w.w / 2), mul(w.U, v * w.h / 2)))), pose, vfov);
    total++;
    if (q && Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1) inside++;
  }
  return inside / total;
}
const opacityAt = (w, f) => { let v = 1; for (const [k, x] of w.opacity ?? []) if (k <= f) v = x; return v; };
const drawn = (w, f) => w.on <= f && (w.off == null || f < w.off) && opacityAt(w, f) > 0.05;

export function hideEdgeClutter(scene, onsetOf, { until = scene.meta.frames } = {}) {
  const I = globalThis.KT_INTERP, vfov = scene.meta.vfov ?? 40, log = [];
  const fps = scene.meta.fps ?? 30;
  for (const h of holds(scene, until)) {
    const a = h.start + 1, b = h.end - 1, pa = I.poseAt(scene.cams, a), pb = I.poseAt(scene.cams, b);
    for (const w of scene.words) {
      if (w.reveal_copy_of || w.echo || !drawn(w, a) || !drawn(w, b)) continue;
      const o = onsetOf(w) ?? Math.round((w.t ?? w.on / fps) * fps);
      const focusFrom = Math.min(appearanceFrame(w), o), focusTo = Math.max(appearanceFrame(w), o) + FOCUS_READ;
      if (focusFrom < h.end && focusTo > h.start) continue;
      if (I.wordMoving(w, a) || I.wordMoving(w, b)) continue;
      const sa = inFrameShare(w, a, pa, vfov), sb = inFrameShare(w, b, pb, vfov);
      if (!(sa > 0 || sb > 0) || sa >= 0.5 || sb >= 0.5) continue;
      const restore = opacityAt(w, h.end);
      w.opacity = [...(w.opacity ?? []).filter(([k]) => k < h.start || k >= h.end), [h.start, 0], [h.end, restore]].sort((x, y) => x[0] - y[0]);
      log.push(`${w.id} ${w.text}: hidden ${h.start}-${h.end} (${Math.round(100 * Math.max(sa, sb))}% in frame)`);
    }
  }
  return { log };
}
