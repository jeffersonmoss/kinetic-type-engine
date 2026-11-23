// Screen-space prop keep-clear framing and avoidance (engine fix brief 18, 23 November 2026).
// Generic; no song names.
//
// While any keep-clear prop (layer under_words or over_words, keep_clear !== false) is visible (opacity > 0.05),
// its screen-space hitBox plus keep_clear_margin_px (default 24 px) is a keep-clear zone.
//   1. frameClearOfProps: reframes camera holds (and splits wide multi-word holds when needed) into the best clear
//      rectangle of the 1280x720 frame so focused sung words stay clear and legible.
//   2. resolvePropOverlaps: targeted post-composition escalation pass for any remaining focus-window overlap
//      (pulses/stamps -> camera move timing -> hold reframing -> plaque slide/pop -> scale down to min_word_h ->
//      scale below min with provenance report -> post-onset tail hide).
// When a scene has no keep-clear props (hasKeepClearProps(scene) === false), every function returns immediately with
// zero mutations, preserving byte-identical output for no-props songs.
import './interp.js';
import * as G from './shown_gate.mjs';
import {
  appearanceFrame, sungWords, letterHeight, cornersAt, fitPoseInBox, fitPoseInClearArea,
  samePose, gateFailures, inkOk, SHOWN_FRAMES, MIN_MOVE,
} from './shown_gate.mjs';
import { scanOverlap, checkPropWordOverlap, wordPropOverlapFrames, wordScreenPoly, drawnScale } from './overlap_gate.mjs';
import { SIZE_DEFAULTS, FOCUS_READ, staticPartials } from './composition.mjs';
import { checkStillEnding } from './assemble_sections.mjs';

const I = globalThis.KT_INTERP;
const add = (a, b) => a.map((x, i) => x + b[i]);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const mul = (a, k) => a.map(x => x * k);
const complete = p => ({ ...p, position: add(p.target, mul(p.N, p.dist)) });

// All camera holds [start, end) with end > start (including 1-2 frame holds and the opening hold k = -1).
export function allHolds(scene, until = scene.meta.frames) {
  const keys = scene.cams, out = [];
  let start = 0, k = -1;
  for (let i = 0; i <= keys.length; i++) {
    const end = Math.min(i < keys.length ? keys[i].f0 : scene.meta.frames, until);
    if (end > start) out.push({ start, end, k, n: i < keys.length ? i : -1 });
    if (i < keys.length) { start = Math.max(start, keys[i].f1); k = i; }
    if (start >= until) break;
  }
  return out;
}

const focusOf = (w, onsetF, until, focusRead = FOCUS_READ) => {
  const A = appearanceFrame(w);
  return { A, fa: Math.max(0, Math.min(A, onsetF)), fb: Math.min(until, Math.max(A, onsetF) + focusRead) };
};

// Corners of w at frame f, optionally inflated by peak drawnScale inside [a, b) so framing leaves room for stamps/pulses.
function wordPtsInHold(w, f, a, b, fps) {
  const cs = cornersAt(w, f) ?? cornersAt(w, appearanceFrame(w));
  if (!cs) return [];
  let maxK = 1;
  for (let g = a; g < b; g++) maxK = Math.max(maxK, drawnScale(w, g, fps));
  if (maxK <= 1.001) return cs;
  const c = [0, 1, 2].map(i => (cs[0][i] + cs[2][i]) / 2);
  return cs.map(pt => pt.map((x, i) => c[i] + (x - c[i]) * maxK));
}

// Evaluate candidate clear rects for a set of focused words in a hold and pick the best pose.
function bestClearFit(pose0, group, h, obstacles, { vfov, fps, W = 1280, H = 720, preferSide = null, minW = 80, minH = 80 } = {}) {
  const rects = I.clearRectsFromObstacles(obstacles, { W, H, mx: 0.94, my: 0.90, minW, minH });
  if (!rects.length) return null;
  const pts = [];
  for (const s of group) {
    const f = Math.min(h.end - 1, Math.max(appearanceFrame(s.w), h.start));
    pts.push(...wordPtsInHold(s.w, f, Math.max(h.start, s.fa), Math.min(h.end, s.fb), fps));
  }
  if (!pts.length) return null;
  const sideOf = r => {
    if (r.x1 <= W * 0.58) return 'left';
    if (r.x0 >= W * 0.65) return 'right';
    if (r.y1 <= H * 0.72) return 'top';
    return 'bottom';
  };
  let best = null;
  for (const r of rects) {
    const side = sideOf(r);
    // Use the narrow right sliver only for single short words unless nothing else exists.
    if (side === 'right' && group.length > 1 && rects.some(o => sideOf(o) !== 'right')) continue;
    const pose = fitPoseInBox(pose0, pts, vfov, r.ndc);
    if (!pose || !(pose.dist > 0)) continue;
    const comp = complete(pose);
    let minCapH = Infinity, minAnyH = Infinity;
    for (const s of group) {
      const f = Math.min(h.end - 1, Math.max(appearanceFrame(s.w), h.start));
      const lh = letterHeight(s.w, f, comp, vfov);
      if (lh != null) {
        minAnyH = Math.min(minAnyH, lh);
        if (!s.w.wordmark) minCapH = Math.min(minCapH, lh);
      }
    }
    if (!Number.isFinite(minCapH)) minCapH = Number.isFinite(minAnyH) ? minAnyH : 1 / pose.dist;
    // Slight stability bonus for staying on the same band (e.g. left or top) as the previous prop-active hold,
    // and slight penalty for jumping to the narrow right sliver when left/top is nearly as large.
    const score = minCapH * (side === preferSide ? 1.06 : 1) * (side === 'right' ? 0.92 : 1);
    if (!best || score > best.score + 1e-6) best = { pose, rect: r, side, minCapH, score };
  }
  return best;
}

