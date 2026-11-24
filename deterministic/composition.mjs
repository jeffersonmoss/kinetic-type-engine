// Composition passes on the joined scene (engine fix brief 3, Fable's rough cut 3 items 17 and 18, 22 November 2026).
// Generic; no song names.
//   tightenLone: a focus word alone in its hold (no other word whole in frame) has letters at least LONE_MIN of the
//     frame height, centred; the hold is reframed closer when that keeps every gate as good as before.
//   hideEdgeClutter: during a camera hold, a word that is not in its focus window and has letters cut by the frame edge
//     is hidden for the rest of that hold (opacity 0, restored when the hold ends). It never touches a focused word.
import './interp.js';
import * as G from './shown_gate.mjs';
import { appearanceFrame, sungWords, letterHeight, fullyShown, cornersAt, fitPose, fitPoseInClearArea, samePose, gateFailures, SIZE_DELAY } from './shown_gate.mjs';
import { scanOverlap, wordPropOverlapFrames } from './overlap_gate.mjs';
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
    // Brief 18: when a keep-clear prop is active in this hold, frame inside the clear band instead of centring.
    const propObs = I.hasKeepClearProps?.(scene) ? I.keepClearObstaclesInRange(scene, h.start, h.end) : [];
    const fit = propObs.length
      ? fitPoseInClearArea(K.to, cs, vfov, propObs, { mx: 0.94, my: 0.90 })?.pose
      : fitPose(K.to, cs, vfov, LONE_WIDTH, 0.9);
    if (!fit) continue;
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
    const [wFa, wFb] = focusWindow(w, onsetOf, scene.meta.fps ?? 30);
    const propClear = !propObs.length || wordPropOverlapFrames(scene, w, wFa, wFb, { useMargin: true }).length === 0;
    if (c <= base && ovAfter <= ovBefore && propClear) {
      base = c;
      log.push(`${w.id} ${w.text}: lone in hold ${h.start}-${h.end}, letters ${(100 * size).toFixed(1)}% -> ${(100 * letterHeight(w, D, I.poseAt(scene.cams, D), vfov)).toFixed(1)}% of the frame height, ${propObs.length ? 'in clear band' : 'centred'}`);
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
  const X = I.wordXform(w, f), band = (hasBlock(w) || !!w.wordmark?.image) ? 1 : Math.min(1, (w.cap ?? w.h) * (1.03 + jb) / w.h);
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
// Unhide w over [a, b): opacity 1, then whatever it was at b.
function unhide(w, a, b) {
  const restore = opacityAt(w, b);
  w.opacity = [...(w.opacity ?? []).filter(([k]) => k < a || k >= b), [a, 1], [b, restore]].sort((x, y) => x[0] - y[0]);
  if (w.opacity.every(([, v]) => v === 1)) delete w.opacity;
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
  // Something on screen: an intro overlay (badge, title card), a photographic backdrop or on-screen prop (brief 17), a picture element or a word.
  if ((scene.intro ?? []).some(x => f >= x.start && f < x.end)) return true;
  if (I.stageVisible?.(scene, f)) return true;
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
    // (5b) early-landing camera move (brief 23): a non-cut move landed inside [run.start, run.end] before the hold's
    //      first incoming word appeared at run.end + 1, leaving a dead hold on an empty plaque. Delay the move so it
    //      lands closer to (or right on) the incoming word while outgoing words stay on screen through the delay.
    if (K5 && K5.verb !== 'cut' && K5.f1 >= run.start && K5.f1 <= run.end && K5.f1 > K5.f0) {
      const nextCam = scene.cams[ki + 1];
      const limitF1 = Math.min(until - 1, nextCam ? nextCam.f0 - 1 : until - 1);
      const maxShift = Math.min(run.end + 1 - K5.f1, limitF1 - K5.f1);
      if (maxShift >= 1) {
        const camSnap = JSON.stringify(scene.cams), f = K5.f0 - 1;
        const p = I.poseAt(scene.cams, f);
        const vis = scene.words.filter(w => !w.reveal_copy_of && drawn(w, f) && inFrameShare(w, f, p, vfov) >= FILLED_SHARE && G.readableOrientation(w, f, p, vfov));
        const wsnap = vis.map(w => [w, w.off, JSON.stringify(w.opacity ?? null)]);
        const spLo = Math.max(0, K5.f0 - 4), spHi = Math.min(until, run.end + 12);
        const spBefore = staticPartials(scene, { from: spLo, until: spHi }).length;
        const origF0 = K5.f0, origF1 = K5.f1;
        let applied = false;
        for (let s = maxShift; s >= 1; s--) {
          scene.cams = JSON.parse(camSnap);
          for (const [w, off, op] of wsnap) { w.off = off; const v = JSON.parse(op); if (v) w.opacity = v; else delete w.opacity; }
          const km = scene.cams[ki];
          km.f0 = origF0 + s; km.f1 = origF1 + s;
          for (const w of vis) {
            const o = opacityAt(w, f), after = opacityAt(w, km.f0 + 1);
            if (w.off != null && w.off <= km.f0 + 1) w.off = km.f0 + 1;
            w.opacity = [...(w.opacity ?? []).filter(([k]) => k < origF0 || k > km.f0 + 1), [origF0, o], [km.f0 + 1, w.off === km.f0 + 1 ? o : after]].sort((x, y) => x[0] - y[0]);
          }
          const spAfter = staticPartials(scene, { from: spLo, until: spHi }).length;
          if (vis.length && spAfter <= spBefore && accept()) {
            log.push(`frames ${run.start}-${run.end}: camera ${km.verb} delayed ${origF0}-${origF1} -> ${km.f0}-${km.f1} (+${s}f to land on incoming word); ${vis.map(w => w.text).join(' ')} stay on`);
            basePartial = partials();
            applied = true;
            break;
          }
        }
        if (applied) continue;
        scene.cams = JSON.parse(camSnap);
        for (const [w, off, op] of wsnap) { w.off = off; const v = JSON.parse(op); if (v) w.opacity = v; else delete w.opacity; }
      }
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
// Brief 20: must-show readable hard floor (70% of the hold's size minimum: 6.3% crowded, 9.45% with room under defaults,
// floored by SPECK_FLOOR 4.0%), and max growth factor when freeing room or re-placing a must-show word.
export const MUST_SHOW_FLOOR_RATIO = 0.70;
export const MUST_SHOW_MAX_GROW = 3.5;
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
// Room for a dropped word (brief 10 item 37, brief 16 item 3, brief 19 items 3-5: applies to every dropped word,
// keyword or non-keyword). Keywords are tried before fillers in every room pass. A filler dropped to make room for a
// keyword (`dropped: 'room'`, `dropped_for`) is never put back while that keyword is still dropped. Any word put back
// must have a placement on its own plaque plane, same orientation, at least its minimum letter size in the hold where
// it is sung (matching sizeShortfalls), centre within 3 of its widths or heights of its planned spot, passing
// shown-whole, projected overlap (size drops shown as ghosts), keep-clear prop clearance (when props exist), and
// static-partly-shown over its whole life, or it stays dropped. Its entrance becomes a pop (motion and clip planes
// removed); if pre-onset frames fail before the camera lands, it tries starting at its sung onset (0 frames late). Any
// later hold where it falls under size is hidden when another word of size stays on screen. Returns one record per
// checked drop: { w, room, how }.
export function placeInRoom(scene, onsetOf, { until = scene.meta.frames, settings = {} } = {}) {
  const S = { ...SIZE_DEFAULTS, ...settings }, I = globalThis.KT_INTERP, vfov = scene.meta.vfov ?? 40, fps = scene.meta.fps ?? 30, out = [];
  const lifeUntil = Math.max(until, scene.meta.frames ?? until);
  const byId = new Map(scene.words.map(x => [x.id, x]));
  const poses = new Map(), poseAt = f => poses.get(f) ?? poses.set(f, I.poseAt(scene.cams, f)).get(f);
  const hs = holds(scene, until);
  const crowdedAt = f => {
    const p = poseAt(f);
    const on = scene.words.filter(x => !x.reveal_copy_of && drawn(x, f) && inFrameShare(x, f, p, vfov) >= FILLED_SHARE);
    return on.length >= S.crowdedWords || on.reduce((t, x) => t + boxCoverage(x, f, p, vfov), 0) >= S.crowdedArea;
  };
  const ghostOverlap = (w, a, b) => {
    const ghosts = scene.words.filter(x => x !== w && x.dropped === 'size' && x.size_restore != null).map(x => [x, x.opacity]);
    for (const [x] of ghosts) { const v = JSON.parse(x.size_restore); if (v) x.opacity = v; else delete x.opacity; }
    const l = scanOverlap(scene, { from: a, until: b }).overlaps.filter(o => o.includes(`${w.id} `));
    for (const [x, op] of ghosts) x.opacity = op;
    return l.length;
  };
  const holdStats = w => {
    const res = [];
    const [fa, fb] = focusWindow(w, onsetOf, fps);
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
      res.push({ h, ...best, crowded, min, focused: fa < h.end && fb > h.start });
    }
    return res;
  };
  const steps = [0, 0.25, -0.25, 0.5, -0.5, 0.75, -0.75, 1, -1, 1.5, -1.5, 2, -2, 3, -3];
  const offsets = steps.flatMap(du => steps.map(dv => [du, dv])).sort((p, q) => Math.hypot(...p) - Math.hypot(...q));
  // Brief 19 items 3 & 4 & brief 20: try must-show words first, then keywords, then fillers (stable within each group),
  // and never put back a word dropped to make room for another word while that beneficiary is still dropped.
  const candidates = scene.words
    .filter(w => !w.reveal_copy_of && !w.echo && ['size', 'static', 'room'].includes(w.dropped))
    .sort((a, b) => (b.must_show ? 2 : b.keyword ? 1 : 0) - (a.must_show ? 2 : a.keyword ? 1 : 0));
  for (const w of candidates) {
    const o = onsetOf(w);
    if (o == null || o >= until) continue;
    if (w.dropped === 'room' && w.dropped_for) {
      const beneficiary = byId.get(w.dropped_for);
      if (beneficiary?.dropped) {
        out.push({ w, room: false, wasDrop: w.dropped, how: `dropped to make room for ${beneficiary.id} ${beneficiary.text}, which is still dropped` });
        continue;
      }
    }
    const wasDrop = w.dropped;
    const keep = JSON.stringify({ C: w.C, w: w.w, h: w.h, cap: w.cap, fontPx: w.fontPx, pad: w.pad, on: w.on, motion: w.motion ?? null, clip: w.clip ?? null, opacity: w.opacity ?? null, dropped: w.dropped, dropped_for: w.dropped_for ?? null, size_restore: w.size_restore ?? null });
    const restore = () => { const k = JSON.parse(keep); for (const [key, v] of Object.entries(k)) { if (v == null) delete w[key]; else w[key] = v; } };
    delete w.opacity; delete w.dropped; delete w.dropped_for; delete w.size_restore; w.motion = []; w.clip = [];
    const h0 = letterHeight(w, o, poseAt(o), vfov);
    if (!(h0 > 0)) { restore(); out.push({ w, room: false, wasDrop, how: 'not in front of the camera at its onset' }); continue; }
    // Determine the required scale across both the onset frame and any focus hold containing it (so restored words meet
    // Type rule 1 under sizeShortfalls). Try onset-crowded min first, then the uncrowded room min if a focus hold needs it.
    const minCrowded = S.minH * 1.03, minRoom = S.roomFactor * S.minH * 1.03;
    const min0 = (crowdedAt(o) ? S.minH : S.roomFactor * S.minH) * 1.03;
    const ks = [...new Set([Math.max(1, min0 / h0), Math.max(1, minRoom / h0)])].sort((a, b) => a - b);
    const C0 = w.C, on0 = w.on, baseDims = { w: w.w, h: w.h, cap: w.cap, fontPx: w.fontPx, pad: w.pad };
    const onCandidates = o > on0 ? [on0, o] : [on0];
    let how = null;
    for (const k of ks) {
      for (const key of Object.keys(baseDims)) if (typeof baseDims[key] === 'number') w[key] = baseDims[key] * k;
      for (const candOn of onCandidates) {
        w.on = candOn;
        const A = Math.max(w.on, appearanceFrame(w)), lo = Math.max(0, w.on), hi = Math.min(until, w.off ?? until);
        for (const [du, dv] of offsets) {
          delete w.opacity;
          w.C = add(C0, add(mul(w.R, du * w.w), mul(w.U, dv * w.h)));
          let whole = true;
          for (let f = A, e = Math.max(A + G.SHOWN_FRAMES - 1, o); f <= e && whole; f++) {
            const p = poseAt(f);
            whole = G.fullyShown(w, f, p, vfov) && G.readableOrientation(w, f, p, vfov, { tilt: false });
          }
          if (!whole) continue;
          // Focus-hold size check matching sizeShortfalls (ignoring later holds, which we hide below if small).
          const sh = holdStats(w);
          const oHoldOk = sh.some(x => x.size >= x.min - 1e-9 && x.h.start <= o && o < x.h.end);
          if (sh.some(x => x.focused && !(oHoldOk && x.h.start > o) && x.size < x.min - 1e-9)) continue;
          if (ghostOverlap(w, lo, hi)) continue;
          if (I.hasKeepClearProps?.(scene)) {
            const [pfa, pfb] = focusWindow(w, onsetOf, fps);
            if (wordPropOverlapFrames(scene, w, pfa, Math.min(until, pfb), { useMargin: true }).length) continue;
          }
          // Hide any later hold where this restored word would be under size (when another word of size stays on screen).
          for (const x of sh) {
            if (x.size >= x.min - 1e-9 || (x.focused && !(oHoldOk && x.h.start > o))) continue;
            const a = Math.max(x.h.start, w.on), b = Math.min(x.h.end, w.off ?? until, until);
            const big = f => scene.words.some(y => y !== w && !y.reveal_copy_of && drawn(y, f) && inFrameShare(y, f, poseAt(f), vfov) > CLIP_SHARE && (letterHeight(y, f, poseAt(f), vfov) ?? 0) >= S.minH);
            let ok = true;
            for (let f = a; f < b && ok; f += 2) if (drawn(w, f)) ok = big(f);
            if (ok) { (w.size_hides ??= []).push([a, b, JSON.stringify(w.opacity ?? null)]); hide(w, a, b); }
          }
          // Brief 19 item 5: any word put back by any room pass must pass static-partly-shown and shown-whole
          // (and overlap above) for its whole life, or it stays dropped.
          if (staticPartials(scene, { words: [w], until: lifeUntil }).length) { delete w.opacity; continue; }
          if (gateFailures({ ...scene, words: [w] }, onsetOf, { until }).some(x => x.kind === 'partial' || x.kind === 'unshown')) { delete w.opacity; continue; }
          const appliedMin = sh.find(x => x.h.start <= o && o < x.h.end)?.min ?? (min0 / 1.03);
          how = `${du || dv ? `moved ${du ? `${du} of its width along its line` : ''}${du && dv ? ' and ' : ''}${dv ? `${dv} of its height up its plaque` : ''}` : 'in its planned spot'}${k > 1.0001 ? `, grown x${k.toFixed(2)}` : ''}${candOn !== on0 ? `, on moved ${on0}->${candOn} (onset)` : ''}, letters ${(100 * h0 * k).toFixed(1)}% (minimum ${(100 * appliedMin).toFixed(1)}%), entering as a pop`;
          break;
        }
        if (how) break;
      }
      if (how) break;
    }
    if (!how) { restore(); out.push({ w, room: false, wasDrop, how: `no placement within 3 of its widths of its spot is whole and readable in frame through its onset, at size (${(100 * min0 / 1.03).toFixed(1)}% min, needs x${ks[0].toFixed(2)}), clear of other words and not static-partial` }); continue; }
    w.put_back = true;
    out.push({ w, room: true, wasDrop, how });
  }
  return out;
}
// wordmarks: true (brief 8 item 55) sizes only the image wordmarks, by their letter height (w.cap, set from the image's
// letter share by the song appearance pass); one that cannot grow is kept and reported, never dropped or hidden.
export function enforceMinSize(scene, onsetOf, { until = scene.meta.frames, settings = {}, wordmarks = false, minEndHold = 15 } = {}) {
  const S = { ...SIZE_DEFAULTS, ...settings };
  const I = globalThis.KT_INTERP, vfov = scene.meta.vfov ?? 40, fps = scene.meta.fps ?? 30;
  const poses = new Map(), poseAt = f => poses.get(f) ?? poses.set(f, I.poseAt(scene.cams, f)).get(f);
  const log = [], mustShowLog = [], counts = { grown: 0, dropped: 0, hidden: 0, keptSmall: 0, importantSmall: 0, mustShowChanged: 0 };
  let hs = holds(scene, until);
  const refreshCam = () => { poses.clear(); hs = holds(scene, until); };
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
  const hasProps = I.hasKeepClearProps?.(scene);
  const propOv = (w, useMargin = true) => {
    if (!hasProps) return 0;
    const [pfa, pfb] = focusWindow(w, onsetOf, fps);
    return wordPropOverlapFrames(scene, w, pfa, Math.min(until, pfb), { useMargin }).length;
  };
  const drops = [];
  const byIdAll = new Map(scene.words.map(x => [x.id, x]));

  // Brief 20: must-show room-freeing ladder for words marked word_overrides.<idx>.must_show or rejected in
  // Keyword drop review.json. Runs ONLY when w.must_show is true; songs with no must-show words never enter this.
  const resolveMustShow = w => {
    const o = onsetOf(w);
    const snapW = x => JSON.stringify({
      C: x.C, w: x.w, h: x.h, cap: x.cap, fontPx: x.fontPx, pad: x.pad ?? null,
      on: x.on, off: x.off ?? null, motion: x.motion ?? null, clip: x.clip ?? null,
      joint: x.joint ?? null, opacity: x.opacity ?? null, dropped: x.dropped ?? null,
      dropped_for: x.dropped_for ?? null, size_restore: x.size_restore ?? null,
    });
    const restW = (x, s) => {
      const d = JSON.parse(s);
      for (const [k, v] of Object.entries(d)) {
        if (v == null && ['pad', 'off', 'motion', 'clip', 'joint', 'opacity', 'dropped', 'dropped_for', 'size_restore'].includes(k)) delete x[k];
        else x[k] = v;
      }
    };
    const floorFor = min => Math.max(G.SPECK_FLOOR, min * MUST_SHOW_FLOOR_RATIO);
    const focusShortAt = (shList, ratio) => {
      const A = appearanceFrame(w), mustEnd = Math.max(A + G.SHOWN_FRAMES - 1, o ?? w.on);
      const targetOf = x => ratio >= 1 - 1e-9 ? x.min : Math.max(floorFor(x.min), x.min * ratio);
      const onsetHoldOk = o != null && shList.some(x =>
        x.size >= targetOf(x) - 1e-9 && ((x.h.start <= o && o <= x.h.end) || (x.h.start <= A && A < x.h.end))
      );
      return shList.filter(x => {
        if (!x.focused) return false;
        if (onsetHoldOk && x.h.start > mustEnd) return false;
        return x.size < targetOf(x) - 1e-9;
      });
    };
    const hasFocusStatic = x => {
      const xo = onsetOf(x), xA = appearanceFrame(x), xMustEnd = Math.max(xA + G.SHOWN_FRAMES - 1, xo ?? x.on);
      return staticPartials(scene, { words: [x], until }).some(r => r.start <= xMustEnd);
    };
    const propClear = (x, raw0, marg0) => {
      if (!hasProps) return true;
      if (propOv(x, false) > raw0) return false;
      return marg0 === 0 ? propOv(x, true) === 0 : propOv(x, true) <= marg0;
    };
    // Convert hinge or clip entrance so w can grow cleanly. When keepA is true and w.joint.f1 > w.on, use a scale
    // entrance over the same [f0, f1] to keep appearanceFrame(w) intact (critical when onset sits inside a camera move).
    const adaptEntrance = (x, keepA) => {
      const j = x.joint;
      const hm = (x.motion ?? []).find(m => m.kind === 'hinge');
      if (keepA && ((hm && hm.f1 > x.on) || (j && j.f1 > x.on))) {
        const f0 = hm?.f0 ?? j.f0 ?? x.on, f1 = hm?.f1 ?? j.f1;
        x.motion = [{ f0, f1, ease: hm?.ease ?? { a: 2, b: 4, x0: 0.34 }, kind: 'scale', P: x.C.slice(), from: 0.65, to: 1 }];
        x.clip = [];
        x.joint = { ...(j ?? {}), prim: 'scale', f0, f1 };
      } else {
        x.motion = []; x.clip = [];
        if (x.joint) x.joint = { ...x.joint, prim: 'pop', f0: x.on, f1: x.on };
      }
    };
    const syncScalePivot = x => {
      if (x.motion?.length) x.motion = x.motion.map(m => m.kind === 'scale' && m.P ? { ...m, P: x.C.slice() } : m);
    };
    // Scan overlaps involving w (including size-drop ghosts) and map each colliding partner to its [startF, endF].
    const ownOverlaps = (lo, hi) => {
      const ghosts = scene.words.filter(x => x !== w && x.dropped === 'size' && x.size_restore != null).map(x => [x, x.opacity]);
      for (const [x] of ghosts) { const v = JSON.parse(x.size_restore); if (v) x.opacity = v; else delete x.opacity; }
      const all = scanOverlap(scene, { from: lo, until: hi }).overlaps;
      const mine = all.filter(str => str.includes(` ${w.id} `) || str.includes(`: ${w.id} `));
      for (const [x, op] of ghosts) x.opacity = op;
      const byPartner = new Map();
      let hasPanel = false;
      for (const str of mine) {
        if (str.includes('panel:') || str.includes('plaque p')) { hasPanel = true; continue; }
        const tm = str.match(/^([\d.]+)–([\d.]+) s/);
        const sf = tm ? Math.round(+tm[1] * fps) : lo, ef = tm ? Math.round(+tm[2] * fps) : hi;
        const ids = [...str.matchAll(/\b(w\d+[a-z0-9]*) /g)].map(m => m[1]).filter(id => id !== w.id);
        for (const id of ids) {
          const cur = byPartner.get(id);
          byPartner.set(id, cur ? { startF: Math.min(cur.startF, sf), endF: Math.max(cur.endF, ef) } : { startF: sf, endF: ef });
        }
      }
      return { mine, hasPanel, byPartner };
    };
    // Decide how each overlapping partner can be cleared (in preference order: hide earlier word after its focus
    // window -> drop filler -> drop review-approved word; optionally early-retire w for later words past w's mustEnd).
    const planClear = (byPartner, { allowEarlyRetire = false } = {}) => {
      const wA = appearanceFrame(w), wMustEnd = Math.max(wA + G.SHOWN_FRAMES - 1, o ?? w.on);
      const actions = [];
      let earlyOff = null, cost = 0;
      for (const [pid, span] of byPartner.entries()) {
        const x = byIdAll.get(pid);
        if (!x || x.reveal_copy_of || x.echo) return null;
        const xA = appearanceFrame(x), xO = onsetOf(x), xMustEnd = Math.max(xA + G.SHOWN_FRAMES - 1, xO ?? x.on);
        const isFiller = !x.keyword && !x.important && !x.must_show && (resizable(x) || x.dropped === 'size');
        const isApproved = !!x.drop_approved && !x.important && !x.must_show && (resizable(x) || x.dropped === 'size');
        // 1. Hide an earlier-placed neighbour after its own shown-whole window (never drops it!).
        if (!x.must_show && !x.dropped && xMustEnd < span.startF) {
          const cutFrom = Math.max(xMustEnd + 1, Math.min(span.startF, w.on));
          const cutTo = Math.min(until, x.off ?? until, w.off ?? until);
          if (cutFrom <= span.startF && cutFrom < cutTo) {
            actions.push({ kind: 'hide', x, cutFrom, cutTo });
            cost += 1;
            continue;
          }
        }
        // 2. Drop a filler neighbour.
        if (isFiller) { actions.push({ kind: 'drop', why: 'filler', x }); cost += 5; continue; }
        // 3. Drop a review-approved neighbour.
        if (isApproved) { actions.push({ kind: 'drop', why: 'approved', x }); cost += 10; continue; }
        // 4. Optional fallback: retire w early when a later word arrives strictly past w's shown-whole requirement.
        if (allowEarlyRetire && span.startF > wMustEnd + 1) {
          earlyOff = earlyOff == null ? span.startF : Math.min(earlyOff, span.startF);
          cost += 20;
          continue;
        }
        return null;
      }
      return { actions, earlyOff, cost };
    };
    const applyPlan = plan => {
      const snaps = plan.actions.map(a => [a.x, snapW(a.x)]);
      for (const a of plan.actions) {
        if (a.kind === 'hide') {
          hide(a.x, a.cutFrom, a.cutTo);
        } else {
          a.x.dropped = 'room'; a.x.dropped_for = w.id; a.x.opacity = [[0, 0]]; delete a.x.size_restore;
        }
      }
      if (plan.earlyOff != null) w.off = Math.min(w.off ?? until, plan.earlyOff);
      return () => { for (const [x, s] of snaps) restW(x, s); };
    };
    const commitPlanLog = (plan, hadDrops) => {
      const parts = [];
      for (const a of plan.actions) {
        if (a.kind === 'hide') {
          parts.push(`hid earlier ${a.x.id} ${a.x.text} on ${a.cutFrom}-${a.cutTo}`);
          log.push(`${a.x.id} ${a.x.text}: hidden ${a.cutFrom}-${a.cutTo} to make room for must-show ${w.id} ${w.text}`);
        } else {
          if (!hadDrops.has(a.x)) counts.dropped++;
          parts.push(`dropped ${a.why} ${a.x.id} ${a.x.text}`);
          log.push(`${a.x.id} ${a.x.text}: dropped (${a.why}) to make room for must-show ${w.id} ${w.text}`);
        }
      }
      if (plan.earlyOff != null) parts.push(`retired ${w.id} ${w.text} at frame ${plan.earlyOff} before later word`);
      return parts.join('; ');
    };

    const rawProp0 = propOv(w, false), margProp0 = propOv(w, true);
    const baseFail0 = ownFailures(w);

    // Step 1: grow in place by dropping or hiding approved/filler/earlier neighbours (and adapting hinge/clip if needed).
    const tryStep1 = ratio => {
      const sh0 = shownHolds(w), fs0 = focusShortAt(sh0, ratio);
      if (!fs0.length) return { ok: true, desc: 'already at target size' };
      const targetOf = x => ratio >= 1 - 1e-9 ? x.min : Math.max(floorFor(x.min), x.min * ratio);
      const k = Math.max(...fs0.map(x => targetOf(x) / x.size)) * 1.03;
      if (!(k <= MUST_SHOW_MAX_GROW)) return null;
      const wSnap = snapW(w);
      const clipped0 = (w.clip ?? []).length > 0, hinge0 = !growable(w);
      const modes = hinge0 ? ['scale', 'pop'] : clipped0 ? ['orig', 'pop', 'scale'] : ['orig', 'pop'];
      let best = null;
      for (const mode of modes) {
        const modeCost = mode === 'orig' ? 0 : 2;
        for (const pv of PIVOTS) {
          restW(w, wSnap);
          if (mode === 'scale') adaptEntrance(w, true);
          else if (mode === 'pop') adaptEntrance(w, false);
          grow(w, k, pv);
          if (mode === 'orig' && clipped0) w.motion = (w.motion ?? []).map(m => m.kind === 'shift' ? { ...m, from: mul(m.from, k), to: mul(m.to, k) } : m);
          else if (mode === 'scale') syncScalePivot(w);
          if (mode === 'orig' && clipped0 && !clipEntranceOk(scene, w)) continue;
          if (ownFailures(w) > baseFail0 || ownFailures(w) > 0) continue;
          if (!propClear(w, rawProp0, margProp0)) continue;
          if (hasFocusStatic(w)) continue;
          const lo = Math.max(0, w.on), hi = Math.min(until, w.off ?? until);
          const ov = ownOverlaps(lo, hi);
          if (ov.hasPanel) continue;
          const plan = planClear(ov.byPartner, { allowEarlyRetire: false });
          if (!plan) continue;
          const totalCost = plan.cost + modeCost + (pv[0] || pv[1] ? 0.5 : 0);
          if (best && totalCost >= best.totalCost) continue;
          const undoPlan = applyPlan(plan);
          const ok = overlapsWithDrops(lo, hi, w.id) === 0 &&
            ownFailures(w) === 0 && !hasFocusStatic(w) &&
            plan.actions.every(a => a.kind !== 'hide' || (ownFailures(a.x) === 0 && !hasFocusStatic(a.x))) &&
            focusShortAt(shownHolds(w), ratio).length === 0;
          undoPlan();
          if (ok) best = { mode, pv, k, plan, totalCost };
        }
      }
      restW(w, wSnap);
      if (!best) return null;
      const hadDrops = new Set(drops);
      if (best.mode === 'scale') adaptEntrance(w, true);
      else if (best.mode === 'pop') adaptEntrance(w, false);
      grow(w, best.k, best.pv);
      if (best.mode === 'orig' && clipped0) w.motion = (w.motion ?? []).map(m => m.kind === 'shift' ? { ...m, from: mul(m.from, best.k), to: mul(m.to, best.k) } : m);
      else if (best.mode === 'scale') syncScalePivot(w);
      applyPlan(best.plan);
      const cleared = commitPlanLog(best.plan, hadDrops);
      counts.grown++; counts.mustShowChanged++;
      return { ok: true, desc: `grown x${best.k.toFixed(2)}${best.mode !== 'orig' ? ` (${best.mode} entrance)` : ''}${cleared ? ` after ${cleared}` : ''}` };
    };

    // Step 2: re-frame the camera on w's failing focus hold(s) (tight fit on hold, or clean hold split around w).
    const tryStep2 = ratio => {
      const sh0 = shownHolds(w), fs0 = focusShortAt(sh0, ratio);
      if (!fs0.length) return { ok: true, desc: 'already at target size' };
      const targetOf = x => ratio >= 1 - 1e-9 ? x.min : Math.max(floorFor(x.min), x.min * ratio);
      const camSnapAll = JSON.stringify(scene.cams);
      const sungAll = sungWords(scene, onsetOf);
      const notes = [];
      for (const targetHold of fs0) {
        const curSh = shownHolds(w);
        const curEntry = curSh.find(x => x.h.start <= targetHold.f && targetHold.f < x.h.end);
        if (!curEntry || curEntry.size >= targetOf(curEntry) - 1e-9) continue;
        const h = curEntry.h, target = targetOf(curEntry);
        const pose0 = I.poseAt(scene.cams, h.start);
        const rLo = Math.max(0, (h.k >= 0 ? scene.cams[h.k].f0 : 0) - 2);
        const rHi = Math.min(until, (h.n >= 0 ? scene.cams[h.n].f1 : until) + 2);
        const locWords = scene.words.filter(x => !x.dropped && !x.reveal_copy_of && x.on <= rHi && (x.off == null || x.off >= rLo));
        const basePart = gateFailures({ ...scene, words: locWords }, onsetOf, { until }).filter(x => x.kind === 'partial' || x.kind === 'unshown').length;
        const baseOv = overlapsWithDrops(rLo, rHi);
        const baseStatic = staticFocusRuns({ ...scene, words: locWords }, onsetOf, { until }).length;
        const propRangeCount = useM => {
          if (!hasProps) return 0;
          let n = 0;
          for (const x of locWords) {
            const xo = onsetOf(x); if (xo == null) continue;
            const [pfa, pfb] = focusWindow(x, onsetOf, fps);
            n += wordPropOverlapFrames(scene, x, pfa, Math.min(until, pfb), { useMargin: useM }).length;
          }
          return n;
        };
        const baseRawProp = propRangeCount(false), baseMargProp = propRangeCount(true);
        const group = sungAll.filter(s => {
          if (s.w.dropped) return false;
          const sa = appearanceFrame(s.w);
          return (sa >= h.start && sa < h.end) || (s.onsetF >= h.start && s.onsetF < h.end);
        });
        if (!group.some(s => s.w === w)) group.push({ w, onsetF: o ?? w.on });
        const otherSizesBefore = new Map(group.filter(s => s.w !== w).map(s => {
          const sf = Math.min(h.end - 1, Math.max(appearanceFrame(s.w), h.start));
          return [s.w.id, letterHeight(s.w, sf, pose0, vfov) ?? 0];
        }));
        const obs = hasProps ? I.keepClearObstaclesInRange(scene, h.start, h.end) : [];
        const fitFor = grp => {
          const pts = [];
          for (const s of grp) {
            const sf = Math.min(h.end - 1, Math.max(appearanceFrame(s.w), h.start));
            const cs = cornersAt(s.w, sf) ?? cornersAt(s.w, appearanceFrame(s.w));
            if (cs) pts.push(...cs);
          }
          if (!pts.length) return null;
          const fitted = obs.length ? fitPoseInClearArea(pose0, pts, vfov, obs, { mx: 0.94, my: 0.90 })?.pose : fitPose(pose0, pts, vfov, 0.94, 0.90);
          if (!fitted || !(fitted.dist > 0)) return null;
          const atFit = letterHeight(w, curEntry.f, complete(fitted), vfov);
          if (!(atFit > 0)) return null;
          const dist = Math.max(fitted.dist, fitted.dist * atFit / (target * 1.03));
          return { ...fitted, dist };
        };
        const camOk = (checkGroup) => {
          refreshCam();
          if (ownFailures(w) > 0) return false;
          if (gateFailures({ ...scene, words: locWords }, onsetOf, { until }).filter(x => x.kind === 'partial' || x.kind === 'unshown').length > basePart) return false;
          if (overlapsWithDrops(rLo, rHi) > baseOv) return false;
          if (staticFocusRuns({ ...scene, words: locWords }, onsetOf, { until }).length > baseStatic) return false;
          if (hasProps) {
            if (propOv(w, false) > 0 || propRangeCount(false) > baseRawProp) return false;
            if (baseMargProp === 0 && propRangeCount(true) > 0) return false;
          }
          for (const s of checkGroup) {
            if (s.w === w) continue;
            const prev = otherSizesBefore.get(s.w.id) ?? 0;
            if (prev < S.minH) continue;
            const sf = Math.min(h.end - 1, Math.max(appearanceFrame(s.w), h.start));
            const nowH = letterHeight(s.w, sf, I.poseAt(scene.cams, sf), vfov) ?? 0;
            if (nowH < S.minH - 1e-4) return false;
          }
          const afterSh = shownHolds(w);
          return focusShortAt(afterSh, ratio).every(x => !(x.h.start <= curEntry.f && curEntry.f < x.h.end));
        };

        const camSnapOne = JSON.stringify(scene.cams);
        let holdFixed = false;
        // 2A: reframe hold h tightly on group.
        const P = fitFor(group);
        if (P && !samePose(pose0, P) && (h.k < 0 || scene.cams[h.k].f1 <= scene.meta.frames - minEndHold)) {
          if (h.k < 0) { if (scene.cams.length) scene.cams[0].from = P; }
          else {
            const old = scene.cams[h.k].to;
            scene.cams[h.k].to = P;
            if (h.n >= 0 && samePose(scene.cams[h.n].from, old)) scene.cams[h.n].from = P;
          }
          if (camOk(group)) {
            holdFixed = true;
            notes.push(`reframed hold ${h.start}-${h.end} (dist ${pose0.dist.toFixed(0)} -> ${P.dist.toFixed(0)})`);
          } else { scene.cams = JSON.parse(camSnapOne); refreshCam(); }
        }
        // 2B: split hold h cleanly around w when group is too wide.
        if (!holdFixed && h.k >= 0 && h.end - h.start >= 16 && group.length >= 2) {
          const wA = appearanceFrame(w), wMustEnd = Math.max(wA + G.SHOWN_FRAMES - 1, o ?? w.on);
          const gBefore = [], gMid = [], gAfter = [];
          for (const s of group) {
            if (s.w === w) { gMid.push(s); continue; }
            const sa = appearanceFrame(s.w), sMustEnd = Math.max(sa + G.SHOWN_FRAMES - 1, s.onsetF);
            if (sMustEnd < w.on) gBefore.push(s);
            else if (s.w.on > wMustEnd) gAfter.push(s);
            else gMid.push(s);
          }
          if (gMid.length < group.length) {
            const Pm = fitFor(gMid);
            const cutIn = gBefore.length ? Math.max(h.start + 4, Math.min(w.on, Math.max(...gBefore.map(s => Math.max(appearanceFrame(s.w) + G.SHOWN_FRAMES - 1, s.onsetF))) + 1)) : h.start;
            const cutOut = gAfter.length ? Math.min(h.end - 4, Math.min(...gAfter.map(s => s.w.on))) : h.end;
            const maxCut = scene.meta.frames - minEndHold;
            if (Pm && cutIn <= w.on && cutOut > wMustEnd && cutOut - cutIn >= 6 && cutIn <= maxCut && cutOut <= maxCut) {
              const oldTo = scene.cams[h.k].to;
              const insert = [];
              if (cutIn > h.start) {
                insert.push({ f0: cutIn, f1: cutIn, kind: 'must_show_split', verb: 'cut', fold: 'flat', ease: { a: 2, b: 3, x0: 0.4 }, from: pose0, to: Pm });
              } else {
                scene.cams[h.k].to = Pm;
              }
              if (cutOut < h.end) {
                insert.push({ f0: cutOut, f1: cutOut, kind: 'must_show_split', verb: 'cut', fold: 'flat', ease: { a: 2, b: 3, x0: 0.4 }, from: Pm, to: oldTo });
              } else if (h.n >= 0 && samePose(scene.cams[h.n].from, oldTo)) {
                scene.cams[h.n].from = Pm;
              }
              if (insert.length) scene.cams.splice(h.k + 1, 0, ...insert);
              if (camOk(gMid)) {
                holdFixed = true;
                notes.push(`split hold ${h.start}-${h.end} on ${cutIn}-${cutOut} (dist ${pose0.dist.toFixed(0)} -> ${Pm.dist.toFixed(0)})`);
              } else { scene.cams = JSON.parse(camSnapOne); refreshCam(); }
            }
          }
        }
        if (!holdFixed) { scene.cams = JSON.parse(camSnapAll); refreshCam(); return null; }
      }
      if (focusShortAt(shownHolds(w), ratio).length > 0) { scene.cams = JSON.parse(camSnapAll); refreshCam(); return null; }
      counts.mustShowChanged++;
      return { ok: true, desc: `reframed camera (${notes.join('; ')})` };
    };

    // Step 3: grow w from a new placement on its plaque plane (0-overlap first, then approved/filler/earlier clear,
    // then early retirement before a later colliding word strictly past w's shown-whole requirement).
    const tryStep3 = ratio => {
      const sh0 = shownHolds(w), fs0 = focusShortAt(sh0, ratio);
      if (!fs0.length) return { ok: true, desc: 'already at target size' };
      const targetOf = x => ratio >= 1 - 1e-9 ? x.min : Math.max(floorFor(x.min), x.min * ratio);
      const k = Math.max(1, Math.max(...fs0.map(x => targetOf(x) / x.size)) * 1.03);
      if (!(k <= MUST_SHOW_MAX_GROW)) return null;
      const wSnap = snapW(w);
      const C0 = w.C.slice(), on0 = w.on;
      const steps = [0, 0.25, -0.25, 0.5, -0.5, 0.75, -0.75, 1, -1, 1.5, -1.5, 2, -2, 3, -3];
      const offsets = steps.flatMap(du => steps.map(dv => [du, dv])).sort((p, q) => Math.hypot(...p) - Math.hypot(...q));
      const hasLateA = (w.joint?.f1 ?? on0) > on0;
      const entModes = hasLateA ? ['scale', 'pop'] : ['pop'];
      const onCands = o != null && o > on0 ? [on0, o] : [on0];
      const tiers = [
        { allowClear: false, allowEarlyRetire: false },
        { allowClear: true, allowEarlyRetire: false },
        { allowClear: true, allowEarlyRetire: true },
      ];
      for (const tier of tiers) {
        let best = null;
        for (const mode of entModes) {
          for (const candOn of onCands) {
            if (mode === 'scale' && candOn !== on0) continue;
            for (const [du, dv] of offsets) {
              restW(w, wSnap);
              w.on = candOn;
              adaptEntrance(w, mode === 'scale');
              grow(w, k, [0, 0]);
              w.C = add(C0, add(mul(w.R, du * w.w), mul(w.U, dv * w.h)));
              if (mode === 'scale') syncScalePivot(w);
              if (ownFailures(w) > 0) continue;
              if (!propClear(w, rawProp0, margProp0)) continue;
              if (hasFocusStatic(w)) continue;
              const lo = Math.max(0, w.on), hi = Math.min(until, w.off ?? until);
              const ov = ownOverlaps(lo, hi);
              if (ov.hasPanel) continue;
              let plan = { actions: [], earlyOff: null, cost: 0 };
              if (ov.byPartner.size) {
                if (!tier.allowClear) continue;
                plan = planClear(ov.byPartner, { allowEarlyRetire: tier.allowEarlyRetire });
                if (!plan) continue;
              }
              const score = plan.cost + Math.hypot(du, dv) * 0.2 + (mode === 'scale' ? 0 : 0.1);
              if (best && score >= best.score) continue;
              const undoPlan = applyPlan(plan);
              const ok = overlapsWithDrops(lo, Math.min(until, w.off ?? until), w.id) === 0 &&
                ownFailures(w) === 0 && !hasFocusStatic(w) &&
                plan.actions.every(a => a.kind !== 'hide' || (ownFailures(a.x) === 0 && !hasFocusStatic(a.x))) &&
                focusShortAt(shownHolds(w), ratio).length === 0;
              undoPlan();
              if (ok) {
                best = { mode, candOn, du, dv, plan, score };
                if (plan.cost === 0 && Math.hypot(du, dv) <= 0.75) break;
              }
            }
            if (best && best.plan.cost === 0 && Math.hypot(best.du, best.dv) <= 0.75) break;
          }
          if (best && best.plan.cost === 0 && Math.hypot(best.du, best.dv) <= 0.75) break;
        }
        if (best) {
          const hadDrops = new Set(drops);
          restW(w, wSnap);
          w.on = best.candOn;
          adaptEntrance(w, best.mode === 'scale');
          grow(w, k, [0, 0]);
          w.C = add(C0, add(mul(w.R, best.du * w.w), mul(w.U, best.dv * w.h)));
          if (best.mode === 'scale') syncScalePivot(w);
          applyPlan(best.plan);
          const cleared = commitPlanLog(best.plan, hadDrops);
          counts.grown++; counts.mustShowChanged++;
          const moved = best.du || best.dv ? `moved (${best.du}w, ${best.dv}h)` : 'at planned spot';
          return { ok: true, desc: `new placement (${moved}, grown x${k.toFixed(2)}, ${best.mode} entrance${best.candOn !== on0 ? `, on ${on0}->${best.candOn}` : ''}${cleared ? `; ${cleared}` : ''})` };
        }
      }
      restW(w, wSnap);
      return null;
    };

    // Partial in-place growth (no neighbours touched) used in Phase B before settling below full minimum.
    const tryPartialInPlace = () => {
      const sh0 = shownHolds(w), fs0 = focusShortAt(sh0, 1.0);
      if (!fs0.length) return null;
      const wSnap = snapW(w), clipped0 = (w.clip ?? []).length > 0, hinge0 = !growable(w);
      const modes = hinge0 ? ['scale', 'pop'] : clipped0 ? ['orig', 'pop', 'scale'] : ['orig', 'pop'];
      const lo = Math.max(0, w.on), hi = Math.min(until, w.off ?? until);
      const ov0 = overlapsWithDrops(lo, hi, w.id);
      for (const r of [0.95, 0.90, 0.85, 0.80, 0.75, MUST_SHOW_FLOOR_RATIO]) {
        const k = Math.max(...fs0.map(x => Math.max(floorFor(x.min), x.min * r) / x.size)) * 1.01;
        if (!(k > 1.02) || k > MUST_SHOW_MAX_GROW) continue;
        for (const mode of modes) for (const pv of PIVOTS) {
          restW(w, wSnap);
          if (mode === 'scale') adaptEntrance(w, true);
          else if (mode === 'pop') adaptEntrance(w, false);
          grow(w, k, pv);
          if (mode === 'orig' && clipped0) w.motion = (w.motion ?? []).map(m => m.kind === 'shift' ? { ...m, from: mul(m.from, k), to: mul(m.to, k) } : m);
          else if (mode === 'scale') syncScalePivot(w);
          if (mode === 'orig' && clipped0 && !clipEntranceOk(scene, w)) continue;
          if (ownFailures(w) === 0 && propClear(w, rawProp0, margProp0) && !hasFocusStatic(w) && overlapsWithDrops(lo, hi, w.id) <= ov0) {
            counts.grown++; counts.mustShowChanged++;
            return { k, desc: `partially grown x${k.toFixed(2)} in place${mode !== 'orig' ? ` (${mode} entrance)` : ''}` };
          }
        }
      }
      restW(w, wSnap);
      return null;
    };

    // Phase A: reach full size minimum (1.0x) in strict preference order:
    //   1. drop/hide approved/filler/earlier neighbours  2. re-frame camera  3. grow from new placement.
    let res = tryStep1(1.0) ?? tryStep2(1.0) ?? tryStep3(1.0);
    if (res) {
      const shAfter = shownHolds(w);
      const bestF = shAfter.find(x => x.focused) ?? shAfter[0];
      const msg = `${w.id} ${w.text} (must_show): kept at full size — ${res.desc}${bestF ? ` (letters ${(100 * bestF.size).toFixed(1)}%, min ${(100 * bestF.min).toFixed(1)}%)` : ''}`;
      w.must_show_action = w.must_show_action ? `${w.must_show_action}; then ${res.desc}` : msg;
      log.push(msg); mustShowLog.push(msg);
      return;
    }

    // Phase B: below normal minimum, down to the readable hard floor (MUST_SHOW_FLOOR_RATIO = 70% of min).
    const partial = tryPartialInPlace();
    let floorRes = null;
    if (focusShortAt(shownHolds(w), MUST_SHOW_FLOOR_RATIO).length > 0) {
      floorRes = tryStep1(MUST_SHOW_FLOOR_RATIO) ?? tryStep2(MUST_SHOW_FLOOR_RATIO) ?? tryStep3(MUST_SHOW_FLOOR_RATIO);
    }
    w.size_kept = true;
    const shEnd = shownHolds(w);
    const worstF = focusShortAt(shEnd, 1.0)[0] ?? shEnd.find(x => x.focused) ?? shEnd[0];
    const aboveFloor = focusShortAt(shEnd, MUST_SHOW_FLOOR_RATIO).length === 0;
    const how = floorRes ? floorRes.desc : partial ? partial.desc : 'kept at existing size';
    const detail = worstF
      ? `letters ${(100 * worstF.size).toFixed(1)}% at frame ${worstF.f}, min ${(100 * worstF.min).toFixed(1)}% ${worstF.crowded ? 'crowded' : 'with room'}, hard floor ${(100 * floorFor(worstF.min)).toFixed(1)}% (${Math.round(100 * MUST_SHOW_FLOOR_RATIO)}% of min)`
      : 'no settled focus hold measured';
    const msg = `${w.id} ${w.text} (must_show): ${aboveFloor ? 'kept below minimum above readable hard floor' : 'kept BELOW readable hard floor (never dropped for size)'} — ${how} (${detail})`;
    w.must_show_action = w.must_show_action ? `${w.must_show_action}; then ${how}` : msg;
    log.push(msg); mustShowLog.push(msg);
  };

  for (const w of scene.words) {
    if (wordmarks ? !(w.wordmark?.image && !w.reveal_copy_of && !w.echo && !w.dropped) : !resizable(w)) continue;
    if (w.on >= until) continue;
    let sh = shownHolds(w), short = sh.filter(x => x.size < x.min - 1e-9);
    if (!short.length) continue;
    const k = Math.max(...short.map(x => x.min / x.size)) * 1.03, was = Math.max(...short.map(x => x.size));
    if (k <= MAX_GROW && growable(w)) {
      const lo = Math.max(0, w.on), hi = Math.min(until, w.off ?? until);
      const ovBefore = overlapsWithDrops(lo, hi, w.id), failBefore = ownFailures(w), propBefore = propOv(w);
      const keep = JSON.stringify({ C: w.C, w: w.w, h: w.h, cap: w.cap, fontPx: w.fontPx, pad: w.pad, motion: w.motion });
      const clipped = (w.clip ?? []).length > 0;
      let done = false;
      for (const pv of PIVOTS) {
        grow(w, k, pv);
        if (clipped) w.motion = (w.motion ?? []).map(m => m.kind === 'shift' ? { ...m, from: mul(m.from, k), to: mul(m.to, k) } : m);
        if ((!clipped || clipEntranceOk(scene, w)) && overlapsWithDrops(lo, hi, w.id) <= ovBefore && ownFailures(w) <= failBefore && propOv(w) <= propBefore) {
          counts.grown++; done = true;
          log.push(`${w.id} ${w.text}: grown x${k.toFixed(2)}${pv[0] || pv[1] ? ` from its ${['', 'left', 'right'][pv[0] === -1 ? 1 : pv[0] === 1 ? 2 : 0]}${pv[0] && pv[1] ? ' ' : ''}${['', 'bottom', 'top'][pv[1] === -1 ? 1 : pv[1] === 1 ? 2 : 0]} ${pv[0] && pv[1] ? 'corner' : 'edge'}` : ''} (letters ${(100 * was).toFixed(1)}% under the ${(100 * Math.max(...short.map(x => x.min))).toFixed(1)}% minimum)`);
          break;
        }
        Object.assign(w, JSON.parse(keep));
      }
      if (done) {
        if (w.must_show) {
          const msg = `${w.id} ${w.text} (must_show): grown x${k.toFixed(2)} in place to full minimum`;
          w.must_show_action = w.must_show_action ? `${w.must_show_action}; then grown x${k.toFixed(2)} in place` : msg;
          mustShowLog.push(msg);
        }
        sh = shownHolds(w); short = sh.filter(x => x.size < x.min - 1e-9); if (!short.length) continue;
      }
    }
    if (wordmarks) {
      const x = short[0]; counts.keptSmall++;
      log.push(`${w.id} ${w.text}: wordmark kept under size (letters ${(100 * x.size).toFixed(1)}% at frame ${x.f}, minimum ${(100 * x.min).toFixed(1)}%; growing x${k.toFixed(2)} would overlap or leave it partly shown; Type rule 1 failure)`);
      continue;
    }
    // Type rule 2 (brief 5 change 3): only non-important words are dropped. An important word (w.important: a name,
    // number or line-end rhyme word by keyword mode's ranking) that cannot grow stays and is reported as under size.
    // Brief 10 item 37 (SETS at 74.3 s): a word that meets its minimum in the hold where it is sung is not dropped for a
    // later hold that falls inside its focus window (the camera pulled back); it is hidden there instead, like any
    // later hold.
    { const o = onsetOf(w);
      if (o != null && sh.some(x => x.size >= x.min - 1e-9 && x.h.start <= o && o < x.h.end)) for (const x of short) if (x.h.start > o) x.focused = false; }
    // Brief 20: a must-show word is never dropped for size; free room in strict preference order before settling down
    // to the 70% readable hard floor. Any remaining under-size later holds strictly past mustEnd are hidden like normal
    // later holds (never dropped).
    if (short.some(x => x.focused) && w.must_show) {
      resolveMustShow(w);
      sh = shownHolds(w);
      const o = onsetOf(w), A = appearanceFrame(w), mustEnd = Math.max(A + G.SHOWN_FRAMES - 1, o ?? w.on);
      short = sh.filter(x => x.size < x.min - 1e-9 && x.h.start > mustEnd).map(x => ({ ...x, focused: false }));
      if (!short.length) continue;
    }
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
      const lo = Math.max(0, w.on), hi = Math.min(until, w.off ?? until), failBefore = ownFailures(w), propBefore = propOv(w);
      const keep = JSON.stringify({ C: w.C, w: w.w, h: w.h, cap: w.cap, fontPx: w.fontPx, pad: w.pad, motion: w.motion });
      const byId = new Map(scene.words.map(x => [x.id, x])), clipped = (w.clip ?? []).length > 0;
      let made = null;
      for (const pv of PIVOTS) {
        grow(w, k, pv);
        if (clipped) w.motion = (w.motion ?? []).map(m => m.kind === 'shift' ? { ...m, from: mul(m.from, k), to: mul(m.to, k) } : m);
        if ((!clipped || clipEntranceOk(scene, w)) && ownFailures(w) <= failBefore && propOv(w) <= propBefore) {
          const mine = scanOverlap(scene, { from: lo, until: hi }).overlaps.filter(o => o.includes(` ${w.id} `) || o.includes(`: ${w.id} `));
          const ids = [...new Set(mine.flatMap(o => [...o.matchAll(/\b(w\d+[a-z0-9]*) /g)].map(m => m[1])))].filter(id => id !== w.id);
          const partners = ids.map(id => byId.get(id));
          if (!mine.some(o => o.includes('panel:') || o.includes('plaque p')) && partners.length && partners.every(x => x && !x.keyword && !x.important && !x.must_show && resizable(x))) {
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
        for (const x of made) { x.dropped = 'room'; x.dropped_for = w.id; x.opacity = [[0, 0]]; counts.dropped++; log.push(`${x.id} ${x.text}: dropped (filler) to make room for the keyword ${w.id} ${w.text}`); }
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
  for (const w of drops) { if (w.dropped) continue; w.size_restore = JSON.stringify(w.opacity ?? null); w.opacity = [[0, 0]]; w.dropped = 'size'; }
  return { log, counts, settings: S, mustShowLog };
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
  const crowdedAt = f => {
    const p = poseAt(f);
    const on = scene.words.filter(x => !x.reveal_copy_of && drawn(x, f) && inFrameShare(x, f, p, vfov) >= FILLED_SHARE);
    return on.length >= S.crowdedWords || on.reduce((t, x) => t + boxCoverage(x, f, p, vfov), 0) >= S.crowdedArea;
  };
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
        if (size != null && (!best || size > best.size + 1e-9 || (Math.abs(size - best.size) <= 1e-9 && crowdedAt(f) && !crowdedAt(best.f)))) best = { size, f };
      }
      if (!best) continue;
      const crowded = crowdedAt(best.f);
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
  const X = I.wordXform(w, f), band = (hasBlock(w) || !!w.wordmark?.image) ? 1 : Math.min(1, (w.cap ?? w.h) * (1.03 + jb) / w.h);
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
        if (!still && s != null) {
          // Include the first frame of the static run (s - 1 when s > f): k consecutive frames at rest have k - 1
          // zero-change steps between them (brief 16b: INSIDE sat 9% in frame on 4541-4543, 3 frames = 2 steps).
          const start = s > f ? s - 1 : s;
          if (g - start >= STATIC_FRAMES) out.push({ w, start, end: g, spanStart: f, spanEnd: e, share: at(s) });
          s = null;
        }
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
      const leaners = [after && (after.keyword === false || after.pronoun || /^pronoun/.test(after.keyword_why ?? '')) ? after : null,
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
// Phrase gaps in later views (brief 16b: UP [gap] TR3Y at 159.3 s, SO DON'T [gap] NOT ONE INCH at 141.5 s).
// When a later view (camera hold) of a phrase shows words on both sides of one or more hidden intermediate words
// from the same plaque/phrase that fit in frame, either show all the fitting words between them (judging crowdedness
// with all of them visible together, with no overlap or static partial) or hide one non-focused side of the gap so
// the view never shows a blank hole inside a phrase.
export function phraseGaps(scene, onsetOf, { until = scene.meta.frames, settings = {}, maxFrames = 7 } = {}) {
  const S = { ...SIZE_DEFAULTS, ...settings }, I = globalThis.KT_INTERP, vfov = scene.meta.vfov ?? 40, fps = scene.meta.fps ?? 30;
  const poses = new Map(), poseAt = f => poses.get(f) ?? poses.set(f, I.poseAt(scene.cams, f)).get(f);
  const hs = holds(scene, until);
  const byMap = new Map(scene.words.filter(w => w.map_index != null && !w.reveal_copy_of && !w.echo).map(w => [w.map_index, w]));
  const crowdedAt = f => {
    const p = poseAt(f);
    const on = scene.words.filter(x => !x.reveal_copy_of && drawn(x, f) && inFrameShare(x, f, p, vfov) >= FILLED_SHARE);
    return on.length >= S.crowdedWords || on.reduce((t, x) => t + boxCoverage(x, f, p, vfov), 0) >= S.crowdedArea;
  };
  const hasProps = I.hasKeepClearProps?.(scene);
  const out = [];
  for (const h of hs) {
    const sampleFrames = [...new Set([h.start, Math.min(h.end - 1, h.start + 2), Math.floor((h.start + h.end) / 2), Math.max(h.start, h.end - 2)])];
    const seen = new Set();
    for (const f of sampleFrames) {
      const p = poseAt(f);
      const vis = scene.words.filter(w =>
        w.map_index != null && !w.reveal_copy_of && !w.echo && drawn(w, f) && !I.wordMoving(w, f) &&
        inFrameShare(w, f, p, vfov) >= FILLED_SHARE && G.readableOrientation(w, f, p, vfov, { tilt: false })
      ).sort((a, b) => a.map_index - b.map_index);
      for (let i = 0; i < vis.length - 1; i++) {
        const wL = vis[i], wR = vis[i + 1];
        if (wR.map_index - wL.map_index <= 1) continue;
        if (!wL.plaque || wL.plaque !== wR.plaque) continue;
        const key = `${h.start}-${h.end}:${wL.plaque}:${wL.map_index}-${wR.map_index}`;
        if (seen.has(key)) continue;
        const hidden = [];
        for (let m = wL.map_index + 1; m < wR.map_index; m++) {
          const mw = byMap.get(m);
          if (!mw || mw.plaque !== wL.plaque || mw.dropped) continue;
          if (mw.on > f || (mw.off != null && f >= mw.off)) continue;
          if (drawn(mw, f)) continue;
          hidden.push(mw);
        }
        if (!hidden.length) continue;
        // Find which hidden intermediate words fit whole & readable in frame across their overlap with this hold.
        const fitting = [];
        for (const mw of hidden) {
          const a = Math.max(h.start, mw.on), b = Math.min(h.end, mw.off ?? until, until);
          if (b - a < 1) continue;
          const savedOp = JSON.stringify(mw.opacity ?? null);
          unhide(mw, a, b);
          let ok = true, anyFrame = false;
          for (let g = a; g < b && ok; g += 2) {
            if (I.wordMoving(mw, g)) continue;
            anyFrame = true;
            const pg = poseAt(g);
            ok = inFrameShare(mw, g, pg, vfov) > CLIP_SHARE && G.readableOrientation(mw, g, pg, vfov);
          }
          const orig = JSON.parse(savedOp); if (orig) mw.opacity = orig; else delete mw.opacity;
          if (ok && anyFrame) fitting.push(mw);
        }
        if (!fitting.length) continue;
        seen.add(key);
        // Option A: can all fitting intermediate words be shown together in hold h (meeting size min, no overlap, no static partial)?
        const savedOps = fitting.map(mw => [mw, JSON.stringify(mw.opacity ?? null)]);
        const ovBefore = overlapFrames(scanOverlap(scene, { from: h.start, until: h.end }).overlaps, fps);
        const stBefore = staticPartials(scene, { from: Math.max(0, h.start - 2), until: Math.min(until, h.end + 2), words: fitting }).length;
        for (const mw of fitting) {
          const a = Math.max(h.start, mw.on), b = Math.min(h.end, mw.off ?? until, until);
          unhide(mw, a, b);
        }
        let allSizeOk = true;
        for (const mw of fitting) {
          const a = Math.max(h.start, mw.on), b = Math.min(h.end, mw.off ?? until, until);
          let best = null;
          for (let g = a; g < b; g += 2) {
            if (!drawn(mw, g) || I.wordMoving(mw, g)) continue;
            const pg = poseAt(g);
            if (inFrameShare(mw, g, pg, vfov) <= CLIP_SHARE || !G.readableOrientation(mw, g, pg, vfov)) continue;
            const sz = letterHeight(mw, g, pg, vfov);
            if (sz != null && (!best || sz > best.size)) best = { size: sz, f: g };
          }
          if (!best) { allSizeOk = false; break; }
          const min = crowdedAt(best.f) ? S.minH : S.roomFactor * S.minH;
          if (best.size < min - 1e-9) { allSizeOk = false; break; }
        }
        const ovAfter = overlapFrames(scanOverlap(scene, { from: h.start, until: h.end }).overlaps, fps);
        const stAfter = staticPartials(scene, { from: Math.max(0, h.start - 2), until: Math.min(until, h.end + 2), words: fitting }).length;
        const propBad = hasProps && fitting.some(mw => {
          const [pfa, pfb] = focusWindow(mw, onsetOf, fps);
          return pfa < h.end && pfb > h.start && wordPropOverlapFrames(scene, mw, Math.max(h.start, pfa), Math.min(h.end, pfb), { useMargin: true }).length > 0;
        });
        for (const [mw, op] of savedOps) { const orig = JSON.parse(op); if (orig) mw.opacity = orig; else delete mw.opacity; }
        const canShowAll = allSizeOk && ovAfter <= ovBefore && stAfter <= stBefore && !propBad;

        // Option B: if not all fitting words can be shown, can we hide one non-focused side of the gap on this plaque?
        let hideSide = null;
        if (!canShowAll) {
          const onPlaque = vis.filter(w => w.plaque === wL.plaque);
          const leftSide = onPlaque.filter(w => w.map_index <= wL.map_index);
          const rightSide = onPlaque.filter(w => w.map_index >= wR.map_index);
          const near = { from: Math.max(0, h.start - maxFrames - 1), until: Math.min(until, h.end + maxFrames + 1) };
          const longRuns = () => emptyFrames(scene, near).filter(r => r.end - r.start + 1 > maxFrames).length;
          const shortInHold = () => {
            let n = 0;
            for (const x of onPlaque) {
              const a = Math.max(h.start, x.on), b = Math.min(h.end, x.off ?? until, until);
              let best = null;
              for (let g = a; g < b; g += 2) {
                if (!drawn(x, g) || I.wordMoving(x, g)) continue;
                const pg = poseAt(g);
                if (inFrameShare(x, g, pg, vfov) <= CLIP_SHARE || !G.readableOrientation(x, g, pg, vfov)) continue;
                const sz = letterHeight(x, g, pg, vfov);
                if (sz != null && (!best || sz > best.size + 1e-9 || (Math.abs(sz - best.size) <= 1e-9 && crowdedAt(g) && !crowdedAt(best.f)))) best = { size: sz, f: g };
              }
              if (!best) continue;
              const min = crowdedAt(best.f) ? S.minH : S.roomFactor * S.minH;
              if (best.size < min - 1e-9) n++;
            }
            return n;
          };
          const runsBefore = longRuns(), shortBefore = shortInHold();
          for (const side of [leftSide, rightSide]) {
            if (!side.length) continue;
            if (side.some(w => { const [fa, fb] = focusWindow(w, onsetOf, fps); return fa < h.end && fb > h.start; })) continue;
            const sOps = side.map(w => [w, JSON.stringify(w.opacity ?? null)]);
            for (const w of side) hide(w, Math.max(h.start, w.on), Math.min(h.end, w.off ?? until, until));
            const ok = longRuns() <= runsBefore && shortInHold() <= shortBefore;
            for (const [w, op] of sOps) { const orig = JSON.parse(op); if (orig) w.opacity = orig; else delete w.opacity; }
            if (ok) { hideSide = side; break; }
          }
        }
        out.push({ h, f, left: wL, right: wR, hidden, fitting, canShowAll, hideSide });
      }
    }
  }
  return out;
}
export function repairPhraseGaps(scene, onsetOf, { until = scene.meta.frames, settings = {}, maxFrames = 7 } = {}) {
  const log = [];
  for (let pass = 0; pass < 4; pass++) {
    const gaps = phraseGaps(scene, onsetOf, { until, settings, maxFrames });
    let changed = false;
    for (const g of gaps) {
      if (g.canShowAll) {
        for (const mw of g.fitting) {
          const a = Math.max(g.h.start, mw.on), b = Math.min(g.h.end, mw.off ?? until, until);
          unhide(mw, a, b);
          if (mw.size_hides) mw.size_hides = mw.size_hides.filter(([ha, hb]) => hb <= a || ha >= b);
        }
        log.push(`${g.fitting.map(w => `${w.id} ${w.text}`).join(', ')}: unhidden ${g.h.start}-${g.h.end} to close phrase gap between ${g.left.id} ${g.left.text} and ${g.right.id} ${g.right.text}`);
        changed = true;
        break;
      }
      if (g.hideSide) {
        for (const w of g.hideSide) {
          const a = Math.max(g.h.start, w.on), b = Math.min(g.h.end, w.off ?? until, until);
          hide(w, a, b);
        }
        log.push(`${g.hideSide.map(w => `${w.id} ${w.text}`).join(', ')}: hidden ${g.h.start}-${g.h.end} to close phrase gap around ${g.fitting.map(w => `${w.id} ${w.text}`).join(', ')} (cannot show at size without overlap)`);
        changed = true;
        break;
      }
    }
    if (!changed) break;
  }
  return { log };
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
  const hasProps = globalThis.KT_INTERP.hasKeepClearProps?.(scene);
  const propOv = () => {
    if (!hasProps) return 0;
    const [pfa, pfb] = focusWindow(w, onsetOf, scene.meta.fps ?? 30);
    return wordPropOverlapFrames(scene, w, pfa, Math.min(until, pfb), { useMargin: true }).length;
  };
  const ovBefore = ov(), propBefore = propOv(), C0 = w.C;
  const dirs = [[w.R, w.w, 'along its line'], [mul(w.R, -1), w.w, 'back along its line'], [w.U, w.h, 'up its plaque'], [mul(w.U, -1), w.h, 'down its plaque']].filter(([d]) => across(d));
  for (const k of [0.25, 0.5, 0.75, 1, 1.5, 2, 3]) for (const [dir, size, name] of dirs) {
    w.C = add(C0, mul(dir, k * size));
    const o = own();
    if (!stuck() && ov() <= ovBefore && o === 0 && propOv() <= propBefore) return `${name} by ${k} of its ${size === w.w ? 'width' : 'height'}`;
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
          if (x.w.must_show && (x.w.clip?.length || x.w.motion?.length)) {
            const snap = JSON.stringify({ C: x.w.C, motion: x.w.motion ?? null, clip: x.w.clip ?? null, joint: x.w.joint ?? null });
            x.w.motion = []; x.w.clip = []; if (x.w.joint) x.w.joint = { ...x.w.joint, prim: 'pop', f0: x.w.on, f1: x.w.on };
            const slidPop = slideWhole(scene, x.w, onsetOf, until, Math.max(x.w.on + G.SHOWN_FRAMES - 1, o));
            if (slidPop) { log.push(`${x.w.id} ${x.w.text} (must_show): moved ${slidPop} (pop entrance) so it is whole at its onset (it was ${Math.round(100 * x.share)}% visible, static, frames ${x.start}-${x.end})`); changed = true; continue; }
            const r = JSON.parse(snap); x.w.C = r.C; if (r.motion) x.w.motion = r.motion; else delete x.w.motion; if (r.clip) x.w.clip = r.clip; else delete x.w.clip; if (r.joint) x.w.joint = r.joint; else delete x.w.joint;
          }
          if (!x.w.important && !x.w.must_show) {
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

// Wordmark size (brief 12 item 1, brief 16 item 2): every image wordmark is sized by its ink box (not the old typed-
// text box or file canvas, so the rule works identically for a 1.7:1 panel PNG and a 4:1–5:1 transparent SVG). When
// alone in its hold, it grows toward WORDMARK_ALONE_WIDTH (80% of the frame width), bounded by the reading safe margins
// (WORDMARK_SAFE_X x WORDMARK_SAFE_Y = 0.94 x 0.90), the overlap gate, the shown-whole gate and static-partial check;
// with neighbours, it grows as large as room allows under those same gates. Reported with before/after ink width share.
export const WORDMARK_ALONE_WIDTH = 0.80, WORDMARK_SAFE_X = 0.94, WORDMARK_SAFE_Y = 0.90;
export function growWordmarks(scene, onsetOf, { until = scene.meta.frames } = {}) {
  const I = globalThis.KT_INTERP, vfov = scene.meta.vfov ?? 40, log = [];
  const marks = scene.words.filter(w => w.wordmark?.image && !w.reveal_copy_of && !w.echo && !w.dropped && w.on < until);
  if (!marks.length) return log;
  const hs = holds(scene, until);
  const at = w => { const o = onsetOf(w) ?? w.on; return Math.min(until - 1, Math.max(appearanceFrame(w), o) + G.SHOWN_FRAMES); };
  const size = w => G.letterHeight(w, at(w), I.poseAt(scene.cams, at(w)), vfov);
  const inkBoxAt = (w, fr) => {
    const pose = I.poseAt(scene.cams, fr), mg = w.wordmark?.margin ?? 0;
    const inkH = w.h / (1 + 2 * mg), inkW = Math.max(1e-6, w.w - 2 * mg * inkH);
    const X = I.wordXform(w, fr);
    const qs = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => I.project(X(add(w.C, add(mul(w.R, a * inkW / 2), mul(w.U, b * inkH / 2)))), pose, vfov));
    if (qs.some(q => !q)) return null;
    const xs = qs.map(q => q.x), ys = qs.map(q => q.y);
    return { w: (Math.max(...xs) - Math.min(...xs)) / 2, h: (Math.max(...ys) - Math.min(...ys)) / 2 };
  };
  const isAlone = (w, fr) => {
    const h = hs.find(x => x.start <= fr && fr < x.end);
    const checkF = h ? [fr, Math.max(h.start, w.on), Math.min(h.end - 1, (w.off ?? until) - 1)] : [fr];
    return checkF.every(f => {
      const p = I.poseAt(scene.cams, f);
      return !scene.words.some(x => x !== w && !x.reveal_copy_of && !x.dropped && drawn(x, f) && inFrameShare(x, f, p, vfov) >= FILLED_SHARE);
    });
  };
  // Check safe reading margins (0.94 x 0.90) at the wordmark's settled hold frame `fr` (not during an incoming camera
  // move before the hold starts; ownFail already enforces fullyShown across A..onset).
  const inSafeMargins = (w, fr) => {
    const cs = cornersAt(w, fr); if (!cs) return false;
    const pose = I.poseAt(scene.cams, fr);
    return cs.every(c => { const q = I.project(c, pose, vfov); return q && Math.abs(q.x) <= WORDMARK_SAFE_X && Math.abs(q.y) <= WORDMARK_SAFE_Y; });
  };
  const pre = new Map(marks.map(w => { const h = size(w); return [w, h == null || !w.wordmark.pre_cap ? null : h * w.wordmark.pre_cap / w.cap]; }));
  const known = [...pre.values()].filter(x => x != null).sort((a, b) => a - b);
  const median = known.length ? known[Math.floor(known.length / 2)] : 0;
  const ownFail = w => gateFailures({ ...scene, words: [w] }, onsetOf, { until }).filter(x => x.kind === 'partial' || x.kind === 'unshown').length;
  const ov = (w, a, b) => scanOverlap(scene, { from: a, until: b }).overlaps.filter(o => o.includes(`${w.id} `)).length;
  const pivots = [[0, 0], [0, -0.5], [0, 0.5], [-0.5, 0], [0.5, 0], [0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]];
  const steps = [1, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5, 0.45, 0.4, 0.35, 0.3, 0.25, 0.2, 0.15, 0.1];
  for (const w of marks) {
    const fr = at(w), now = size(w), ib0 = inkBoxAt(w, fr);
    if (now == null || !ib0 || !(ib0.w > 0)) continue;
    const alone = isAlone(w, fr);
    const maxSafe = Math.min(WORDMARK_SAFE_X / ib0.w, WORDMARK_SAFE_Y / ib0.h);
    const fullW = WORDMARK_ALONE_WIDTH / ib0.w;
    const fullCap = Math.max(pre.get(w) ?? 0, median) / now;
    const full = w.wordmark.target_height != null
      ? Math.min(maxSafe, w.wordmark.target_height / ib0.h)
      : Math.min(maxSafe, Math.max(fullW, fullCap));
    if (full <= 1.01) {
      log.push(`${w.id} ${w.text} at ${(w.t ?? 0).toFixed(2)} s (${alone ? 'alone' : 'with neighbours'}): ink width ${(100 * ib0.w).toFixed(1)}% of frame (already at/above ${(100 * WORDMARK_ALONE_WIDTH).toFixed(0)}% target)`);
      continue;
    }
    const o = onsetOf(w) ?? w.on, h = hs.find(x => x.start <= fr && fr < x.end);
    const on0 = w.on, b = Math.min(until, w.off ?? until), ov0 = ov(w, Math.max(0, on0), b), f0 = ownFail(w);
    const hasProps = I.hasKeepClearProps?.(scene);
    const propOv = () => {
      if (!hasProps) return 0;
      const [pfa, pfb] = focusWindow(w, onsetOf, scene.meta.fps ?? 30);
      return wordPropOverlapFrames(scene, w, pfa, Math.min(until, pfb), { useMargin: true }).length;
    };
    const prop0 = propOv();
    // For a lone static-entrance wordmark that switches on before its hold lands, also allow starting cleanly at the
    // hold start (still <= sung onset, 0 frames late) if pre-hold frames would overlap the outgoing plaque.
    const onCands = alone && !(w.motion ?? []).length && h && h.start > on0 && h.start <= o ? [on0, h.start] : [on0];
    const keep = JSON.stringify({ C: w.C, w: w.w, h: w.h, cap: w.cap, fontPx: w.fontPx, pad: w.pad, on: w.on, motion: w.motion });
    const back = () => Object.assign(w, JSON.parse(keep));
    let done = null;
    for (const t of steps) {
      const k = 1 + (full - 1) * t;
      for (const [pu, pv] of pivots) {
        for (const candOn of onCands) {
          w.on = candOn;
          const C0 = w.C;
          const P = add(C0, add(mul(w.R, pu * w.w / 2), mul(w.U, pv * w.h / 2)));
          w.C = add(P, mul(C0.map((x, i) => x - P[i]), k));
          const dC = w.C.map((x, i) => x - C0[i]);
          if (w.motion?.length && Math.hypot(...dC) > 1e-6) {
            w.motion = w.motion.map(m => m.kind === 'scale' && m.P ? { ...m, P: add(m.P, dC) } : m);
          }
          for (const key of ['w', 'h', 'cap', 'fontPx', 'pad']) if (typeof w[key] === 'number') w[key] *= k;
          const a = Math.max(0, w.on);
          if (inSafeMargins(w, fr) && ov(w, a, b) <= ov0 && ownFail(w) <= f0 && propOv() <= prop0 && !staticPartials(scene, { words: [w], until }).length) {
            done = { k, pu, pv, candOn, ib: inkBoxAt(w, fr) };
            break;
          }
          back();
        }
        if (done) break;
      }
      if (done) break;
    }
    log.push(`${w.id} ${w.text} at ${(w.t ?? 0).toFixed(2)} s (${alone ? 'alone' : 'with neighbours'}): ink width ${(100 * ib0.w).toFixed(1)}% -> ${done ? `${(100 * done.ib.w).toFixed(1)}% of frame (grown x${done.k.toFixed(2)}, height ${(100 * done.ib.h).toFixed(1)}%, letters ${(100 * now * done.k).toFixed(1)}%${done.candOn !== on0 ? `, on ${on0}->${done.candOn}` : ''})` : `${(100 * ib0.w).toFixed(1)}% (kept: every growth exceeded safe margins, overlapped a word, cut at an edge or left a static partial)`}`);
  }
  return log;
}
