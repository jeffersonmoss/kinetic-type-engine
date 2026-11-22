// Attached word transitions: catalogue and geometry builders (Fable spec, 22 November 2026, sections B and C).
// Every builder is pure and deterministic. Geometry is given in world coordinates at rest (spec 43.1.2).
import './interp.js';

const add = (a, b) => a.map((x, i) => x + b[i]);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const mul = (a, k) => a.map(x => x * k);
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = a => { const l = Math.hypot(...a); return l > 0 ? mul(a, 1 / l) : [0, 0, 0]; };
const clean = v => v.map(x => (Math.abs(x) < 1e-12 ? 0 : x));
export const clampInt = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// Spec 13: easing.
export const SHARP_EASE = Object.freeze({ a: 2, b: 4, x0: 0.34 });
export const PIVOT_EASE = Object.freeze({ a: 2, b: 3, x0: 0.40 });

// Spec 16 to 26. actor: 'camera' joints are done by a camera pivot about the joint (10.1); 'object' joints move the guest (10.2).
export const CATALOGUE = Object.freeze({
  'cube-roll': { family: 'hinge', actor: 'camera', k: 0.75, min: 10, max: 15, floor: 9, modes: ['land'] },
  'room-corner': { family: 'hinge', actor: 'camera', k: 0.75, min: 10, max: 15, floor: 9, modes: ['land'] },
  'pivot-roll': { family: 'hinge', actor: 'camera', k: 0.75, min: 10, max: 15, floor: 9, modes: ['land'] },
  'fold-down': { family: 'hinge', actor: 'object', k: 0.4, min: 5, max: 9, modes: ['land', 'attack'] },
  'swing-in': { family: 'hinge', actor: 'object', k: 0.4, min: 5, max: 9, modes: ['land', 'attack'] },
  flip: { family: 'flip', actor: 'camera', k: 1.0, min: 15, max: 21, floor: 15, modes: ['land'] },
  'slide-out': { family: 'hide', actor: 'object', k: 0.33, min: 5, max: 8, modes: ['land', 'attack'] },
  uncover: { family: 'hide', actor: 'object', k: 0.4, min: 6, max: 9, modes: ['land', 'attack'] },
  'pass-through': { family: 'hide', actor: 'camera', k: 0.75, min: 10, max: 15, floor: 10, modes: ['land'] },
  shove: { family: 'push', actor: 'object', k: 0.4, min: 6, max: 9, modes: ['land', 'attack'] },
  rail: { family: 'slide', actor: 'object', k: 0.33, min: 5, max: 8, modes: ['land', 'attack'] },
  dock: { family: 'slide', actor: 'object', k: 0.33, min: 5, max: 8, modes: ['land', 'attack'] },
  tick: { family: 'rider', actor: 'object', k: 0, min: 4, max: 4, modes: ['land', 'attack'] },
  extrude: { family: 'grow', actor: 'object', k: 0.25, min: 4, max: 6, modes: ['land', 'attack'] },
  // Jefferson, 22 November 2026 (pops became a crutch): a host-free zoom, uniform scale 0.10 -> 1 about the word's centre.
  zoom: { family: 'zoom', actor: 'object', k: 0.25, min: 4, max: 6, modes: ['land', 'attack'] },
  sprout: { family: 'grow', actor: 'object', k: 0.33, min: 5, max: 7, modes: ['land', 'attack'] },
  pop: { family: 'pop', actor: 'none', k: 0, min: 0, max: 0, modes: ['land'] },
  travel: { family: 'travel', actor: 'none', k: 0, min: 0, max: 0, modes: ['land'] },
});
export const PIVOT_PRIMS = Object.freeze(['cube-roll', 'room-corner', 'pivot-roll', 'flip', 'pass-through']);
export const OBJECT_PRIMS = Object.freeze(Object.keys(CATALOGUE).filter(k => CATALOGUE[k].actor === 'object'));
// Boundary kinds (spec 36) and the folds each one uses.
export const KIND_FOLDS = Object.freeze({
  butt: ['flat'],
  'cube-roll': ['corner-out', 'tip-out'],
  'pivot-roll': ['roll'],
  'room-corner': ['corner-in', 'tip-in'],
  'pass-through': ['depth'],
  flip: ['flip'],
  travel: ['flat', 'roll', 'corner-in', 'tip-in', 'corner-out', 'tip-out', 'depth', 'flip'],
});
export function kindOfFold(fold) {
  if (fold === 'flat') return 'butt';
  if (fold === 'corner-out' || fold === 'tip-out') return 'cube-roll';
  if (fold === 'corner-in' || fold === 'tip-in') return 'room-corner';
  if (fold === 'roll') return 'pivot-roll';
  if (fold === 'depth') return 'pass-through';
  if (fold === 'flip') return 'flip';
  return 'travel';
}

// Spec C header: D = clamp(round(k x beat frames), min, max).
export function nominalDuration(prim, bpm, fps = 30) {
  const c = CATALOGUE[prim];
  if (!c) throw Error(`Unknown primitive ${prim}`);
  if (prim === 'tick') return 4;
  const beatF = (60 / bpm) * fps;
  return clampInt(Math.round(c.k * beatF), c.min, c.max);
}

// ---------- object builders (spec 19, 20, 22, 23, 24, 25) ----------
// Inputs use world vectors: d (unit, out of the host edge, in the plaque plane), t (unit, along the edge),
// N (plaque normal), G = { id, C, extD, extT } (guest rest centre and box extents along d and t), g = gap.
// Each builder returns { guest: { motion, clip }, staged?: [{ id, motion }] }.

const seg = (kind, f0, f1, extra) => ({ f0, f1, ease: SHARP_EASE, kind, ...extra });

