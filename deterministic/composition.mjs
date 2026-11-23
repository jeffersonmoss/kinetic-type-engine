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
import { JERSEY_FONTS } from './style.mjs';
import { isGrey, ungrey } from './word_roles.mjs';

export const LONE_MIN = 0.22, LONE_WIDTH = 0.8, FOCUS_READ = 15;
const add = (a, b) => a.map((x, i) => x + b[i]);
const mul = (a, k) => a.map(x => x * k);
const sub = (a, b) => a.map((x, i) => x - b[i]);
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
  // The letters' band is the cap height plus the drawn ink outside it: round-letter overshoot (3% of the cap) and, on
  // jersey letters, half the bold stroke on each side (brief 7 item 11: a jersey word whose cap band was just past the
  // top edge still showed its stroke there).
  const jb = JERSEY_FONTS.includes(w.font) && !w.stripes && !w.wordmark ? 0.10 : 0;
  const X = I.wordXform(w, f), band = hasBlock(w) ? 1 : Math.min(1, (w.cap ?? w.h) * (1.03 + jb) / w.h);
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
// Edge-on (brief 7 item 5): a word turned so far from the camera that its letters are foreshortened past reading (the
// angle between its face and the line to the camera under EDGE_ON_DEG) counts as unreadable while the camera is still.
export const EDGE_ON_DEG = 20;
function edgeOn(w, f, pose) {
  const X = globalThis.KT_INTERP.wordXform(w, f), c = X(w.C), n = X(add(w.C, w.N)).map((x, i) => x - c[i]);
  const d = pose.position.map((x, i) => x - c[i]), nl = Math.hypot(...n), dl = Math.hypot(...d);
  if (!(nl > 0) || !(dl > 0)) return false;
  return n.reduce((s, x, i) => s + x * d[i], 0) / (nl * dl) < Math.sin(EDGE_ON_DEG * Math.PI / 180);
}
// Sideways at the edge (brief 8 item 52: IN at 123.9 s): a word of SIDE_LETTERS letters or fewer turned 60 to 120
// degrees from upright whose box touches or crosses the frame edge (within EDGE_GAP of it) reads as a stray mark, so
// outside its focus window it is hidden while the camera is still, like an edge-on word.
export const SIDE_LETTERS = 2, EDGE_GAP = 0.02;
function sidewaysAtEdge(w, f, pose, vfov) {
  if (String(w.text).replace(/[^A-Za-z0-9]/g, '').length > SIDE_LETTERS) return false;
  const cs = cornersAt(w, f);
  if (!cs) return false;
  const q = cs.map(c => globalThis.KT_INTERP.project(c, pose, vfov));
  if (q.some(x => !x)) return false;
  const ang = Math.abs(Math.atan2(q[1].y - q[0].y, (q[1].x - q[0].x) * 16 / 9) * 180 / Math.PI);
  if (ang < 60 || ang > 120) return false;
  return q.some(x => Math.abs(x.x) >= 1 - EDGE_GAP || Math.abs(x.y) >= 1 - EDGE_GAP);
}
export function hideUnreadable(scene, onsetOf, { until = scene.meta.frames } = {}) {
  const I = globalThis.KT_INTERP, vfov = scene.meta.vfov ?? 40, fps = scene.meta.fps ?? 30, log = [], focused = [];
  const poses = new Map(), poseAt = f => poses.get(f) ?? poses.set(f, I.poseAt(scene.cams, f)).get(f);
  for (const w of scene.words) {
    if (w.reveal_copy_of) continue;
    const [focusFrom, focusTo] = focusWindow(w, onsetOf, fps);
    const end = Math.min(until, w.off ?? until);
    let run = null;
    const close = f => { if (run) { hide(w, run, f); log.push(`${w.id} ${w.text}: hidden ${run}-${f} (upside down, mirrored, from behind, edge-on, or a short word sideways at the frame edge)`); run = null; } };
    for (let f = Math.max(0, w.on); f < end; f++) {
      // Upside down counts while the camera is still; during a camera move a turning word may pass the vertical.
      const still = !scene.cams.some(k => k.f0 < f && f < k.f1);
      const bad = drawn(w, f) && inFrameShare(w, f, poseAt(f), vfov) > 0 && (!G.readableOrientation(w, f, poseAt(f), vfov, { tilt: still }) || (still && (edgeOn(w, f, poseAt(f)) || sidewaysAtEdge(w, f, poseAt(f), vfov))));
      if (bad && f >= focusFrom && f < focusTo) { focused.push(`${w.id} ${w.text} at frame ${f}`); close(f); continue; }
      if (bad && run == null) run = f;
      if (!bad) close(f);
    }
    close(end);
  }
  return { log, focused: [...new Set(focused.map(x => x.replace(/ at frame \d+$/, '')))] };
}

