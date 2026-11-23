// Composition passes on the joined scene (engine fix brief 3, Fable's rough cut 3 items 17 and 18, 22 November 2026).
// Generic; no song names.
//   tightenLone: a focus word alone in its hold (no other word whole in frame) has letters at least LONE_MIN of the
//     frame height, centred; the hold is reframed closer when that keeps every gate as good as before.
//   hideEdgeClutter: during a camera hold, a word that is not in its focus window and has letters cut by the frame edge
//     is hidden for the rest of that hold (opacity 0, restored when the hold ends). It never touches a focused word.
import './interp.js';
import * as G from './shown_gate.mjs';
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

// Share of the word's letters inside the frame: a 9 x 3 grid over its cap band (the letters, not the padded box).
function inFrameShare(w, f, pose, vfov) {
  const I = globalThis.KT_INTERP;
  const X = I.wordXform(w, f), band = Math.min(1, (w.cap ?? w.h) / w.h);
  let inside = 0, total = 0;
  for (let i = 0; i < 9; i++) for (let j = 0; j < 3; j++) {
    const u = -1 + (2 * i + 1) / 9, v = (-1 + (2 * j + 1) / 3) * band;
    const q = I.project(X(add(w.C, add(mul(w.R, u * w.w / 2), mul(w.U, v * w.h / 2)))), pose, vfov);
    total++;
    if (q && Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1) inside++;
  }
  return inside / total;
}
const opacityAt = (w, f) => { let v = 1; for (const [k, x] of w.opacity ?? []) if (k <= f) v = x; return v; };
const drawn = (w, f) => w.on <= f && (w.off == null || f < w.off) && opacityAt(w, f) > 0.05;
// Hide w over [a, b): opacity 0, then whatever it was at b.
function hide(w, a, b) {
  const restore = opacityAt(w, b);
  w.opacity = [...(w.opacity ?? []).filter(([k]) => k < a || k >= b), [a, 0], [b, restore]].sort((x, y) => x[0] - y[0]);
}
const focusWindow = (w, onsetOf, fps) => {
  const o = onsetOf(w) ?? Math.round((w.t ?? w.on / fps) * fps);
  return [Math.min(appearanceFrame(w), o), Math.max(appearanceFrame(w), o) + FOCUS_READ];
};

// Edge clutter (brief 3, tightened in brief 4): during a camera hold, a word outside its focus window whose letters are
// cut by the frame edge (CLIP_SHARE or less of its letters in frame, any at all) is hidden for the rest of that hold.
// Rough cut 4 showed halved letters on words two thirds in frame, so the share is measured on the letters and the
// threshold is near whole.
export const CLIP_SHARE = 0.95, MOVE_TAIL = 8;
export function hideEdgeClutter(scene, onsetOf, { until = scene.meta.frames } = {}) {
  const I = globalThis.KT_INTERP, vfov = scene.meta.vfov ?? 40, log = [];
  const fps = scene.meta.fps ?? 30;
  const cutAt = f => scene.cams.some(k => k.verb === 'cut' && k.f0 <= f && f <= k.f1 && k.f1 - k.f0 <= 1);
  for (const h of holds(scene, until)) {
    for (const w of scene.words) {
      if (w.reveal_copy_of || w.echo) continue;
      let [, focusTo] = focusWindow(w, onsetOf, fps);
      // A camera cut after the word's onset ends its focus (brief 4: a sliver of STUCK stayed on the cut to INSIDE).
      const onset = onsetOf(w) ?? Math.round((w.t ?? w.on / fps) * fps);
      if (cutAt(h.start) && onset < h.start && w.on < h.start) focusTo = Math.min(focusTo, h.start);
      const a = Math.max(h.start, focusTo), b = h.end;
      if (b - a < 2 || !drawn(w, a) || !drawn(w, b - 1)) continue;
      if (I.wordMoving(w, a) || I.wordMoving(w, b - 1)) continue;
      const sa = inFrameShare(w, a, I.poseAt(scene.cams, a), vfov), sb = inFrameShare(w, b - 1, I.poseAt(scene.cams, b - 1), vfov);
      if (!(sa > 0 || sb > 0) || (sa > CLIP_SHARE && sb > CLIP_SHARE)) continue;
      // Also the last frames of a short camera move into the hold on which the word is already cut by the edge.
      let g = a;
      const K = h.k >= 0 ? scene.cams[h.k] : null;
      if (a === h.start && K && K.f1 === h.start && K.f1 - K.f0 <= MOVE_TAIL) {
        // Only while another word is whole in frame, so the hide never leaves the frame empty.
        const other = f => scene.words.some(x => x !== w && !x.reveal_copy_of && drawn(x, f) &&
          inFrameShare(x, f, I.poseAt(scene.cams, f), vfov) > CLIP_SHARE);
        while (g - 1 >= Math.max(K.f0, focusTo) && drawn(w, g - 1) && !I.wordMoving(w, g - 1) &&
          inFrameShare(w, g - 1, I.poseAt(scene.cams, g - 1), vfov) <= CLIP_SHARE && other(g - 1)) g--;
      }
      hide(w, g, b);
      log.push(`${w.id} ${w.text}: hidden ${g}-${b} (${Math.round(100 * Math.max(sa, sb))}% of its letters in frame)`);
    }
  }
  return { log };
}