// 22.1 slide-out: guest starts shifted by -(extD + g) d, clipped at the host's edge, slides along d to rest.
export function buildSlideOut({ G, d, g, hostEdgeP, hostId, f0, f1 }) {
  return {
    guest: {
      motion: [seg('shift', f0, f1, { from: clean(mul(d, -(G.extD + g))), to: [0, 0, 0] })],
      clip: [{ f0, f1, P: hostEdgeP, n: d, ride: hostId ?? null }],
    },
  };
}

// 22.2 uncover: the guest never moves; the staged words slide back by s = (extD + g) d to rest.
// Clip on the guest through the host's trailing edge, riding with the host.
export function buildUncover({ G, d, g, hostEdgeP, hostId, f0, f1 }) {
  const s = clean(mul(d, G.extD + g));
  return {
    s,
    guest: { motion: [], clip: [{ f0, f1, P: hostEdgeP, n: d, ride: hostId }] },
    stagedSegment: seg('shift', f0, f1, { from: s, to: [0, 0, 0] }),
  };
}

// 23 shove: guest starts at rest + s and moves by -s with the staged words; clip fixed at the far edge of the
// guest's rest slot with normal -d.
export function buildShove({ G, d, g, f0, f1 }) {
  const s = clean(mul(d, G.extD + g));
  const seamP = add(G.C, mul(d, G.extD / 2));
  return {
    s,
    guest: {
      motion: [seg('shift', f0, f1, { from: s, to: [0, 0, 0] })],
      clip: [{ f0, f1, P: seamP, n: clean(mul(d, -1)), ride: null }],
    },
    stagedSegment: seg('shift', f0, f1, { from: s, to: [0, 0, 0] }),
  };
}

// 24.1 rail: guest starts off frame displaced along t by `offset` (signed) and slides to rest. 24.2 dock: along d.
export function buildRail({ dir, offset, f0, f1 }) {
  return { guest: { motion: [seg('shift', f0, f1, { from: clean(mul(dir, offset)), to: [0, 0, 0] })], clip: [] } };
}

// 19 fold-down: hinge on the guest's near edge, axis d x N so that +90 carries d onto N; 90 -> 0.
export function buildFoldDown({ G, d, N, f0, f1 }) {
  const P = add(G.C, mul(d, -G.extD / 2));
  return { guest: { motion: [seg('hinge', f0, f1, { P, axis: clean(unit(cross(d, N))), from: 90, to: 0 })], clip: [] } };
}

// 20 swing-in: pivot on one near-edge corner, turned 90 degrees in plane about N, swings down to rest.
// side = +1 or -1 picks the corner along t. Sign: the turned box has its centre on the d side of the host edge.
export function buildSwingIn({ G, d, t, N, side, f0, f1 }) {
  const c = add(G.C, add(mul(d, -G.extD / 2), mul(t, side * G.extT / 2)));
  const v = sub(G.C, c);
  const I = globalThis.KT_INTERP;
  let best = null;
  for (const sgn of [1, -1]) {
    const vr = I.rotateAxis(v, N, (sgn * Math.PI) / 2);
    const score = dot(vr, d);
    if (!best || score > best.score) best = { sgn, score, centre: add(c, vr) };
  }
  return {
    pivot: c,
    startCentre: best.centre,
    guest: { motion: [seg('hinge', f0, f1, { P: c, axis: N, from: 90 * best.sgn, to: 0 })], clip: [] },
  };
}

// 25.1 extrude: scale along d only, 0.02 -> 1, anchored on the near edge.
export function buildExtrude({ G, d, f0, f1 }) {
  const P = add(G.C, mul(d, -G.extD / 2));
  return { guest: { motion: [seg('scale', f0, f1, { P, axis: d, from: 0.02, to: 1 })], clip: [] } };
}

// Host-free zoom: uniform scale 0.10 -> 1 about the word's own centre.
export function buildZoom({ G, f0, f1 }) {
  return { guest: { motion: [seg('scale', f0, f1, { P: G.C, from: 0.10, to: 1 })], clip: [] } };
}

// 25.2 sprout: uniform scale 0.10 -> 1 about Q on the guest's near edge.
export function buildSprout({ Q, f0, f1 }) {
  return { guest: { motion: [seg('scale', f0, f1, { P: Q, from: 0.10, to: 1 })], clip: [] } };
}

// ---------- camera pivots (spec 16, 17, 18, 21, 44) ----------
// Choose the pivot sign that carries from.N closest to to.N (and from.U closest to to.U as a tie-break).
export function pivotSpec(fromPose, toPose, P, axis, degAbs) {
  const I = globalThis.KT_INTERP;
  let best = null;
  for (const sgn of [1, -1]) {
    const a = (sgn * degAbs * Math.PI) / 180;
    const N = I.rotateAxis(fromPose.N, axis, a), U = I.rotateAxis(fromPose.U, axis, a);
    const score = dot(N, toPose.N) * 10 + dot(U, toPose.U);
    if (!best || score > best.score) best = { score, deg: sgn * degAbs };
  }
  return { P, axis: clean(unit(axis)), deg: best.deg };
}

// Hinge line between plaque A and a folded B: A's exit edge through the point nearest `near`.
export function hingeLine(A, edge, near) {
  const dir = { right: A.R, left: mul(A.R, -1), top: A.U, bottom: mul(A.U, -1) }[edge];
  const horizontal = edge === 'right' || edge === 'left';
  const half = (horizontal ? A.w : A.h) / 2;
  const axis = unit(cross(A.N, dir));
  const base = add(A.C, mul(dir, half));
  const P = add(base, mul(axis, dot(sub(near, base), axis)));
  return { P, axis, dir };
}