// Fly-through (brief 8 item 56: the camera passed through DAY's block at 79.8 s, a white flash). Only a true pass-through
// (brief 9 item 26: WOLVES at 120.6 s was hidden while the camera slid past it, so it popped off in one frame): while
// the camera moves and the word itself is still, a word reaching behind the camera's near plane, or with letters over
// FLY_LETTERS of the frame height and under FLY_SHARE of its letters in frame, is hidden on those frames, except while
// it must be shown whole (from where it comes to rest through its onset and SHOWN_FRAMES; reported), and only while
// the frame centre's line of sight meets the word (the camera heads into it, not past its edge). Each hide says
// whether it changes visible pixels (brief 9 item 29): some of the word was in frame and unoccluded on its frames.
export const FLY_LETTERS = 0.9, FLY_SHARE = 0.5;
export function hideFlythrough(scene, onsetOf, { until = scene.meta.frames, letters = FLY_LETTERS, maxFrames = 7 } = {}) {
  const I = globalThis.KT_INTERP, vfov = scene.meta.vfov ?? 40, log = [], focused = [];
  let visible = 0;
  for (const w of scene.words) {
    if (w.reveal_copy_of) continue;
    const o = onsetOf(w), mustEnd = o == null ? -1 : Math.max(appearanceFrame(w) + G.SHOWN_FRAMES - 1, o);
    const end = Math.min(until, w.off ?? until);
    let run = null, seen = false;
    // Brief 9 item 27: a hide that leaves a stretch over maxFrames near-empty (a lone sideways word counts as empty)
    // is undone and reported.
    const close = f => {
      if (run == null) return;
      const near = { from: Math.max(0, run - maxFrames - 1), until: Math.min(until, f + maxFrames + 1), sideFill: SIDE_FILL };
      const longRuns = () => emptyFrames(scene, near).filter(r => r.end - r.start + 1 > maxFrames).length;
      const before = longRuns(), op = JSON.stringify(w.opacity ?? null);
      hide(w, run, f);
      if (longRuns() > before) {
        const v = JSON.parse(op); if (v) w.opacity = v; else delete w.opacity;
        log.push(`${w.id} ${w.text}: not hidden ${run}-${f} (the camera passes through it, but hiding it would leave the screen near-empty)`);
      } else {
        if (seen) visible++;
        log.push(`${w.id} ${w.text}: hidden ${run}-${f} (the camera passes through it)${seen ? '' : '; no visible change (out of frame or covered on those frames)'}`);
      }
      run = null; seen = false;
    };
    for (let f = Math.max(0, w.on); f < end; f++) {
      const moving = scene.cams.some(k => k.f0 <= f && f <= k.f1);
      let bad = false, vis = 0;
      if (moving && drawn(w, f) && !I.wordMoving(w, f)) {
        const pose = I.poseAt(scene.cams, f), share = inFrameShare(w, f, pose, vfov);
        if (share > 0 || nearCamera(w, f, pose)) {
          const h = letterHeight(w, f, pose, vfov);
          bad = ((nearCamera(w, f, pose) || (h != null && h > letters && share < FLY_SHARE)) && centreOnWord(w, f, pose)) ||
            crossesBox(w, f - 1, scene) || crossesBox(w, f, scene);
          if (bad) vis = visibleFraction(w, f, pose, vfov, scene, { absolute: true }) ?? 0;
        }
      }
      if (bad && f <= mustEnd) { focused.push(`${w.id} ${w.text} at frame ${f}`); close(f); continue; }
      if (bad && run == null) run = f;
      if (bad && vis > 0) seen = true;
      if (!bad) close(f);
    }
    close(end);
  }
  return { log, visible, focused: [...new Set(focused.map(x => x.replace(/ at frame \d+$/, '')))] };
}
// The line of sight through the frame centre meets the word's box in front of the camera: the camera is heading into
// the word, not turning or sliding past its edge (WOLVES at 120.6 s, 9% in frame at the edge as the camera pivots by).
function centreOnWord(w, f, pose) {
  const cs = cornersAt(w, f);
  if (!cs) return false;
  const sub3 = (a, b) => a.map((x, i) => x - b[i]), dot3 = (a, b) => a.reduce((t, x, i) => t + x * b[i], 0);
  const e1 = sub3(cs[1], cs[0]), e2 = sub3(cs[3], cs[0]);
  const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  const dir = pose.N.map(x => -x), dn = dot3(dir, n);
  if (Math.abs(dn) < 1e-12) return false;
  const t = dot3(sub3(cs[0], pose.position), n) / dn;
  if (!(t > 0)) return false;
  const hit = sub3(pose.position.map((x, i) => x + dir[i] * t), cs[0]);
  const u = dot3(hit, e1) / dot3(e1, e1), v = dot3(hit, e2) / dot3(e2, e2);
  return u >= 0 && u <= 1 && v >= 0 && v <= 1;
}
// The camera goes through the word's box between frames f and f + 1 (brief 10 item 12: GRINS at 126.00 s, a pale blue
// block across the right third as the camera's pivot crossed its plaque). Posed geometry, drawn or not.
function crossesBox(w, f, scene) {
  const I = globalThis.KT_INTERP;
  const at = g => {
    const X = I.wordXform(w, g), pose = I.poseAt(scene.cams, g);
    const cs = [[-1, -1], [1, -1], [-1, 1]].map(([a, b]) => X(add(w.C, add(mul(w.R, a * w.w / 2), mul(w.U, b * w.h / 2)))));
    const e1 = sub(cs[1], cs[0]), e2 = sub(cs[2], cs[0]), n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const rel = sub(pose.position, cs[0]), d = n.reduce((t, x, i) => t + x * rel[i], 0) / Math.hypot(...n);
    const u = rel.reduce((t, x, i) => t + x * e1[i], 0) / e1.reduce((t, x) => t + x * x, 0), v = rel.reduce((t, x, i) => t + x * e2[i], 0) / e2.reduce((t, x) => t + x * x, 0);
    return { d, u, v };
  };
  const a = at(f), b = at(f + 1);
  if (Math.sign(a.d) === Math.sign(b.d)) return false;
  const t = a.d / (a.d - b.d), u = a.u + (b.u - a.u) * t, v = a.v + (b.v - a.v) * t;
  return u >= 0 && u <= 1 && v >= 0 && v <= 1;
}
// Part of the word is behind the camera's near plane (the camera is inside or past it).
function nearCamera(w, f, pose) {
  const cs = cornersAt(w, f);
  return !!cs && cs.some(p => -p.reduce((a, x, i) => a + (x - pose.position[i]) * pose.N[i], 0) < VIEW_NEAR);
}
// No empty frame mid-song (brief 4): where no word is visible between the intro and the end, the words on screen just
// before stay on until the next word is visible, when that adds no projected overlap. Remaining empty runs are listed.
function anyVisible(scene, f, pose, vfov, sideFill = 1) {
  const I = globalThis.KT_INTERP;
  // Something on screen: an intro overlay (badge, title card), a picture element or a word.
  if ((scene.intro ?? []).some(x => f >= x.start && f < x.end)) return true;
  const filling = [...scene.words, ...(scene.elements ?? [])].filter(w => {
    const on = (w.on <= f && (w.off == null || f < w.off)) || (w.reveal_on != null && f >= w.reveal_on);
    if (!on || opacityAt(w, f) <= 0.05) return false;
    const X = I.wordXform(w, f), c = X(w.C), n = X(add(w.C, w.N)).map((x, i) => x - c[i]);
    if (n.reduce((s, x, i) => s + x * (pose.position[i] - c[i]), 0) <= 0) return false;
    // Filled means a word at least FILLED_SHARE in frame and readable; an edge sliver does not count.
    return inFrameShare(w, f, pose, vfov) >= FILLED_SHARE && G.readableOrientation(w, f, pose, vfov, { tilt: false }) && !sliver(w, f, pose, vfov);
  });
  if (!filling.length) return false;
  // Brief 7 item 3: a frame whose only words are under the size minimum (Type rule 1, the minimum for that frame) is
  // empty too. Picture elements, wordmarks and words with no measurable letters always count.
  const S = { ...SIZE_DEFAULTS, ...(scene.meta.size_rule ?? {}) };
  const crowded = filling.length >= S.crowdedWords || filling.reduce((a, w) => a + boxCoverage(w, f, pose, vfov), 0) >= S.crowdedArea;
  const min = (crowded ? S.minH : S.roomFactor * S.minH) * EMPTY_SIZE_SLACK;
  return filling.some(w => { if (w.kind === 'element' || w.wordmark) return true; const h = letterHeight(w, f, pose, vfov); return h == null || h >= min * (sideFill > 1 && sideways(w, f, pose, vfov) ? sideFill : 1); });
}
// Near-empty (brief 9 item 27: a 13.9% WE turned 90 degrees, left alone for 0.47 s by a hide, read as tiny): for the
// check that a hide does not empty the screen, a word turned 60 to 120 degrees from upright fills a frame only with
// letters at least SIDE_FILL times that frame's minimum. The song-wide empty-screen gate and Type rule 1 do not use it.
export const SIDE_FILL = 1.5;
function sideways(w, f, pose, vfov) {
  const cs = cornersAt(w, f);
  if (!cs) return false;
  const q = cs.map(c => globalThis.KT_INTERP.project(c, pose, vfov));
  if (q.some(x => !x)) return false;
  const a = Math.abs(Math.atan2(q[1].y - q[0].y, (q[1].x - q[0].x) * 16 / 9) * 180 / Math.PI);
  return a >= 60 && a <= 120;
}
// Sliver (brief 8 item 50): a word seen nearly edge-on, its drawn width under SLIVER_ASPECT of its true width for its
// drawn height (HE flipping in at 84.5 s), is unreadable, so it does not fill the frame. Measured on the projected box
// (midpoints of opposite edges), so a hinge flip or a one-axis grow counts.
export const SLIVER_ASPECT = 0.5;
function sliver(w, f, pose, vfov) {
  const cs = cornersAt(w, f);
  if (!cs || !(w.w > 0) || !(w.h > 0)) return false;
  const q = cs.map(c => globalThis.KT_INTERP.project(c, pose, vfov));
  if (q.some(x => !x)) return false;
  const A = 16 / 9, m = (a, b) => [(a.x + b.x) / 2 * A, (a.y + b.y) / 2];
  const l = m(q[0], q[3]), r = m(q[1], q[2]), lo = m(q[0], q[1]), hi = m(q[3], q[2]);
  const dw = Math.hypot(r[0] - l[0], r[1] - l[1]), dh = Math.hypot(hi[0] - lo[0], hi[1] - lo[1]);
  if (!(dh > 0)) return true;
  return dw / dh < SLIVER_ASPECT * (w.w / w.h);
}
// A word within 3% of its minimum still fills the frame (rounding, and the 13.4% HOWLS class of near misses).
export const EMPTY_SIZE_SLACK = 0.97;
export const FILLED_SHARE = 0.5;
export function emptyFrames(scene, { from = 0, until = scene.meta.frames, sideFill = 1 } = {}) {
  const I = globalThis.KT_INTERP, vfov = scene.meta.vfov ?? 40, runs = [];
  for (let f = from; f < until; f++) {
    if (anyVisible(scene, f, I.poseAt(scene.cams, f), vfov, sideFill)) continue;
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
    const overlapBefore = overlapFrames(scanOverlap(scene, { from: lo, until: hi }).overlaps, scene.meta.fps ?? 30);
    const wLo = Math.max(from, run.start - 20), wHi = Math.min(until, run.end + 21);
    const emptyCount = () => emptyFrames(scene, { from: wLo, until: wHi }).reduce((n, r) => n + r.end - r.start + 1, 0);
    const emptyBefore = emptyCount();
    // Kept when fewer frames nearby are empty (a part-filled run gets the other tries on the next pass).
    const accept = () => emptyCount() < emptyBefore &&
      overlapFrames(scanOverlap(scene, { from: lo, until: hi }).overlaps, scene.meta.fps ?? 30) <= overlapBefore && partials() <= basePartial;
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

// Swell (brief 7 item 3, fill 6): an empty stretch left after the other fills, in which the only words on screen are
// under the size minimum, is filled by swelling those words to the minimum: a scale segment up over SWELL_RAMP frames
// from the stretch start (or the word's appearance, if later), and back down over SWELL_RAMP frames ending by the
// stretch end, or earlier when the next word's entrance would collide. The pivot is tried on a 3 by 3 grid over the
// group's box, then over each word's own box. A swell is kept only if no stretch over the limit is left, and it adds no
// projected overlap, no partly shown focused word and no static partly-on-screen word. Scale factor at most SWELL_MAX.
export const SWELL_RAMP = 3, SWELL_MAX = 3.5;
export function swellSmallWords(scene, { from = 0, until = scene.meta.frames, onsetOf, maxFrames = 7 } = {}) {
  const I = globalThis.KT_INTERP, vfov = scene.meta.vfov ?? 40, log = [], dbg = process.env.KTE_SWELL_DEBUG;
  const S = { ...SIZE_DEFAULTS, ...(scene.meta.size_rule ?? {}) };
  const long = r => r.end - r.start + 1 > maxFrames;
  const ease = { a: 2, b: 4, x0: 0.34 };
  for (const run of emptyFrames(scene, { from, until }).filter(long)) {
    if (run.start === 0) continue;
    // The words readable (over half in frame) on some frame of the stretch, with the first such frame.
    const seen = new Map();
    for (let f = run.start; f <= run.end; f++) {
      const pose = I.poseAt(scene.cams, f);
      for (const w of scene.words) {
        if (seen.has(w) || w.reveal_copy_of || w.wordmark || w.on > f || (w.off != null && w.off <= f) || opacityAt(w, f) <= 0.05) continue;
        if ((w.motion ?? []).some(m => m.kind === 'hinge')) continue;
        if ((visibleFraction(w, f, pose, vfov, scene) ?? 0) > 0.5) seen.set(w, f);
      }
    }
    const small = [...seen.keys()].filter(w => (w.off == null || w.off > run.end));
    if (!small.length) { if (dbg) console.log('swell nosmall', run.start, run.end); continue; }
    // Each word's scale brings it to the minimum on every frame of the stretch on which it is readable (past the ramp).
    let together = 0;
    for (let f = run.start; f <= run.end; f++) { const pose = I.poseAt(scene.cams, f); together = Math.max(together, small.filter(w => seen.get(w) <= f && (visibleFraction(w, f, pose, vfov, scene) ?? 0) > 0.5).length); }
    const target = together >= S.crowdedWords ? S.minH : S.roomFactor * S.minH;
    const ks = new Map();
    for (const w of small) {
      let h = Infinity;
      for (let f = Math.min(run.end, seen.get(w) + SWELL_RAMP); f <= run.end; f++) {
        const pose = I.poseAt(scene.cams, f);
        if ((visibleFraction(w, f, pose, vfov, scene) ?? 0) > 0.5) h = Math.min(h, letterHeight(w, f, pose, vfov) ?? Infinity);
      }
      if (Number.isFinite(h) && h > 0 && h < target) ks.set(w, Math.min(SWELL_MAX, target / h * 1.04));
    }
    small.splice(0, small.length, ...small.filter(w => ks.has(w)));
    if (!small.length) { if (dbg) console.log('swell skip', run.start, run.end); continue; }
    const big = Math.min(...small.map(w => target / ks.get(w) * 1.04)), k = Math.max(...ks.values());
    const why = {};
    const lo = Math.max(0, run.start - 2), hi = Math.min(until, run.end + 12);
    const ovScore = () => overlapFrames(scanOverlap(scene, { from: lo, until: hi }).overlaps, scene.meta.fps ?? 30);
    const ovBefore = ovScore();
    const partBefore = onsetOf ? gateFailures(scene, onsetOf, { until }).filter(x => x.kind === 'partial').length : 0;
    const statBefore = staticPartials(scene, { from: lo, until: hi }).length;
    // Any one word at size fills a frame, so subsets of the small words are tried, fewest words first (largest first).
    const all = small.slice(), subsets = [];
    for (let m = 1; m < 1 << all.length; m++) subsets.push(all.filter((_, i) => m & (1 << i)));
    const fillers = ws => ws.filter(w => !w.keyword).length;
    subsets.sort((p, q) => p.length - q.length || fillers(p) - fillers(q) || ks.get(p[0]) - ks.get(q[0]));
    const dot = (p, q) => p.reduce((s2, x, i) => s2 + x * q[i], 0);
    const pivotsOf = ws => {
      const R0 = ws[0].R, U0 = ws[0].U;
      const ext = ws.flatMap(w => [-1, 1].flatMap(sx => [-1, 1].map(sy => add(w.C, add(mul(w.R, sx * w.w / 2), mul(w.U, sy * w.h / 2))))));
      const rs = ext.map(p => dot(p, R0)), us = ext.map(p => dot(p, U0));
      const gc = mul(ext.reduce((s2, p) => add(s2, p), [0, 0, 0]), 1 / ext.length);
      const gr = (Math.max(...rs) - Math.min(...rs)) / 2, gu = (Math.max(...us) - Math.min(...us)) / 2;
      const out = [];
      for (const [px, py] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const tag = `${py < 0 ? 'bottom' : py > 0 ? 'top' : ''}${px && py ? ' ' : ''}${px < 0 ? 'left' : px > 0 ? 'right' : ''}` || 'centre';
        out.push([ws.length > 1 ? `the group's ${tag}` : `its ${tag}`, ws.map(() => add(gc, add(mul(R0, px * gr), mul(U0, py * gu))))]);
        if (ws.length > 1) out.push([`each word's ${tag}`, ws.map(w => add(w.C, add(mul(w.R, px * w.w / 2), mul(w.U, py * w.h / 2))))]);
      }
      return out;
    };
    // End choices: all back to size by the stretch end (or a few frames earlier), or a hand-off, each word back to size
    // as the next word of the subset reaches it.
    const ends = [run.end + 1]; for (let e = run.end; e > run.start + SWELL_RAMP * 2 && run.end + 1 - e <= maxFrames - 1; e--) ends.push(e);
    ends.push('hand-off', 'early hand-off');
    const snap = new Map(all.map(w => [w, JSON.stringify(w.motion ?? null)]));
    const restore = ws => ws.forEach(w => { const v = JSON.parse(snap.get(w)); if (v) w.motion = v; else delete w.motion; });
    const near = { from: Math.max(0, run.start - maxFrames), until: Math.min(until, run.end + maxFrames + 1) };
    let done = null, used = null;
    // Brief 9 item 28 (AND at 23.5 s ran off the left edge): a swelled word may not lose any of its in-frame share.
    const shareOf = (w, f) => inFrameShare(w, f, I.poseAt(scene.cams, f), vfov);
    search: for (const ws of subsets) {
      const pre = new Map(ws.map(w => [w, Array.from({ length: run.end - run.start + 2 }, (_, i) => drawn(w, run.start + i) ? shareOf(w, run.start + i) : null)]));
      const inFrame = () => ws.every(w => pre.get(w).every((v, i) => v == null || !drawn(w, run.start + i) || shareOf(w, run.start + i) >= Math.min(v, 0.995) - 1e-9));
      // A subset that cannot clear the stretch even with no other check is skipped before the pivot search.
      for (const dn1 of ends) for (const [name, P] of pivotsOf(ws)) {
        const hand = typeof dn1 === 'string';
        if (hand && ws.length < 2) continue;
        const order = ws.slice().sort((p, q) => seen.get(p) - seen.get(q));
        ws.forEach((w, i) => {
          // The swell starts as the word comes on (it may still be entering), so it is at size when it is readable.
          const up0 = Math.max(run.start, w.on), nx = order[order.indexOf(w) + 1];
          const end = hand ? (nx ? Math.max(up0 + 2, seen.get(nx) + (dn1 === 'hand-off' ? SWELL_RAMP : 0)) : run.end + 1) : dn1;
          const up1 = Math.min(up0 + SWELL_RAMP, end - 1), dn0 = Math.max(up1, end - SWELL_RAMP);
          if (hand && nx && seen.get(nx) <= up0) return;
          w.motion = [...(w.motion ?? []), { f0: up0, f1: up1, ease, kind: 'scale', P: P[i], from: 1, to: ks.get(w), swell: true }, { f0: dn0, f1: end, ease, kind: 'scale', P: P[i], from: ks.get(w), to: 1, swell: true }];
        });
        const tests = [['frame', inFrame], ['empty', () => !emptyFrames(scene, near).filter(long).length],
          ['overlap', () => ovScore() <= ovBefore],
          ['static', () => staticPartials(scene, { from: lo, until: hi }).length <= statBefore],
          ['partial', () => !onsetOf || gateFailures(scene, onsetOf, { until }).filter(x => x.kind === 'partial').length <= partBefore]];
        const bad = tests.find(([, t]) => !t());
        if (!bad) { done = hand ? `${name}, each handing off to the next` : `${name}, back to size by frame ${dn1}`; used = ws; break search; }
        why[bad[0]] = (why[bad[0]] ?? 0) + 1;
        restore(ws);
      }
    }
    if (dbg && !done) console.log('swell none', run.start, run.end, small.map(w => w.text).join(' '), k.toFixed(2), JSON.stringify(why));
    if (done) log.push(`frames ${run.start}-${run.end} (${(run.start / (scene.meta.fps ?? 30)).toFixed(2)} s): ${used.map(w => `${w.id} ${w.text} x${ks.get(w).toFixed(2)}`).join(', ')} swelled to ${(100 * target).toFixed(1)}% about ${done}`);
  }
  const all = emptyFrames(scene, { from, until });
  return { log, remaining: all.filter(long), short: all.filter(r => !long(r)) };
}

// Swell release (brief 8 item 51): a word swelled xSWELL_BIG or more that shrinks back to its resting size reads as a
// big-then-tiny jump. Tried in order, each kept only if it adds no projected overlap, static partly-on-screen word,
// partly shown focused word or empty stretch over the limit: (1) hold the swelled size to the end of the word's life;
// (2) settle at the square root of the swell; (3) release over RELEASE_SLOW frames, as far as its life allows.
// Otherwise the swell is left and reported.
export const SWELL_BIG = 2, RELEASE_SLOW = 12;
export function swellRelease(scene, onsetOf, { until = scene.meta.frames, maxFrames = 7 } = {}) {
  const fps = scene.meta.fps ?? 30, log = [];
  const long = r => r.end - r.start + 1 > maxFrames;
  for (const w of scene.words) {
    const segs = (w.motion ?? []).filter(m => m.swell && m.kind === 'scale');
    for (const up of segs.filter(m => m.from === 1 && m.to >= SWELL_BIG)) {
      const dn = segs.find(m => m !== up && m.from === up.to && m.to === 1 && m.f0 >= up.f1);
      if (!dn) continue;
      const end = Math.min(until, w.off ?? until), k = up.to;
      const lo = Math.max(0, dn.f0 - 2), hi = Math.min(until, end + maxFrames + 1);
      const ov = () => overlapFrames(scanOverlap(scene, { from: lo, until: hi }).overlaps, fps);
      const st = () => staticPartials(scene, { from: lo, until: hi }).length;
      const pa = () => gateFailures(scene, onsetOf, { until }).filter(x => x.kind === 'partial').length;
      const em = () => emptyFrames(scene, { from: lo, until: hi }).filter(long).length;
      // Brief 9 item 28: the word may not lose in-frame share on any frame (AND ran off the left edge as it released).
      const I = globalThis.KT_INTERP, vfov = scene.meta.vfov ?? 40, sh = f => inFrameShare(w, f, I.poseAt(scene.cams, f), vfov);
      const shares = () => { const out = []; for (let f = dn.f0; f < end; f++) out.push(drawn(w, f) ? sh(f) : 1); return out; };
      const fr0 = shares();
      const fr = () => { const now = shares(); return now.every((v, i) => v >= Math.min(fr0[i], 0.995) - 1e-9) ? 0 : 1; };
      const before = [0, ov(), st(), em(), pa()], was = { f0: dn.f0, f1: dn.f1, to: dn.to, P: dn.P };
      // Brief 10 item 13: keep the release slow and steer it instead: the release may shrink about another point of the
      // word's box, with a shift from (1 - k)(P_up - P) to 0 over the same frames, so the word does not jump where the
      // pivot changes and is steered to a rest point that stays in frame.
      const hinge = (w.motion ?? []).some(m => m.kind === 'hinge');
      const slow = Math.max(dn.f1, Math.min(end, dn.f0 + RELEASE_SLOW));
      const grid = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => add(w.C, add(mul(w.R, a * w.w / 2), mul(w.U, b * w.h / 2))));
      const pivots = hinge ? [up.P] : [up.P, ...grid];
      const tries = [['held at its swelled size to its end', { to: k, f1: dn.f0 + 1, P: up.P }]];
      // Slowest first: RELEASE_SLOW frames, then 8 and 6 (still slower than the 3-frame drop).
      const lens = [...new Set([slow, Math.min(slow, dn.f0 + 8), Math.min(slow, dn.f0 + 6)])].filter(f1 => f1 > dn.f1);
      for (const f1 of lens) for (const r of [Math.sqrt(k), 1]) pivots.forEach((P, i) => tries.push([`released over ${f1 - dn.f0} frames to x${r.toFixed(2)}${i ? ', steered about another point of its box' : ''}`, { to: r, f1, P }]));
      tries.push([`settles at x${Math.sqrt(k).toFixed(2)}`, { to: Math.sqrt(k), P: up.P }]);
      let ok = null, steer = null; const why = {};
      for (const [name, t] of tries) {
        Object.assign(dn, was, t);
        if (steer) { w.motion = w.motion.filter(m => !steer.includes(m)); steer = null; }
        const same = t.P.every((x, i) => Math.abs(x - up.P[i]) < 1e-6);
        if (!same) {
          // A shift channel holds its first segment's `from` before it starts, so a zero segment comes first.
          steer = [{ f0: w.on - 1, f1: w.on - 1, kind: 'shift', from: [0, 0, 0], to: [0, 0, 0], steer: true },
            { f0: dn.f0, f1: dn.f1, ease: dn.ease, kind: 'shift', from: mul(sub(up.P, t.P), 1 - k), to: [0, 0, 0], steer: true }];
          w.motion.push(...steer);
        }
        const checks = [fr, ov, st, em, pa];
        const bad = checks.findIndex((c, i) => c() > before[i]);
        if (bad < 0) { ok = name; break; }
        const nm = ['runs off the frame', 'overlap', 'static partial', 'empty stretch', 'partly shown'][bad]; why[nm] = (why[nm] ?? 0) + 1;
      }
      if (!ok) { Object.assign(dn, was); if (steer) w.motion = w.motion.filter(m => !steer.includes(m)); }
      log.push(`${w.id} ${w.text} (swelled x${k.toFixed(2)} at frame ${up.f0}): ${ok ?? `left to shrink back to size (slower or steered releases refused: ${Object.entries(why).map(([k, n]) => `${k} ${n}`).join(', ')})`}`);
    }
  }
  return log;
}
// Largest word never grey (brief 8 item 54: EVERY at 132 s and OFF at 136.5 s): on any frame, the word with the tallest
// letters among those readable and at least half in frame is made cream if it is grey (its colour pass, word_roles).
export function largestGreyToCream(scene, { until = scene.meta.frames } = {}) {
  const I = globalThis.KT_INTERP, vfov = scene.meta.vfov ?? 40, log = [];
  for (let f = 0; f < until; f++) {
    const pose = I.poseAt(scene.cams, f);
    let top = null, th = 0;
    for (const w of scene.words) {
      if (w.reveal_copy_of || w.wordmark || w.score || !drawn(w, f) || inFrameShare(w, f, pose, vfov) < FILLED_SHARE || !G.readableOrientation(w, f, pose, vfov, { tilt: false })) continue;
      const h = letterHeight(w, f, pose, vfov) ?? 0;
      if (h > th) { th = h; top = w; }
    }
    if (top && isGrey(top)) {
      const was = ungrey(top);
      for (const c of scene.words) if (c.reveal_copy_of === top.id && isGrey(c)) ungrey(c);
      log.push(`${top.id} ${top.text} at ${(f / (scene.meta.fps ?? 30)).toFixed(2)} s: ${was} -> cream (the largest word on screen, ${(100 * th).toFixed(1)}% of the frame height)`);
    }
  }
  return log;
}
// Lone holds (brief 8 item 49): stretches over LONE_HOLD frames in which one readable word is the only one on screen,
// with the dropped words sung inside them (a drop that leaves a single word holding). Reported, not failed.
export const LONE_HOLD = 30;
export function loneHolds(scene, { until = scene.meta.frames, onsetOf } = {}) {
  const I = globalThis.KT_INTERP, vfov = scene.meta.vfov ?? 40, out = [];
  let run = null;
  const close = f => { if (run && f - run.start > LONE_HOLD) out.push({ ...run, end: f - 1 }); run = null; };
  for (let f = 0; f < until; f++) {
    if ((scene.intro ?? []).some(x => f >= x.start && f < x.end)) { close(f); continue; }
    const pose = I.poseAt(scene.cams, f);
    const vis = scene.words.filter(w => !w.reveal_copy_of && drawn(w, f) && inFrameShare(w, f, pose, vfov) >= FILLED_SHARE && G.readableOrientation(w, f, pose, vfov, { tilt: false }));
    if (vis.length === 1 && (!run || run.w === vis[0])) { run ??= { w: vis[0], start: f }; continue; }
    close(f);
    if (vis.length === 1) run = { w: vis[0], start: f };
  }
  close(until);
  return out.map(r => ({ ...r, drops: scene.words.filter(x => x.dropped && onsetOf && onsetOf(x) != null && onsetOf(x) >= r.start - 15 && onsetOf(x) <= r.end) }));
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
// wordmarks: true (brief 8 item 55) sizes only the image wordmarks, by their letter height (w.cap, set from the image's
// letter share by the song appearance pass); one that cannot grow is kept and reported, never dropped or hidden.
export function enforceMinSize(scene, onsetOf, { until = scene.meta.frames, settings = {}, wordmarks = false } = {}) {
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
  // The score weighs overlaps involving the grown word above all others, so a growth cannot trade an overlap elsewhere
  // in the window for a new one of its own (brief 7: WE grown into CIRCLE).
  const overlapsWithDrops = (from, to, id = null) => {
    const ghosts = scene.words.filter(x => x.dropped === 'size' && x.size_restore != null).map(x => [x, x.opacity]);
    for (const [x] of ghosts) { const v = JSON.parse(x.size_restore); if (v) x.opacity = v; else delete x.opacity; }
    const all = scanOverlap(scene, { from, until: to }).overlaps;
    // Overlap frames, not intervals: a growth that lengthens an existing overlap is worse (CIRCLE's stamp frames).
    const frames = o => { const m = o.match(/^([\d.]+)–([\d.]+) s/); return m ? Math.round((+m[2] - +m[1]) * (scene.meta.fps ?? 30)) + 1 : 1; };
    const n = all.reduce((t, o) => t + frames(o), 0) + (id ? 1000 * all.filter(o => o.includes(`${id} `)).reduce((t, o) => t + frames(o), 0) : 0);
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
    if (wordmarks ? !(w.wordmark?.image && !w.reveal_copy_of && !w.echo && !w.dropped) : !resizable(w)) continue;
    if (w.on >= until) continue;
    let sh = shownHolds(w), short = sh.filter(x => x.size < x.min - 1e-9);
    if (!short.length) continue;
    const k = Math.max(...short.map(x => x.min / x.size)) * 1.03, was = Math.max(...short.map(x => x.size));
    if (k <= MAX_GROW && growable(w)) {
      const lo = Math.max(0, w.on), hi = Math.min(until, w.off ?? until);
      const ovBefore = overlapsWithDrops(lo, hi, w.id), failBefore = ownFailures(w);
      const keep = JSON.stringify({ C: w.C, w: w.w, h: w.h, cap: w.cap, fontPx: w.fontPx, pad: w.pad, motion: w.motion });
      const clipped = (w.clip ?? []).length > 0;
      let done = false;
      for (const pv of PIVOTS) {
        grow(w, k, pv);
        if (clipped) w.motion = (w.motion ?? []).map(m => m.kind === 'shift' ? { ...m, from: mul(m.from, k), to: mul(m.to, k) } : m);
        if ((!clipped || clipEntranceOk(scene, w)) && overlapsWithDrops(lo, hi, w.id) <= ovBefore && ownFailures(w) <= failBefore) {
          counts.grown++; done = true;
          log.push(`${w.id} ${w.text}: grown x${k.toFixed(2)}${pv[0] || pv[1] ? ` from its ${['', 'left', 'right'][pv[0] === -1 ? 1 : pv[0] === 1 ? 2 : 0]}${pv[0] && pv[1] ? ' ' : ''}${['', 'bottom', 'top'][pv[1] === -1 ? 1 : pv[1] === 1 ? 2 : 0]} ${pv[0] && pv[1] ? 'corner' : 'edge'}` : ''} (letters ${(100 * was).toFixed(1)}% under the ${(100 * Math.max(...short.map(x => x.min))).toFixed(1)}% minimum)`);
          break;
        }
        Object.assign(w, JSON.parse(keep));
      }
      if (done) { sh = shownHolds(w); short = sh.filter(x => x.size < x.min - 1e-9); if (!short.length) continue; }
    }
    if (wordmarks) {
      const x = short[0]; counts.keptSmall++;
      log.push(`${w.id} ${w.text}: wordmark kept under size (letters ${(100 * x.size).toFixed(1)}% at frame ${x.f}, minimum ${(100 * x.min).toFixed(1)}%; growing x${k.toFixed(2)} would overlap or leave it partly shown; Type rule 1 failure)`);
      continue;
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
    // Type rule 2 (brief 7): a keyword is dropped only by necessity. First make room: grow it and drop the filler words
    // its grown box would overlap (they are dropped for good, `dropped: "room"`, never brought back by the empty-screen
    // undo). Only when a keyword or a name is in the way, or growing fails for another reason, is it dropped.
    if (short.some(x => x.focused) && w.keyword && k <= MAX_GROW && growable(w)) {
      const lo = Math.max(0, w.on), hi = Math.min(until, w.off ?? until), failBefore = ownFailures(w);
      const keep = JSON.stringify({ C: w.C, w: w.w, h: w.h, cap: w.cap, fontPx: w.fontPx, pad: w.pad, motion: w.motion });
      const byId = new Map(scene.words.map(x => [x.id, x])), clipped = (w.clip ?? []).length > 0;
      let made = null;
      for (const pv of PIVOTS) {
        grow(w, k, pv);
        if (clipped) w.motion = (w.motion ?? []).map(m => m.kind === 'shift' ? { ...m, from: mul(m.from, k), to: mul(m.to, k) } : m);
        if ((!clipped || clipEntranceOk(scene, w)) && ownFailures(w) <= failBefore) {
          const mine = scanOverlap(scene, { from: lo, until: hi }).overlaps.filter(o => o.includes(` ${w.id} `) || o.includes(`: ${w.id} `));
          const ids = [...new Set(mine.flatMap(o => [...o.matchAll(/\b(w\d+[a-z0-9]*) /g)].map(m => m[1])))].filter(id => id !== w.id);
          const partners = ids.map(id => byId.get(id));
          if (!mine.some(o => o.includes('panel:') || o.includes('plaque p')) && partners.length && partners.every(x => x && !x.keyword && !x.important && resizable(x))) {
            const ops = partners.map(x => [x, x.opacity]);
            for (const x of partners) x.opacity = [[0, 0]];
            const grownState = JSON.stringify({ C: w.C, w: w.w, h: w.h, cap: w.cap, fontPx: w.fontPx, pad: w.pad, motion: w.motion });
            Object.assign(w, JSON.parse(keep)); const base = overlapsWithDrops(lo, hi, w.id);
            Object.assign(w, JSON.parse(grownState));
            if (overlapsWithDrops(lo, hi, w.id) <= base) { made = partners; break; }
            for (const [x, op] of ops) x.opacity = op;
          }
        }
        Object.assign(w, JSON.parse(keep));
      }
      if (made) {
        for (const x of made) { x.dropped = 'room'; x.opacity = [[0, 0]]; counts.dropped++; log.push(`${x.id} ${x.text}: dropped (filler) to make room for the keyword ${w.id} ${w.text}`); }
        counts.grown++;
        log.push(`${w.id} ${w.text}: grown x${k.toFixed(2)} after dropping ${made.map(x => x.text).join(', ')} (keyword; letters ${(100 * was).toFixed(1)}%)`);
        sh = shownHolds(w); short = sh.filter(x => x.size < x.min - 1e-9); if (!short.length) continue;
      }
    }
    if (short.some(x => x.focused)) {
      // Applied after every word is sized, so each growth was checked against all words shown (a drop undone for the
      // empty-screen rule then brings back no overlap).
      drops.push(w); counts.dropped++;
      if (w.keyword) counts.keywordsDropped = (counts.keywordsDropped ?? 0) + 1;
      const x = short.find(s => s.focused);
      log.push(`${w.id} ${w.text}: dropped${w.keyword ? ' by necessity (keyword: no filler to drop frees room)' : ''} (letters ${(100 * x.size).toFixed(1)}% at frame ${x.f}, minimum ${(100 * x.min).toFixed(1)}% ${x.crowded ? 'crowded' : 'with room'}; ${growable(w) ? 'growing would overlap or leave it partly shown' : (w.clip ?? []).length ? 'growing would overlap, leave it partly shown, or break its entrance past its host' : 'it enters on a hinge, so it cannot grow'})`);
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
// than STATIC_RATE since the frame before. A run of STATIC_FRAMES or more partly-on-screen static frames fails.
// Best guesses: STATIC_RATE 0.01 (crossing the edge in under about 3 s counts as moving), STATIC_FRAMES 3 (0.1 s; brief 7).
export const PARTIAL_LO = 0.005, PARTIAL_HI = 0.995, STATIC_RATE = 0.01, STATIC_FRAMES = 3;
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
// Occluders (brief 7 item 1): viewer.html draws every panel plaque with a flat ground-coloured occluder grown
// OCCLUDER_GROW past its edges (at least 150 units or 0.3 of its smaller side) while the plaque is on. A word behind
// another panel's occluder is cut inside the frame (DOES at 84.6 s in rough cut 6b), which the frame-edge measure
// cannot see. The trims the viewer makes where two non-parallel panels meet are ignored (slightly conservative).
const occluderCache = new WeakMap(), byIdCache = new WeakMap();
const byIdOf = scene => byIdCache.get(scene) ?? byIdCache.set(scene, new Map(scene.words.map(x => [x.id, x]))).get(scene);
export function occludersOf(scene) {
  if (occluderCache.has(scene)) return occluderCache.get(scene);
  const reveal = scene.meta?.whole_song?.revealF0 ?? Infinity;
  const out = (scene.plaques ?? []).filter(p => p.surface === 'panel').map(p => {
    const m = Math.max(150, 0.3 * Math.min(p.w, p.h));
    return { id: p.id, C: p.C, R: p.R, U: p.U, N: p.N, hw: p.w / 2 + m, hh: p.h / 2 + m, on: p.on, off: p.off, reveal_on: p.reveal_on, until: reveal };
  });
  occluderCache.set(scene, out);
  return out;
}
const occluderOn = (o, f) => f < o.until && ((f >= o.on && (o.off == null || f < o.off)) || (o.reveal_on != null && f >= o.reveal_on));
// Share of sample points on the word's letter band that are in frame, past its active clip planes and in front of
// every other panel's occluder, over the samples in frame and past the clip planes (so it multiplies the exact
// frame-and-clip fraction). 1 when nothing occludes.
function unoccludedShare(w, f, pose, vfov, scene, X, band) {
  const occ = occludersOf(scene).filter(o => o.id !== w.plaque && occluderOn(o, f));
  if (!occ.length) return 1;
  const I = globalThis.KT_INTERP, cam = pose.position;
  let seen = 0, hidden = 0;
  for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) {
    const u = -1 + (2 * i + 1) / 16, v = -1 + (2 * j + 1) / 4;
    const p = X(add(w.C, add(mul(w.R, u * w.w / 2), mul(w.U, v * band * w.h / 2))));
    const q = I.project(p, pose, vfov);
    if (!q || Math.abs(q.x) > 1 || Math.abs(q.y) > 1) continue;
    const d = p.map((x, k) => x - cam[k]), dist = Math.hypot(...d);
    let blocked = false;
    for (const o of occ) {
      const dn = d[0] * o.N[0] + d[1] * o.N[1] + d[2] * o.N[2];
      if (Math.abs(dn) < 1e-9) continue;
      const t = ((o.C[0] - cam[0]) * o.N[0] + (o.C[1] - cam[1]) * o.N[1] + (o.C[2] - cam[2]) * o.N[2]) / dn;
      if (!(t > 0) || t * dist > dist - 2) continue; // behind the camera, or not in front of the point
      const h = [cam[0] + d[0] * t - o.C[0], cam[1] + d[1] * t - o.C[1], cam[2] + d[2] * t - o.C[2]];
      if (Math.abs(h[0] * o.R[0] + h[1] * o.R[1] + h[2] * o.R[2]) <= o.hw && Math.abs(h[0] * o.U[0] + h[1] * o.U[1] + h[2] * o.U[2]) <= o.hh) { blocked = true; break; }
    }
    blocked ? hidden++ : seen++;
  }
  return seen + hidden ? seen / (seen + hidden) : 1;
}
// Clip planes (brief 7 item 1): the visible fraction also cuts the word by its active clip half-spaces, as the viewer
// does, so a word stuck part-way past its host's edge counts as partly shown.
// The viewer's camera clips at VIEW_NEAR (viewer.html PerspectiveCamera near 20), so nothing nearer is drawn.
export const VIEW_NEAR = 20;
export function visibleFraction(w, f, pose, vfov, scene = null, { absolute = false } = {}) {
  const I = globalThis.KT_INTERP;
  // The letters' band is the cap height plus the drawn ink outside it: round-letter overshoot (3% of the cap) and, on
  // jersey letters, half the bold stroke on each side (brief 7 item 11: a jersey word whose cap band was just past the
  // top edge still showed its stroke there).
  const jb = JERSEY_FONTS.includes(w.font) && !w.stripes && !w.wordmark ? (scene?.meta?.jersey_bold ?? 0.10) : 0;
  const X = I.wordXform(w, f), band = hasBlock(w) ? 1 : Math.min(1, (w.cap ?? w.h) * (1.03 + jb) / w.h);
  const c = X(w.C), n = X(add(w.C, w.N)).map((x, i) => x - c[i]);
  if (n.reduce((s, x, i) => s + x * (pose.position[i] - c[i]), 0) <= 0) return null; // seen from behind: not drawn
  // Corners in world space (clipped by the word's active clip planes), then camera space clipped to the near plane,
  // then projected; the unclipped outline gives the total.
  const tv = Math.tan((vfov * Math.PI) / 360), aspect = 16 / 9;
  const byId = scene ? byIdOf(scene) : null;
  const world = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => X(add(w.C, add(mul(w.R, u * w.w / 2), mul(w.U, v * band * w.h / 2)))));
  let cut = world;
  for (const { P, n: cn } of (w.clip?.length ? I.wordClips(w, f, byId) : [])) {
    const sd = q => (q[0] - P[0]) * cn[0] + (q[1] - P[1]) * cn[1] + (q[2] - P[2]) * cn[2];
    cut = clipPoly(cut, q => sd(q) >= 0, (a, b) => { const t = sd(a) / (sd(a) - sd(b)); return a.map((x, i) => x + (b[i] - x) * t); });
  }
  const proj = poly => {
    let cam = poly.map(p => {
      const d = p.map((x, i) => x - pose.position[i]);
      return [d.reduce((s, x, i) => s + x * pose.R[i], 0), d.reduce((s, x, i) => s + x * pose.U[i], 0), -d.reduce((s, x, i) => s + x * pose.N[i], 0)];
    });
    const near = VIEW_NEAR;
    cam = clipPoly(cam, p => p[2] >= near, (a, b) => { const t = (near - a[2]) / (b[2] - a[2]); return a.map((x, i) => x + (b[i] - x) * t); });
    return cam.length < 3 ? null : cam.map(q => [q[0] / (q[2] * tv * aspect), q[1] / (q[2] * tv)]);
  };
  const whole = proj(world);
  if (!whole) return 0;
  const total = polyArea(whole);
  if (!(total > 0)) return 0;
  let p = cut === world ? whole : cut.length >= 3 ? proj(cut) : null;
  if (!p) return 0;
  for (const [axis, sign] of [[0, 1], [0, -1], [1, 1], [1, -1]])
    p = clipPoly(p, q => sign * q[axis] <= 1, (a, b) => { const t = (sign - a[axis]) / (b[axis] - a[axis]); return a.map((x, i) => x + (b[i] - x) * t); });
  const share = p.length < 3 ? 0 : (absolute ? polyArea(p) / 4 : polyArea(p) / total);
  return share > 0 && scene ? share * unoccludedShare(w, f, pose, vfov, scene, X, band) : share;
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
    for (let f = a - 1; f <= b; f++) r.push(f >= a && f < b && drawn(w, f) ? visibleFraction(w, f, poseAt(f), vfov, scene) : null);
    const at = f => r[f - a + 1];
    const partial = f => { const v = at(f); return v != null && v > PARTIAL_LO && v < PARTIAL_HI; };
    let f = a;
    while (f < b) {
      if (!partial(f)) { f++; continue; }
      let e = f; while (e < b && partial(e)) e++;
      // Static frames inside the span [f, e).
      let s = null;
      for (let g = f; g <= e; g++) {
        // Still: the share moved under STATIC_RATE since the frame before (brief 7 item 6: a camera pausing for 3 or 4
        // frames mid-sweep left TAPE 58% on screen, which a centred difference across the pause's ends missed).
        const prev = at(g - 1) ?? at(g);
        const still = g < e && Math.abs((at(g) ?? 0) - (prev ?? 0)) < STATIC_RATE;
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
// Zoom entrances (brief 7 item 4): a word that zooms in from a speck starts at no less than ZOOM_FLOOR of the size
// minimum with room (its entrance scale's starting factor is raised), so its first frames are not specks. Kept only if
// the entrance frames gain no overlap.
export const ZOOM_FLOOR = 0.5;
export function floorZoomEntrances(scene, { until = scene.meta.frames, settings = {} } = {}) {
  const S = { ...SIZE_DEFAULTS, ...settings }, I = globalThis.KT_INTERP, vfov = scene.meta.vfov ?? 40, fps = scene.meta.fps ?? 30, log = [];
  const floor = ZOOM_FLOOR * S.roomFactor * S.minH;
  for (const w of scene.words) {
    if (w.on >= until || w.reveal_copy_of) continue;
    const seg = (w.motion ?? []).find(m => m.kind === 'scale' && !m.swell && !m.axis && m.f0 <= w.on + 1 && m.from < 1 && m.to === 1);
    if (!seg) continue;
    const settled = letterHeight(w, seg.f1, I.poseAt(scene.cams, seg.f1), vfov);
    if (!(settled > 0)) continue;
    const from = Math.min(1, floor / settled);
    if (seg.from >= from - 1e-9) continue;
    const lo = Math.max(0, seg.f0 - 1), hi = Math.min(until, seg.f1 + 2);
    const before = overlapFrames(scanOverlap(scene, { from: lo, until: hi }).overlaps, fps, w.id), was = seg.from;
    seg.from = from;
    if (overlapFrames(scanOverlap(scene, { from: lo, until: hi }).overlaps, fps, w.id) <= before)
      log.push(`${w.id} ${w.text}: zoom starts at x${from.toFixed(2)} (was x${was}), first frame ${(100 * settled * from).toFixed(1)}% of the frame height`);
    else seg.from = was;
  }
  return log;
}
// Partners of a hold hide (brief 7 item 8: GIVE hidden for a hold left HIM alone): when the size pass hides a word for
// a hold, its sung neighbour that leans on it (a pronoun object or filler right after it, or a filler right before it)
// is hidden over the same frames, unless the neighbour is in its focus window there; then the hide is undone, so the
// two show together. Uses w.size_hides and w.map_index (word roles).
export function pairHoldHides(scene, onsetOf, { until = scene.meta.frames, maxFrames = 7 } = {}) {
  const fps = scene.meta.fps ?? 30, log = [];
  const byMap = new Map(scene.words.filter(w => w.map_index != null && !w.reveal_copy_of).map(w => [w.map_index, w]));
  for (const h of scene.words) {
    for (const rec of [...(h.size_hides ?? [])]) {
      const [a, b] = rec;
      const after = byMap.get(h.map_index + 1), before = byMap.get(h.map_index - 1);
      const leaners = [after && (after.keyword === false || /^pronoun/.test(after.keyword_why ?? '')) ? after : null,
        before && before.keyword === false ? before : null].filter(Boolean);
      for (const n of leaners) {
        let lo = null, hi = null;
        for (let f = Math.max(a, n.on); f < Math.min(b, n.off ?? until, until); f++) if (drawn(n, f)) { lo ??= f; hi = f + 1; }
        if (lo == null) continue;
        const [fa, fb] = focusWindow(n, onsetOf, fps);
        const near = { from: Math.max(0, lo - maxFrames - 1), until: Math.min(until, hi + maxFrames + 1) };
        const longRuns = () => emptyFrames(scene, near).filter(r => r.end - r.start + 1 > maxFrames).length;
        const runsBefore = longRuns(), nOp = JSON.stringify(n.opacity ?? null);
        let undo = fa < hi && fb > lo;
        if (!undo) { hide(n, lo, hi); if (longRuns() > runsBefore) { const v = JSON.parse(nOp); if (v) n.opacity = v; else delete n.opacity; undo = true; } }
        if (undo) {
          const ovB = overlapFrames(scanOverlap(scene, { from: a, until: b }).overlaps, fps, h.id), hOp = JSON.stringify(h.opacity ?? null);
          const v = JSON.parse(rec[2]); if (v) h.opacity = v; else delete h.opacity;
          if (overlapFrames(scanOverlap(scene, { from: a, until: b }).overlaps, fps, h.id) > ovB || longRuns() > runsBefore) {
            const o = JSON.parse(hOp); if (o) h.opacity = o; else delete h.opacity;
            log.push(`${h.id} ${h.text}: hidden ${a}-${b} for a hold while ${n.id} ${n.text} shows (${fa < hi && fb > lo ? 'it is in its focus window' : 'hiding it would empty the screen'}, and showing ${h.text} would overlap); left as is`);
            break;
          }
          h.size_hides = h.size_hides.filter(x => x !== rec);
          log.push(`${h.id} ${h.text}: hold hide ${a}-${b} undone, so it shows with ${n.id} ${n.text} (${fa < hi && fb > lo ? 'in its focus window' : 'hiding it too would empty the screen'})`);
          break;
        }
        log.push(`${n.id} ${n.text}: hidden ${lo}-${hi} with ${h.id} ${h.text} (hidden there for a hold)`);
      }
    }
  }
  return log;
}
// Overlap measured in frames (the sum of the scan's interval lengths), optionally only intervals involving one word.
export function overlapFrames(list, fps = 30, id = null) {
  return list.filter(o => !id || o.includes(`${id} `)).reduce((t, o) => { const m = o.match(/^([\d.]+)–([\d.]+) s/); return t + (m ? Math.round((+m[2] - +m[1]) * fps) + 1 : 1); }, 0);
}
// Slide a word along its plaque (its R or U direction, up to 1.5 of its width or height) until it is no longer static
// and partly visible through its shown-whole requirement, with no new overlap and no new shown-whole failure. Returns a
// description, or null (the word is left where it was).
function slideWhole(scene, w, onsetOf, until, mustEnd) {
  // A word entering past a clip plane slides only across the plane's normal, so it still emerges from behind its host
  // (brief 8 item 49: IN, riding out from behind CIRCLE, was dropped because clip words were never slid).
  const clipNs = (w.clip ?? []).map(c => c.n);
  const across = d => clipNs.every(n => Math.abs(d[0] * n[0] + d[1] * n[1] + d[2] * n[2]) < 1e-6 * Math.hypot(...n) * Math.hypot(...d));
  const lo = Math.max(0, w.on), hi = Math.min(until, w.off ?? until);
  // Overlaps that involve this word (a plain count could trade one overlap for another; brief 7).
  // Counted with every size drop shown, since the empty-screen rule may bring one back (TREY slid onto FOR and A).
  const ov = () => {
    const ghosts = scene.words.filter(x => x.dropped === 'size' && x.size_restore != null).map(x => [x, x.opacity]);
    for (const [x] of ghosts) { const v = JSON.parse(x.size_restore); if (v) x.opacity = v; else delete x.opacity; }
    const l = scanOverlap(scene, { from: lo, until: hi }).overlaps;
    for (const [x, op] of ghosts) x.opacity = op;
    return overlapFrames(l, scene.meta.fps ?? 30) + 1000 * overlapFrames(l, scene.meta.fps ?? 30, w.id);
  };
  // The slid word must be whole at its onset: neither partly shown nor slid out of frame (brief 8 item 58: RAISE in
  // Flagg slid first to partly shown, then wholly out of frame).
  const own = () => gateFailures({ ...scene, words: [w] }, onsetOf, { until }).reduce((t, x) => t + (x.kind === 'partial' ? 100 : x.kind === 'unshown' ? 1 : 0), 0);
  const stuck = () => staticPartials(scene, { words: [w], until }).some(r => r.start <= mustEnd);
  const ovBefore = ov(), C0 = w.C;
  const dirs = [[w.R, w.w, 'along its line'], [mul(w.R, -1), w.w, 'back along its line'], [w.U, w.h, 'up its plaque'], [mul(w.U, -1), w.h, 'down its plaque']].filter(([d]) => across(d));
  for (const k of [0.25, 0.5, 0.75, 1, 1.5, 2, 3]) for (const [dir, size, name] of dirs) {
    w.C = add(C0, mul(dir, k * size));
    const o = own();
    if (!stuck() && ov() <= ovBefore && o === 0) return `${name} by ${k} of its ${size === w.w ? 'width' : 'height'}`;
  }
  w.C = C0;
  return null;
}
// Static partials a focused word cannot be hidden from without breaking its shown-whole requirement (the cases the
// join must slide, drop or hide by necessity). Candidate choice ranks sections by this count (brief 8 item 58).
export function staticFocusRuns(scene, onsetOf, { until = scene.meta.frames } = {}) {
  const fps = scene.meta.fps ?? 30;
  return staticPartials(scene, { until }).filter(x => {
    const o = onsetOf(x.w);
    if (x.w.reveal_copy_of || o == null) return false;
    const [fa, fb] = focusWindow(x.w, onsetOf, fps);
    return fa < x.spanEnd && fb > x.spanStart && x.start <= Math.max(appearanceFrame(x.w) + G.SHOWN_FRAMES - 1, o);
  });
}
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
        if (x.start <= mustEnd) {
          // Brief 7 item 1: a sung word that cannot be shown whole at its onset (cut by a panel it straddles, or stuck
          // past a clip plane) is slid along its plaque until it is whole; failing that a filler is dropped, a keyword
          // other than a name is dropped by necessity, and a name or number is left for the gate to report.
          const slid = slideWhole(scene, x.w, onsetOf, until, mustEnd);
          if (slid) { log.push(`${x.w.id} ${x.w.text}: moved ${slid} so it is whole at its onset (it was ${Math.round(100 * x.share)}% visible, static, frames ${x.start}-${x.end})`); changed = true; continue; }
          if (!x.w.important) {
            x.w.size_restore = null; x.w.opacity = [[0, 0]]; x.w.dropped = 'static'; changed = true;
            log.push(`${x.w.id} ${x.w.text}: dropped (${x.w.keyword ? `keyword, dropped by necessity: no slide along its plaque makes it whole` : 'filler'}; ${Math.round(100 * x.share)}% visible and static at its onset, frames ${x.start}-${x.end})`);
            continue;
          }
          // Brief 8 item 58 (MAINE in Raise the Flagg): a name or number that no slide makes whole is hidden for its
          // partly-on-screen span, a necessity drop for those frames, reported.
          hide(x.w, a, b); x.w.static_hidden = [...(x.w.static_hidden ?? []), [a, b]]; changed = true;
          log.push(`${x.w.id} ${x.w.text}: hidden ${a}-${b} by necessity (name or number; no slide along its plaque makes it whole; ${Math.round(100 * x.share)}% visible and static at its onset, frames ${x.start}-${x.end})`);
          focused.push(`${x.w.id} ${x.w.text} ${x.start}-${x.end} (hidden by necessity)`); continue;
        }
        from = Math.max(a, mustEnd + 1);
      }
      hide(x.w, from, b); changed = true;
      log.push(`${x.w.id} ${x.w.text}: hidden ${from}-${b} (static and ${Math.round(100 * x.share)}% on screen on frames ${x.start}-${x.end})`);
    }
    if (!changed) break;
  }
  return { log, focused: [...new Set(focused)] };
}
