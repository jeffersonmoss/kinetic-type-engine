// Fold geometry and look-ahead trail planning: rulebook sections 8 and 9.
import { stream, weightedChoice, weightedOrder, cooldownFactor } from './rng.mjs';
import { KIND_FOLDS, kindOfFold } from './primitives.mjs';
import { computeShotLandings, localPoseToWorld, firstLandingDistance, moveFloor, verbDurations, MIN_HOLD_FRAMES } from './camera.mjs';

const add = (a, b) => a.map((x, i) => x + b[i]);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const mul = (a, k) => a.map(x => x * k);
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(...a);
const norm = a => { const l = len(a); return l > 0 ? mul(a, 1 / l) : [0, 0, 0]; };

function turn(v, axis, degrees) {
  const t = (degrees * Math.PI) / 180;
  const c = Math.cos(t), s = Math.sin(t);
  return add(add(mul(v, c), mul(cross(axis, v), s)), mul(axis, dot(axis, v) * (1 - c)))
    .map(x => (Math.abs(x) < 1e-10 ? 0 : x));
}

const worldVec = (p, uv) => add(mul(p.R, uv[0]), mul(p.U, uv[1]));

export function computeAlignmentOffset(A, B, { fold, edge, sign = 1, alignMode = 'centre', last = [0, 0], first = [0, 0] }) {
  const horizontal = edge === 'right' || edge === 'left';
  const lenA = horizontal ? A.h : A.w;
  const lenB = fold === 'roll' ? (horizontal ? B.w : B.h) : (horizontal ? B.h : B.w);

  if (alignMode === 'centre') return 0;
  if (alignMode === 'start') return horizontal ? (lenA - lenB) / 2 : -(lenA - lenB) / 2;
  if (alignMode === 'end') return horizontal ? -(lenA - lenB) / 2 : (lenA - lenB) / 2;

  // 8.1.1 match: put B's first cluster level with A's last cluster along edgeAxis, then clamp for >= 40% overlap.
  const edgeAxis = horizontal ? A.U : A.R;
  let Rb = [...A.R], Ub = [...A.U];
  if (fold === 'roll') {
    Rb = turn(Rb, A.N, 90 * sign);
    Ub = turn(Ub, A.N, 90 * sign);
  }
  const posA = horizontal ? last[1] : last[0];
  const posB = dot(Rb, edgeAxis) * first[0] + dot(Ub, edgeAxis) * first[1];
  const raw = posA - posB;
  const minOverlap = 0.40 * Math.min(lenA, lenB);
  const maxShift = (lenA + lenB) / 2 - minOverlap;
  return Math.max(-maxShift, Math.min(maxShift, raw));
}

export function placeFold(A, B, {
  fold,
  edge = 'right',
  sign = 1,
  gap = 0,
  alignment = 0,
  last = [0, 0],
  first = [0, 0],
  readingDistance = 0,
  hg = 0,
  heading = [1, 0, 0],
  flipAxis = 'U',
}) {
  const direction = { right: A.R, left: mul(A.R, -1), top: A.U, bottom: mul(A.U, -1) }[edge];
  if (!direction) throw Error(`Unknown edge: ${edge}`);
  const horizontal = edge === 'right' || edge === 'left';
  const edgeAxis = horizontal ? A.U : A.R;
  const halfA = (horizontal ? A.w : A.h) / 2;
  const halfB = (fold === 'roll' ? (horizontal ? B.h : B.w) : (horizontal ? B.w : B.h)) / 2;
  let C = add(add(A.C, mul(direction, halfA + gap + halfB)), mul(edgeAxis, alignment));
  let R = [...A.R], U = [...A.U], N = [...A.N];

  if (fold === 'roll') {
    R = turn(R, N, 90 * sign);
    U = turn(U, N, 90 * sign);
  } else if (['corner-in', 'tip-in', 'corner-out', 'tip-out'].includes(fold)) {
    if ((fold.startsWith('corner') && !horizontal) || (fold.startsWith('tip') && horizontal)) {
      throw Error('Fold and exit edge have incompatible axes');
    }
    const axis = cross(A.N, direction);
    const angle = fold.endsWith('-in') ? -90 : 90;
    const hinge = add(A.C, mul(direction, halfA + gap / 2));
    C = add(hinge, turn(sub(C, hinge), axis, angle));
    R = turn(R, axis, angle);
    U = turn(U, axis, angle);
    N = turn(N, axis, angle);
  } else if (fold === 'depth') {
    const source = add(A.C, worldVec(A, last));
    const destination = sub(source, mul(A.N, readingDistance + 0.5 * (A.lastCap ?? 0) + A.thickness));
    C = sub(destination, worldVec({ R, U }, first));
  } else if (fold === 'flip') {
    // 8.7: B sits back to back with A, 0.5*hg behind A's back face, aligned on K.
    // Since slab extends -N*thickness behind front face C, B's front face is at -(A.thickness + 0.5*hg + B.thickness).
    // Spec 21.1: axis U (revolving door) R' = -R, N' = -N; axis R (tumble) U' = -U, N' = -N.
    if (flipAxis === 'R') U = mul(A.U, -1);
    else R = mul(A.R, -1);
    N = mul(A.N, -1);
    const source = add(A.C, worldVec(A, last));
    C = sub(sub(source, mul(A.N, A.thickness + 0.5 * hg + (B.thickness ?? 0))), worldVec({ R, U }, first));
  } else if (fold === 'jump') {
    C = add(A.C, mul(heading, 2.5 * Math.max(A.w, A.h)));
  } else if (fold !== 'flat') {
    throw Error(`Unknown fold: ${fold}`);
  }
  return { ...B, C, R, U, N };
}

