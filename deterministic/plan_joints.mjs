// Joint planner (Fable spec, attached word transitions, items 8 to 15, 27, 28 to 35, 42).
// One greedy pass in song order after planTrail. Every choice is made by rule and seeded stream; no model, no clock.
import './interp.js';
import { stream, cooldownFactor } from './rng.mjs';
import { computeShotLandings, localPoseToWorld, readingDistance, MIN_HOLD_FRAMES } from './camera.mjs';
import { slabBounds, pointInBox, rayIntersectsBox } from './plan_trail.mjs';
import { letterExtents } from './compose_plaques.mjs';
import {
  CATALOGUE, PIVOT_PRIMS, SHARP_EASE, nominalDuration,
  buildSlideOut, buildUncover, buildShove, buildRail, buildFoldDown, buildSwingIn, buildExtrude, buildSprout, buildZoom,
} from './primitives.mjs';

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normText = s => String(s).toUpperCase().replace(/[^A-Z0-9']/g, '');

// 35.1 and 35.2 base weights. Deviation (his decision, 22 November 2026): shove and uncover weigh the same as
// slide-out, because the pushed word now carries a single pre_offset instead of staging the whole plaque.
export const ANCHOR_WEIGHTS = Object.freeze({ pop: 20, 'slide-out': 18, 'fold-down': 16, shove: 18, uncover: 18, 'swing-in': 9, rail: 7, dock: 7, sprout: 6, extrude: 5, zoom: 10 });
export const RIDER_WEIGHTS = Object.freeze({ pop: 50, tick: 50, sprout: 20, extrude: 20, 'slide-out': 15, dock: 12, rail: 12, zoom: 15 });
// Jefferson, 22 November 2026: plain pops had become a crutch (51% of entrances). Animated entrances are the default; a
// pop is drawn only as an accent (at most one per line, while the running pop share is under POP_ACCENT_SHARE) or when
// no animated entrance fits. Riders (short words) may now use the quick, host-still primitives as well as tick.
export const POP_ACCENT_SHARE = 0.12;
export const POP_ACCENT_WEIGHT = 4;
const RIDER_PRIMS = new Set(['tick', 'sprout', 'extrude', 'slide-out', 'dock', 'rail', 'zoom']);
const MOVES_HOST = new Set(['shove', 'uncover']);
// rail needs no host (it enters along the plaque from off frame); a host only picks its direction.
const NEEDS_HOST = new Set(['slide-out', 'uncover', 'shove', 'fold-down', 'swing-in', 'dock', 'extrude', 'sprout']);
const HOST_OPTIONAL = new Set(['tick', 'rail']);

// Scene-space geometry of a plaque word (same maths as build_best's scene assembly).
export function sceneWordGeometry(p, w) {
  let R = p.R, U = p.U;
  if (w.turn === 90) { R = p.U; U = mul(p.R, -1); } else if (w.turn === -90) { R = mul(p.U, -1); U = p.R; }
  const C = add(p.C, add(mul(p.R, w.x), add(mul(p.U, w.y), mul(p.N, 0.5))));
  return { C, R, U, N: p.N, w: w.boxW, h: w.boxH };
}

// 32.1: repeat runs, as lists of consecutive word ids (song order, one shot, same normalised text, each within 2 beats).
export function findRepeatRuns(orderedWords, bpm) {
  const beat = 60 / bpm;
  const runs = [];
  let cur = [];
  for (const w of orderedWords) {
    const last = cur.at(-1);
    if (last && last.si === w.si && normText(last.text) === normText(w.text) && w.t - last.t <= 2 * beat + 1e-9) cur.push(w);
    else { if (cur.length >= 2) runs.push(cur.map(x => x.id)); cur = [w]; }
  }
  if (cur.length >= 2) runs.push(cur.map(x => x.id));
  return runs;
}

// Merge each repeat run into one landing group (32.3). Called after composePlaques so layouts are unchanged.
export function applyRepeatRunGroups(shots, bpm) {
  const ordered = shots.flatMap((s, si) => s.clusters.map(c => ({ id: c.anchor.id, text: c.anchor.text, t: c.anchor.t, si, c })));
  ordered.sort((a, b) => a.t - b.t);
  const runs = findRepeatRuns(ordered, bpm);
  for (const run of runs) {
    const si = ordered.find(o => o.id === run[0]).si;
    const shot = shots[si];
    const runClusters = shot.clusters.filter(c => run.includes(c.anchor.id));
    const rest = shot.groups.map(g => g.filter(c => !runClusters.includes(c))).filter(g => g.length);
    const grp = [...runClusters];
    grp.run = true;
    const firstIdx = shot.clusters.indexOf(runClusters[0]);
    const before = rest.filter(g => shot.clusters.indexOf(g[0]) < firstIdx);
    const after = rest.filter(g => shot.clusters.indexOf(g[0]) > firstIdx);
    shot.groups = [...before, grp, ...after];
    shot.runs = [...(shot.runs ?? []), run];
  }
  return runs;
}

// The four plaque-plane edges of a box, as 2D directions in the plaque's (R, U) frame.
const EDGES = [['right', [1, 0]], ['left', [-1, 0]], ['top', [0, 1]], ['bottom', [0, -1]]];

export function planJoints({
  shots, placedPlaques, boundaries, map, seed, metrics, vfov = 40, fps = 30,
  wordsMode = 'pop', pinnedShots = null, clipEnd = 21.971,
}) {
  const I = globalThis.KT_INTERP;
  const bpm = map.tempo_bpm;
  const tv = Math.tan((vfov * Math.PI) / 360), th = tv * 16 / 9;
  const log = { divergences: [], forced: [], rejected: [], notes: [], pops: [] };
  const popLines = new Set(); let popCount = 0, entranceCount = 0, accentPops = 0;
  // Amendment 5 (Fable 7, Neon): every animated primitive is capped at PRIM_SHARE of the section's entrances (at least
  // 2) and at most 2 in any 5 consecutive entrances. The mandatory first-word pop is outside POP_ACCENT_SHARE.
  const PRIM_SHARE = 0.25, primCount = new Map(), recent = [];

  // ---- landings and world poses (shared with camera.mjs) ----
  const shotLandings = shots.map((s, si) => {
    const { landings } = computeShotLandings(s, placedPlaques[si], vfov, fps, { wordsMode });
    for (const l of landings) l.world = localPoseToWorld(placedPlaques[si], l);
    return landings;
  });
  const allLandings = shotLandings.flatMap(ls => ls).sort((a, b) => a.landingFrame - b.landingFrame);
  const landingOfCluster = new Map(); // `${si}:${ci}` -> landing
  shotLandings.forEach((ls, si) => ls.forEach(l => l.clusterIndices.forEach(ci => landingOfCluster.set(`${si}:${ci}`, l))));
  const poseEstimate = f => {
    let p = allLandings[0].world;
    for (const l of allLandings) if (l.landingFrame <= f) p = l.world;
    return { ...p, position: add(p.target, mul(p.N, p.dist)) };
  };

  // ---- shot energy percentiles (as camera.mjs) ----
  const shotMeanEnergy = shots.map((s, si) => {
    const eArr = map.energy_10hz ?? [];
    const a = Math.max(0, Math.floor(s.words[0].t * 10));
    const b = Math.max(a + 1, Math.min(eArr.length, Math.ceil((shots[si + 1]?.words[0].t ?? clipEnd) * 10)));
    const slice = eArr.slice(a, b);
    return slice.length ? slice.reduce((x, y) => x + y, 0) / slice.length : 0;
  });
  const sortedE = [...shotMeanEnergy].sort((a, b) => a - b);
  const energyPct = shotMeanEnergy.map(v => (sortedE.length > 1 ? sortedE.filter(x => x < v).length / (sortedE.length - 1) : 0.5));

  // ---- words in song order with scene geometry ----
  const words = [];
  placedPlaques.forEach((p, si) => {
    for (const w of p.words) {
      const g = sceneWordGeometry(p, w);
      const onsetF = Math.round(w.t * fps);
      words.push({
        id: w.id, text: w.text, role: w.role, t: w.t, si, ci: w.cluster, cap: w.cap, font: w.font,
        lx: w.x, ly: w.y, ew: w.w, eh: w.h, ...g, onsetF, L: Math.max(0, onsetF - 1),
        motion: [], clip: [], on: null, joint: null,
      });
    }
  });
  words.sort((a, b) => a.t - b.t || a.si - b.si);
  const byId = new Map(words.map(w => [w.id, w]));
  const runs = findRepeatRuns(words, bpm);
  const runOf = new Map();
  runs.forEach((r, ri) => r.forEach((id, k) => runOf.set(id, { ri, k, run: r })));

  // Box of word X in the 2D frame of plaque P (null when not coplanar with P, spec 11 "both lie in one plane").
  const boxIn = (X, P, f = null) => {
    if (Math.abs(dot(X.N, P.N) - 1) > 1e-6) return null;
    const off = f == null ? [0, 0, 0] : I.wordShift(X, f);
    const C = add(X.C, off);
    if (Math.abs(dot(sub(C, P.C), P.N) - 0.5) > 1) return null;
    const horiz = Math.abs(dot(X.R, P.R)) > 0.5;
    return { x: dot(sub(C, P.C), P.R), y: dot(sub(C, P.C), P.U), w: horiz ? X.w : X.h, h: horiz ? X.h : X.w, cap: X.cap };
  };
  // Item 11 between guest box G and host box H for edge direction e2 (2D unit vector of the host edge normal).
  const edgeRel = (G, H, e2) => {
    const horiz = e2[0] !== 0;
    const extD = b => (horiz ? b.w : b.h), extT = b => (horiz ? b.h : b.w);
    const posD = b => (horiz ? b.x : b.y) * (horiz ? e2[0] : e2[1]);
    const posT = b => (horiz ? b.y : b.x);
    const g = (posD(G) - extD(G) / 2) - (posD(H) + extD(H) / 2);
    const lo = Math.max(posT(G) - extT(G) / 2, posT(H) - extT(H) / 2), hi = Math.min(posT(G) + extT(G) / 2, posT(H) + extT(H) / 2);
    return { g, share: Math.max(0, hi - lo) / extT(G), tLo: posT(H) - extT(H) / 2, tHi: posT(H) + extT(H) / 2, far: posD(H) + extD(H) / 2 };
  };

  // ---- state ----
  const joints = [];
  const settle = new Map();      // word id -> settle frame (15.2)
  const entered = [];            // words entered so far, in order
  let lastFull = null, lastAnchor = null, prevAnchorWord = null;
  const lastUse = new Map();     // prim -> joint index (cooldown tau 3)
  let forcedCount = 0;
  let prevEnd = -Infinity;
  const runPrim = new Map();     // run index -> { prim, D, mode, segmentStart }
  const shotJointPrims = shots.map(() => []); // for parallel shots (32.7)
  const P = si => placedPlaques[si];

  const visibleAt = (si, excludeId) => entered.filter(x => x.id !== excludeId && x.si >= si - 1 && x.si <= si);

  // Host candidates (item 12) for guest G given an adjacency share threshold.
  function findHost(G, thr, prevSung) {
    const plq = P(G.si);
    const gb = boxIn(G, plq);
    const cands = visibleAt(G.si, G.id);
    const tests = [];
    for (const H of cands) {
      const hb = boxIn(H, plq, null);
      if (!hb) continue;
      for (const [edge, e2] of EDGES) {
        const r = edgeRel(gb, hb, e2);
        const minCap = Math.min(H.cap, G.cap);
        const ok = r.g >= -1e-6 && r.g <= 0.6 * minCap && (thr === 0 ? r.share > 0 : r.share >= thr - 1e-9);
        if (ok) tests.push({ H, edge, e2, g: Math.max(0, r.g), share: r.share });
      }
    }
    const pick = list => list.sort((a, b) => b.H.t - a.H.t || b.share - a.share)[0];
    const prev = tests.filter(x => x.H.id === prevSung?.id);
    if (prev.length) return { ...pick(prev), compound: null };
    if (tests.length) return { ...pick(tests), compound: null };
    if (thr === 0) return null;
    // Compound host: a run of visible words along one edge whose facing edges together meet the threshold.
    for (const [edge, e2] of EDGES) {
      const parts = [];
      for (const H of cands) {
        const hb = boxIn(H, plq, null);
        if (!hb) continue;
        const r = edgeRel(gb, hb, e2);
        if (r.g >= -1e-6 && r.g <= 0.6 * Math.min(H.cap, G.cap) && r.share > 0) parts.push({ H, r });
      }
      if (parts.length < 2) continue;
      const fars = parts.map(p => p.r.far);
      if (Math.max(...fars) - Math.min(...fars) > 0.6 * Math.min(...parts.map(p => p.H.cap))) continue;
      const horiz = e2[0] !== 0;
      const gT = horiz ? [gb.y - gb.h / 2, gb.y + gb.h / 2] : [gb.x - gb.w / 2, gb.x + gb.w / 2];
      const iv = parts.map(p => [Math.max(gT[0], p.r.tLo), Math.min(gT[1], p.r.tHi)]).filter(v => v[1] > v[0]).sort((a, b) => a[0] - b[0]);
      let covered = 0, cur = null;
      for (const v of iv) {
        if (!cur || v[0] > cur[1]) { if (cur) covered += cur[1] - cur[0]; cur = [...v]; } else cur[1] = Math.max(cur[1], v[1]);
      }
      if (cur) covered += cur[1] - cur[0];
      if (covered / (gT[1] - gT[0]) >= thr - 1e-9) {
        const lead = parts.sort((a, b) => b.H.t - a.H.t)[0];
        return { H: lead.H, edge, e2, g: Math.max(0, Math.min(...parts.map(p => p.r.g))), share: covered / (gT[1] - gT[0]), compound: parts.map(p => p.H.id) };
      }
    }
    return null;
  }

  // Share of a word's posed quad inside the frame at pose (5 x 5 samples).
  function inFrameShare(X, f, pose) {
    const Xf = (X.motion.length ? I.wordXform(X, f) : (p => p));
    let n = 0, inside = 0;
    for (const a of [-0.4, -0.2, 0, 0.2, 0.4]) for (const b of [-0.4, -0.2, 0, 0.2, 0.4]) {
      n++;
      const q = I.project(Xf(add(X.C, add(mul(X.R, a * X.w), mul(X.U, b * X.h)))), pose, vfov);
      if (q && Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1) inside++;
    }
    return inside / n;
  }
  // 2D overlap (plaque plane) of box a and b with margin m.
  const overlap2 = (a, b, m = 0) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 + m && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + m;

  // Smallest offset along `dir` taking the guest wholly out of frame at every pose, plus 10% of the frame (24.1.1).
  function offFrameOffset(G, dir, poses) {
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => add(G.C, add(mul(G.R, a * G.w / 2), mul(G.U, b * G.h / 2))));
    const outside = m => poses.every(p => {
      const q = corners.map(c => I.project(add(c, mul(dir, m)), p, vfov));
      if (q.some(x => !x)) return true;
      return Math.min(...q.map(x => x.x)) > 1 || Math.max(...q.map(x => x.x)) < -1 || Math.min(...q.map(x => x.y)) > 1 || Math.max(...q.map(x => x.y)) < -1;
    });
    const step = 0.02 * Math.max(G.w, G.h);
    let m = 0, guard = 0;
    while (!outside(m) && guard++ < 2000) m += step;
    const p = poses.at(-1);
    return m + 0.1 * (Math.abs(dot(dir, p.R)) > 0.5 ? 2 * p.dist * th : 2 * p.dist * tv);
  }

  // Pre-offset (Jefferson's change of 22 November 2026, replacing plaque-wide staging of spec 27): only the pushed
  // or uncovering host moves. Its rest is where it lands; before the joint it is drawn displaced by s, sitting where
  // the guest will end up, and s eases to zero during the joint. Rest geometry, checks and the reveal are unchanged.
  function preOffsetAllowed(G, H, s, f0) {
    const plq = P(G.si);
    if (H.si !== G.si) return { ok: false, why: 'host on another plaque' };
    if (f0 - (settle.get(H.id) ?? 0) < 8) return { ok: false, why: `host ${H.text} has ${f0 - (settle.get(H.id) ?? 0)} still frames (< 8)` };
    const hb = boxIn(H, plq);
    const sb = { ...hb, x: hb.x + dot(s, plq.R), y: hb.y + dot(s, plq.U) };
    // The displaced host must not overlap any other word that is on screen while it is displaced.
    for (const o of entered) {
      if (o.id === H.id || o.si < G.si - 1) continue;
      const ob = boxIn(o, plq, f0);
      if (ob && overlap2(sb, ob)) return { ok: false, why: `displaced ${H.text} overlaps ${o.text}` };
    }
    return { ok: true, group: [H] };
  }
  const unitV = a => { const l = Math.hypot(...a); return l > 0 ? mul(a, 1 / l) : [0, 0, 0]; };

  // Apply the pre_offset s to the host retroactively (its earlier entrance ends at rest + s) and append s -> 0.
  function applyStaging(group, s, segment, guestId) {
    for (const x of group) {
      for (const m of x.motion) if (m.kind === 'shift') { m.from = add(m.from, s); m.to = add(m.to, s); }
      for (const c of x.clip) if (!c.ride) c.P = add(c.P, s);
      x.motion.push({ ...segment, from: [...s], to: [0, 0, 0] });
      (x.pre_offset ??= []).push({ v: [...s], f0: segment.f0, f1: segment.f1, by: guestId });
    }
  }

  // Build the geometry of a candidate primitive for guest G. Returns null with a reason when ineligible.
  function tryPrim(prim, G, ctx) {
    const cat = CATALOGUE[prim];
    const { prevSung, prevAnchor, cameraLeaves, landing, prevLanding, runCap } = ctx;
    if (prim === 'pop') return { prim, mode: 'land', f0: G.L, f1: G.L, D: 0, host: null };
    if (prim === 'tick' && G.role !== 'rider') return null;
    if (G.role === 'rider' && !RIDER_PRIMS.has(prim)) return null;
    // Host (item 12).
    let host = null;
    if (prim === 'tick') host = findHost(G, 0.4, prevSung);
    else if (prim === 'sprout') host = findHost(G, 0, prevSung);
    else if (NEEDS_HOST.has(prim) || prim === 'rail') host = findHost(G, 0.6, prevSung);
    if (NEEDS_HOST.has(prim) && !host) return { reject: 'no adjacent host' };
    if (MOVES_HOST.has(prim) && host.H.si !== G.si) return { reject: 'host on another plaque' };
    if (['fold-down', 'swing-in', 'extrude', 'sprout'].includes(prim) && host.g > 0.35 * Math.min(host.H.cap, G.cap) + 1e-6) {
      return { reject: `47.3 gap ${host.g.toFixed(1)} puts the hinge more than 0.35 cap from the host edge` };
    }
    if (ctx.butFirst && MOVES_HOST.has(prim)) return { reject: '35.3 first word after butt' };
    // Timing (14, 15).
    const moves = MOVES_HOST.has(prim);
    let earliest = Math.max(prevEnd, host ? (settle.get(host.H.id) ?? 0) : -Infinity);
    // Zoom grows in place from the word's own centre and has no host, so it skips the waits on the previous anchor's
    // settle (rough cut 2: most remaining pops were zooms refused only by those waits), and not on the
    // previous entrance's timing either: it may overlap it in time (13.1.16 exempts zoom from the entrance-overlap
    // rule; the in-frame ink-box overlap test still applies).
    // A landing zoom still starts no earlier than the previous word's onset, so nothing grows before its turn.
    // Amendment 5 (Fable 11): a zoom may overlap the previous entrance by at most 2 frames (the eye follows one).
    if (prim === 'zoom') earliest = Math.max(ctx.prevSung ? ctx.prevSung.L : -Infinity, prevEnd - 2);
    else if (G.role !== 'rider' && prevAnchor) {
      const sP = settle.get(prevAnchor.id) ?? 0;
      if (cameraLeaves) earliest = Math.max(earliest, sP + 15);
      else if (moves) earliest = Math.max(earliest, sP + 8);
      else earliest = Math.max(earliest, sP);
    }
    if (ctx.shortGap) {
      // 35.4: under 8 frames since the previous onset: pop, tick, or a 4 to 6 frame attack whose host does not move.
      if (moves) return { reject: '35.4 host moves' };
    }
    const nominal = prim === 'tick' ? 4 : nominalDuration(prim, bpm, fps);
    const pinned = ctx.pin && ctx.pin.prim === prim ? ctx.pin : null;
    const runFix = ctx.runFix && ctx.runFix.prim === prim ? ctx.runFix : null;
    let mode = null, D = 0, f0, f1;
    const fits = [];
    const wantModes = runFix ? [runFix.mode] : pinned?.mode ? [pinned.mode] : cat.modes;
    for (const m of wantModes) {
      // 35.4 short gaps allow attacks only; a zoom may also land there, since it starts after the previous onset and
      // touches no other word (rough cut 2: 49 of the remaining pops were zooms refused as attacks by item 15).
      if (ctx.shortGap && prim !== 'tick' && prim !== 'zoom' && m !== 'attack') continue;
      if (m === 'land') {
        const maxD = Math.min(runFix?.D ?? pinned?.D ?? nominal, G.L - earliest);
        const minD = runFix ? runFix.D : cat.min;
        if (maxD >= minD) { fits.push({ mode: m, D: Math.min(runFix?.D ?? pinned?.D ?? nominal, maxD) }); }
      } else if (m === 'attack') {
        if (G.L < earliest) continue;
        const cap = ctx.shortGap ? 6 : 6;
        const lo = ctx.shortGap && prim !== 'tick' ? Math.max(4, cat.min) : cat.min;
        const want = Math.min(runFix?.D ?? pinned?.D ?? nominal, cap, cat.max);
        if (want >= lo) fits.push({ mode: m, D: want });
      }
    }
    if (!fits.length) return { reject: `timing (earliest ${earliest}, L ${G.L})` };
    if (runCap != null) for (const ft of fits) ft.D = Math.min(ft.D, runCap);
    const fitsOk = fits.filter(ft => ft.D >= (prim === 'tick' ? 4 : cat.min));
    if (!fitsOk.length) return { reject: `32.2 run spacing ${runCap} frames below minimum` };
    // Amendment 4 (engine rule review, 22 November 2026): an animated entrance that leaves this word or the previous
    // anchor fewer than 15 readable frames, where a pop would keep 15, is rejected in both modes; land comes first. The
    // camera leaves for the next landing about 9 frames before its onset; it left the previous anchor at f0.
    const leaveF = G.role !== 'rider' && ctx.nextAnchor && ctx.nextLeaves ? ctx.nextAnchor.L - 9 : Infinity;
    const sPrev = ctx.cameraLeaves && prevAnchor ? (settle.get(prevAnchor.id) ?? 0) : -Infinity;
    const readFail = ft => {
      const a = ft.mode === 'land' ? G.L - ft.D : G.L, b = ft.mode === 'land' ? G.L : G.L + ft.D;
      // Only where the pop would keep the 15 frames: when nothing can, the entrance is not what costs the reading.
      if (leaveF - b < 15 && b > G.L && leaveF - G.L >= 15) return `reading: ${G.text} keeps ${leaveF - b} readable frames (under 15; a pop keeps ${leaveF - G.L})`;
      if (a - sPrev < 15 && a < G.L && G.L - sPrev >= 15) return `reading: ${prevAnchor.text} keeps ${a - sPrev} readable frames (under 15; a pop keeps ${G.L - sPrev})`;
      return null;
    };
    const ordered = [...fitsOk.filter(ft => ft.mode === 'land'), ...fitsOk.filter(ft => ft.mode !== 'land')];
    const readable = ordered.filter(ft => !readFail(ft));
    if (!readable.length) return { reject: readFail(ordered[0]) };
    ({ mode, D } = readable[0]);
    if (mode === 'land') { f0 = G.L - D; f1 = G.L; } else { f0 = G.L; f1 = G.L + D; }
    if (mode === 'attack' && G.role !== 'rider' && ctx.nextAnchor && ctx.nextLeaves && ctx.nextAnchor.L - 9 - f1 < 15) {
      return { reject: `item 15: attack settles at ${f1}, leaving under 15 readable frames before the camera leaves for ${ctx.nextAnchor.text}` };
    }
    // Host in frame at f0 (item 12), at the camera pose of that frame.
    const poseF0 = poseEstimate(f0 - 1 < G.L ? Math.min(f0, G.L - 1) : f0);
    if (host && inFrameShare(host.H, f0, poseF0) < 0.6) {
      if (HOST_OPTIONAL.has(prim)) host = null; // tick and rail fall back to entering from off frame
      else return { reject: 'host under 60% in frame at f0' };
    }
    // Geometry in world vectors.
    const plq = P(G.si);
    const d = host ? add(mul(plq.R, host.e2[0]), mul(plq.U, host.e2[1])) : plq.R;
    const t = host ? (host.e2[0] !== 0 ? plq.U : plq.R) : plq.U;
    const horiz = host ? host.e2[0] !== 0 : true;
    const gb = boxIn(G, plq);
    const extD = horiz ? gb.w : gb.h, extT = horiz ? gb.h : gb.w;
    const g = host ? host.g : 0;
    const Gw = { id: G.id, C: G.C, extD, extT };
    const hostEdgeP = add(G.C, mul(d, -(extD / 2 + g)));
    const toPose = landing?.world ? { ...landing.world, position: add(landing.world.target, mul(landing.world.N, landing.world.dist)) } : poseF0;
    // Item 12 / 47.3: the host stays at least 60% in frame from f0 to f1, so sample the follow move too.
    if (host && cameraLeaves && !HOST_OPTIONAL.has(prim)) {
      const key = { f0, f1, verb: 'follow', ease: SHARP_EASE, from: poseF0, to: toPose };
      for (const u of [0.25, 0.5, 0.75, 1]) {
        const ff = Math.round(f0 + u * (f1 - f0));
        if (inFrameShare(host.H, ff, I.movePose(key, ff)) < 0.6) return { reject: `host under 60% in frame during the follow at f=${ff}` };
      }
    }
    const others = visibleAt(G.si, G.id).filter(x => x.id !== host?.H.id && !(host?.compound ?? []).includes(x.id));
    let built, extra = {};
    switch (prim) {
      case 'slide-out': built = buildSlideOut({ G: Gw, d, g, hostEdgeP, hostId: host.H.id, f0, f1 }); break;
      case 'tick':
        if (host) built = buildSlideOut({ G: Gw, d, g, hostEdgeP, hostId: host.H.id, f0, f1 });
        else {
          // Amendment 6 (Neon): off-frame entry only by rail, never the 4-frame tick (too fast for the eye).
          return { reject: '6: tick without a host would enter from off frame' };
        }
        break;
      case 'uncover': case 'shove': {
        if (host.compound) return { reject: 'compound host cannot carry one pre_offset' };
        const s = mul(d, extD + g);
        const st = preOffsetAllowed(G, host.H, s, f0);
        if (!st.ok) return { reject: st.why };
        built = prim === 'shove' ? buildShove({ G: Gw, d, g, f0, f1 }) : buildUncover({ G: Gw, d, g, hostEdgeP, hostId: host.H.id, f0, f1 });
        extra.staged = st.group;
        break;
      }
      case 'fold-down': {
        if (extD > 0.5 * Math.min(poseF0.dist, toPose.dist)) return { reject: '19.3 too close to camera' };
        built = buildFoldDown({ G: Gw, d, N: plq.N, f0, f1 });
        break;
      }
      case 'swing-in': {
        const okSides = [];
        for (const side of [1, -1]) {
          const b = buildSwingIn({ G: Gw, d, t, N: plq.N, side, f0, f1 });
          // 20.2: swept quarter disc misses other visible words (sampled), start box at least half in frame.
          const probe = { ...G, motion: b.guest.motion, clip: [] };
          let clash = false;
          for (const u of [0, 0.25, 0.5, 0.75]) {
            const ff = f0 + u * (f1 - f0);
            const X = I.wordXform(probe, ff);
            const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]].map(([a, c]) => X(add(G.C, add(mul(G.R, a * G.w / 2), mul(G.U, c * G.h / 2)))));
            const xs = cs.map(c => dot(sub(c, plq.C), plq.R)), ys = cs.map(c => dot(sub(c, plq.C), plq.U));
            const bx = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2, w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
            for (const o of others) { const ob = boxIn(o, plq, ff); if (ob && overlap2(bx, ob, 0.05 * Math.min(o.cap, G.cap))) clash = true; }
          }
          if (!clash && inFrameShare(probe, f0, poseF0) >= 0.5) okSides.push({ side, b });
        }
        if (!okSides.length) return { reject: '20.2 swing sweep or start box' };
        const pickSide = okSides.length === 2 ? (stream(seed, 'swing', G.id, 0)() < 0.5 ? 0 : 1) : 0;
        built = okSides[pickSide].b;
        break;
      }
      case 'rail': case 'dock': {
        if (D < 6) return { reject: `6: ${prim} of ${D} frames (off-frame entries take at least 6)` };
        const dirs = prim === 'rail' ? [t, mul(t, -1)] : [d];
        const ok = [];
        for (const dir of dirs) {
          const off = offFrameOffset(G, dir, [poseF0, toPose]);
          let clash = false;
          for (const u of [0.25, 0.5, 0.75, 0.9]) {
            const sb = { ...gb, x: gb.x + dot(mul(dir, off * (1 - u)), plq.R), y: gb.y + dot(mul(dir, off * (1 - u)), plq.U) };
            for (const o of others) { const ob = boxIn(o, plq, f0); if (ob && overlap2(sb, ob)) clash = true; }
          }
          // Amendment 6: speed cap, at most one eighth of the frame width per frame.
          const frameW = 2 * Math.min(poseF0.dist, toPose.dist) * th;
          if (off / D > frameW / 8) clash = true;
          if (!clash) ok.push({ dir, off });
        }
        if (!ok.length) return { reject: '24.1 swept box hits a visible word' };
        const pick = ok.length > 1 ? (stream(seed, 'raildir', G.id, 0)() < 0.5 ? 0 : 1) : 0;
        built = buildRail({ dir: ok[pick].dir, offset: ok[pick].off, f0, f1 });
        break;
      }
      case 'extrude': built = buildExtrude({ G: Gw, d, f0, f1 }); break;
      case 'zoom': built = buildZoom({ G: Gw, f0, f1 }); break;
      case 'sprout': {
        const H = host.H;
        const lets = metrics ? letterExtents(H.text, H.font ?? 'anton', H.cap, metrics) : null;
        const tG = dot(G.C, t);
        let qT = dot(H.C, t);
        if (lets && Math.abs(Math.abs(dot(H.R, t)) - 1) < 1e-6) {
          const sgn = dot(H.R, t);
          const near = lets.reduce((b, l) => (Math.abs(dot(H.C, t) + sgn * l.cx - tG) < Math.abs(dot(H.C, t) + sgn * b.cx - tG) ? l : b));
          qT = dot(H.C, t) + sgn * near.cx;
          extra.letter = near.ch;
        }
        const Q = add(add(G.C, mul(d, -extD / 2)), mul(t, qT - tG));
        built = buildSprout({ Q, f0, f1 });
        break;
      }
      default: return null;
    }
    return { prim, mode, D, f0, f1, host, built, edge: host?.edge ?? null, d, ...extra };
  }

  // ---- pivot joints for boundaries done by the camera (16 to 22) ----
  const carried = new Map(); // word id -> pivot joint
  const pivotFor = new Map(); // si -> pivot record
  function planPivot(si, prevAnchorSettle) {
    const bnd = boundaries[si];
    if (!bnd || !PIVOT_PRIMS.includes(bnd.kind)) return null;
    const first = shotLandings[si][0];
    // Rough cut 2 (HE'LL at 97.6 s, WATCH at 106.2 s, frames 2927 and 3185): the pivot used to end on the landing
    // group's anchor onset, so a carried word sung before the anchor stayed on the far side of the turn until after it
    // was sung. The pivot now lands by the earliest onset of the words it carries, and the landing moves with it.
    const groupL = Math.min(...first.groupWords.map(w => byId.get(w.id)?.L ?? Infinity));
    // Amendment 8 (Fable 16): a carried pickup word may pull the landing by at most PICKUP_PULL frames (0.5 s); past
    // that the boundary is not a pivot (it falls back to a cut and the words enter on their own).
    const PICKUP_PULL = 15;
    if (first.landingFrame - groupL > PICKUP_PULL) return { reject: `pivot ${bnd.kind}: a carried word sung ${first.landingFrame - groupL} frames before the landing (over ${PICKUP_PULL})` };
    const f1 = Math.min(first.landingFrame, groupL);
    if (f1 < first.landingFrame) first.landingFrame = f1;
    const cat = CATALOGUE[bnd.kind];
    const nominal = nominalDuration(bnd.kind, bpm, fps);
    const earliest = Math.max(prevEnd, prevAnchorSettle + 12);
    const D = Math.min(nominal, f1 - earliest);
    if (D < cat.floor) return { reject: `pivot ${bnd.kind} fits only ${D}f (< floor ${cat.floor})` };
    const f0 = f1 - D;
    const ids = first.groupWords.map(w => w.id).filter(id => byId.get(id).onsetF <= f1 + 3 + 1);
    // Amendment 8 (Neon 3.3.1): when the anchor is not in the carried group, the pivot is recorded on a carried word.
    if (!ids.length) return { reject: `pivot ${bnd.kind}: no word of the landing group is sung by its end` };
    const guest = ids.includes(first.anchorWordId) ? first.anchorWordId : ids[0];
    return { prim: bnd.kind, family: cat.family, mode: 'carried', f0, f1, D, fold: bnd.fold, edge: bnd.edge, flipAxis: bnd.flipAxis, sign: bnd.sign, ids, guest };
  }

  const recordJoint = (G, rec, extra = {}) => {
    const cat = CATALOGUE[rec.prim];
    const j = {
      index: joints.length, word: G.id, text: G.text, role: G.role, shot: G.si + 1,
      prim: rec.prim, family: cat.family, host: rec.host?.H?.id ?? rec.hostId ?? null,
      compoundHost: rec.host?.compound ?? null, edge: rec.edge ?? null, mode: rec.mode,
      f0: rec.f0, f1: rec.f1, D: rec.D, run: extra.run ?? null, forced_repeat: !!extra.forced,
      track: G.role === 'rider' ? 'rider' : 'anchor', rejected: extra.rejected ?? [], carriedIds: extra.carriedIds ?? null,
      letter: rec.letter ?? null, tickRail: !!rec.tickRail, pinned: !!extra.pinned,
      pivot: extra.pivot ?? null,
    };
    joints.push(j);
    lastUse.set(rec.prim, j.index);
    lastFull = j;
    if (j.track === 'anchor') lastAnchor = j;
    shotJointPrims[G.si].push(rec.prim);
    return j;
  };

  // ---- the greedy pass (42.2) ----
  let prevSung = null;
  for (let wi = 0; wi < words.length; wi++) {
    const G = words[wi];
    const isAnchor = G.role !== 'rider';
    const landing = landingOfCluster.get(`${G.si}:${G.ci}`);
    const prevLanding = prevAnchorWord ? landingOfCluster.get(`${prevAnchorWord.si}:${prevAnchorWord.ci}`) : null;
    // Pivot boundary: the first landing group of a shot entered by a camera kind is carried.
    if (carried.has(G.id)) {
      const pj = carried.get(G.id);
      G.on = G.L >= pj.f0 ? pj.f0 : G.L;
      settle.set(G.id, pj.f1);
      G.joint = { ...pj.jointRef, word: G.id, carried: true, sameJointAs: pj.jointRef.index };
      entered.push(G); prevSung = G;
      if (isAnchor) prevAnchorWord = G;
      continue;
    }
    const isShotFirst = wi === 0 || words[wi - 1].si !== G.si;
    if (isShotFirst && G.si > 0) {
      const pv = planPivot(G.si, prevAnchorWord ? (settle.get(prevAnchorWord.id) ?? 0) : 0);
      if (pv && !pv.reject) {
        const guest = byId.get(pv.guest);
        const j = recordJoint(guest, { ...pv, hostId: prevAnchorWord?.id ?? null }, { carriedIds: pv.ids, pivot: { fold: pv.fold, edge: pv.edge, flipAxis: pv.flipAxis, sign: pv.sign } });
        pivotFor.set(G.si, j);
        for (const id of pv.ids) carried.set(id, { f0: pv.f0, f1: pv.f1, jointRef: j });
        prevEnd = pv.f1;
        if (carried.has(G.id)) { wi--; continue; } // reprocess this word as carried
      } else if (pv?.reject) {
        log.notes.push(`shot ${G.si + 1}: ${pv.reject}; the boundary's camera move falls back to a verb move and the words pop`);
        boundaries[G.si].pivotFallback = pv.reject;
      }
    }
    const bnd = G.si > 0 ? boundaries[G.si] : null;
    const isTravelFirst = isShotFirst && G.si > 0 && (bnd.kind === 'travel' || bnd.pivotFallback);
    const butFirst = isShotFirst && G.si > 0 && bnd.kind === 'butt';
    const shortGap = prevSung ? G.onsetF - prevSung.onsetF < 8 : false;
    const cameraLeaves = isAnchor && prevLanding && landing !== prevLanding;
    const nextAnchor = words.slice(wi + 1).find(w => w.role !== 'rider') ?? null;
    const nextLeaves = !!nextAnchor && landingOfCluster.get(`${nextAnchor.si}:${nextAnchor.ci}`) !== landing;
    const ctx = { prevSung, prevAnchor: prevAnchorWord, cameraLeaves, landing, prevLanding, shortGap, butFirst, nextAnchor, nextLeaves };

    // Candidates.
    let cands;
    if (wi === 0 || isTravelFirst) cands = [wi === 0 ? 'pop' : 'travel'];
    else if (!isAnchor) cands = Object.keys(RIDER_WEIGHTS);
    else cands = Object.keys(ANCHOR_WEIGHTS);
    const pinList = pinnedShots?.[G.si]?.joints ?? [];
    const pin = pinList.find(p => p.word === G.id);
    const run = runOf.get(G.id);
    let runFix = null, runExclude = null;
    if (run && run.k >= 1) {
      const seg = Math.floor(run.k / 4); // tokens 1-4, 5-8, ... share one treatment (32.2, 32.4)
      const rp = runPrim.get(run.ri);
      if (rp && rp.segment === seg) runFix = rp;
      else if (rp && rp.segment !== seg) runExclude = rp.prim;
    }

    // 32.2/32.3: the run primitive must fit every joint of its segment, so D is capped by the run's onset spacing.
    let runCap = null;
    if (run && run.k >= 1 && !runFix) {
      const seg = Math.floor(run.k / 4);
      const segIds = run.run.filter((id, k) => k >= 1 && Math.floor(k / 4) === seg);
      const allIds = run.run;
      const gaps = [];
      for (const id of segIds) { const k = allIds.indexOf(id); if (k >= 1 && k + 1 < allIds.length) gaps.push(byId.get(allIds[k + 1]).onsetF - byId.get(id).onsetF); }
      if (gaps.length) runCap = Math.min(...gaps);
    }
    const evals = new Map();
    const evalPrim = prim => {
      if (!evals.has(prim)) {
        let r;
        if (prim === 'travel') r = { prim, mode: 'land', f0: G.L, f1: G.L, D: 0, host: null };
        else r = tryPrim(prim, G, { ...ctx, pin, runFix, runCap });
        evals.set(prim, r);
      }
      return evals.get(prim);
    };
    const rejected = [];
    let chosen = null, pinnedUsed = false, forced = false;

    if (pin) {
      const r = evalPrim(pin.prim);
      if (r && !r.reject) {
        chosen = r; pinnedUsed = true;
        // A pin that repeats the previous primitive outside a run is logged as a forced repeat (34), like the draw would.
        const runMate = run && lastFull?.run === run.ri && r.prim !== 'pop';
        if (!runMate && ((lastFull && lastFull.prim === r.prim) || (isAnchor && lastAnchor && lastAnchor.prim === r.prim))) {
          forced = true; forcedCount++; log.forced.push({ word: G.id, text: G.text, prim: r.prim, pinned: true });
        }
      }
      else {
        log.divergences.push({ word: G.id, text: G.text, pinned: pin.prim, why: r?.reject ?? 'not available for this role' });
      }
    }
    if (!chosen && runFix) {
      const r = evalPrim(runFix.prim);
      if (r && !r.reject) chosen = r;
      else log.notes.push(`run ${run.ri + 1} token ${run.k + 1} (${G.text}): run primitive ${runFix.prim} ineligible (${r?.reject}); drawn afresh`);
    }
    if (!chosen) {
      const eligible = cands.filter(p => { const r = evalPrim(p); if (!r || r.reject) { rejected.push({ prim: p, why: r?.reject ?? 'role' }); return false; } return true; });
      // Variety (29, 30, 32.5, 32.7).
      const afterRun = lastFull?.run != null && !run;
      const prevRunPrim = afterRun ? lastFull.prim : null;
      const okV = p => {
        if (lastFull && p === lastFull.prim) return false;                         // V1 full track
        if (isAnchor && lastAnchor && p === lastAnchor.prim) return false;          // V1 anchor track
        const r = evals.get(p);
        if (isAnchor && lastAnchor && CATALOGUE[p].family === lastAnchor.family && (r.edge ?? null) === (lastAnchor.edge ?? null) && p !== 'pop' && lastAnchor.prim !== 'pop') return false; // V2
        if (prevRunPrim && (p === prevRunPrim || CATALOGUE[p].family === CATALOGUE[prevRunPrim].family)) return false; // 32.5
        if (runExclude && p === runExclude) return false;                          // 32.4
        return true;
      };
      const line = shots[G.si].line ?? G.si;
      const accentOk = !popLines.has(line) && accentPops < POP_ACCENT_SHARE * (entranceCount + 1);
      const capN = Math.max(2, Math.floor(PRIM_SHARE * words.length));
      const okCap = p => p === 'pop' || p === 'travel' || ((primCount.get(p) ?? 0) < capN && recent.slice(-4).filter(x => x === p).length < 2);
      let pool = eligible.filter(okV).filter(okCap);
      // A pop stays in the pool only as an accent, unless nothing animated is left.
      if (!accentOk) pool = pool.filter(p => p !== 'pop'); // an empty pool goes to the forced branch, animated first
      const parallelRef = shots[G.si].parallelOf;
      const kInShot = shotJointPrims[G.si].length;
      const parallelPrim = parallelRef != null ? shotJointPrims[parallelRef]?.[kInShot] : null;
      if (parallelPrim && pool.includes(parallelPrim)) chosen = evals.get(parallelPrim);
      else if (pool.length) {
        const rng = stream(seed, 'joint', wi, 0);
        const base = isAnchor ? ANCHOR_WEIGHTS : RIDER_WEIGHTS;
        const opts = pool.map(p => {
          let w = (base[p] ?? 1) * cooldownFactor(lastUse.get(p), joints.length, 3);
          if (p === 'pop') w = accentOk ? POP_ACCENT_WEIGHT : 0;
          if (isAnchor && lastAnchor && CATALOGUE[p].family === lastAnchor.family) w *= 0.5;
          const fam = CATALOGUE[p].family;
          if (energyPct[G.si] > 0.5 && (fam === 'hinge' || fam === 'push')) w *= 1.3;
          if (energyPct[G.si] < 0.5 && (fam === 'hide' || fam === 'slide' || p === 'pop')) w *= 1.2;
          if (butFirst && (p === 'shove' || p === 'uncover')) w = 0;
          return { p, w };
        }).filter(o => o.w > 0);
        let draw = rng() * opts.reduce((s, o) => s + o.w, 0);
        let pick = opts.at(-1).p;
        for (const o of opts) { draw -= o.w; if (draw < 0) { pick = o.p; break; } }
        chosen = evals.get(pick);
      } else {
        // 34: forced repeat.
        forced = true;
        // 34 read on both tracks (V1 is hard on each): pop is unforced only if neither track just used pop.
        // Animated first: repeat the least recently used animated entrance (a logged forced repeat) before a pop.
        const animatedAll = eligible.filter(p => p !== 'pop');
        // Judgment over the caps (they are defaults): Jefferson's standing note makes an animated entrance the default,
        // so a capped-out animated entrance beats a pop; the overrun is logged.
        const animated = animatedAll.filter(okCap).length ? animatedAll.filter(okCap) : animatedAll;
        if (animatedAll.length && !animatedAll.filter(okCap).length) log.notes.push(`${G.id} ${G.text}: every eligible animated entrance is over its frequency cap; the least recently used one is taken over a pop`);
        if (!animated.length && eligible.includes('pop')) {
          chosen = evals.get('pop');
          forced = lastFull?.prim === 'pop' || (isAnchor && lastAnchor?.prim === 'pop'); // a pop after a pop is a logged forced repeat (34)
          if (forced) { forcedCount++; log.forced.push({ word: G.id, text: G.text, prim: 'pop' }); }
        }
        else {
          const lru = [...(animated.length ? animated : eligible)].sort((a, b) => (lastUse.get(a) ?? -1) - (lastUse.get(b) ?? -1))[0];
          chosen = evals.get(lru ?? 'pop') ?? evalPrim('pop');
          forcedCount++;
          log.forced.push({ word: G.id, text: G.text, prim: chosen.prim });
        }
      }
    }

    // Commit geometry.
    const runTag = run ? run.ri : null;
    if (run && run.k >= 1 && !runPrim.has(run.ri) || (run && runPrim.get(run.ri)?.segment !== Math.floor(run.k / 4) && run.k >= 1)) {
      // pop is never a run treatment (29: two pops never run back to back).
      if (chosen.prim !== 'pop') runPrim.set(run.ri, { prim: chosen.prim, D: chosen.D, mode: chosen.mode, segment: Math.floor(run.k / 4) });
    }
    if (chosen.built) {
      if (chosen.staged) applyStaging(chosen.staged, chosen.built.s, chosen.built.stagedSegment, G.id);
      G.motion.push(...chosen.built.guest.motion);
      G.clip.push(...chosen.built.guest.clip);
    }
    const j = recordJoint(G, chosen, { run: runTag, forced, rejected, pinned: pinnedUsed });
    if (chosen.prim !== 'travel') { entranceCount++; recent.push(chosen.prim); primCount.set(chosen.prim, (primCount.get(chosen.prim) ?? 0) + 1); }
    if (chosen.prim === 'pop') {
      popCount++; if (wi > 0) accentPops++; popLines.add(shots[G.si].line ?? G.si);
      const animatedRejects = cands.filter(p => p !== 'pop').map(p => evals.get(p));
      const why = wi === 0 ? 'first word' : pinnedUsed ? 'pinned'
        : animatedRejects.every(r => !r || r.reject) ? (animatedRejects.some(r => r?.reject?.startsWith('reading')) ? 'protects reading' : 'no animated entrance fits')
        : 'accent';
      log.pops.push({ word: G.id, text: G.text, why });
    }
    G.joint = j;
    G.on = chosen.prim === 'pop' || chosen.prim === 'travel' ? G.L : chosen.f0;
    settle.set(G.id, chosen.prim === 'pop' || chosen.prim === 'travel' ? G.on : chosen.f1);
    if (chosen.prim !== 'pop' && chosen.prim !== 'travel') prevEnd = chosen.f1;
    entered.push(G);
    prevSung = G;
    if (isAnchor) prevAnchorWord = G;
  }

  // ---- landings adjusted for staging (27.3) and repeat-run framing (32.3) ----
  for (const ls of shotLandings) {
    for (const l of ls) {
      const plq = P(l.shotIndex);
      const ws = l.groupWords.map(w => byId.get(w.id));
      // The landing is triggered by its earliest sung anchor; that word's joint decides the camera's entry.
      const trigger = ws.filter(w => w.role !== 'rider').sort((a, b) => a.t - b.t)[0] ?? byId.get(l.anchorWordId);
      l.triggerWordId = trigger.id;
      const anchorJ = trigger?.joint;
      l.entryJoint = anchorJ ? (anchorJ.carried ? joints[anchorJ.sameJointAs] : anchorJ) : null;
      if (l.entryJoint && l.entryJoint.mode === 'attack' && CATALOGUE[l.entryJoint.prim].actor === 'object') l.arrivalFrame = l.entryJoint.f1;
      const settleW = w => (w.joint && !['pop', 'travel'].includes(w.joint.prim) && !w.joint.carried ? w.joint.f1 : w.L);
      if (l.run) {
        // 32.3: frame the union of the run's settled states (each word counted from its settle frame on).
        const times = [...new Set(ws.map(settleW))].sort((a, b) => a - b);
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (const f of times) {
          for (const w of ws) {
            if (settleW(w) > f) continue;
            const b = boxIn(w, plq, f);
            if (!b) continue;
            x0 = Math.min(x0, b.x - b.w / 2); x1 = Math.max(x1, b.x + b.w / 2); y0 = Math.min(y0, b.y - b.h / 2); y1 = Math.max(y1, b.y + b.h / 2);
          }
        }
        l.lx = (x0 + x1) / 2; l.ly = (y0 + y1) / 2;
        l.dist = Math.max(l.dist, readingDistance(x1 - x0, y1 - y0, 0.94, 0.86, vfov));
        const minCap = Math.min(...ws.map(w => w.cap));
        l.runCapPx = (minCap / (2 * l.dist * tv)) * 720;
        if (l.runCapPx < 65) log.notes.push(`run framing of shot ${l.shotIndex + 1}: smallest cap ${l.runCapPx.toFixed(1)} px under 65 after pre-offsets`);
      }
      else {
        // 27.3 with pre-offsets: frame the words where they are drawn at the landing (visible and settled ones only).
        const fL = l.arrivalFrame ?? l.landingFrame;
        const seen = ws.filter(w => w.on != null && w.on <= fL && settleW(w) <= fL);
        if (seen.length) {
          const mean = mul(seen.reduce((acc, w) => add(acc, I.wordShift(w, fL)), [0, 0, 0]), 1 / seen.length);
          if (Math.hypot(...mean) > 1e-6) { l.lx += dot(mean, plq.R); l.ly += dot(mean, plq.U); l.stagedShift = mean; }
        }
      }
      l.world = localPoseToWorld(plq, l);
    }
  }

  // ---- outputs ----
  const byWord = new Map(words.map(w => [w.id, {
    on: w.on, pre_offset: w.pre_offset ?? null, stamp: w.role !== 'rider' && w.joint && w.joint.prim === 'pop' && !w.joint.carried,
    motion: w.motion, clip: w.clip, joint: w.joint,
  }]));
  const anchorJoints = joints.filter(j => j.track === 'anchor');
  return { joints, anchorJoints, byWord, shotLandings, runs, forcedCount, log, pivotFor };
}