// Unreadable text (brief 4): a word outside its focus window that is mirrored or seen from behind is hidden on every
// frame it would be in frame that way; one upside down (tilted past MAX_TILT) is hidden while the camera is still. Focus words are reported, never hidden.
export function hideUnreadable(scene, onsetOf, { until = scene.meta.frames } = {}) {
  const I = globalThis.KT_INTERP, vfov = scene.meta.vfov ?? 40, fps = scene.meta.fps ?? 30, log = [], focused = [];
  const poses = new Map(), poseAt = f => poses.get(f) ?? poses.set(f, I.poseAt(scene.cams, f)).get(f);
  for (const w of scene.words) {
    if (w.reveal_copy_of) continue;
    const [focusFrom, focusTo] = focusWindow(w, onsetOf, fps);
    const end = Math.min(until, w.off ?? until);
    let run = null;
    const close = f => { if (run) { hide(w, run, f); log.push(`${w.id} ${w.text}: hidden ${run}-${f} (upside down, mirrored or from behind)`); run = null; } };
    for (let f = Math.max(0, w.on); f < end; f++) {
      // Upside down counts while the camera is still; during a camera move a turning word may pass the vertical.
      const still = !scene.cams.some(k => k.f0 < f && f < k.f1);
      const bad = drawn(w, f) && inFrameShare(w, f, poseAt(f), vfov) > 0 && !G.readableOrientation(w, f, poseAt(f), vfov, { tilt: still });
      if (bad && f >= focusFrom && f < focusTo) { focused.push(`${w.id} ${w.text} at frame ${f}`); close(f); continue; }
      if (bad && run == null) run = f;
      if (!bad) close(f);
    }
    close(end);
  }
  return { log, focused: [...new Set(focused.map(x => x.replace(/ at frame \d+$/, '')))] };
}