export function slabBounds(p, growth = 0) {
  const ext = [0, 1, 2].map(i => (Math.abs(p.R[i]) * p.w + Math.abs(p.U[i]) * p.h + Math.abs(p.N[i]) * p.thickness) / 2 + growth);
  // C is on the front face; the slab lies behind it.
  const center = sub(p.C, mul(p.N, p.thickness / 2));
  return { min: center.map((x, i) => x - ext[i]), max: center.map((x, i) => x + ext[i]) };
}

export function slabCenter(p) {
  return sub(p.C, mul(p.N, p.thickness / 2));
}

export function boxesIntersect(a, b) {
  return [0, 1, 2].every(i => a.min[i] < b.max[i] && b.min[i] < a.max[i]);
}

export function pointInBox(pt, box) {
  return [0, 1, 2].every(i => pt[i] > box.min[i] && pt[i] < box.max[i]);
}

export function rayIntersectsBox(origin, target, box) {
  const dir = sub(target, origin);
  let lo = 1e-4, hi = 1 - 1e-4;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dir[i]) < 1e-12) {
      if (origin[i] < box.min[i] || origin[i] > box.max[i]) return false;
    } else {
      let t1 = (box.min[i] - origin[i]) / dir[i];
      let t2 = (box.max[i] - origin[i]) / dir[i];
      if (t1 > t2) [t1, t2] = [t2, t1];
      lo = Math.max(lo, t1);
      hi = Math.min(hi, t2);
      if (lo > hi) return false;
    }
  }
  return lo <= hi;
}

export function hairpinOK(c1, c2, c3) {
  return len(sub(c3, c1)) >= 0.6 * (len(sub(c2, c1)) + len(sub(c3, c2)));
}

// Tables from sections 9.3, 9.4, 9.8.
export const FOLD_AXIS = Object.freeze({
  flat: 'none',
  roll: 'roll',
  'corner-in': 'yaw',
  'tip-in': 'pitch',
  'corner-out': 'yaw',
  'tip-out': 'pitch',
  depth: 'depth',
  flip: 'yaw',
  jump: 'none',
});

const FOLD_TAU = Object.freeze({
  flat: 1.5,
  roll: 3,
  'corner-in': 3,
  'tip-in': 3,
  'corner-out': 4,
  'tip-out': 4,
  depth: 4,
  flip: 6,
});

export const FOLD_BASE = Object.freeze({
  B2: { flat: 40, roll: 20, 'corner-in': 18, 'tip-in': 10, 'corner-out': 1.8, 'tip-out': 1.1, depth: 1.4, flip: 0 },
  B3: { flat: 12, roll: 14, 'corner-in': 24, 'tip-in': 18, 'corner-out': 4.2, 'tip-out': 2.8, depth: 3.5, flip: 0.7 },
  B4: { flat: 4, roll: 8, 'corner-in': 8, 'tip-in': 8, 'corner-out': 7, 'tip-out': 5.6, depth: 7.7, flip: 2.8 },
});

// Spec 36: boundary kinds by class (B2, B3, B4) and the kinds' frame floors (36.3).
export const KIND_BASE = Object.freeze({
  B2: { butt: 34, 'cube-roll': 22, 'pivot-roll': 18, 'room-corner': 14, 'pass-through': 6, flip: 4, travel: 2 },
  B3: { butt: 20, 'cube-roll': 28, 'pivot-roll': 14, 'room-corner': 16, 'pass-through': 10, flip: 8, travel: 4 },
  B4: { butt: 8, 'cube-roll': 24, 'pivot-roll': 8, 'room-corner': 10, 'pass-through': 18, flip: 12, travel: 20 },
});
export const KIND_FLOOR = Object.freeze({ 'cube-roll': 9, 'room-corner': 9, 'pivot-roll': 9, flip: 15, 'pass-through': 10 });
export const ATTACHED_KINDS = Object.freeze(['butt', 'cube-roll', 'pivot-roll', 'room-corner']);
// Gap by kind (spec 36 table): butt and pivot-roll 0.30 x hg, cube-roll and room-corner 0, travel the old ranges.
export function kindGap(kind, b) {
  if (kind === 'butt' || kind === 'pivot-roll') return 0.30 * b.hg;
  if (kind === 'cube-roll' || kind === 'room-corner') return 0;
  return b.travelGap;
}

const SET_PIECE_BASE = Object.freeze({ depth: 32, 'corner-out': 30, 'tip-out': 22, flip: 16 });

export const FAMILIES = Object.freeze({
  'Corner Room': {
    flat: 0.8, roll: 0.8, 'corner-in': 2.2, 'tip-in': 1.8, 'corner-out': 0.6, 'tip-out': 0.5, depth: 0.6, flip: 0.5,
    gapScale: 0.85,
  },
  'Tumbling Run': {
    flat: 0.5, roll: 1.5, 'corner-in': 0.8, 'tip-in': 1.6, 'corner-out': 1.6, 'tip-out': 2.2, depth: 0.8, flip: 1.8,
    gapScale: 1.0,
  },
  'Corridor Rush': {
    flat: 1.4, roll: 0.5, 'corner-in': 0.7, 'tip-in': 0.5, 'corner-out': 0.8, 'tip-out': 0.6, depth: 2.8, flip: 0.6,
    gapScale: 1.1,
  },
  'Poster Stack': {
    flat: 2.2, roll: 2.4, 'corner-in': 0.6, 'tip-in': 0.4, 'corner-out': 0.3, 'tip-out': 0.3, depth: 0.4, flip: 0.3,
    gapScale: 0.8,
  },
});

const EDGE_BASE = Object.freeze({ right: 45, bottom: 25, top: 18, left: 12 });
const ALIGN_BASE = Object.freeze({ match: 55, start: 15, centre: 15, end: 15 });
const OPPOSITE_EDGE = Object.freeze({ right: 'left', left: 'right', top: 'bottom', bottom: 'top' });