// Pass 1 (early in join, and in prop-aware section builds): reframe every hold whose focused sung words intrude on a
// keep-clear prop's zone (hitBox + keep_clear_margin_px) into the best clear band, preferring camera framing over
// shrinking words. Splits wide multi-word holds when splitting cleanly lifts words above the legibility minimum.
export function frameClearOfProps(scene, onsetOf, { until = scene.meta.frames, settings = {}, W = 1280, H = 720, minEndHold = 15 } = {}) {
  if (!I.hasKeepClearProps?.(scene)) return { log: [], holdsReframed: 0, holdsSplit: 0 };
  const S = { ...SIZE_DEFAULTS, ...settings };
  const vfov = scene.meta.vfov ?? 40, fps = scene.meta.fps ?? 30;
  const byId = new Map(scene.words.map(w => [w.id, w]));
  const log = [];
  let holdsReframed = 0, holdsSplit = 0, preferSide = 'left';

  // Build initial list of holds; we may insert split keys, so walk by index after collecting splits or iterate freshly.
  const sung = sungWords(scene, onsetOf).filter(s => s.onsetF < until && inkOk(s.w))
    .map(s => ({ ...s, ...focusOf(s.w, s.onsetF, until) }));

  const applyHoldPose = (h, newPose) => {
    if (h.k < 0) {
      if (scene.cams.length) scene.cams[0].from = newPose;
      return;
    }
    const old = scene.cams[h.k].to;
    scene.cams[h.k].to = newPose;
    if (h.n >= 0 && samePose(scene.cams[h.n].from, old)) scene.cams[h.n].from = newPose;
  };

  for (let pass = 0; pass < 2; pass++) {
    let changed = false;
    const hs = allHolds(scene, until);
    for (const h of hs) {
      const obs = I.keepClearObstaclesInRange(scene, h.start, h.end, W, H, { useMargin: true });
      if (!obs.length) continue;
      const pose0 = I.poseAt(scene.cams, h.start);
      // Focused words whose focus window overlaps this hold AND that are in frame (or start/sung) in this hold.
      const group = sung.filter(s => {
        if (!(s.fa < h.end && s.fb > h.start)) return false;
        const a = Math.max(h.start, s.fa), b = Math.min(h.end, s.fb);
        const belongs = (s.A >= h.start && s.A < h.end) || (s.onsetF >= h.start && s.onsetF < h.end);
        if (belongs) return true;
        // Include an overlapping-tail word only if it is actually drawn and on-screen in this hold's current framing.
        for (let f = a; f < b; f++) {
          if (wordScreenPoly(s.w, f, pose0, { vfov, fps, W, H, byId })) return true;
        }
        return false;
      });
      if (!group.length) continue;

      // Skip holds where every focused word is ALREADY clear of all obstacles (with margin) throughout the hold.
      const anyHit = group.some(s => {
        const a = Math.max(h.start, s.fa), b = Math.min(h.end, s.fb);
        return wordPropOverlapFrames(scene, s.w, a, b, { W, H, useMargin: true, byId }).length > 0;
      });
      if (!anyHit) continue;

      let fit = bestClearFit(pose0, group, h, obs, { vfov, fps, W, H, preferSide });
      if (!fit) {
        const rawObs = I.keepClearObstaclesInRange(scene, h.start, h.end, W, H, { useMargin: false });
        fit = bestClearFit(pose0, group, h, rawObs, { vfov, fps, W, H, preferSide, minW: 48, minH: 48 });
      }
      if (!fit) continue;

      // Try clean hold split if fitting all words simultaneously drops below legibility minimum S.minH.
      if (pass === 0 && group.length >= 2 && fit.minCapH < S.minH * 1.05 && h.k >= 0 && h.end - h.start >= 20) {
        const ordered = [...group].sort((a, b) => a.onsetF - b.onsetF);
        let bestSplit = null;
        for (let m = 1; m < ordered.length; m++) {
          const g1 = ordered.slice(0, m), g2 = ordered.slice(m);
          const g1FocusEnd = Math.max(...g1.map(s => s.fb));
          const g2Start = Math.min(...g2.map(s => s.fa));
          if (g1FocusEnd > g2Start) continue;
          const splitF = g2Start;
          if (splitF - h.start < 8 || h.end - splitF < 8 || splitF > scene.meta.frames - minEndHold) continue;
          const h1 = { ...h, end: splitF }, h2 = { ...h, start: splitF };
          const obs1 = I.keepClearObstaclesInRange(scene, h1.start, h1.end, W, H, { useMargin: true });
          const obs2 = I.keepClearObstaclesInRange(scene, h2.start, h2.end, W, H, { useMargin: true });
          const f1 = obs1.length ? bestClearFit(pose0, g1, h1, obs1, { vfov, fps, W, H, preferSide }) : { pose: pose0, minCapH: S.minH * 2, side: preferSide, rect: null };
          const f2 = obs2.length ? bestClearFit(pose0, g2, h2, obs2, { vfov, fps, W, H, preferSide: f1?.side ?? preferSide }) : { pose: pose0, minCapH: S.minH * 2, side: preferSide, rect: null };
          if (!f1 || !f2) continue;
          const worst = Math.min(f1.minCapH, f2.minCapH);
          if (worst > fit.minCapH * 1.15 && (!bestSplit || worst > bestSplit.worst)) {
            bestSplit = { splitF, f1, f2, g1, g2, worst };
          }
        }
        if (bestSplit) {
          const { splitF, f1, f2, g1, g2 } = bestSplit;
          const oldTo = scene.cams[h.k].to;
          scene.cams[h.k].to = f1.pose;
          const cutKey = {
            f0: splitF, f1: splitF, kind: 'keep_clear_split', verb: 'cut', fold: 'flat',
            ease: { a: 2, b: 3, x0: 0.4 }, from: f1.pose, to: f2.pose,
          };
          scene.cams.splice(h.k + 1, 0, cutKey);
          const nextIdx = h.k + 2;
          if (nextIdx < scene.cams.length && samePose(scene.cams[nextIdx].from, oldTo)) scene.cams[nextIdx].from = f2.pose;
          holdsSplit++;
          preferSide = f2.side;
          log.push(`hold ${h.start}-${h.end}: split at frame ${splitF} into [${g1.map(s => s.w.text).join(' ')}] (${f1.side}, min ${(100 * f1.minCapH).toFixed(1)}%) and [${g2.map(s => s.w.text).join(' ')}] (${f2.side}, min ${(100 * f2.minCapH).toFixed(1)}%) to keep clear and legible (combined was ${(100 * fit.minCapH).toFixed(1)}%)`);
          changed = true;
          break; // re-enumerate holds after splice
        }
      }

      if (!samePose(pose0, fit.pose)) {
        applyHoldPose(h, fit.pose);
        holdsReframed++;
        preferSide = fit.side;
        log.push(`hold ${h.start}-${h.end}: reframed ${group.length} word${group.length > 1 ? 's' : ''} (${group.map(s => s.w.text).join(' ')}) into ${fit.side} clear band [${Math.round(fit.rect.x0)}..${Math.round(fit.rect.x1)}, ${Math.round(fit.rect.y0)}..${Math.round(fit.rect.y1)}], dist ${pose0.dist.toFixed(0)} -> ${fit.pose.dist.toFixed(0)} (min letters ${(100 * fit.minCapH).toFixed(1)}%)`);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return { log, holdsReframed, holdsSplit };
}

// Compute world-space displacement along (w.R, w.U) that shifts w's projected screen centre by (dxPx, dyPx) at pose.
function screenDeltaToWorld(w, f, pose, dxPx, dyPx, { vfov = 40, W = 1280, H = 720 } = {}) {
  const X = I.wordXform(w, f);
  const c0 = X(w.C);
  const p0 = I.project(c0, pose, vfov);
  const pr = I.project(add(c0, w.R), pose, vfov);
  const pu = I.project(add(c0, w.U), pose, vfov);
  if (!p0 || !pr || !pu) return null;
  // Jacobian: screen px per 1 world unit along w.R and w.U
  const j00 = (pr.x - p0.x) * W / 2, j10 = -(pr.y - p0.y) * H / 2;
  const j01 = (pu.x - p0.x) * W / 2, j11 = -(pu.y - p0.y) * H / 2;
  const det = j00 * j11 - j01 * j10;
  if (Math.abs(det) < 1e-9) return null;
  const dr = (j11 * dxPx - j01 * dyPx) / det;
  const du = (-j10 * dxPx + j00 * dyPx) / det;
  return add(mul(w.R, dr), mul(w.U, du));
}

function translateWord(w, dC) {
  w.C = add(w.C, dC);
  if (w.motion?.length) {
    w.motion = w.motion.map(m => (m.kind === 'scale' || m.kind === 'hinge') && m.P ? { ...m, P: add(m.P, dC) } : m);
  }
}

function scaleWordAbout(w, k, [pu, pv] = [0, 0]) {
  const P = add(w.C, add(mul(w.R, pu * w.w / 2), mul(w.U, pv * w.h / 2)));
  const C0 = w.C;
  w.C = add(P, mul(sub(C0, P), k));
  const dC = sub(w.C, C0);
  if (w.motion?.length && Math.hypot(...dC) > 1e-6) {
    w.motion = w.motion.map(m => m.kind === 'scale' && m.P ? { ...m, P: add(m.P, dC) } : m);
  }
  for (const key of ['w', 'h', 'cap', 'fontPx', 'pad']) if (typeof w[key] === 'number') w[key] *= k;
}

function hideSpan(w, a, b) {
  let restore = 1;
  for (const [k, x] of w.opacity ?? []) if (k <= b) restore = x;
  w.opacity = [...(w.opacity ?? []).filter(([k]) => k < a || k >= b), [a, 0], [b, restore]].sort((x, y) => x[0] - y[0]);
}

// Pass 2 (after composition, wordmarks, static partials, fills): resolve any remaining focus-window prop overlaps
// using a strict preference ladder:
//   A. Pulse/stamp taming
//   B. Camera move timing (land earlier / leave later / cut)
//   C. Hold reframing into clear rect (framing before shrinking)
//   D. Entrance/slide adjustment on plaque plane (keeps 100% size)
//   E. Scale down to legibility minimum S.minH (or below with provenance flag rather than overlapping)
//   F. Post-onset tail hide (only after onset + SHOWN_FRAMES already satisfied)
export function resolvePropOverlaps(scene, onsetOf, { until = scene.meta.frames, settings = {}, W = 1280, H = 720, minEndHold = 15 } = {}) {
  if (!I.hasKeepClearProps?.(scene)) return { log: [], belowMin: [], unresolved: [] };
  const S = { ...SIZE_DEFAULTS, ...settings };
  const vfov = scene.meta.vfov ?? 40, fps = scene.meta.fps ?? 30;
  const byId = new Map(scene.words.map(w => [w.id, w]));
  const log = [], belowMin = [], unresolved = [];
  const allSung = sungWords(scene, onsetOf).filter(s => s.onsetF < until && inkOk(s.w));

  // Localised checks for speed: only judge words overlapping [lo, hi] when modifying a camera key, or [w] alone for
  // single-word edits.
  const localSceneForRange = (lo, hi) => {
    const ws = scene.words.filter(x => !x.dropped && !x.reveal_copy_of && x.on <= hi && (x.off == null || x.off >= lo));
    return { ...scene, words: ws };
  };
  const propFramesInRange = (lo, hi, useMargin) => {
    let n = 0;
    for (const { w, onsetF } of allSung) {
      if (w.dropped) continue;
      const { fa, fb } = focusOf(w, onsetF, until);
      if (fb <= lo || fa >= hi) continue;
      n += wordPropOverlapFrames(scene, w, fa, fb, { W, H, useMargin, byId }).length;
    }
    return n;
  };
  const partialCountFor = wordsList => gateFailures({ ...scene, words: wordsList }, onsetOf, { until }).filter(x => x.kind === 'partial').length;
  const ovCount = (lo, hi) => scanOverlap(scene, { from: lo, until: hi }).overlaps.length;
  const statCount = (lo, hi) => staticPartials(scene, { from: lo, until: hi }).length;
  const endingOk = () => checkStillEnding(scene, { minHoldFrames: minEndHold }).pass;

  const snapWord = w => JSON.stringify({
    C: w.C, w: w.w, h: w.h, cap: w.cap, fontPx: w.fontPx, pad: w.pad,
    on: w.on, off: w.off ?? null, stamp: w.stamp ?? false, stamp_peak: w.stamp_peak ?? null,
    pulses: w.pulses ?? null, pulse_peak: w.pulse_peak ?? null,
    motion: w.motion ?? null, clip: w.clip ?? null, joint: w.joint ?? null, opacity: w.opacity ?? null,
  });
  const restoreWord = (w, s) => {
    const o = JSON.parse(s);
    for (const [k, v] of Object.entries(o)) {
      if (v == null && ['off', 'stamp_peak', 'pulses', 'pulse_peak', 'motion', 'clip', 'joint', 'opacity'].includes(k)) delete w[k];
      else w[k] = v;
    }
  };

  // Phase 1: hard clearance against raw hitBox (useMargin: false).
  // Phase 2: polish pass to also clear keep_clear_margin_px (useMargin: true) without shrinking below S.minH or
  // adding any raw hitBox overlap.
  for (const phaseMargin of [false, true]) {
    const maxRounds = phaseMargin ? 2 : 6;
    for (let round = 0; round < maxRounds; round++) {
      const check = checkPropWordOverlap(scene, onsetOf, { until, W, H, useMargin: phaseMargin });
      if (check.pass) break;
      let roundChanged = false;
      const seenWords = new Set();

      for (const v of check.violations) {
        if (seenWords.has(v.wordId)) continue;
        seenWords.add(v.wordId);
        const w = byId.get(v.wordId);
        if (!w) continue;
        const onsetF = onsetOf(w);
        if (onsetF == null) continue;
        const { A, fa, fb } = focusOf(w, onsetF, until);
        const lo = Math.max(0, Math.min(w.on, fa) - 2);
        const hi = Math.min(until, Math.max(w.off ?? until, fb) + 2);
        const ownHits = useMargin => wordPropOverlapFrames(scene, w, fa, fb, { W, H, useMargin, byId });
        const hits0 = ownHits(phaseMargin);
        if (!hits0.length) continue;

        const baseOwnPart = partialCountFor([w]);
        const baseOv = ovCount(lo, hi);
        const baseStat = statCount(lo, hi);
        const baseEnd = endingOk();
        const validWord = () =>
          (!phaseMargin || ownHits(false).length === 0) &&
          partialCountFor([w]) <= baseOwnPart &&
          ovCount(lo, hi) <= baseOv &&
          statCount(lo, hi) <= baseStat &&
          (!baseEnd || endingOk());

        const badFrames = [...new Set(hits0.map(h => h.frame))].sort((a, b) => a - b);
        let fixed = false;

        // Step A: pulse / stamp taming if drawnScale > 1 causes the prop hit.
        if (badFrames.some(f => drawnScale(w, f, fps) > 1 + 1e-6)) {
          const ws = snapWord(w);
          const hitsNoScale = wordPropOverlapFrames(scene, w, fa, fb, { W, H, useMargin: phaseMargin, byId, useDrawnScale: false });
          if (hitsNoScale.length < hits0.length) {
            let tried = false;
            if (w.stamp && badFrames.some(f => f >= w.on && f < w.on + 3)) {
              w.stamp = false; delete w.stamp_peak; tried = true;
            }
            const badPulses = (w.pulses ?? []).filter(t => badFrames.some(f => f >= t * fps - 1 && f <= (t + 0.45) * fps + 1));
            if (badPulses.length) {
              w.pulses = (w.pulses ?? []).filter(t => !badPulses.includes(t)); tried = true;
            }
            if (tried && ownHits(phaseMargin).length < hits0.length && validWord()) {
              log.push(`${w.id} ${w.text}: tamed stamp/pulse to clear prop ${v.propId}${phaseMargin ? ' margin' : ''} (${hits0.length} -> ${ownHits(phaseMargin).length} frames)`);
              fixed = true; roundChanged = true;
            } else restoreWord(w, ws);
          }
        }
        if (fixed && ownHits(phaseMargin).length === 0) continue;

        // Step B: camera move timing adjustment when bad frames occur during a camera transition.
        {
          const camSnap = JSON.stringify(scene.cams);
          const moveKeys = scene.cams.map((K, idx) => ({ K, idx })).filter(({ K }) => K.f1 > K.f0 && K.f0 < fb && K.f1 > fa);
          for (const { K, idx } of moveKeys) {
            const prevEnd = idx > 0 ? scene.cams[idx - 1].f1 : 0;
            const nextStart = idx + 1 < scene.cams.length ? scene.cams[idx + 1].f0 : scene.meta.frames;
            const moveBad = badFrames.filter(f => f >= K.f0 && f < K.f1);
            if (!moveBad.length) continue;
            const rLo = Math.max(0, prevEnd - 2), rHi = Math.min(until, nextStart + 2);
            const locWords = localSceneForRange(rLo, rHi).words;
            const baseCamPart = partialCountFor(locWords);
            const baseCamRaw = propFramesInRange(rLo, rHi, false);
            const baseCamTarget = propFramesInRange(rLo, rHi, phaseMargin);
            const baseCamOv = ovCount(rLo, rHi);
            const baseCamStat = statCount(rLo, rHi);

            const tries = [];
            const b0 = moveBad[0], b1 = moveBad.at(-1);
            if (b0 >= prevEnd + MIN_MOVE) tries.push(['land earlier', { f0: Math.max(prevEnd + 1, K.f0 - (K.f1 - b0)), f1: b0 }]);
            if (b0 > K.f0 + MIN_MOVE) tries.push(['shorten to land earlier', { f0: K.f0, f1: b0 }]);
            if (K.f1 - (b1 + 1) >= MIN_MOVE) tries.push(['start later', { f0: b1 + 1, f1: K.f1 }]);
            const shiftOut = b1 + 1 - K.f0;
            if (shiftOut > 0 && K.f1 + shiftOut <= Math.min(nextStart - 1, scene.meta.frames - minEndHold)) {
              tries.push(['delay move', { f0: K.f0 + shiftOut, f1: K.f1 + shiftOut }]);
            }
            if (K.bow) tries.push(['remove bow', { bow: false }]);
            tries.push(['cut at landing', { f0: K.f1, f1: K.f1, verb: 'cut', cut_from: K.verb }]);
            if (b0 >= prevEnd) tries.push(['cut before prop hit', { f0: b0, f1: b0, verb: 'cut', cut_from: K.verb }]);

            for (const [label, patch] of tries) {
              if (patch.f1 != null && patch.f1 > scene.meta.frames - minEndHold && patch.f1 > patch.f0) continue;
              Object.assign(K, patch);
              const okRaw = !phaseMargin || propFramesInRange(rLo, rHi, false) <= baseCamRaw;
              if (okRaw && ownHits(phaseMargin).length < hits0.length && propFramesInRange(rLo, rHi, phaseMargin) < baseCamTarget &&
                  partialCountFor(locWords) <= baseCamPart && ovCount(rLo, rHi) <= baseCamOv && statCount(rLo, rHi) <= baseCamStat &&
                  (!baseEnd || endingOk())) {
                log.push(`${w.id} ${w.text}: camera key ${idx} (${label}, now ${K.f0}-${K.f1}) clears prop ${v.propId}${phaseMargin ? ' margin' : ''}`);
                fixed = true; roundChanged = true;
                break;
              }
              scene.cams = JSON.parse(camSnap);
              Object.assign(K, scene.cams[idx]);
            }
            if (fixed) break;
          }
        }
        if (fixed && ownHits(phaseMargin).length === 0) continue;

        // Step C: reframe the hold(s) intersecting badFrames into a clear rectangle (framing change first).
        {
          const camSnap = JSON.stringify(scene.cams);
          const curOwn = ownHits(phaseMargin).length;
          const hs = allHolds(scene, until).filter(h => badFrames.some(f => f >= h.start && f < h.end));
          for (const h of hs) {
            const pose0 = I.poseAt(scene.cams, h.start);
            const rLo = Math.max(0, (h.k >= 0 ? scene.cams[h.k].f0 : 0) - 2);
            const rHi = Math.min(until, (h.n >= 0 ? scene.cams[h.n].f1 : until) + 2);
            const locWords = localSceneForRange(rLo, rHi).words;
            const baseCamPart = partialCountFor(locWords);
            const baseCamRaw = propFramesInRange(rLo, rHi, false);
            const baseCamTarget = propFramesInRange(rLo, rHi, phaseMargin);
            const baseCamOv = ovCount(rLo, rHi);
            const baseCamStat = statCount(rLo, rHi);

            const group = allSung.filter(s => {
              if (s.w.dropped) return false;
              const sf = focusOf(s.w, s.onsetF, until);
              if (!(sf.fa < h.end && sf.fb > h.start)) return false;
              if (s.w === w) return true;
              const belongs = (sf.A >= h.start && sf.A < h.end) || (s.onsetF >= h.start && s.onsetF < h.end);
              if (belongs) return true;
              for (let f = Math.max(h.start, sf.fa); f < Math.min(h.end, sf.fb); f++) {
                if (wordScreenPoly(s.w, f, pose0, { vfov, fps, W, H, byId })) return true;
              }
              return false;
            }).map(s => ({ ...s, ...focusOf(s.w, s.onsetF, until) }));

            const marginModes = phaseMargin ? [true] : [true, false];
            for (const useMargin of marginModes) {
              const obs = I.keepClearObstaclesInRange(scene, h.start, h.end, W, H, { useMargin });
              const rects = I.clearRectsFromObstacles(obs, { W, H, mx: 0.94, my: 0.90, minW: 48, minH: 48 });
              const pts = [];
              for (const s of group) {
                const f = Math.min(h.end - 1, Math.max(s.A, h.start));
                pts.push(...wordPtsInHold(s.w, f, Math.max(h.start, s.fa), Math.min(h.end, s.fb), fps));
              }
              if (!pts.length) continue;
              const cands = rects.map(r => ({ r, pose: fitPoseInBox(pose0, pts, vfov, r.ndc) }))
                .filter(c => c.pose && c.pose.dist > 0)
                .sort((a, b) => a.pose.dist - b.pose.dist);
              for (const c of cands) {
                if (h.k < 0) scene.cams[0].from = c.pose;
                else {
                  const old = scene.cams[h.k].to;
                  scene.cams[h.k].to = c.pose;
                  if (h.n >= 0 && samePose(scene.cams[h.n].from, old)) scene.cams[h.n].from = c.pose;
                }
                const okRaw = !phaseMargin || propFramesInRange(rLo, rHi, false) <= baseCamRaw;
                if (okRaw && ownHits(phaseMargin).length < curOwn && propFramesInRange(rLo, rHi, phaseMargin) < baseCamTarget &&
                    partialCountFor(locWords) <= baseCamPart && ovCount(rLo, rHi) <= baseCamOv && statCount(rLo, rHi) <= baseCamStat &&
                    (!baseEnd || endingOk())) {
                  log.push(`${w.id} ${w.text}: reframed hold ${h.start}-${h.end} into clear band [${Math.round(c.r.x0)}..${Math.round(c.r.x1)}, ${Math.round(c.r.y0)}..${Math.round(c.r.y1)}]${useMargin ? '' : ' (tight to hitBox)'}`);
                  const refF = Math.min(h.end - 1, Math.max(A, h.start));
                  const afterH = !w.wordmark ? letterHeight(w, refF, I.poseAt(scene.cams, refF), vfov) : null;
                  if (afterH != null && afterH < S.minH - 1e-4) {
                    belowMin.push(`${w.id} ${w.text} at ${(onsetF / fps).toFixed(2)} s: reframed into clear band [${Math.round(c.r.x0)}..${Math.round(c.r.x1)}, ${Math.round(c.r.y0)}..${Math.round(c.r.y1)}] (letters ${(100 * afterH).toFixed(1)}%, under ${(100 * S.minH).toFixed(1)}% min) to clear prop ${v.propId}`);
                  }
                  fixed = true; roundChanged = true;
                  break;
                }
                scene.cams = JSON.parse(camSnap);
              }
              if (fixed) break;
            }
            if (fixed) break;
          }
        }
        if (fixed && ownHits(phaseMargin).length === 0) continue;

        // Step D: entrance cleanup (pop / start at onset) and plaque-plane slide into the clear zone (100% size kept!).
        {
          const ws = snapWord(w);
          const curOwn = ownHits(phaseMargin).length;
          if ((w.motion?.length || w.on < onsetF) && badFrames.every(f => f < A || f < onsetF)) {
            if (w.motion?.length) { w.motion = []; w.clip = []; w.joint = { prim: 'pop', f0: w.on, f1: w.on }; }
            if (ownHits(phaseMargin).length < curOwn && validWord()) {
              log.push(`${w.id} ${w.text}: entrance changed to pop to clear prop ${v.propId}${phaseMargin ? ' margin' : ''}`);
              fixed = true; roundChanged = true;
            } else {
              restoreWord(w, ws);
              if (!w.motion?.length && onsetF > w.on) {
                w.on = onsetF;
                if (w.joint) { w.joint.f0 = onsetF; w.joint.f1 = onsetF; }
                if (ownHits(phaseMargin).length < curOwn && validWord()) {
                  log.push(`${w.id} ${w.text}: switched on at onset ${onsetF} to clear prop ${v.propId}${phaseMargin ? ' margin' : ''}`);
                  fixed = true; roundChanged = true;
                } else restoreWord(w, ws);
              }
            }
          }
          if (!fixed || ownHits(phaseMargin).length > 0) {
            const ws2 = snapWord(w);
            const nowHits = ownHits(phaseMargin);
            if (nowHits.length) {
              const refF = nowHits[0].frame;
              const pose = I.poseAt(scene.cams, refF);
              const poly = nowHits[0].screenPoly;
              const wx0 = Math.min(...poly.map(p => p[0])), wx1 = Math.max(...poly.map(p => p[0]));
              const wy0 = Math.min(...poly.map(p => p[1])), wy1 = Math.max(...poly.map(p => p[1]));
              const obs = I.keepClearObstaclesInRange(scene, fa, fb, W, H, { useMargin: true });
              const rawObs = phaseMargin ? [] : I.keepClearObstaclesInRange(scene, fa, fb, W, H, { useMargin: false });
              const deltas = [];
              for (const oList of [obs, rawObs]) {
                for (const o of oList) {
                  const pad = 4;
                  deltas.push([o.x0 - pad - wx1, 0]);
                  deltas.push([0, o.y0 - pad - wy1]);
                  deltas.push([o.x1 + pad - wx0, 0]);
                  deltas.push([0, o.y1 + pad - wy0]);
                  deltas.push([o.x0 - pad - wx1, o.y0 - pad - wy1]);
                }
              }
              deltas.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
              for (const dropMotion of [false, true]) {
                for (const [dxPx, dyPx] of deltas) {
                  if (Math.hypot(dxPx, dyPx) < 1 || Math.hypot(dxPx, dyPx) > W) continue;
                  const dC = screenDeltaToWorld(w, refF, pose, dxPx, dyPx, { vfov, W, H });
                  if (!dC) continue;
                  if (dropMotion && (w.motion?.length || w.clip?.length)) {
                    w.motion = []; w.clip = []; w.joint = { prim: 'pop', f0: w.on, f1: w.on };
                  }
                  translateWord(w, dC);
                  if (ownHits(phaseMargin).length === 0 && validWord()) {
                    log.push(`${w.id} ${w.text}: slid (${Math.round(dxPx)}, ${Math.round(dyPx)}) px on plaque${dropMotion ? ' (entrance -> pop)' : ''} to clear prop ${v.propId}${phaseMargin ? ' margin' : ''}`);
                    fixed = true; roundChanged = true;
                    break;
                  }
                  restoreWord(w, ws2);
                }
                if (fixed && ownHits(phaseMargin).length === 0) break;
              }
            }
          }
        }
        if (fixed && ownHits(phaseMargin).length === 0) continue;

        // Step E: scale word down (down to legibility minimum S.minH first; past that, only in Phase 1 to prevent raw
        // hitBox overlap, reported in provenance — brief 18 item 3).
        {
          const ws = snapWord(w);
          const nowHits = ownHits(phaseMargin);
          if (nowHits.length) {
            const refF = nowHits[0].frame;
            const pose = I.poseAt(scene.cams, refF);
            const curH = letterHeight(w, refF, pose, vfov) ?? S.minH;
            const scales = [0.92, 0.85, 0.78, 0.70, 0.62, 0.55, 0.48, 0.40, 0.32, 0.25];
            const obsM = I.keepClearObstaclesInRange(scene, fa, fb, W, H, { useMargin: true });
            const obsR = phaseMargin ? [] : I.keepClearObstaclesInRange(scene, fa, fb, W, H, { useMargin: false });
            const clearRects = [
              ...I.clearRectsFromObstacles(obsM, { W, H, mx: 0.94, my: 0.90, minW: 48, minH: 48 }),
              ...I.clearRectsFromObstacles(obsR, { W, H, mx: 0.96, my: 0.94, minW: 36, minH: 36 }),
            ];
            const pivots = [[-1, 0], [0, 1], [1, 0], [0, -1], [0, 0]];
            let scaledOk = null;
            const belowModes = phaseMargin ? [false] : [false, true];
            for (const allowBelowMin of belowModes) {
              for (const k of scales) {
                const newH = curH * k;
                if (!allowBelowMin && !w.wordmark && newH < S.minH - 1e-4) continue;
                if (allowBelowMin && !w.wordmark && newH >= S.minH - 1e-4) continue;
                for (const pv of pivots) {
                  scaleWordAbout(w, k, pv);
                  if (ownHits(phaseMargin).length === 0 && validWord()) {
                    scaledOk = { k, newH, below: !w.wordmark && newH < S.minH - 1e-4, moved: false };
                    break;
                  }
                  restoreWord(w, ws);
                }
                if (scaledOk) break;
                for (const r of clearRects) {
                  if (w.motion?.length || w.clip?.length) { w.motion = []; w.clip = []; w.joint = { prim: 'pop', f0: w.on, f1: w.on }; }
                  scaleWordAbout(w, k, [0, 0]);
                  const poly = wordScreenPoly(w, refF, pose, { vfov, fps, W, H, byId, useDrawnScale: false });
                  if (poly) {
                    const cx = (Math.min(...poly.map(p => p[0])) + Math.max(...poly.map(p => p[0]))) / 2;
                    const cy = (Math.min(...poly.map(p => p[1])) + Math.max(...poly.map(p => p[1]))) / 2;
                    const tx = (r.x0 + r.x1) / 2, ty = (r.y0 + r.y1) / 2;
                    const dC = screenDeltaToWorld(w, refF, pose, tx - cx, ty - cy, { vfov, W, H });
                    if (dC) translateWord(w, dC);
                  }
                  if (ownHits(phaseMargin).length === 0 && validWord()) {
                    scaledOk = { k, newH, below: !w.wordmark && newH < S.minH - 1e-4, moved: true };
                    break;
                  }
                  restoreWord(w, ws);
                }
                if (scaledOk) break;
              }
              if (scaledOk) break;
            }
            if (scaledOk) {
              const msg = `${w.id} ${w.text} at ${(onsetF / fps).toFixed(2)} s: scaled x${scaledOk.k.toFixed(2)}${scaledOk.moved ? ' and centred in clear band' : ''} (letters ${(100 * curH).toFixed(1)}% -> ${(100 * scaledOk.newH).toFixed(1)}%, min ${(100 * S.minH).toFixed(1)}%) to clear prop ${v.propId}${phaseMargin ? ' margin' : ''}`;
              log.push(msg);
              if (scaledOk.below) belowMin.push(msg);
              fixed = true; roundChanged = true;
            }
          }
        }
        if (fixed && ownHits(phaseMargin).length === 0) continue;

        // Step F: post-onset tail hide (Phase 1 only, ONLY after w already satisfied A..max(A+SHOWN_FRAMES-1, onsetF)).
        if (!phaseMargin) {
          const nowHits = ownHits(false);
          const mustEnd = Math.max(A + SHOWN_FRAMES - 1, onsetF);
          if (nowHits.length && nowHits[0].frame > mustEnd) {
            const ws = snapWord(w);
            const cutFrom = nowHits[0].frame;
            hideSpan(w, cutFrom, fb);
            if (ownHits(false).length === 0 && validWord()) {
              log.push(`${w.id} ${w.text}: hidden on post-onset focus tail ${cutFrom}-${fb - 1} (already shown whole through frame ${mustEnd}) to clear prop ${v.propId}`);
              fixed = true; roundChanged = true;
            } else restoreWord(w, ws);
          }
        }

        if (!phaseMargin && !fixed && ownHits(false).length > 0) {
          unresolved.push(`${w.id} ${w.text} at ${(onsetF / fps).toFixed(2)} s: could not clear prop ${v.propId} without breaking another gate (${ownHits(false).length} frames)`);
        }
      }
      if (!roundChanged) break;
    }
  }

  return { log, belowMin, unresolved };
}
