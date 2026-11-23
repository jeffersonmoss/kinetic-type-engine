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

// Share of the word's ink inside the frame: an 11 x 5 grid that includes the edges, over the letter band, or over the
// whole box for a word drawn on its own background block (brief 4: CUTS on a navy block showed its lower half and the
// foot of its letters at the top edge while a 9 x 3 grid inside the band found nothing in frame).
export const hasBlock = w => !!w.colours?.background || (w.pad ?? 0) > 0.2 * (w.cap ?? Infinity);
function inFrameShare(w, f, pose, vfov) {
  const I = globalThis.KT_INTERP;
  const X = I.wordXform(w, f), band = hasBlock(w) ? 1 : Math.min(1, (w.cap ?? w.h) / w.h);
  let inside = 0, total = 0;
  for (let i = 0; i <= 10; i++) for (let j = 0; j <= 4; j++) {
    const u = -1 + i / 5, v = (-1 + j / 2) * band;
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
      let g = a, e = b;
      const K = h.k >= 0 ? scene.cams[h.k] : null, Kn = h.n >= 0 ? scene.cams[h.n] : null;
      // Only while another word is whole in frame, so the hide never leaves the frame empty.
      const other = f => scene.words.some(x => x !== w && !x.reveal_copy_of && drawn(x, f) &&
        inFrameShare(x, f, I.poseAt(scene.cams, f), vfov) > CLIP_SHARE);
      const clipped = f => drawn(w, f) && !I.wordMoving(w, f) && inFrameShare(w, f, I.poseAt(scene.cams, f), vfov) <= CLIP_SHARE;
      // And into the first frames of a short camera move out of the hold, while the word is still cut.
      if (Kn && Kn.f0 === h.end && Kn.f1 - Kn.f0 <= MOVE_TAIL) while (e < Kn.f1 && clipped(e) && other(e)) e++;
      if (a === h.start && K && K.f1 === h.start && K.f1 - K.f0 <= MOVE_TAIL) {
        while (g - 1 >= Math.max(K.f0, focusTo) && drawn(w, g - 1) && !I.wordMoving(w, g - 1) &&
          inFrameShare(w, g - 1, I.poseAt(scene.cams, g - 1), vfov) <= CLIP_SHARE && other(g - 1)) g--;
      }
      hide(w, g, e);
      log.push(`${w.id} ${w.text}: hidden ${g}-${e} (${Math.round(100 * Math.max(sa, sb))}% of its letters in frame)`);
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
  // Something on screen: an intro overlay (badge, title card), a picture element or a word.
  if ((scene.intro ?? []).some(x => f >= x.start && f < x.end)) return true;
  return [...scene.words, ...(scene.elements ?? [])].some(w => {
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
// Only empty stretches longer than maxFrames are filled or reported (Jefferson, 22 November 2026: perceptibly long gaps
// between something leaving and the next thing arriving are the problem; a frame or a few are not).
export function fillEmptyFrames(scene, { from = 0, until = scene.meta.frames, onsetOf, maxFrames = 15 } = {}) {
  const long = r => r.end - r.start + 1 > maxFrames;
  const I = globalThis.KT_INTERP, vfov = scene.meta.vfov ?? 40, log = [];
  const partials = () => onsetOf ? gateFailures(scene, onsetOf, { until }).filter(x => x.kind === 'partial').length : 0;
  let basePartial = partials();
  for (let pass = 0; pass < 3; pass++) {
  const before = log.length;
  for (const run of emptyFrames(scene, { from, until })) {
    if (run.start === 0 || !long(run)) continue;
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
    // (5) an empty hold (brief 5: a whip landed on a hold showing a third of one word): the camera does not make the
    //     move into it and stays on its last filled pose until the next move, which then starts from there; the words
    //     visible on that pose stay on through the run. Kept on the same terms as the other tries.
    const ki = scene.cams.findLastIndex(k => k.f0 < run.start && k.f1 <= run.end + 1);
    const K5 = scene.cams[ki];
    // Never when a word is sung in the skipped hold: it would be read from the old framing (brief 5: YOU MISS AND at 5%).
    const holdEnd5 = scene.cams[ki + 1]?.f0 ?? run.end + 1;
    const sungIn = K5 && scene.words.some(w => !w.reveal_copy_of && !w.dropped && onsetOf?.(w) != null && onsetOf(w) >= K5.f0 && onsetOf(w) < holdEnd5);
    if (K5 && !sungIn && emptyFrames(scene, { from: run.start, until: run.end + 1 }).length) {
      const camSnap = JSON.stringify(scene.cams), f = K5.f0 - 1;
      const p = I.poseAt(scene.cams, f);
      const vis = scene.words.filter(w => !w.reveal_copy_of && drawn(w, f) && inFrameShare(w, f, p, vfov) >= FILLED_SHARE && G.readableOrientation(w, f, p, vfov));
      const wsnap = vis.map(w => [w, w.off, JSON.stringify(w.opacity ?? null)]);
      const oldTo = K5.to, Kn = scene.cams[ki + 1];
      K5.to = K5.from;
      if (Kn && samePose(Kn.from, oldTo)) Kn.from = K5.from;
      for (const w of vis) {
        const o = opacityAt(w, f), after = opacityAt(w, run.end + 1);
        if (w.off != null && w.off <= run.end + 1) w.off = run.end + 1;
        w.opacity = [...(w.opacity ?? []).filter(([k]) => k < K5.f0 || k > run.end + 1), [K5.f0, o], [run.end + 1, w.off === run.end + 1 ? o : after]].sort((x, y) => x[0] - y[0]);
      }
      if (vis.length && accept()) { log.push(`frames ${run.start}-${run.end}: camera ${K5.verb} at ${K5.f0}-${K5.f1} skipped (it led into an empty hold); ${vis.map(w => w.text).join(' ')} stay on`); basePartial = partials(); continue; }
      scene.cams = JSON.parse(camSnap);
      for (const [w, off, op] of wsnap) { w.off = off; const v = JSON.parse(op); if (v) w.opacity = v; else delete w.opacity; }
    }
  }
  if (log.length === before) break;
  }
  const all = emptyFrames(scene, { from, until });
  return { log, remaining: all.filter(long), short: all.filter(r => !long(r)) };
}

// Size (engine fix brief 5, Jefferson 22 November 2026: "We should either show a word big enough to be seen or not
// show it at all"). Per camera hold, each word whole in frame and at rest is measured at its largest (cap height as a
// share of the frame height, letterHeight). Its minimum is minH when the frame is crowded and roomFactor x minH when it
// is not. Crowded: at that frame at least crowdedWords (4) words (this one included) are at least half in frame, or their
// projected boxes cover at least crowdedArea of the frame. A word under its minimum is first grown about its centre (its
// box, cap, font size and padding together, at most MAX_GROW times), kept only when that adds no projected overlap over
// its life and does not make it partly shown or unshown at its onset. Otherwise: in a hold that is its focus window it is
// dropped for its whole life (opacity 0, w.dropped = 'size', exempt from the shown-whole gates like a keyword-mode
// drop); in a later hold it is hidden for that hold when another word meeting its minimum stays on screen there. Echoes,
// reveal copies and wordmarks are not resized; a hinge word is measured but not grown.
// crowdedWords 4 (brief 6, was 3): HE, TURNS and a small sideways HE in a mostly empty frame were judged crowded, so the
// small HE passed at 9.5%; three words with room around them are not crowded.
export const SIZE_DEFAULTS = Object.freeze({ minH: 0.09, roomFactor: 1.5, crowdedWords: 4, crowdedArea: 0.30 });
export const MAX_GROW = 2.5;
function boxCoverage(w, f, pose, vfov) {
  const cs = cornersAt(w, f);
  if (!cs) return 0;
  const q = cs.map(c => globalThis.KT_INTERP.project(c, pose, vfov));
  if (q.some(x => !x)) return 0;
  const p = q.map(x => [Math.max(-1, Math.min(1, x.x)), Math.max(-1, Math.min(1, x.y))]);
  let a = 0;
  for (let i = 0; i < p.length; i++) { const [x0, y0] = p[i], [x1, y1] = p[(i + 1) % p.length]; a += x0 * y1 - x1 * y0; }
  return Math.abs(a) / 2 / 4;
}
const resizable = w => !w.reveal_copy_of && !w.echo && !w.wordmark && !w.dropped && !w.size_kept;
// A hinge word is not grown (its hinge axis is fixed in the world). A word entering past a clip plane (a rider sliding
// out from behind its host's edge) is grown with its slide scaled by the same factor, and kept only if it still starts
// wholly behind the plane and is wholly past it when the clip ends (Rough cut 6b, ARE at 34 s).
const growable = w => !(w.motion ?? []).some(s => s.kind === 'hinge');
const clipEntranceOk = (scene, w) => {
  const byId = new Map(scene.words.map(x => [x.id, x])), I = globalThis.KT_INTERP;
  const side = (f, cs) => {
    const cl = I.wordClips(w, f, byId);
    return cl.map(({ P, n }) => cs.map(c => (c[0] - P[0]) * n[0] + (c[1] - P[1]) * n[1] + (c[2] - P[2]) * n[2]));
  };
  for (const c of w.clip ?? []) {
    const raw = f => { const X = I.wordXform(w, f); return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => X(add(w.C, add(mul(w.R, a * w.w / 2), mul(w.U, b * w.h / 2))))); };
    const start = side(c.f0, raw(c.f0)), end = c.f1 - 1 >= c.f0 ? side(c.f1 - 1, raw(c.f1)) : [];
    if (start.some(ds => ds.some(d => d > 1e-6 * (1 + Math.abs(d))))) return false;   // some of it shows at the start
    if (end.some(ds => ds.some(d => d < -1e-6 * (1 + Math.abs(d))))) return false;    // still cut when the clip ends
  }
  return true;
};
export function enforceMinSize(scene, onsetOf, { until = scene.meta.frames, settings = {} } = {}) {
  const S = { ...SIZE_DEFAULTS, ...settings };
  const I = globalThis.KT_INTERP, vfov = scene.meta.vfov ?? 40, fps = scene.meta.fps ?? 30;
  const poses = new Map(), poseAt = f => poses.get(f) ?? poses.set(f, I.poseAt(scene.cams, f)).get(f);
  const log = [], counts = { grown: 0, dropped: 0, hidden: 0, keptSmall: 0, importantSmall: 0 };
  const hs = holds(scene, until);
  const crowdedAt = f => {
    const p = poseAt(f);
    const on = scene.words.filter(x => !x.reveal_copy_of && drawn(x, f) && inFrameShare(x, f, p, vfov) >= FILLED_SHARE);
    return on.length >= S.crowdedWords || on.reduce((s, x) => s + boxCoverage(x, f, p, vfov), 0) >= S.crowdedArea;
  };
  // Each hold the word is shown in: its largest letters there, the frame, and the minimum that applies.
  const shownHolds = w => {
    const out = [];
    for (const h of hs) {
      const a = Math.max(h.start, w.on), b = Math.min(h.end, w.off ?? until, until);
      let best = null;
      for (let f = a; f < b; f += 2) {
        if (!drawn(w, f) || I.wordMoving(w, f)) continue;
        const p = poseAt(f);
        if (inFrameShare(w, f, p, vfov) <= CLIP_SHARE || !G.readableOrientation(w, f, p, vfov)) continue;
        const size = letterHeight(w, f, p, vfov);
        if (size != null && (!best || size > best.size)) best = { size, f };
      }
      if (!best) continue;
      const crowded = crowdedAt(best.f), min = crowded ? S.minH : S.roomFactor * S.minH;
      const [fa, fb] = focusWindow(w, onsetOf, fps);
      out.push({ h, ...best, crowded, min, focused: fa < h.end && fb > h.start });
    }
    return out;
  };
  // Grown about a pivot on its box (centre first, then edge midpoints and corners), so a word next to a bigger one can
  // grow away from it (Jefferson: "just move over the big word ... increasing the size of he").
  const PIVOTS = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
  // Overlap for a growth is counted with every size drop shown, so a drop undone later for the empty-screen rule never
  // brings back an overlap.
  const overlapsWithDrops = (from, to) => {
    const ghosts = scene.words.filter(x => x.dropped === 'size' && x.size_restore != null).map(x => [x, x.opacity]);
    for (const [x] of ghosts) { const v = JSON.parse(x.size_restore); if (v) x.opacity = v; else delete x.opacity; }
    const n = scanOverlap(scene, { from, until: to }).overlaps.length;
    for (const [x, op] of ghosts) x.opacity = op;
    return n;
  };
  const grow = (w, k, [pu, pv] = [0, 0]) => {
    const P = add(w.C, add(mul(w.R, pu * w.w / 2), mul(w.U, pv * w.h / 2)));
    w.C = add(P, mul(w.C.map((x, i) => x - P[i]), k));
    for (const key of ['w', 'h', 'cap', 'fontPx', 'pad']) if (typeof w[key] === 'number') w[key] *= k;
  };
  const ownFailures = w => gateFailures({ ...scene, words: [w] }, onsetOf, { until }).filter(x => x.kind === 'partial' || x.kind === 'unshown').length;
  const drops = [];
  for (const w of scene.words) {
    if (!resizable(w) || w.on >= until) continue;
    let sh = shownHolds(w), short = sh.filter(x => x.size < x.min - 1e-9);
    if (!short.length) continue;
    const k = Math.max(...short.map(x => x.min / x.size)) * 1.03, was = Math.max(...short.map(x => x.size));
    if (k <= MAX_GROW && growable(w)) {
      const lo = Math.max(0, w.on), hi = Math.min(until, w.off ?? until);
      const ovBefore = overlapsWithDrops(lo, hi), failBefore = ownFailures(w);
      const keep = JSON.stringify({ C: w.C, w: w.w, h: w.h, cap: w.cap, fontPx: w.fontPx, pad: w.pad, motion: w.motion });
      const clipped = (w.clip ?? []).length > 0;
      let done = false;
      for (const pv of PIVOTS) {
        grow(w, k, pv);
        if (clipped) w.motion = (w.motion ?? []).map(m => m.kind === 'shift' ? { ...m, from: mul(m.from, k), to: mul(m.to, k) } : m);
        if ((!clipped || clipEntranceOk(scene, w)) && overlapsWithDrops(lo, hi) <= ovBefore && ownFailures(w) <= failBefore) {
          counts.grown++; done = true;
          log.push(`${w.id} ${w.text}: grown x${k.toFixed(2)}${pv[0] || pv[1] ? ` from its ${['', 'left', 'right'][pv[0] === -1 ? 1 : pv[0] === 1 ? 2 : 0]}${pv[0] && pv[1] ? ' ' : ''}${['', 'bottom', 'top'][pv[1] === -1 ? 1 : pv[1] === 1 ? 2 : 0]} ${pv[0] && pv[1] ? 'corner' : 'edge'}` : ''} (letters ${(100 * was).toFixed(1)}% under the ${(100 * Math.max(...short.map(x => x.min))).toFixed(1)}% minimum)`);
          break;
        }
        Object.assign(w, JSON.parse(keep));
      }
      if (done) { sh = shownHolds(w); short = sh.filter(x => x.size < x.min - 1e-9); if (!short.length) continue; }
    }
    // Type rule 2 (brief 5 change 3): only non-important words are dropped. An important word (w.important: a name,
    // number or line-end rhyme word by keyword mode's ranking) that cannot grow stays and is reported as under size.
    if (short.some(x => x.focused) && w.important) {
      w.size_kept = true;
      counts.importantSmall = (counts.importantSmall ?? 0) + 1;
      const x = short.find(s => s.focused);
      log.push(`${w.id} ${w.text}: kept under size, important word (letters ${(100 * x.size).toFixed(1)}% at frame ${x.f}, minimum ${(100 * x.min).toFixed(1)}%; Type rule 1 failure)`);
      continue;
    }
    if (short.some(x => x.focused)) {
      // Applied after every word is sized, so each growth was checked against all words shown (a drop undone for the
      // empty-screen rule then brings back no overlap).
      drops.push(w); counts.dropped++;
      const x = short.find(s => s.focused);
      log.push(`${w.id} ${w.text}: dropped (letters ${(100 * x.size).toFixed(1)}% at frame ${x.f}, minimum ${(100 * x.min).toFixed(1)}% ${x.crowded ? 'crowded' : 'with room'}; ${growable(w) ? 'growing would overlap or leave it partly shown' : (w.clip ?? []).length ? 'growing would overlap, leave it partly shown, or break its entrance past its host' : 'it enters on a hinge, so it cannot grow'})`);
      continue;
    }
    for (const x of short) {
      const a = Math.max(x.h.start, w.on), b = Math.min(x.h.end, w.off ?? until, until);
      const big = f => scene.words.some(y => y !== w && !y.reveal_copy_of && drawn(y, f) && inFrameShare(y, f, poseAt(f), vfov) > CLIP_SHARE &&
        (letterHeight(y, f, poseAt(f), vfov) ?? 0) >= S.minH);
      let ok = true;
      for (let f = a; f < b && ok; f += 2) if (drawn(w, f)) ok = big(f);
      if (ok && drops.includes(w)) continue;
      if (ok) { (w.size_hides ??= []).push([a, b, JSON.stringify(w.opacity ?? null)]); hide(w, a, b); counts.hidden++; log.push(`${w.id} ${w.text}: hidden ${a}-${b} (letters ${(100 * x.size).toFixed(1)}%, minimum ${(100 * x.min).toFixed(1)}%)`); }
      else if (!(w.size_kept_holds ??= []).includes(a)) { w.size_kept_holds.push(a); counts.keptSmall++; log.push(`${w.id} ${w.text}: kept at ${(100 * x.size).toFixed(1)}% in ${a}-${b} (hiding it would leave no word of size on screen)`); }
    }
  }
  for (const w of drops) { w.size_restore = JSON.stringify(w.opacity ?? null); w.opacity = [[0, 0]]; w.dropped = 'size'; }
  return { log, counts, settings: S };
}

// No outlines (brief 5, change 2; Jefferson: "Let's keep all letters solid color and just not do outlines"). Every
// word is drawn solid: a hollow outline style becomes its flat twin in the same colour, a white edge is removed, and a
// team wordmark loses its stroke and accent rings (its second team colour comes from its background block). The 76ers
// striped jersey letters keep their thickening, which is in each letter's own colour.
export function noOutlines(scene, { flatOf = () => null } = {}) {
  const log = [];
  for (const w of scene.words) {
    if (w.wordmark) {
      const b = w.wordmark.colours ?? {};
      if (b.stroke || b.accent) { const { stroke, accent, ...rest } = b; w.wordmark.colours = rest; log.push(`${w.id} ${w.text}: wordmark stroke and accent removed`); }
      continue;
    }
    if (w.stripes) continue;
    if (w.kind === 'outline' || w.colours?.stroke) {
      const colour = w.colours?.stroke ?? w.colours?.text, flat = flatOf(w.style);
      log.push(`${w.id} ${w.text}: ${w.style} drawn solid${flat ? ` as ${flat}` : ''}`);
      if (flat) w.style = flat;
      w.kind = 'fill';
      const { stroke, ...rest } = w.colours ?? {};
      w.colours = { ...rest, text: colour };
    }
    if (w.colours?.outline) { const { outline, ...rest } = w.colours; w.colours = rest; log.push(`${w.id} ${w.text}: white edge removed`); }
  }
  return { log };
}

// The empty-screen rule outranks the size rule (Jefferson: no empty stretch over 0.25 s is not waivable). Where a long
// empty stretch remains after the fills, the size drops and hides inside it are undone (the word shown as it was) and
// listed, so the fills can be tried again.
export function undoSizeForEmpty(scene, runs) {
  // One word per stretch per call (the one covering most of it), so only as many come back as the screen needs.
  const log = [];
  for (const r of runs) {
    const cover = (a, b) => Math.min(b, r.end + 1) - Math.max(a, r.start);
    const opts = [];
    for (const w of scene.words) {
      if (w.dropped === 'size' && w.on <= r.end && (w.off ?? Infinity) > r.start) opts.push({ w, n: cover(w.on, w.off ?? Infinity), kind: 'drop' });
      for (const h of w.size_hides ?? []) if (h[0] <= r.end && h[1] > r.start) opts.push({ w, n: cover(h[0], h[1]), kind: 'hide', h });
    }
    const best = opts.sort((a, b) => b.n - a.n || (b.w.cap ?? 0) - (a.w.cap ?? 0))[0];
    if (!best) continue;
    const { w } = best;
    if (best.kind === 'drop') {
      const v = JSON.parse(w.size_restore ?? 'null'); if (v) w.opacity = v; else delete w.opacity;
      delete w.dropped; delete w.size_restore;
      log.push(`${w.id} ${w.text}: shown small after all (dropping it left frames ${r.start}-${r.end} empty)`);
    } else {
      const [a, b, op] = best.h; const v = JSON.parse(op); if (v) w.opacity = v; else delete w.opacity;
      w.size_hides = w.size_hides.filter(x => x[0] !== a);
      log.push(`${w.id} ${w.text}: hide ${a}-${b} undone (it left frames ${r.start}-${r.end} empty)`);
    }
  }
  return log;
}

// Read-only size measure for the Type-rule check: every hold in which a word is shown (at rest, at least 95% in frame,
// readable, opacity on) with its largest letters, the minimum that applies and whether it is its focus hold.
export function sizeShortfalls(scene, onsetOf, { until = scene.meta.frames, settings = {} } = {}) {
  const S = { ...SIZE_DEFAULTS, ...settings };
  const I = globalThis.KT_INTERP, vfov = scene.meta.vfov ?? 40, fps = scene.meta.fps ?? 30, out = [];
  const poses = new Map(), poseAt = f => poses.get(f) ?? poses.set(f, I.poseAt(scene.cams, f)).get(f);
  const hs = holds(scene, until);
  for (const w of scene.words) {
    if (w.reveal_copy_of || w.wordmark || w.dropped || w.on >= until) continue;
    for (const h of hs) {
      const a = Math.max(h.start, w.on), b = Math.min(h.end, w.off ?? until, until);
      let best = null;
      for (let f = a; f < b; f += 2) {
        if (!drawn(w, f) || I.wordMoving(w, f)) continue;
        const p = poseAt(f);
        if (inFrameShare(w, f, p, vfov) <= CLIP_SHARE || !G.readableOrientation(w, f, p, vfov)) continue;
        const size = letterHeight(w, f, p, vfov);
        if (size != null && (!best || size > best.size)) best = { size, f };
      }
      if (!best) continue;
      const p = poseAt(best.f);
      const on = scene.words.filter(x => !x.reveal_copy_of && drawn(x, best.f) && inFrameShare(x, best.f, p, vfov) >= FILLED_SHARE);
      const crowded = on.length >= S.crowdedWords || on.reduce((t, x) => t + boxCoverage(x, best.f, p, vfov), 0) >= S.crowdedArea;
      const min = crowded ? S.minH : S.roomFactor * S.minH;
      const [fa, fb] = focusWindow(w, onsetOf, fps);
      if (best.size < min - 1e-9) out.push({ w, start: h.start, end: h.end, f: best.f, size: best.size, min, crowded, focused: fa < h.end && fb > h.start });
    }
  }
  return out;
}

// No word static and partly on screen (brief 6 item 5; Jefferson: "No word should ever be static and partly on screen.
// A word's boundary has only three allowed states: moving onto the screen, moving off it, or wholly on screen.").
// Visible fraction r(f): the word's ink (letter band, or the whole box for a word on a block) projected and clipped to
// the frame, as a share of its projected area. Partly on screen: PARTIAL_LO < r < PARTIAL_HI. Static: r changes by less
// than STATIC_RATE per frame (centred difference). A run of STATIC_FRAMES or more partly-on-screen static frames fails.
// Best guesses: STATIC_RATE 0.01 (crossing the edge in under about 3 s counts as moving), STATIC_FRAMES 4 (0.13 s).
export const PARTIAL_LO = 0.005, PARTIAL_HI = 0.995, STATIC_RATE = 0.01, STATIC_FRAMES = 4;
function clipPoly(poly, inside, cut) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], ia = inside(a), ib = inside(b);
    if (ia) out.push(a);
    if (ia !== ib) out.push(cut(a, b));
  }
  return out;
}
const polyArea = p => { let a = 0; for (let i = 0; i < p.length; i++) { const [x0, y0] = p[i], [x1, y1] = p[(i + 1) % p.length]; a += x0 * y1 - x1 * y0; } return Math.abs(a) / 2; };
export function visibleFraction(w, f, pose, vfov) {
  const I = globalThis.KT_INTERP;
  const X = I.wordXform(w, f), band = hasBlock(w) ? 1 : Math.min(1, (w.cap ?? w.h) / w.h);
  const c = X(w.C), n = X(add(w.C, w.N)).map((x, i) => x - c[i]);
  if (n.reduce((s, x, i) => s + x * (pose.position[i] - c[i]), 0) <= 0) return null; // seen from behind: not drawn
  // Corners in camera space, clipped to the near plane, then projected.
  const tv = Math.tan((vfov * Math.PI) / 360), aspect = 16 / 9;
  let cam = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
    const p = X(add(w.C, add(mul(w.R, u * w.w / 2), mul(w.U, v * band * w.h / 2))));
    const d = p.map((x, i) => x - pose.position[i]);
    return [d.reduce((s, x, i) => s + x * pose.R[i], 0), d.reduce((s, x, i) => s + x * pose.U[i], 0), -d.reduce((s, x, i) => s + x * pose.N[i], 0)];
  });
  const near = 1;
  cam = clipPoly(cam, p => p[2] >= near, (a, b) => { const t = (near - a[2]) / (b[2] - a[2]); return a.map((x, i) => x + (b[i] - x) * t); });
  if (cam.length < 3) return 0;
  let p = cam.map(q => [q[0] / (q[2] * tv * aspect), q[1] / (q[2] * tv)]);
  const total = polyArea(p);
  if (!(total > 0)) return 0;
  for (const [axis, sign] of [[0, 1], [0, -1], [1, 1], [1, -1]])
    p = clipPoly(p, q => sign * q[axis] <= 1, (a, b) => { const t = (sign - a[axis]) / (b[axis] - a[axis]); return a.map((x, i) => x + (b[i] - x) * t); });
  return p.length < 3 ? 0 : polyArea(p) / total;
}
// Runs of a word partly on screen and static, each inside its partly-on-screen span [spanStart, spanEnd).
export function staticPartials(scene, { from = 0, until = scene.meta.frames, words = scene.words } = {}) {
  const I = globalThis.KT_INTERP, vfov = scene.meta.vfov ?? 40, out = [];
  const poses = new Map(), poseAt = f => poses.get(f) ?? poses.set(f, I.poseAt(scene.cams, f)).get(f);
  for (const w of words) {
    if (w.dropped) continue;
    const a = Math.max(from, w.on, 0), b = Math.min(until, w.off ?? until);
    if (b - a < STATIC_FRAMES) continue;
    const r = [];
    for (let f = a - 1; f <= b; f++) r.push(f >= a && f < b && drawn(w, f) ? visibleFraction(w, f, poseAt(f), vfov) : null);
    const at = f => r[f - a + 1];
    const partial = f => { const v = at(f); return v != null && v > PARTIAL_LO && v < PARTIAL_HI; };
    let f = a;
    while (f < b) {
      if (!partial(f)) { f++; continue; }
      let e = f; while (e < b && partial(e)) e++;
      // Static frames inside the span [f, e).
      let s = null;
      for (let g = f; g <= e; g++) {
        const prev = at(g - 1) ?? at(g), next = at(g + 1) ?? at(g);
        const still = g < e && Math.abs((next ?? 0) - (prev ?? 0)) / 2 < STATIC_RATE;
        if (still && s == null) s = g;
        if (!still && s != null) { if (g - s >= STATIC_FRAMES) out.push({ w, start: s, end: g, spanStart: f, spanEnd: e, share: at(s) }); s = null; }
      }
      f = e;
    }
  }
  return out;
}
// Resolve: the whole partly-on-screen span of such a word is hidden ("That fragment should not appear at all"), outside
// its focus window. A focused word is reported, never hidden (the shown-whole gate keeps it whole there).
export function hideStaticPartials(scene, onsetOf, { until = scene.meta.frames } = {}) {
  const fps = scene.meta.fps ?? 30, log = [], focused = [];
  for (let pass = 0; pass < 3; pass++) {
    const runs = staticPartials(scene, { until });
    let changed = false;
    const done = new Set();
    for (const x of runs) {
      const key = `${x.w.id}:${x.spanStart}`;
      if (done.has(key)) continue;
      done.add(key);
      const [fa, fb] = focusWindow(x.w, onsetOf, fps);
      const a = x.spanStart, b = x.spanEnd;
      let from = a;
      if (!x.w.reveal_copy_of && onsetOf(x.w) != null && fa < b && fb > a) {
        // A focused word must stay whole from where it comes to rest through its onset and for SHOWN_FRAMES; after
        // that it may be hidden. If the static frames fall inside that requirement, report it instead.
        const o = onsetOf(x.w), A = appearanceFrame(x.w);
        const mustEnd = Math.max(A + G.SHOWN_FRAMES - 1, o);
        if (x.start <= mustEnd) { focused.push(`${x.w.id} ${x.w.text} ${x.start}-${x.end}`); continue; }
        from = Math.max(a, mustEnd + 1);
      }
      hide(x.w, from, b); changed = true;
      log.push(`${x.w.id} ${x.w.text}: hidden ${from}-${b} (static and ${Math.round(100 * x.share)}% on screen on frames ${x.start}-${x.end})`);
    }
    if (!changed) break;
  }
  return { log, focused: [...new Set(focused)] };
}