function foldEnergyFactor(fold, e) {
  if (fold === 'flat' || fold === 'roll') {
    return e < 0.5 ? 1 + 0.65 * (0.5 - e) : 1 - 0.35 * (e - 0.5);
  }
  return e > 0.5 ? 1 + 0.75 * (e - 0.5) : 1 - 0.5 * (0.5 - e);
}

export function effectiveTurnSign(fold, edge, sign) {
  if (fold === 'roll' || fold === 'flip') return sign >= 0 ? 1 : -1;
  if (fold === 'corner-in') return edge === 'right' ? -1 : 1;
  if (fold === 'corner-out') return edge === 'right' ? 1 : -1;
  if (fold === 'tip-in') return edge === 'top' ? 1 : -1;
  if (fold === 'tip-out') return edge === 'top' ? -1 : 1;
  return 0;
}

function validEdgesForFold(fold) {
  if (fold === 'corner-in' || fold === 'corner-out') return ['right', 'left'];
  if (fold === 'tip-in' || fold === 'tip-out') return ['top', 'bottom'];
  if (fold === 'depth' || fold === 'flip') return ['right']; // edge unused for depth/flip
  return ['right', 'bottom', 'top', 'left'];
}

function validSignsForFold(fold) {
  if (fold === 'roll' || fold === 'flip') return [1, -1];
  return [1];
}

function validAlignsForFold(fold, isEcho) {
  if (fold === 'depth' || fold === 'flip') return ['match'];
  if (isEcho && fold === 'corner-in') return ['match'];
  return ['match', 'start', 'centre', 'end'];
}

function lastTravelEdge(shot, plaque, vfov, fps, wordsMode) {
  const { landings } = computeShotLandings(shot, plaque, vfov, fps, { wordsMode });
  if (landings.length < 2) return null;
  const a = landings.at(-2), b = landings.at(-1);
  const dx = b.lx - a.lx, dy = b.ly - a.ly;
  if (Math.hypot(dx, dy) < 1e-6) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'top' : 'bottom';
}

function clusterNinePoints(plaque, clusterIdx) {
  const cb = plaque.clusterBoxes[clusterIdx];
  const pts = [];
  for (const sx of [-0.5, 0, 0.5]) {
    for (const sy of [-0.5, 0, 0.5]) {
      pts.push(add(plaque.C, add(mul(plaque.R, cb.cx + sx * cb.w), mul(plaque.U, cb.cy + sy * cb.h))));
    }
  }
  return pts;
}

function classRank(bClass) {
  return bClass === 'B4' ? 4 : bClass === 'B3' ? 3 : 2;
}