// No empty frame mid-song (brief 4): where no word is visible between the intro and the end, the words on screen just
// before stay on until the next word is visible, when that adds no projected overlap. Remaining empty runs are listed.
function anyVisible(scene, f, pose, vfov) {
  const I = globalThis.KT_INTERP;
  return scene.words.some(w => {
    const on = (w.on <= f && (w.off == null || f < w.off)) || (w.reveal_on != null && f >= w.reveal_on);
    if (!on || opacityAt(w, f) <= 0.05) return false;
    const X = I.wordXform(w, f), c = X(w.C), n = X(add(w.C, w.N)).map((x, i) => x - c[i]);
    if (n.reduce((s, x, i) => s + x * (pose.position[i] - c[i]), 0) <= 0) return false;
    // Filled means a word at least FILLED_SHARE in frame and readable; an edge sliver does not count.
    return inFrameShare(w, f, pose, vfov) >= FILLED_SHARE && G.readableOrientation(w, f, pose, vfov, { tilt: false });
  });
}
export const FILLED_SHARE = 0.5;
export function emptyFrames(scene, { from = 0, until = scene.meta.frames } = {}) {
  const I = globalThis.KT_INTERP, vfov = scene.meta.vfov ?? 40, runs = [];
  for (let f = from; f < until; f++) {
    if (anyVisible(scene, f, I.poseAt(scene.cams, f), vfov)) continue;
    const last = runs.at(-1);
    if (last && last.end === f - 1) last.end = f; else runs.push({ start: f, end: f });
  }
  return runs;
}
// Three tries per empty run, up to three passes, each kept only when fewer nearby frames are empty and neither partly shown focused words nor projected
// overlaps increase: (1) the outgoing words stay on through the run; (2) the incoming words (switching on within
// FILL_LEAD frames after it, at rest) switch on at the first frame of the run they are in frame and upright.
export const FILL_LEAD = 4;
export function fillEmptyFrames(scene, { from = 0, until = scene.meta.frames, onsetOf } = {}) {
  const I = globalThis.KT_INTERP, vfov = scene.meta.vfov ?? 40, log = [];
  const partials = () => onsetOf ? gateFailures(scene, onsetOf, { until }).filter(x => x.kind === 'partial').length : 0;
  let basePartial = partials();
  for (let pass = 0; pass < 3; pass++) {
  const before = log.length;
  for (const run of emptyFrames(scene, { from, until })) {
    if (run.start === 0) continue;
    const lo = Math.max(0, run.start - 2), hi = Math.min(scene.meta.frames, run.end + 12);
    const overlapBefore = scanOverlap(scene, { from: lo, until: hi }).overlaps.length;
    const wLo = Math.max(from, run.start - 20), wHi = Math.min(until, run.end + 21);
    const emptyCount = () => emptyFrames(scene, { from: wLo, until: wHi }).reduce((n, r) => n + r.end - r.start + 1, 0);
    const emptyBefore = emptyCount();
    // Kept when fewer frames nearby are empty (a part-filled run gets the other tries on the next pass).
    const accept = () => emptyCount() < emptyBefore &&
      scanOverlap(scene, { from: lo, until: hi }).overlaps.length <= overlapBefore && partials() <= basePartial;
    const pose = I.poseAt(scene.cams, run.start - 1);
    const leaving = scene.words.filter(w => !w.reveal_copy_of && w.off != null && w.off >= run.start - 1 && w.off <= run.end + 1 &&
      opacityAt(w, run.start - 1) > 0.05 && inFrameShare(w, run.start - 1, pose, vfov) > 0);
    if (leaving.length) {
      const snap = leaving.map(w => [w, w.off]);
      for (const w of leaving) w.off = run.end + 1;
      if (accept()) { log.push(`frames ${run.start}-${run.end}: ${leaving.map(w => w.text).join(' ')} stay on until ${run.end + 1}`); continue; }
      for (const [w, off] of snap) w.off = off;
    }
    const coming = scene.words.filter(w => !w.reveal_copy_of && !w.echo && w.on > run.end && w.on <= run.end + FILL_LEAD && !(w.motion ?? []).length);
    const snap = coming.map(w => [w, w.on, w.joint && { ...w.joint }]);
    const moved = [];
    for (const w of coming) {
      for (let f = run.start; f < w.on; f++) {
        const p = I.poseAt(scene.cams, f);
        if (inFrameShare(w, f, p, vfov) > 0 && G.readableOrientation(w, f, p, vfov)) {
          moved.push(`${w.text} ${w.on} -> ${f}`); w.on = f;
          if (w.joint && w.joint.f0 > f) { w.joint.f0 = f; if (w.joint.f1 < f) w.joint.f1 = f; }
          break;
        }
      }
    }
    if (moved.length && accept()) { log.push(`frames ${run.start}-${run.end}: switched on earlier, ${moved.join(', ')}`); basePartial = partials(); continue; }
    for (const [w, on, joint] of snap) { w.on = on; if (joint) w.joint = joint; }
    // (3) a short run inside a camera move: the move lands on the run's first frame (at least 2 frames long), and the
    //     incoming words switch on there.
    const K = scene.cams.find(k => k.f0 < run.start && k.f1 >= run.start && k.f1 > k.f0);
    if (K && run.end - run.start < 3 && run.start - K.f0 >= 2) {
      const was = K.f1, camSnap = JSON.stringify(scene.cams);
      K.f1 = run.start;
      const next = scene.words.filter(w => !w.reveal_copy_of && !w.echo && w.on > run.start - 1 && w.on <= was + FILL_LEAD && !(w.motion ?? []).length);
      const wsnap = next.map(w => [w, w.on, w.joint && { ...w.joint }]);
      const p = I.poseAt(scene.cams, run.start);
      const sw = [];
      for (const w of next) if (inFrameShare(w, run.start, p, vfov) > 0 && G.readableOrientation(w, run.start, p, vfov)) {
        sw.push(`${w.text} ${w.on} -> ${run.start}`); w.on = run.start;
        if (w.joint && w.joint.f0 > run.start) { w.joint.f0 = run.start; if (w.joint.f1 < run.start) w.joint.f1 = run.start; }
      }
      if (accept()) { log.push(`frames ${run.start}-${run.end}: camera ${K.verb} lands at ${run.start} instead of ${was}${sw.length ? `; switched on ${sw.join(', ')}` : ''}`); basePartial = partials(); continue; }
      scene.cams = JSON.parse(camSnap);
      for (const [w, on, joint] of wsnap) { w.on = on; if (joint) w.joint = joint; }
    }
    // (4) camera stutter: the camera holds the run's last filled pose over the run (key.hold in interp.js), and the
    //     words visible and readable on that frame stay on through it. Kept on the same terms as the other tries.
    const K4 = scene.cams.find(k => k.f0 < run.start && k.f1 >= run.end && k.f1 > k.f0 && k.verb !== 'cut');
    const still = emptyFrames(scene, { from: run.start, until: run.end + 1 });
    if (K4 && still.length) {
      const camSnap = JSON.stringify(scene.cams), f = run.start - 1, p = I.poseAt(scene.cams, f);
      const vis = scene.words.filter(w => !w.reveal_copy_of && drawn(w, f) && inFrameShare(w, f, p, vfov) > 0 && G.readableOrientation(w, f, p, vfov));
      const wsnap = vis.map(w => [w, w.off, JSON.stringify(w.opacity ?? null)]);
      K4.hold = [...(K4.hold ?? []), [run.start, run.end]];
      for (const w of vis) {
        const o = opacityAt(w, f), after = opacityAt(w, run.end + 1);
        if (w.off != null && w.off <= run.end + 1) w.off = run.end + 1;
        w.opacity = [...(w.opacity ?? []).filter(([k]) => k < run.start || k > run.end + 1), [run.start, o], [run.end + 1, w.off === run.end + 1 ? o : after]].sort((x, y) => x[0] - y[0]);
      }
      if (accept()) { log.push(`frames ${run.start}-${run.end}: camera ${K4.verb} holds the frame ${f} pose; ${vis.map(w => w.text).join(' ')} stay on`); basePartial = partials(); continue; }
      scene.cams = JSON.parse(camSnap);
      for (const [w, off, op] of wsnap) { w.off = off; const v = JSON.parse(op); if (v) w.opacity = v; else delete w.opacity; }
    }
  }
  if (log.length === before) break;
  }
  return { log, remaining: emptyFrames(scene, { from, until }) };
}