// Plan the complete 3D trail with peaks, heat map, repetition, look-ahead DFS, and 9.7 fallbacks.
export function planTrail({
  shots,
  plaques,
  map,
  seed,
  vfov = 40,
  fps = 30,
  clipEnd = 21.971,
  family = 'Corner Room',
  panelMode = 'on',
  wordsMode = 'pop',
  pinnedShots = null,
}) {
  const fam = FAMILIES[family] ?? FAMILIES['Corner Room'];
  const nShots = shots.length;
  const nBounds = Math.max(0, nShots - 1);

  // 1. Compute shot energy and highest E percentiles for 9.2 Peaks.
  const shotMeanEnergy = shots.map((s, si) => {
    const eArr = map.energy_10hz ?? [];
    const t0 = s.words[0].t;
    const t1 = shots[si + 1]?.words[0].t ?? clipEnd;
    const a = Math.max(0, Math.floor(t0 * 10));
    const b = Math.max(a + 1, Math.min(eArr.length, Math.ceil(t1 * 10)));
    const slice = eArr.slice(a, b);
    return slice.length ? slice.reduce((x, y) => x + y, 0) / slice.length : 0;
  });
  const sortedE = [...shotMeanEnergy].sort((a, b) => a - b);
  const shotEnergyPct = shotMeanEnergy.map(v =>
    sortedE.length > 1 ? sortedE.filter(x => x < v).length / (sortedE.length - 1) : 0.5
  );
  const shotMaxE = shots.map(s => Math.max(...s.clusters.map(c => c.E)));
  const sortedMaxE = [...shotMaxE].sort((a, b) => a - b);
  const shotEmphPct = shotMaxE.map(v =>
    sortedMaxE.length > 1 ? sortedMaxE.filter(x => x < v).length / (sortedMaxE.length - 1) : 0.5
  );

  // 2. 9.2 Peaks & 9.3 Set pieces.
  const boundaryInfo = [];
  for (let si = 1; si < nShots; si++) {
    const s = shots[si];
    const bClass = s.boundary ?? 'B2';
    const clsVal = bClass === 'B4' ? 1.0 : bClass === 'B3' ? 0.6 : 0.3;
    const hit = (map.strong_hits_s ?? []).some(t => Math.abs(t - s.clusters[0].anchor.t) <= 0.08) ? 1 : 0;
    const PK = 0.35 * clsVal + 0.25 * shotEnergyPct[si] + 0.20 * hit + 0.20 * shotEmphPct[si];
    boundaryInfo.push({
      si,
      bIndex: si - 1,
      bClass,
      PK,
      isEcho: !!s.echo,
      motifOf: s.motifOf ?? null,
      parallelOf: s.parallelOf ?? null,
      isSetPiece: false,
      energyPct: shotEnergyPct[si],
    });
  }

  const targetSetPieces = Math.ceil(0.2 * nBounds);
  const pkOrder = [...boundaryInfo].sort((a, b) => b.PK - a.PK || a.bIndex - b.bIndex);
  const chosenSetPieces = [];
  for (const b of pkOrder) {
    if (chosenSetPieces.length >= targetSetPieces) break;
    if (b.isEcho || b.motifOf != null || b.parallelOf != null) continue;
    if (chosenSetPieces.some(c => Math.abs(c.bIndex - b.bIndex) <= 2)) continue;
    b.isSetPiece = true;
    chosenSetPieces.push(b);
  }

  // Draw set-piece folds in song order with set-piece cooldown (tau 2 set pieces).
  const setPiecesChrono = [...chosenSetPieces].sort((a, b) => a.bIndex - b.bIndex);
  const lastSetPieceFold = new Map();
  setPiecesChrono.forEach((b, spIdx) => {
    const rng = stream(seed, 'setpiece', b.si, 0);
    const opts = Object.entries(SET_PIECE_BASE).map(([fold, base]) => ({
      value: fold,
      base,
      weight: base * fam[fold] * cooldownFactor(lastSetPieceFold.get(fold), spIdx, 2),
    }));
    b.setPieceFoldOrder = weightedOrder(opts, rng);
    b.setPieceFold = b.setPieceFoldOrder[0];
    lastSetPieceFold.set(b.setPieceFold, spIdx);
  });

  // 3. Boundary kinds (Fable spec 36): the kind draw replaces the fold draw. Streaks (9.5.3) are deleted (36.2);
  // repeats now come only from the lyric. V3: consecutive boundaries never share a kind, except `butt` twice (31).
  const lastFoldUse = new Map();
  const lastAxisUse = new Map();
  const kindHistory = [];
  const beatF = (60 / map.tempo_bpm) * fps;

  for (const b of boundaryInfo) {
    const si = b.si;
    const pinned = pinnedShots?.[si]?.boundary;
    const rng = stream(seed, 'fold', si, 0);
    const gapRng = stream(seed, 'gap', si, 0);
    const prevLastAnchorT = shots[si - 1].clusters.at(-1).anchor.t;
    const currFirstT = shots[si].groups[0][0].anchor.t;
    const availFrames = (Math.round(currFirstT * fps) - 1) - (Math.round(prevLastAnchorT * fps) - 1) - MIN_HOLD_FRAMES;
    b.availSec = availFrames / fps;
    // 36.3: gap between A's last anchor and B's first anchor, in frames.
    b.anchorGapF = Math.round(currFirstT * fps) - Math.round(prevLastAnchorT * fps);

    const hg = Math.sqrt(plaques[si - 1].lastCap * plaques[si].firstCap);
    b.hg = hg;
    const gapRanges = { B2: [0.45, 0.80], B3: [0.70, 1.20], B4: [1.40, 2.40] };
    const [gLo, gHi] = gapRanges[b.bClass] ?? gapRanges.B2;
    const gapU = pinned?.gapU != null ? pinned.gapU : gapRng();
    b.gapU = gapU;
    b.travelGap = (gLo + (gHi - gLo) * gapU) * hg * fam.gapScale; // old ranges, used by `travel`
    b.gap = b.travelGap;

    // Fold factor (36.1): family multiplier, fold and axis cooldowns, energy factor.
    const foldFactor = fold => {
      const axis = FOLD_AXIS[fold];
      const cf = cooldownFactor(lastFoldUse.get(fold), b.bIndex, FOLD_TAU[fold]);
      const ca = axis === 'none' ? 1 : cooldownFactor(lastAxisUse.get(axis), b.bIndex, 2);
      return fam[fold] * cf * ca * foldEnergyFactor(fold, b.energyPct);
    };
    const kindEligible = kind => {
      if (KIND_FLOOR[kind] != null && b.anchorGapF < 12 + KIND_FLOOR[kind]) return false; // 36.3
      const prevK = kindHistory.at(-1);
      if (kind === prevK && !(kind === 'butt' && kindHistory.at(-2) !== 'butt')) return false; // V3
      return true;
    };
    const subFoldOrder = (kind, r) => {
      if (kind === 'travel') {
        const opts = Object.entries(FOLD_BASE[b.bClass] ?? FOLD_BASE.B2).map(([fold, base]) => ({ value: fold, base, weight: base * foldFactor(fold) }));
        return weightedOrder(opts, r);
      }
      const folds = KIND_FOLDS[kind];
      if (folds.length === 1) return [...folds];
      return weightedOrder(folds.map(f => ({ value: f, base: 1, weight: foldFactor(f) })), r);
    };
    const kindWeight = (kind, base) => {
      if (kind === 'travel') return base;
      const fs = KIND_FOLDS[kind];
      return base * fs.reduce((sum, f) => sum + foldFactor(f), 0) / fs.length;
    };
    const col = KIND_BASE[b.bClass] ?? KIND_BASE.B2;
    const ordinaryKinds = weightedOrder(
      Object.entries(col).map(([kind, base]) => ({ value: kind, base, weight: kindEligible(kind) ? kindWeight(kind, base) : 0, valid: true })),
      rng,
    );

    let kindOrder;
    let intendedVerb = null;
    let source = 'sampled';
    if (pinned?.kind || pinned?.fold) {
      const pk = pinned.kind ?? kindOfFold(pinned.fold);
      kindOrder = [pk, ...ordinaryKinds.filter(k => k !== pk)];
      intendedVerb = pinned.verb ?? null;
      source = 'pinned';
    } else if (b.isEcho) {
      // 32.6: echo shots keep the existing rule, flip 55, cube-roll 45.
      const echoOrder = weightedOrder([
        { value: 'flip', base: 55, weight: kindEligible('flip') ? 55 : 0 },
        { value: 'cube-roll', base: 45, weight: kindEligible('cube-roll') ? 45 : 0 },
      ], rng);
      kindOrder = [...echoOrder, ...ordinaryKinds.filter(k => !echoOrder.includes(k))];
      intendedVerb = 'sweep';
      source = 'echo';
    } else if ((b.motifOf != null && boundaryInfo[b.motifOf - 1]) || (b.parallelOf != null && boundaryInfo[b.parallelOf - 1])) {
      const refB = boundaryInfo[(b.motifOf ?? b.parallelOf) - 1];
      kindOrder = [refB.intendedKind, ...ordinaryKinds.filter(k => k !== refB.intendedKind)];
      intendedVerb = refB.intendedVerb;
      source = b.motifOf != null ? `motif:${b.motifOf + 1}` : `parallel:${b.parallelOf + 1}`;
    } else if (b.isSetPiece) {
      const spKinds = [...new Set(b.setPieceFoldOrder.map(kindOfFold))];
      kindOrder = [...spKinds, ...ordinaryKinds.filter(k => !spKinds.includes(k))];
      source = 'set-piece';
    } else {
      kindOrder = ordinaryKinds;
    }
    // Ineligible kinds (36.3, V3) move behind the eligible ones; `travel` is always last before the jump (36.4).
    kindOrder = [...kindOrder.filter(k => k !== 'travel' && kindEligible(k)), ...kindOrder.filter(k => k !== 'travel' && !kindEligible(k) && pinned && (pinned.kind ?? kindOfFold(pinned.fold)) === k), 'travel'];

    const tryList = [];
    kindOrder.forEach((kind, ki) => {
      let order = subFoldOrder(kind, stream(seed, `kindfold_${kind}`, si, ki));
      if (b.isSetPiece && kind !== 'travel') order = [...b.setPieceFoldOrder.filter(f => order.includes(f)), ...order.filter(f => !b.setPieceFoldOrder.includes(f))];
      if (pinned?.fold && kind === (pinned.kind ?? kindOfFold(pinned.fold)) && order.includes(pinned.fold)) order = [pinned.fold, ...order.filter(f => f !== pinned.fold)];
      if (kind === 'travel') order = order.slice(0, 4);
      for (const fold of order) tryList.push({ kind, fold });
    });
    b.tryList = tryList;
    b.intendedKind = tryList[0].kind;
    b.intendedFold = tryList[0].fold;
    b.intendedVerb = intendedVerb;
    b.foldOrder = tryList.map(x => x.fold);
    b.source = source;
    // 21.1: second flip axis, U 65 / R 35.
    b.flipAxis = pinned?.flipAxis ?? (stream(seed, 'flipaxis', si, 0)() < 0.65 ? 'U' : 'R');

    kindHistory.push(b.intendedKind);
    lastFoldUse.set(b.intendedFold, b.bIndex);
    const ax = FOLD_AXIS[b.intendedFold];
    if (ax !== 'none') lastAxisUse.set(ax, b.bIndex);
  }

  // 4. Heading and envelope (9.6.3).
  const headRng = stream(seed, 'heading', 0, 0);
  const s1 = headRng() < 0.5 ? 1 : -1;
  const s2 = headRng() < 0.5 ? 1 : -1;
  const G = norm([0.80, s1 * 0.45, s2 * 0.40]);
  const L = Math.sqrt(plaques.reduce((sum, p) => sum + p.w * p.h, 0));
  const envCenterX = 1.2 * L * G[0];

  const headingEnvelopeFactor = (prevC, candC) => {
    const step = norm(sub(candC, prevC));
    const dx = (candC[0] - envCenterX) / (1.33 * L);
    const dy = candC[1] / (0.75 * L);
    const dz = candC[2] / (0.75 * L);
    const rho = Math.hypot(dx, dy, dz);
    return Math.max(0.05, (1 + 0.3 * dot(step, G)) * Math.exp(-2 * Math.max(0, rho - 1)));
  };

  // Precompute local landings and last travel edges for all shots.
  const localLandingsByShot = shots.map((s, si) => computeShotLandings(s, plaques[si], vfov, fps, { wordsMode }).landings);
  const firstReadDist = localLandingsByShot.map(ls => ls[0].dist);
  const lastTravelByShot = shots.map((s, si) => lastTravelEdge(s, plaques[si], vfov, fps, wordsMode));

  // 5. DFS look-ahead placement (9.6, 9.7).
  const placed = new Array(nShots);
  const chosenBoundaries = new Array(nShots);
  placed[0] = {
    ...plaques[0],
    C: [0, 0, 0],
    R: [1, 0, 0],
    U: [0, 1, 0],
    N: [0, 0, 1],
    surface: panelMode === 'off' ? 'open' : 'panel',
    fold: null,
  };
  chosenBoundaries[0] = null;

  let backtracks = 0;
  const MAX_BACKTRACKS = 200;

  // Test candidate plaque placement at shot index `si` against 9.6.2 (a)-(e).
  function testPlacement(si, cand, fold, edge, sign, prevTurnHistory, kind = 'travel') {
    const prevP = placed[si - 1];

    // 10.5.2 Rotation floor check: at least one moving verb (whip, sweep, glide) must meet both 0.8*dur and moveFloor(fold).
    const bnd = boundaryInfo[si - 1];
    const floorF = Math.ceil(moveFloor(fold) * fps - 1e-9);
    const availF = Math.round(bnd.availSec * fps);
    const durs = verbDurations(map.tempo_bpm);
    const hasMovingVerb = ['whip', 'sweep', 'glide'].some(v => {
      const dur = durs[v];
      const df = Math.min(availF, Math.round(Math.min(dur, bnd.availSec) * fps));
      return bnd.availSec >= 0.8 * dur && df >= floorF && df >= Math.ceil(0.20 * fps);
    });
    if (kind === 'travel' && fold !== 'jump' && fold !== 'flat' && !hasMovingVerb) {
      return { ok: false, failedTest: `10.5.2 rotation floor (${availF}f, no moving verb meets ${floorF}f floor for ${fold})` };
    }

    // (a) Solid trail: slab box grown by 60 intersects no earlier slab box (for flip, A tested without growth).
    const candGrown = slabBounds(cand, 60);
    const candExact = slabBounds(cand, 0);
    for (let j = 0; j < si; j++) {
      if (fold === 'flip' && j === si - 1) {
        if (boxesIntersect(candExact, slabBounds(placed[j], 0))) {
          return { ok: false, failedTest: `9.6.2(a) solid trail collision with p${j + 1} (flip exact)` };
        }
      } else if (j === si - 1 && ATTACHED_KINDS.includes(kind)) {
        // Spec 41.3: attached pair, both slabs 1 unit thick, candidate shrunk by 1 unit on each axis.
        if (boxesIntersect(slabBounds({ ...cand, thickness: 1 }, -1), slabBounds({ ...placed[j], thickness: 1 }, 0))) {
          return { ok: false, failedTest: `9.6.2(a) attached pair overlap with p${j + 1}` };
        }
      } else {
        if (boxesIntersect(candGrown, slabBounds(placed[j], 0))) {
          return { ok: false, failedTest: `9.6.2(a) solid trail collision with p${j + 1}` };
        }
      }
    }

    // (b) No hairpin: |c3 - c1| >= 0.6 * (|c2 - c1| + |c3 - c2|); exempt flip and jump.
    if (si >= 2 && fold !== 'flip' && fold !== 'jump') {
      const c1 = slabCenter(placed[si - 2]);
      const c2 = slabCenter(placed[si - 1]);
      const c3 = slabCenter(cand);
      if (!hairpinOK(c1, c2, c3)) {
        return { ok: false, failedTest: '9.6.2(b) hairpin' };
      }
    }

    // (c) No corkscrew: after two turning folds running on one axis with one sign, a third takes the other sign.
    const axis = FOLD_AXIS[fold];
    const effSign = effectiveTurnSign(fold, edge, sign);
    if (axis !== 'none' && axis !== 'depth' && effSign !== 0 && prevTurnHistory.length >= 2) {
      const t1 = prevTurnHistory.at(-1);
      const t2 = prevTurnHistory.at(-2);
      if (t1.axis === axis && t2.axis === axis && t1.sign === effSign && t2.sign === effSign) {
        return { ok: false, failedTest: `9.6.2(c) corkscrew (${axis} ${effSign > 0 ? '+' : '-'})` };
      }
    }

    // (d) Camera clear & (e) Sight line against switched-on plaques (i-1 unless depth, and i-2 unless already hidden).
    const landings = localLandingsByShot[si];
    const worldLandings = landings.map(l => localPoseToWorld(cand, l));
    const checkIndices = [];
    if (fold !== 'depth') checkIndices.push(si - 1);
    if (si >= 2 && !chosenBoundaries[si - 1]?.earlyHidePrev2 && chosenBoundaries[si - 1]?.fold !== 'depth') {
      // Wait: if i-2 was already hidden by depth at i-1, it's off!
      if (placed[si - 2].surface !== 'open_hidden') checkIndices.push(si - 2);
    }

    const offendingSet = new Set();
    let failDetail = '';
    for (const oi of checkIndices) {
      const op = placed[oi];
      const grownCamBox = slabBounds(op, 0.5 * op.maxCap);
      const exactOpBox = slabBounds(op, 0);
      const opIsPanel = panelMode !== 'off' && op.surface === 'panel';

      for (let li = 0; li < worldLandings.length; li++) {
        const pose = worldLandings[li];
        if (pointInBox(pose.position, grownCamBox)) {
          offendingSet.add(oi);
          failDetail = `9.6.2(d) camera clear against p${oi + 1}`;
        }
        if (opIsPanel) {
          for (const ci of landings[li].clusterIndices) {
            const pts = clusterNinePoints(cand, ci);
            for (const pt of pts) {
              if (rayIntersectsBox(pose.position, pt, exactOpBox)) {
                offendingSet.add(oi);
                failDetail = `9.6.2(e) sight line blocked by p${oi + 1}`;
                break;
              }
            }
          }
        }
      }
    }

    if (offendingSet.size > 0) {
      // If the ONLY offender is plaque i-2, hide it early (11.3.3) instead of rejecting!
      if (offendingSet.size === 1 && offendingSet.has(si - 2)) {
        return { ok: true, earlyHidePrev2: true, earlyHideReason: failDetail };
      }
      return { ok: false, failedTest: failDetail };
    }
    return { ok: true, earlyHidePrev2: false };
  }

  function buildOptionList(si, fold, state, attempt, kind = 'travel') {
    const bnd = boundaryInfo[si - 1];
    const prevP = placed[si - 1];
    const currP = plaques[si];
    const lastCluster = prevP.clusterBoxes.at(-1);
    const firstCluster = currP.clusterBoxes[0];
    const last = [lastCluster.cx, lastCluster.cy];
    const first = [firstCluster.cx, firstCluster.cy];
    const gap = kindGap(kind, bnd);
    const rng = stream(seed, `opt_${fold}`, si, attempt);
    const pinned = pinnedShots?.[si]?.boundary;

    const edges = validEdgesForFold(fold);
    const signs = validSignsForFold(fold);
    const aligns = kind === 'butt' ? ['match'] : validAlignsForFold(fold, bnd.isEcho); // 36: butt aligns `match`
    const lastTravel = bnd.bClass === 'B2' ? lastTravelByShot[si - 1] : null;

    const rawOptions = [];
    for (const edge of edges) {
      for (const sign of signs) {
        for (const alignMode of aligns) {
          const alignment = (fold === 'depth' || fold === 'flip')
            ? 0
            : computeAlignmentOffset(prevP, currP, { fold, edge, sign, alignMode, last, first });
          const cand = placeFold(prevP, currP, {
            fold, edge, sign, gap, alignment, last, first,
            readingDistance: firstReadDist[si],
            hg: bnd.hg,
            heading: G,
            flipAxis: bnd.flipAxis,
          });
          let w = (EDGE_BASE[edge] ?? 1) * (ALIGN_BASE[alignMode] ?? 1);
          // Edge cooldown (tau 2).
          if (fold !== 'depth' && fold !== 'flip') {
            w *= cooldownFactor(state.lastEdgeUse.get(edge), bnd.bIndex, 2);
          }
          // 9.6.3 Heading and envelope.
          w *= headingEnvelopeFactor(prevP.C, cand.C);
          // 9.6.4 Flow at B2.
          if (lastTravel && fold !== 'depth' && fold !== 'flip') {
            if (edge === lastTravel) w *= 1.4;
            else if (edge === OPPOSITE_EDGE[lastTravel]) w *= 0.5;
          }
          // 9.6.5 Balance.
          const axis = FOLD_AXIS[fold];
          const effSign = effectiveTurnSign(fold, edge, sign);
          if (axis !== 'none' && axis !== 'depth' && effSign !== 0) {
            const curBal = state.balance[axis] ?? 0;
            const nextBal = curBal * 0.85 + effSign;
            if (Math.abs(nextBal) > 1.5) w *= 0.35;
            else if (Math.abs(curBal * 0.85 - effSign) > 1.5) w *= 1.45;
          }
          // Strongly prefer keeping plaques right-side-up in world Y (avoid 180-deg inverted plaques in the reveal).
          if (cand.U[1] < -0.5) w *= 0.08;
          rawOptions.push({
            value: { edge, sign, alignMode, alignment, gap, cand, effSign, axis },
            base: (EDGE_BASE[edge] ?? 1) * (ALIGN_BASE[alignMode] ?? 1),
            weight: w,
            valid: true,
          });
        }
      }
    }

    let ordered = weightedOrder(rawOptions, rng);

    // Prioritize pinned, motif-mirrored, or parallel-mirrored option first (if present).
    if (pinned && pinned.fold === fold && pinned.edge) {
      const matchIdx = ordered.findIndex(o => o.edge === pinned.edge && o.sign === pinned.sign && o.alignMode === pinned.alignMode);
      if (matchIdx > 0) {
        const [item] = ordered.splice(matchIdx, 1);
        ordered.unshift(item);
      }
    } else if (bnd.motifOf != null && chosenBoundaries[bnd.motifOf]) {
      const ref = chosenBoundaries[bnd.motifOf];
      const targetEdge = shots[si].motifMirror ? (OPPOSITE_EDGE[ref.edge] ?? ref.edge) : ref.edge;
      const targetSign = shots[si].motifMirror ? -ref.sign : ref.sign;
      const matchIdx = ordered.findIndex(o => o.edge === targetEdge && o.sign === targetSign && o.alignMode === ref.alignMode);
      if (matchIdx > 0) {
        const [item] = ordered.splice(matchIdx, 1);
        ordered.unshift(item);
      }
    } else if (bnd.parallelOf != null && chosenBoundaries[bnd.parallelOf]) {
      const ref = chosenBoundaries[bnd.parallelOf];
      const targetEdge = OPPOSITE_EDGE[ref.edge] ?? ref.edge;
      const matchIdx = ordered.findIndex(o => o.edge === targetEdge);
      if (matchIdx > 0) {
        const [item] = ordered.splice(matchIdx, 1);
        ordered.unshift(item);
      }
    }

    return ordered;
  }

  function dfs(si, state) {
    if (si >= nShots) return true;
    const bnd = boundaryInfo[si - 1];
    const ladderLog = [];

    // 36.4: the fallback ladder tries kinds (and each kind's folds) in weighted order; travel, then jump, last.
    const tryList = bnd.tryList;
    let intendedChoice = null;

    for (let fi = 0; fi < tryList.length; fi++) {
      const { kind, fold } = tryList[fi];
      const options = buildOptionList(si, fold, state, fi, kind);
      if (fi === 0 && options.length) {
        intendedChoice = {
          fold,
          kind,
          edge: options[0].edge,
          sign: options[0].sign,
          alignMode: options[0].alignMode,
          gap: options[0].gap,
          verb: bnd.intendedVerb,
        };
      }

      for (let oi = 0; oi < options.length; oi++) {
        const opt = options[oi];
        const res = testPlacement(si, opt.cand, fold, opt.edge, opt.sign, state.turnHistory, kind);
        if (!res.ok) {
          if (oi === 0) ladderLog.push({ step: fi === 0 ? 'primary' : `retry-fold-${fi}`, fold, edge: opt.edge, sign: opt.sign, alignMode: opt.alignMode, failedTest: res.failedTest });
          continue;
        }

        // Commit tentative placement for shot si.
        const prevSurfaceBackup = placed[si - 1].surface;
        if (fold === 'depth') placed[si - 1].surface = 'open';
        if (fold === 'flip') {
          placed[si - 1].flip_mounted = true;
        }
        placed[si] = {
          ...opt.cand,
          surface: panelMode === 'off' ? 'open' : 'panel',
          fold,
          flip_mounted: fold === 'flip' ? true : false,
        };

        const lastTravel = bnd.bClass === 'B2' ? lastTravelByShot[si - 1] : null;
        const flowBreak = !!(lastTravel && fold !== 'depth' && fold !== 'flip' && opt.edge === OPPOSITE_EDGE[lastTravel]);

        chosenBoundaries[si] = {
          si,
          bIndex: bnd.bIndex,
          bClass: bnd.bClass,
          PK: bnd.PK,
          isSetPiece: bnd.isSetPiece,
          isEcho: bnd.isEcho,
          source: bnd.source,
          intended: intendedChoice,
          intendedFold: bnd.intendedFold,
          intendedKind: bnd.intendedKind,
          intendedVerb: bnd.intendedVerb,
          fold,
          kind,
          flipAxis: fold === 'flip' ? bnd.flipAxis : null,
          anchorGapF: bnd.anchorGapF,
          edge: opt.edge,
          sign: opt.sign,
          alignMode: opt.alignMode,
          gap: opt.gap,
          gapU: bnd.gapU,
          hg: bnd.hg,
          verb: bnd.intendedVerb, // finalized in camera.mjs if null
          earlyHidePrev2: res.earlyHidePrev2,
          earlyHideReason: res.earlyHideReason ?? null,
          fallbackUsed: kind !== bnd.intendedKind,
          isJump: false,
          flowBreak,
          ladderLog: [...ladderLog],
        };

        const nextLastEdge = new Map(state.lastEdgeUse);
        if (fold !== 'depth' && fold !== 'flip') nextLastEdge.set(opt.edge, bnd.bIndex);
        const nextBalance = { ...state.balance };
        if (opt.axis !== 'none' && opt.axis !== 'depth' && opt.effSign !== 0) {
          nextBalance[opt.axis] = (nextBalance[opt.axis] ?? 0) * 0.85 + opt.effSign;
        }
        const nextTurnHistory = (opt.axis !== 'none' && opt.axis !== 'depth' && opt.effSign !== 0)
          ? [...state.turnHistory, { axis: opt.axis, sign: opt.effSign }]
          : state.turnHistory;

        if (dfs(si + 1, { lastEdgeUse: nextLastEdge, balance: nextBalance, turnHistory: nextTurnHistory })) {
          return true;
        }

        // Backtrack!
        placed[si - 1].surface = prevSurfaceBackup;
        if (fold === 'flip') placed[si - 1].flip_mounted = false;
        backtracks++;
        ladderLog.push({ step: 'backtrack', fold, edge: opt.edge, sign: opt.sign, alignMode: opt.alignMode, failedTest: 'downstream backtrack' });
        if (backtracks >= MAX_BACKTRACKS) break;
      }
      if (backtracks >= MAX_BACKTRACKS) break;
    }

    // 9.7 Step 3: jump fallback, trying G turned 0, 45, -45, 90, -90 degrees about world Y.
    if (si === 1 || backtracks >= MAX_BACKTRACKS) {
      const jumpAngles = [0, 45, -45, 90, -90];
      const prevP = placed[si - 1];
      const currP = plaques[si];
      for (const deg of jumpAngles) {
        const hVec = turn(G, [0, 1, 0], deg);
        const cand = placeFold(prevP, currP, { fold: 'jump', edge: 'right', heading: hVec });
        const res = testPlacement(si, cand, 'jump', 'right', 1, state.turnHistory);
        if (res.ok || deg === jumpAngles.at(-1)) {
          placed[si] = {
            ...cand,
            surface: panelMode === 'off' ? 'open' : 'panel',
            fold: 'jump',
            flip_mounted: false,
          };
          chosenBoundaries[si] = {
            si,
            bIndex: bnd.bIndex,
            bClass: bnd.bClass,
            PK: bnd.PK,
            isSetPiece: bnd.isSetPiece,
            isEcho: bnd.isEcho,
            source: bnd.source,
            intended: intendedChoice ?? { fold: bnd.intendedFold, edge: 'right', sign: 1, alignMode: 'match', gap: bnd.gap, verb: bnd.intendedVerb },
            intendedFold: bnd.intendedFold,
            intendedVerb: bnd.intendedVerb,
            fold: 'jump',
            kind: 'travel',
            edge: 'right',
            sign: 1,
            alignMode: 'centre',
            gap: 0,
            gapU: bnd.gapU,
            hg: bnd.hg,
            verb: 'cut',
            earlyHidePrev2: res.earlyHidePrev2 ?? false,
            earlyHideReason: res.earlyHideReason ?? null,
            fallbackUsed: true,
            isJump: true,
            flowBreak: false,
            ladderLog: [...ladderLog, { step: 'jump', fold: 'jump', angleDeg: deg, failedTest: res.ok ? null : res.failedTest }],
          };
          if (dfs(si + 1, state)) return true;
        }
      }
    }
    return false;
  }

  const initialState = { lastEdgeUse: new Map(), balance: { roll: 0, yaw: 0, pitch: 0 }, turnHistory: [] };
  const solved = dfs(1, initialState);

  // If DFS exhausted backtrack budget before reaching the end, place remaining shots via jump fallback so checks can still evaluate the build.
  if (!solved) {
    for (let si = 1; si < nShots; si++) {
      if (placed[si]) continue;
      const bnd = boundaryInfo[si - 1];
      const prevP = placed[si - 1];
      const currP = plaques[si];
      let chosenJump = null;
      for (const deg of [0, 45, -45, 90, -90]) {
        const hVec = turn(G, [0, 1, 0], deg);
        const cand = placeFold(prevP, currP, { fold: 'jump', edge: 'right', heading: hVec });
        const res = testPlacement(si, cand, 'jump', 'right', 1, []);
        chosenJump = { cand, deg, res };
        if (res.ok) break;
      }
      placed[si] = { ...chosenJump.cand, surface: panelMode === 'off' ? 'open' : 'panel', fold: 'jump', flip_mounted: false };
      chosenBoundaries[si] = {
        si,
        bIndex: bnd.bIndex,
        bClass: bnd.bClass,
        PK: bnd.PK,
        isSetPiece: bnd.isSetPiece,
        isEcho: bnd.isEcho,
        source: bnd.source,
        intended: { fold: bnd.intendedFold, edge: 'right', sign: 1, alignMode: 'match', gap: bnd.gap, verb: bnd.intendedVerb },
        intendedFold: bnd.intendedFold,
        intendedVerb: bnd.intendedVerb,
        fold: 'jump',
        kind: 'travel',
        edge: 'right',
        sign: 1,
        alignMode: 'centre',
        gap: 0,
        gapU: bnd.gapU,
        hg: bnd.hg,
        verb: 'cut',
        earlyHidePrev2: false,
        earlyHideReason: null,
        fallbackUsed: true,
        isJump: true,
        flowBreak: false,
        ladderLog: [{ step: 'jump-after-budget', fold: 'jump', angleDeg: chosenJump.deg, failedTest: chosenJump.res.failedTest ?? null }],
      };
    }
  }

  return {
    placedPlaques: placed,
    boundaries: chosenBoundaries,
    heading: G,
    L,
    backtracks,
    solved,
  };
}
