// Camera framing, verbs, accents, visibility, and reveal: rulebook sections 10, 11, and 14.
import './interp.js';
import { stream, weightedChoice, cooldownFactor } from './rng.mjs';
import { CATALOGUE, PIVOT_EASE, SHARP_EASE, pivotSpec, hingeLine } from './primitives.mjs';

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const add = (a, b) => a.map((x, i) => x + b[i]);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const mul = (a, k) => a.map(x => x * k);
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => {
  const l = Math.hypot(...a);
  return l > 0 ? mul(a, 1 / l) : [0, 0, 0];
};
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export const MIN_HOLD_FRAMES = 8;

export function readingDistance(w, h, fw, fh, vfov = 40, aspect = 16 / 9) {
  const tv = Math.tan((vfov * Math.PI) / 360);
  const th = tv * aspect;
  return Math.max(w / (fw * 2 * th), h / (fh * 2 * tv));
}

export function verbDurations(bpm) {
  const beat = 60 / bpm;
  return {
    cut: 0,
    whip: clamp(0.5 * beat, 0.20, 0.30),
    sweep: clamp(0.75 * beat, 0.36, 0.50),
    glide: clamp(beat, 0.50, 0.70),
  };
}

export function posterDistance(anchor, cluster, tier, vfov = 40) {
  const fills = { XL: [0.84, 0.60], L: [0.78, 0.54], M: [0.70, 0.46], S: [0.56, 0.34] };
  if (!fills[tier]) throw Error(`Unknown tier: ${tier}`);
  return Math.max(
    readingDistance(anchor.w, anchor.h, ...fills[tier], vfov),
    readingDistance(cluster.w, cluster.h, 0.92, 0.86, vfov)
  );
}

export function stackDistance(group, vfov = 40) {
  return readingDistance(group.w, group.h, 0.86, 0.74, vfov);
}

export function maxStill(bpm) {
  return clamp((2 * 60) / bpm, 0.9, 1.4);
}

export function moveFloor(fold) {
  if (fold === 'flip') return 0.5;
  if (fold === 'depth') return 0.33;
  if (['roll', 'corner-in', 'corner-out', 'tip-in', 'tip-out'].includes(fold)) return 0.30;
  return 0.20;
}

export function eligibleDuration(verb, available, fold, bpm) {
  if (verb === 'cut') return 0;
  const duration = verbDurations(bpm)[verb];
  const floor = moveFloor(fold);
  if (duration === undefined) throw Error(`Unknown verb: ${verb}`);
  const actual = Math.min(duration, available);
  return available >= 0.8 * duration && actual >= floor ? actual : null;
}

export function easeFor(verb, fold, easeMode = 'asymmetric') {
  const sharp = verb === 'whip' || fold === 'depth';
  if (easeMode === 'symmetric') return sharp ? { p: 5 } : { p: 3 };
  return sharp ? { a: 2, b: 4, x0: 0.34 } : { a: 2, b: 3, x0: 0.40 };
}

// Compute local landing framing for a single cluster poster (10.3), with neighbour-aware refinement
// to prevent focus-dominance clashes (13.1.3) and awkward same-row partial-word edge cut-offs.
function makePosterLanding(shot, plaque, clusterIdx, vfov, fps, wordsMode = 'pop') {
  const cObj = shot.clusters[clusterIdx];
  const cb = plaque.clusterBoxes[clusterIdx];
  const anchor = cb.anchor;
  const turn = anchor.turn ?? 0;
  const tv = Math.tan((vfov * Math.PI) / 360);
  const th = tv * (16 / 9);

  // Express cluster box and anchor box in the anchor's upright coordinate frame.
  let cW = cb.w, cH = cb.h;
  let aW = anchor.boxW, aH = anchor.boxH;
  if (turn === 90 || turn === -90) {
    cW = cb.h; cH = cb.w;
  }
  const baseDist = posterDistance({ w: aW, h: aH }, { w: cW, h: cH }, cObj.tier, vfov);

  // Cluster centre in plaque local coords, shifted least amount to keep anchor in 4% safe frame ([-0.92, 0.92]).
  const toAnchorFrame = (x, y) => {
    if (turn === 90) return [y, -x];
    if (turn === -90) return [-y, x];
    return [x, y];
  };
  const fromAnchorFrame = (u, v) => {
    if (turn === 90) return [-v, u];
    if (turn === -90) return [v, -u];
    return [u, v];
  };

  const [cu, cv] = toAnchorFrame(cb.cx, cb.cy);
  const [au, av] = toAnchorFrame(anchor.x, anchor.y);
  const clampTarget = (tuIn, tvIn, d, anchorMargin = 0.915, clusterMargin = 0.96) => {
    let tu = tuIn, tvC = tvIn;
    const cHalfW = clusterMargin * d * th;
    const cHalfH = clusterMargin * d * tv;
    const cMinU = cu + cW / 2 - cHalfW, cMaxU = cu - cW / 2 + cHalfW;
    const cMinV = cv + cH / 2 - cHalfH, cMaxV = cv - cH / 2 + cHalfH;
    if (cMinU <= cMaxU) tu = clamp(tu, cMinU, cMaxU);
    if (cMinV <= cMaxV) tvC = clamp(tvC, cMinV, cMaxV);
    const aHalfW = anchorMargin * d * th;
    const aHalfH = anchorMargin * d * tv;
    const aMinU = au + aW / 2 - aHalfW, aMaxU = au - aW / 2 + aHalfW;
    const aMinV = av + aH / 2 - aHalfH, aMaxV = av - aH / 2 + aHalfH;
    if (aMinU <= aMaxU) tu = clamp(tu, aMinU, aMaxU);
    if (aMinV <= aMaxV) tvC = clamp(tvC, aMinV, aMaxV);
    return [tu, tvC];
  };

  let [tu, tvCoord] = clampTarget(cu, cv, baseDist, 0.92, 1.0);
  let dist = baseDist;

  // Visible same-plaque neighbour words at this landing frame.
  const neighbours = [];
  for (let ci = 0; ci < plaque.clusterBoxes.length; ci++) {
    if (ci === clusterIdx) continue;
    if (wordsMode === 'pop' && ci > clusterIdx) continue;
    for (const nw of plaque.clusterBoxes[ci].words) {
      const [nu, nv] = toAnchorFrame(nw.x, nw.y);
      const nW = (turn === 90 || turn === -90) ? nw.h : nw.w;
      const nH = (turn === 90 || turn === -90) ? nw.w : nw.h;
      const sameRow = (nw.turn ?? 0) === turn
        && (Math.min(nv + nH / 2, av + aH / 2) - Math.max(nv - nH / 2, av - aH / 2)) > 0.35 * Math.min(nH, aH);
      neighbours.push({ nu, nv, nW, nH, sameRow });
    }
  }

  if (neighbours.length > 0) {
    const minRiderCap = cObj.riders.length ? Math.min(...cb.words.filter(w => w.role === 'rider').map(w => w.cap)) : Infinity;
    const maxDistForLegibility = Math.min(
      (anchor.cap * 720) / (2 * 66 * tv),
      Number.isFinite(minRiderCap) ? (minRiderCap * 720) / (2 * 30.5 * tv) : Infinity
    );
    const minTightDist = Math.max(
      readingDistance(aW, aH, 0.88, 0.76, vfov),
      readingDistance(cW, cH, 0.92, 0.86, vfov)
    );

    const evalCandidate = (d, tU, tV) => {
      const fw = d * th, fh = d * tv;
      // Verify hard safe-frame bounds for anchor and cluster.
      const ax0 = (au - aW / 2 - tU) / fw, ax1 = (au + aW / 2 - tU) / fw;
      const ay0 = (av - aH / 2 - tV) / fh, ay1 = (av + aH / 2 - tV) / fh;
      if (ax0 < -0.918 || ax1 > 0.918 || ay0 < -0.918 || ay1 > 0.918) return null;
      const cx0 = (cu - cW / 2 - tU) / fw, cx1 = (cu + cW / 2 - tU) / fw;
      const cy0 = (cv - cH / 2 - tV) / fh, cy1 = (cv + cH / 2 - tV) / fh;
      if (cx0 < -0.97 || cx1 > 0.97 || cy0 < -0.97 || cy1 > 0.97) return null;
      if (d > maxDistForLegibility) return null;

      const As = (ax1 - ax0) * (ay1 - ay0);
      let penalty = 0;
      let hasIssue = false;
      for (const n of neighbours) {
        const nx0 = (n.nu - n.nW / 2 - tU) / fw, nx1 = (n.nu + n.nW / 2 - tU) / fw;
        const ny0 = (n.nv - n.nH / 2 - tV) / fh, ny1 = (n.nv + n.nH / 2 - tV) / fh;
        const ix0 = Math.max(-1, nx0), ix1 = Math.min(1, nx1);
        const iy0 = Math.max(-1, ny0), iy1 = Math.min(1, ny1);
        if (ix1 <= ix0 || iy1 <= iy0) continue;
        const fullA = (nx1 - nx0) * (ny1 - ny0);
        const inA = (ix1 - ix0) * (iy1 - iy0);
        const share = fullA > 1e-9 ? inA / fullA : 0;

        // 13.1.3 focus dominance check (with small safety margin).
        if (share >= 0.49) {
          if (inA > As / 1.62) { penalty += 1000 + 200 * (inA - As / 1.62); hasIssue = true; }
        } else {
          if (inA > As * 0.98) { penalty += 1000; hasIssue = true; }
          const mx0 = Math.max(-0.51, ix0), mx1 = Math.min(0.51, ix1);
          const my0 = Math.max(-0.51, iy0), my1 = Math.min(0.51, iy1);
          if (mx1 > mx0 && my1 > my0) { penalty += 1000 + 500 * (mx1 - mx0) * (my1 - my0); hasIssue = true; }
        }

        // Awkward same-row horizontal cut-off ("UR RINGS", "OOM FOR ONE!").
        if (n.sameRow && share > 0.14 && share < 0.99) {
          penalty += 120 * Math.sin(Math.PI * share);
          hasIssue = true;
        } else if (!n.sameRow && share >= 0.48 && share < 0.96 && inA > As / 2.2) {
          penalty += 25;
          hasIssue = true;
        }
      }
      const drift = Math.abs(Math.log(d / baseDist)) * 2 + Math.hypot((tU - cu) / fw, (tV - cv) / fh) * 14;
      return { penalty, total: penalty + drift, hasIssue };
    };

    const baseEval = evalCandidate(baseDist, tu, tvCoord);
    if (baseEval && baseEval.hasIssue) {
      let best = { d: baseDist, tu, tv: tvCoord, total: baseEval.total };
      const distMults = [1.0, 0.90, 0.82, 0.74, 0.66, 0.58, 1.08];
      const uShifts = [0, 0.08, -0.08, 0.16, -0.16, 0.24, -0.24, 0.34, -0.34];
      const vShifts = [0, 0.08, -0.08, 0.16, -0.16, 0.24, -0.24];
      for (const dm of distMults) {
        const d = Math.max(minTightDist, baseDist * dm);
        const fw = d * th, fh = d * tv;
        for (const us of uShifts) {
          for (const vs of vShifts) {
            const [cTu, cTv] = clampTarget(cu + us * fw, cv + vs * fh, d, 0.915, 0.96);
            const ev = evalCandidate(d, cTu, cTv);
            if (ev && ev.total < best.total - 1e-6) {
              best = { d, tu: cTu, tv: cTv, total: ev.total };
            }
          }
        }
      }
      dist = best.d;
      tu = best.tu;
      tvCoord = best.tv;
    }
  }

  const [lx, ly] = fromAnchorFrame(tu, tvCoord);

  const onsetFrame = Math.round(cObj.anchor.t * fps);
  return {
    kind: 'poster',
    shotIndex: shot.index,
    clusterIndices: [clusterIdx],
    clusters: [cObj],
    lx, ly, turn, dist,
    onsetT: cObj.anchor.t,
    onsetFrame,
    landingFrame: Math.max(0, onsetFrame - 1),
    lastAnchorT: cObj.anchor.t,
    lastAnchorFrame: onsetFrame,
    anchorWordId: anchor.id,
    groupWords: cb.words,
    hasRiders: cObj.riders.length > 0,
    firstRiderT: cObj.riders.length ? cObj.riders[0].t : null,
  };
}

// Compute local landing framings for a shot's landing groups, applying 10.4 stack rules (tighten / split).
export function computeShotLandings(shot, plaque, vfov = 40, fps = 30, { wordsMode = 'pop' } = {}) {
  const tv = Math.tan((vfov * Math.PI) / 360);
  const th = tv * (16 / 9);
  const landings = [];
  const notes = [];

  const processGroup = (clusterIndices, isRun = false) => {
    if (isRun && clusterIndices.length > 1) {
      // Spec 32.3: a repeat run is one landing group held in one still framing, provided the smallest word
      // passes the 65 px floor; otherwise it is framed word by word. A run whose words face different ways is
      // also framed word by word, because check 13.1.1 needs each sung anchor upright within 1 degree.
      const runTurns = new Set(clusterIndices.map(ci => plaque.clusterBoxes[ci].anchor.turn ?? 0));
      if (runTurns.size > 1) {
        notes.push({ reason: `repeat run framed word by word: mixed orientations (32.3 fallback)` });
        for (const ci of clusterIndices) landings.push(makePosterLanding(shot, plaque, ci, vfov, fps, wordsMode));
        return;
      }
      const runTurn = [...runTurns][0];
      // 13.1.5 counts word ink only: the first token alone must cover at least 3.5% of the frame at the run framing.
      const firstAnchor = plaque.clusterBoxes[clusterIndices[0]].anchor;
      const groupWords = clusterIndices.flatMap(ci => plaque.clusterBoxes[ci].words);
      const x0 = Math.min(...groupWords.map(w => w.x - w.w / 2)), x1 = Math.max(...groupWords.map(w => w.x + w.w / 2));
      const y0 = Math.min(...groupWords.map(w => w.y - w.h / 2)), y1 = Math.max(...groupWords.map(w => w.y + w.h / 2));
      // Runs take the tight stack framing (0.94 x 0.86 of the frame) so the first token alone carries enough ink.
      let dist = readingDistance(x1 - x0, y1 - y0, 0.94, 0.86, vfov);
      const minCap = Math.min(...clusterIndices.map(ci => plaque.clusterBoxes[ci].anchor.cap));
      const firstShare = ((firstAnchor.boxW ?? firstAnchor.w) * (firstAnchor.boxH ?? firstAnchor.h)) / ((2 * dist * tv) * (2 * dist * tv * 16 / 9));
      if ((minCap / (2 * dist * tv)) * 720 < 65) {
        notes.push({ reason: `repeat run framed word by word: smallest cap under 65 px (32.3)` });
        for (const ci of clusterIndices) landings.push(makePosterLanding(shot, plaque, ci, vfov, fps, wordsMode));
        return;
      }
      const firstC = shot.clusters[clusterIndices[0]], lastC = shot.clusters[clusterIndices.at(-1)];
      const onsetFrame = Math.round(firstC.anchor.t * fps);
      landings.push({
        kind: 'stack', run: true, shotIndex: shot.index, clusterIndices: [...clusterIndices],
        clusters: clusterIndices.map(ci => shot.clusters[ci]),
        lx: (x0 + x1) / 2, ly: (y0 + y1) / 2, turn: runTurn, dist,
        onsetT: firstC.anchor.t, onsetFrame, landingFrame: Math.max(0, onsetFrame - 1),
        lastAnchorT: lastC.anchor.t, lastAnchorFrame: Math.round(lastC.anchor.t * fps),
        anchorWordId: plaque.clusterBoxes[clusterIndices[0]].anchor.id, groupWords,
        hasRiders: firstC.riders.length > 0, firstRiderT: firstC.riders.length ? firstC.riders[0].t : null,
      });
      return;
    }
    if (clusterIndices.length === 1) {
      landings.push(makePosterLanding(shot, plaque, clusterIndices[0], vfov, fps, wordsMode));
      return;
    }
    // Check orientation consistency: a stack shares one camera up; split if orientations differ.
    const turns = clusterIndices.map(ci => plaque.clusterBoxes[ci].anchor.turn ?? 0);
    if (new Set(turns).size > 1) {
      notes.push({ reason: `stack split due to differing orientations in shot ${shot.index + 1}` });
      for (const ci of clusterIndices) landings.push(makePosterLanding(shot, plaque, ci, vfov, fps, wordsMode));
      return;
    }
    const turn = turns[0];
    const groupWords = clusterIndices.flatMap(ci => plaque.clusterBoxes[ci].words);
    const x0 = Math.min(...groupWords.map(w => w.x - w.w / 2));
    const x1 = Math.max(...groupWords.map(w => w.x + w.w / 2));
    const y0 = Math.min(...groupWords.map(w => w.y - w.h / 2));
    const y1 = Math.max(...groupWords.map(w => w.y + w.h / 2));
    const rawW = x1 - x0, rawH = y1 - y0;
    const gW = (turn === 90 || turn === -90) ? rawH : rawW;
    const gH = (turn === 90 || turn === -90) ? rawW : rawH;
    const lx = (x0 + x1) / 2, ly = (y0 + y1) / 2;

    let dist = stackDistance({ w: gW, h: gH }, vfov);
    const anchors = clusterIndices.map(ci => plaque.clusterBoxes[ci].anchor);
    const minCap = Math.min(...anchors.map(a => a.cap));
    const capPxAt = d => (minCap / (2 * d * tv)) * 720;

    // Spec 48.1 counts word ink only, so the first word of a stack must carry 3.2% of the frame on its own.
    const firstA = anchors[0];
    const firstShareAt = d => ((firstA.boxW ?? firstA.w) * (firstA.boxH ?? firstA.h)) / ((2 * d * tv) * (2 * d * th));
    if (capPxAt(dist) < 65 || firstShareAt(dist) < 0.032) {
      dist = readingDistance(gW, gH, 0.94, 0.86, vfov);
      notes.push({ reason: `stack tightened to 0.94/0.86 for shot ${shot.index + 1}${firstShareAt(dist) < 0.032 ? ' (first word still under 3.2% of frame)' : ''}` });
    }
    if (capPxAt(dist) < 65) {
      // Split off last cluster to its own landing (10.4), provided there is room.
      const lastCi = clusterIndices.at(-1);
      const prevCi = clusterIndices.at(-2);
      const gapFrames = Math.round(shot.clusters[lastCi].anchor.t * fps) - Math.round(shot.clusters[prevCi].anchor.t * fps);
      if (gapFrames >= MIN_HOLD_FRAMES) {
        notes.push({ reason: `stack split: smallest anchor ${capPxAt(dist).toFixed(1)}px < 65px (10.4)` });
        processGroup(clusterIndices.slice(0, -1));
        processGroup([lastCi]);
        return;
      }
      notes.push({ reason: `stack anchor ${capPxAt(dist).toFixed(1)}px < 65px but gap ${gapFrames}f < ${MIN_HOLD_FRAMES}f; kept tightened` });
    }

    // 10.4 second check: each sung anchor at least 30% width or 22% height, and largest (or only one yet on).
    const frameW = 2 * dist * th, frameH = 2 * dist * tv;
    let floorFail = false;
    for (let k = 0; k < clusterIndices.length; k++) {
      const a = anchors[k];
      const wShare = a.boxW / frameW;
      const hShare = a.boxH / frameH;
      if (wShare < 0.30 && hShare < 0.22) floorFail = true;
      if (wordsMode === 'preset') {
        const maxArea = Math.max(...anchors.map(x => x.boxW * x.boxH));
        if (a.boxW * a.boxH < maxArea - 1e-6 && k > 0) floorFail = true;
      }
    }
    if (floorFail) {
      // Only split if every adjacent pair in the group has >= MIN_HOLD_FRAMES between them.
      let canSplit = true;
      for (let k = 1; k < clusterIndices.length; k++) {
        const gf = Math.round(shot.clusters[clusterIndices[k]].anchor.t * fps) - Math.round(shot.clusters[clusterIndices[k - 1]].anchor.t * fps);
        if (gf < MIN_HOLD_FRAMES) canSplit = false;
      }
      if (canSplit) {
        notes.push({ reason: `stack split to posters: 10.4 30%/22% or largest-word floor` });
        for (const ci of clusterIndices) landings.push(makePosterLanding(shot, plaque, ci, vfov, fps, wordsMode));
        return;
      }
    }

    const firstC = shot.clusters[clusterIndices[0]];
    const lastC = shot.clusters[clusterIndices.at(-1)];
    const onsetFrame = Math.round(firstC.anchor.t * fps);
    landings.push({
      kind: 'stack',
      shotIndex: shot.index,
      clusterIndices: [...clusterIndices],
      clusters: clusterIndices.map(ci => shot.clusters[ci]),
      lx, ly, turn, dist,
      onsetT: firstC.anchor.t,
      onsetFrame,
      landingFrame: Math.max(0, onsetFrame - 1),
      lastAnchorT: lastC.anchor.t,
      lastAnchorFrame: Math.round(lastC.anchor.t * fps),
      anchorWordId: anchors[0].id,
      groupWords,
      hasRiders: firstC.riders.length > 0,
      firstRiderT: firstC.riders.length ? firstC.riders[0].t : null,
    });
  };

  for (const grp of shot.groups) {
    const idxs = grp.map(c => shot.clusters.indexOf(c));
    processGroup(idxs, !!grp.run);
  }
  return { landings, notes };
}

export function localPoseToWorld(plaque, { lx, ly, turn = 0, dist }) {
  const target = add(plaque.C, add(mul(plaque.R, lx), mul(plaque.U, ly)));
  let R = plaque.R, U = plaque.U, N = plaque.N;
  if (turn === 90) { R = plaque.U; U = mul(plaque.R, -1); }
  else if (turn === -90) { R = mul(plaque.U, -1); U = plaque.R; }
  const position = add(target, mul(N, dist));
  return { target, R, U, N, dist, position };
}

export function firstLandingDistance(shot, plaque, vfov = 40, fps = 30, opts = {}) {
  const { landings } = computeShotLandings(shot, plaque, vfov, fps, opts);
  return landings[0].dist;
}

// Compute a pull-back accent pose (whole plaque in 0.86 / 0.74) in world coords.
export function pullAccentWorldPose(plaque, vfov = 40) {
  const dist = readingDistance(plaque.w, plaque.h, 0.86, 0.74, vfov);
  return localPoseToWorld(plaque, { lx: 0, ly: 0, turn: 0, dist });
}

// Verb weights table (10.5) and family verb multipliers (9.8).
const VERB_BASE = {
  B1: { cut: 35, whip: 40, sweep: 20, glide: 5 },
  B2: { cut: 8, whip: 42, sweep: 40, glide: 10 },
  B3: { cut: 8, whip: 34, sweep: 46, glide: 12 },
  B4: { cut: 20, whip: 25, sweep: 35, glide: 20 },
};

const FAMILY_VERBS = {
  'Corner Room': { cut: 0.8, whip: 1.0, sweep: 1.2, glide: 1.0 },
  'Tumbling Run': { cut: 0.7, whip: 1.3, sweep: 1.1, glide: 0.7 },
  'Corridor Rush': { cut: 1.0, whip: 1.2, sweep: 0.8, glide: 1.2 },
  'Poster Stack': { cut: 1.8, whip: 1.3, sweep: 0.7, glide: 0.5 },
};

function verbEnergyFactor(verb, e) {
  if (verb === 'cut') return 0.5 + 1.0 * e;
  if (verb === 'whip') return 0.6 + 0.8 * e;
  if (verb === 'sweep') return 1.0;
  return 1.5 - 1.0 * e;
}

export function drawVerb({
  bClass,
  isSetPiece,
  fold,
  available,
  bpm,
  energyPct,
  family = 'Corner Room',
  lastVerbUse,
  moveCounter,
  rng,
  leadNeeded = 0,
  fps = 30,
  forcedVerb = null,
}) {
  const col = isSetPiece ? 'B4' : (VERB_BASE[bClass] ? bClass : 'B2');
  const fam = FAMILY_VERBS[family] ?? FAMILY_VERBS['Corner Room'];
  const durs = verbDurations(bpm);
  const floorFrames = Math.ceil(moveFloor(fold) * fps - 1e-9);
  const availFrames = Math.floor(available * fps + 1e-6);

  const checkVerb = v => {
    if (v === 'cut') {
      // Depth is a push-through; prefer not cutting on depth if moving is possible, still eligible if needed.
      return { ok: true, durFrames: 0, durSec: 0 };
    }
    const dur = durs[v];
    const actual = Math.min(dur, available);
    const durFrames = Math.min(availFrames, Math.round(actual * fps));
    const ok = available >= 0.8 * dur && durFrames >= floorFrames && durFrames >= Math.ceil(0.20 * fps);
    return { ok, durFrames, durSec: durFrames / fps };
  };

  if (forcedVerb) {
    const res = checkVerb(forcedVerb);
    if (res.ok) return { verb: forcedVerb, ...res, forced: true, adjusted: false };
    // If a forced moving verb is too short for the fold's rotation floor (e.g., echo flip with sweep < 0.50s),
    // promote to the shortest eligible moving verb rather than cutting.
    if (forcedVerb !== 'cut') {
      for (const alt of ['whip', 'sweep', 'glide']) {
        const altRes = checkVerb(alt);
        if (altRes.ok) {
          return {
            verb: alt,
            ...altRes,
            forced: false,
            adjusted: true,
            reason: `forced verb ${forcedVerb} ineligible for ${fold}; promoted to ${alt}`,
          };
        }
      }
    }
  }

  const verbs = ['cut', 'whip', 'sweep', 'glide'];
  const leadChecks = verbs.map(v => ({ v, res: checkVerb(v) }));
  const shortestLeadVerb = leadNeeded > 0
    ? leadChecks.find(x => x.v !== 'cut' && x.res.ok && x.res.durSec >= leadNeeded - 1e-6)?.v
    : null;
  const options = leadChecks.map(({ v, res }) => {
    let w = VERB_BASE[col][v] * fam[v] * verbEnergyFactor(v, energyPct) * cooldownFactor(lastVerbUse.get(v), moveCounter, 1.5);
    // 10.5.3 Pickup lead: prefer the briskest duration >= leadNeeded so camera swings cleanly while riders are sung.
    if (leadNeeded > 0 && v !== 'cut' && res.ok && res.durSec >= leadNeeded - 1e-6) {
      if (v === shortestLeadVerb || col !== 'B1') w *= 2.5;
    }
    return { value: v, base: VERB_BASE[col][v], weight: res.ok ? w : 0, valid: res.ok, res };
  });

  const anyMoving = options.some(o => o.value !== 'cut' && o.valid);
  if (!anyMoving) {
    return { verb: 'cut', ok: true, durFrames: 0, durSec: 0, forced: false, adjusted: true, reason: 'no moving verb eligible; fell back to cut (10.5.1)' };
  }
  const picked = weightedChoice(options, rng, 'cut');
  const found = options.find(o => o.value === picked);
  return {
    verb: picked,
    ...found.res,
    forced: false,
    adjusted: forcedVerb != null && picked !== forcedVerb,
    reason: forcedVerb != null && picked !== forcedVerb ? `forced verb ${forcedVerb} ineligible; drew ${picked}` : null,
  };
}

// Ray vs axis-aligned slab box (since all stage 1 slabs are axis-aligned per 8.9).
function raySlabHit(origin, dir, box, tMin = 1e-4, tMax = 1 - 1e-4) {
  let lo = tMin, hi = tMax;
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

function slabAABB(p) {
  const ext = [0, 1, 2].map(i => (Math.abs(p.R[i]) * p.w + Math.abs(p.U[i]) * p.h + Math.abs(p.N[i]) * p.thickness) / 2);
  const ctr = sub(p.C, mul(p.N, p.thickness / 2));
  return { min: ctr.map((x, i) => x - ext[i]), max: ctr.map((x, i) => x + ext[i]) };
}

function slabCorners(p) {
  const pts = [];
  for (const sx of [-0.5, 0.5]) {
    for (const sy of [-0.5, 0.5]) {
      for (const sz of [0, -1]) {
        pts.push(add(p.C, add(mul(p.R, sx * p.w), add(mul(p.U, sy * p.h), mul(p.N, sz * p.thickness)))));
      }
    }
  }
  return pts;
}

// Check if a plaque's projected 8 slab corners overlap the screen [-1, 1]^2.
function plaqueOnScreen(p, pose, vfov = 40) {
  const I = globalThis.KT_INTERP;
  const pts = slabCorners(p);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, front = 0, behind = 0;
  for (const pt of pts) {
    const q = I.project(pt, pose, vfov);
    if (!q) { behind++; continue; }
    front++;
    if (q.x < x0) x0 = q.x;
    if (q.x > x1) x1 = q.x;
    if (q.y < y0) y0 = q.y;
    if (q.y > y1) y1 = q.y;
  }
  if (!front) return false;
  if (behind > 0) return true; // straddles camera plane
  return x1 >= -1 && x0 <= 1 && y1 >= -1 && y0 <= 1;
}

// Compute reveal pose, ranking all 12 directions in fixed order (section 14.1, 14.3, 14.5).
export function planRevealPose(placedPlaques, vfov = 40) {
  const tv = Math.tan((vfov * Math.PI) / 360);
  const th = tv * (16 / 9);
  const allCorners = placedPlaques.flatMap(slabCorners);
  const minP = [0, 1, 2].map(i => Math.min(...allCorners.map(c => c[i])));
  const maxP = [0, 1, 2].map(i => Math.max(...allCorners.map(c => c[i])));
  const trailCenter = [0, 1, 2].map(i => (minP[i] + maxP[i]) / 2);

  const p0 = placedPlaques[0];
  const localToWorldDir = ([a, b, c]) => norm(add(mul(p0.R, a), add(mul(p0.U, b), mul(p0.N, c))));

  // 14.1 Fixed order: 8 diagonals, then 4 shallow front views.
  const rawDirs = [
    { name: 'diag (+1,+1,+1)', v: [1, 1, 1] },
    { name: 'diag (-1,+1,+1)', v: [-1, 1, 1] },
    { name: 'diag (+1,-1,+1)', v: [1, -1, 1] },
    { name: 'diag (-1,-1,+1)', v: [-1, -1, 1] },
    { name: 'diag (+1,+1,-1)', v: [1, 1, -1] },
    { name: 'diag (-1,+1,-1)', v: [-1, 1, -1] },
    { name: 'diag (+1,-1,-1)', v: [1, -1, -1] },
    { name: 'diag (-1,-1,-1)', v: [-1, -1, -1] },
    { name: 'front (+0.35,+0.35,0.866)', v: [0.35, 0.35, 0.866] },
    { name: 'front (-0.35,+0.35,0.866)', v: [-0.35, 0.35, 0.866] },
    { name: 'front (+0.35,-0.35,0.866)', v: [0.35, -0.35, 0.866] },
    { name: 'front (-0.35,-0.35,0.866)', v: [-0.35, -0.35, 0.866] },
  ];

  const aabbs = placedPlaques.map(slabAABB);
  const totalArea = placedPlaques.reduce((s, p) => s + p.w * p.h, 0);
  const evaluated = [];

  for (let di = 0; di < rawDirs.length; di++) {
    const dirSpec = rawDirs[di];
    const N = localToWorldDir(dirSpec.v);
    const worldUp = [0, 1, 0];
    const R = norm(cross(worldUp, N));
    const U = cross(N, R);

    // Iteratively center the projected 2D bounding box and solve exact fitted distance inside [-0.86, 0.86] (14.3).
    const I = globalThis.KT_INTERP;
    let target = [...trailCenter];
    let dist = 100;
    for (let iter = 0; iter < 6; iter++) {
      dist = 100;
      for (const c of allCorners) {
        const rel = sub(c, target);
        const dx = dot(rel, R);
        const dy = dot(rel, U);
        const dz = dot(rel, N);
        const req = dz + Math.max(Math.abs(dx) / (0.86 * th), Math.abs(dy) / (0.86 * tv));
        if (req > dist) dist = req;
      }
      const probePos = add(target, mul(N, dist));
      let px0 = Infinity, px1 = -Infinity, py0 = Infinity, py1 = -Infinity;
      for (const c of allCorners) {
        const q = I.project(c, { position: probePos, R, U, N }, vfov);
        if (q) {
          if (q.x < px0) px0 = q.x;
          if (q.x > px1) px1 = q.x;
          if (q.y < py0) py0 = q.y;
          if (q.y > py1) py1 = q.y;
        }
      }
      if (Number.isFinite(px0) && Number.isFinite(px1)) {
        const cx = (px0 + px1) / 2;
        const cy = (py0 + py1) / 2;
        target = add(target, add(mul(R, cx * dist * th * 0.7), mul(U, cy * dist * tv * 0.7)));
      }
    }
    dist = 100;
    for (const c of allCorners) {
      const rel = sub(c, target);
      const dx = dot(rel, R);
      const dy = dot(rel, U);
      const dz = dot(rel, N);
      const req = dz + Math.max(Math.abs(dx) / (0.86 * th), Math.abs(dy) / (0.86 * tv));
      if (req > dist) dist = req;
    }
    dist *= 1.002; // tiny guard against float boundary
    const position = add(target, mul(N, dist));

    // Area-weighted facing, front-facing readability, and uprightness (penalizes upside-down and mostly-back-facing views).
    let facingSum = 0, frontFacingSum = 0, uprightSum = 0, upsideDownArea = 0, backArea = 0;
    for (const p of placedPlaques) {
      const area = p.w * p.h;
      const absN = Math.abs(dot(N, p.N));
      const isFront = dot(p.N, sub(position, p.C)) >= 0;
      const upDot = dot(p.U, U);
      facingSum += area * absN;
      frontFacingSum += area * absN * (isFront ? 1.0 : 0.65);
      uprightSum += area * Math.max(0, upDot);
      if (upDot < -0.15) upsideDownArea += area;
      if (!isFront) backArea += area;
    }
    const denom = Math.max(1, totalArea);
    const facing = facingSum / denom;
    const frontFacing = frontFacingSum / denom;
    const uprightScore = uprightSum / denom;
    const upsideDownShare = upsideDownArea / denom;
    const backShare = backArea / denom;

    // Occlusion: share of plaques more than half covered by nearer plaques (5x5 grid per plaque face).
    let coveredCount = 0;
    const grid = [-0.4, -0.2, 0, 0.2, 0.4];
    for (let pi = 0; pi < placedPlaques.length; pi++) {
      const p = placedPlaques[pi];
      // Sample the side of the plaque facing the camera (front if dot(p.N, N) >= 0, else back).
      const zFace = dot(p.N, N) >= 0 ? 0 : -p.thickness;
      let hitPts = 0, totalPts = 0;
      for (const gx of grid) {
        for (const gy of grid) {
          totalPts++;
          const pt = add(p.C, add(mul(p.R, gx * p.w), add(mul(p.U, gy * p.h), mul(p.N, zFace))));
          const ray = sub(pt, position);
          let blocked = false;
          for (let oi = 0; oi < placedPlaques.length; oi++) {
            if (oi === pi) continue;
            if (raySlabHit(position, ray, aabbs[oi], 1e-4, 1 - 1e-4)) { blocked = true; break; }
          }
          if (blocked) hitPts++;
        }
      }
      if (hitPts / totalPts > 0.5) coveredCount++;
    }
    const coverShare = coveredCount / Math.max(1, placedPlaques.length);
    const metric = (dist * (1 + 2 * coverShare) * (1 + 2.5 * upsideDownShare) * (1 + 0.6 * backShare)) / (0.5 + 0.35 * frontFacing + 0.15 * uprightScore);
    const passes = coverShare <= 0.25 + 1e-9;

    evaluated.push({
      index: di,
      name: dirSpec.name,
      pose: { target, R, U, N, dist, position },
      dist,
      coverShare,
      coveredCount,
      facing,
      upsideDownShare,
      uprightScore,
      metric,
      passes,
      refuseReason: passes ? null : `coverShare ${(coverShare * 100).toFixed(1)}% > 25%`,
    });
  }

  const ranked = [...evaluated].sort((a, b) => a.metric - b.metric || a.index - b.index);
  const chosen = ranked.find(r => r.passes) ?? ranked[0];
  const refused = ranked.filter(r => r !== chosen && r.metric <= chosen.metric).map(r => ({
    name: r.name,
    metric: r.metric,
    coverShare: r.coverShare,
    reason: r.refuseReason ?? 'higher metric',
  }));
  return { chosen, ranked, refused, flagged: !chosen.passes };
}

// Plan full camera keys, accents, punch-ins, visibility, and reveal (sections 10, 11, 14).
export function planCameraAndVisibility({
  shots,
  placedPlaques,
  trailBoundaries,
  map,
  seed,
  vfov = 40,
  fps = 30,
  clipEnd = 21.971,
  revealUntil = 24.5,
  family = 'Corner Room',
  wordsMode = 'pop',
  easeMode = 'asymmetric',
  panelMode = 'on',
  pinnedShots = null,
  preservePinnedTiming = false,
  jointPlan = null,
}) {
  const I = globalThis.KT_INTERP;
  const bpm = map.tempo_bpm;
  // Word-motion windows (joints), used to keep accents off entrances (spec 15.3) and to extend landing activity.
  const motionWindows = jointPlan ? jointPlan.joints.filter(j => j.f1 > j.f0).map(j => [j.f0, j.f1]) : [];
  const jointSettle = new Map();
  if (jointPlan) for (const [id, bw] of jointPlan.byWord) if (bw.joint) jointSettle.set(id, bw.joint.f1 ?? bw.on);
  const beatTimes = (map.beats ?? []).map(b => (typeof b === 'number' ? b : b.t)).sort((a, b) => a - b);
  const maxStillSec = maxStill(bpm);
  const durs = verbDurations(bpm);
  const totalFrames = Math.round(revealUntil * fps);
  const th = Math.tan((vfov * Math.PI) / 360) * (16 / 9);
  const lastVerbUse = new Map();
  let moveCounter = 0;
  let accentCounter = 0;
  const lastAccentUse = new Map();

  // Compute shot energy percentiles for verb energy factors.
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

  // 1. Compute landing groups and world poses per shot.
  const shotLandings = [];
  const shotCameraLogs = shots.map(() => ({
    landingFrames: [],
    accentFrames: [],
    changes: [],
    paceFirstDrawOk: true,
    entryVerb: null,
    entryVerbIntended: null,
  }));

  for (let si = 0; si < shots.length; si++) {
    if (jointPlan) {
      // Landings come from the joint planner (staging and repeat-run framing already applied, spec 27.3, 32.3).
      const landings = jointPlan.shotLandings[si];
      for (const l of landings) {
        if (l.arrivalFrame != null && l.arrivalFrame !== l.landingFrame) {
          shotCameraLogs[si].changes.push({ stage: 'camera', reason: `attack entrance: landing frame ${l.landingFrame} -> ${l.arrivalFrame} (14.2)` });
          l.landingFrame = l.arrivalFrame;
        }
      }
      shotLandings.push(landings);
      continue;
    }
    const { landings, notes } = computeShotLandings(shots[si], placedPlaques[si], vfov, fps, { wordsMode });
    for (const n of notes) shotCameraLogs[si].changes.push({ stage: 'camera', reason: n.reason });
    for (const l of landings) {
      l.world = localPoseToWorld(placedPlaques[si], l);
    }
    shotLandings.push(landings);
  }

  // Build ordered timeline of landing events across the whole clip.
  // Also handle 10.9 punch-in into final anchor of a 2-3 cluster stack.
  const events = [];
  for (let si = 0; si < shots.length; si++) {
    const landings = shotLandings[si];
    for (let li = 0; li < landings.length; li++) {
      const l = landings[li];
      const ev = {
        type: 'landing',
        shotIndex: si,
        localIdx: li,
        isShotEntry: li === 0,
        landing: l,
        pose: l.world,
        frame: l.landingFrame,
        lastActivityFrame: Math.max(l.landingFrame, l.lastAnchorFrame - 1,
          ...l.groupWords.map(w => jointSettle.get(w.id) ?? -Infinity)),
      };
      events.push(ev);
      shotCameraLogs[si].landingFrames.push(l.landingFrame);

      // 10.9 Punch into a final anchor inside a 2-3 cluster group.
      if (l.kind === 'stack' && !l.run && !jointPlan && l.clusters.length >= 2) {
        const lastC = l.clusters.at(-1);
        const lastCi = l.clusterIndices.at(-1);
        const leadSec = lastC.anchor.t - l.onsetT;
        if ((lastC.tier === 'L' || lastC.tier === 'XL') && lastC.owned >= 0.6 && leadSec >= (MIN_HOLD_FRAMES / fps) + 0.24 - 1e-6) {
          const poster = makePosterLanding(shots[si], placedPlaques[si], lastCi, vfov, fps, wordsMode);
          poster.world = localPoseToWorld(placedPlaques[si], poster);
          const punchDurF = Math.round(durs.whip * fps);
          const f1 = poster.landingFrame;
          const f0 = Math.max(l.landingFrame + MIN_HOLD_FRAMES, f1 - punchDurF);
          if (f1 - f0 >= Math.ceil(0.20 * fps)) {
            events.push({
              type: 'punch-in',
              shotIndex: si,
              localIdx: li,
              isShotEntry: false,
              landing: poster,
              pose: poster.world,
              frame: f1,
              forcedF0: f0,
              forcedVerb: 'whip',
              lastActivityFrame: f1,
            });
            shotCameraLogs[si].landingFrames.push(f1);
            shotCameraLogs[si].changes.push({ stage: 'camera', reason: `punch-in to final anchor ${lastC.anchor.text} at frame ${f1} (10.9)` });
          }
        }
      }
    }
  }

  // 2. Plan transit keys between consecutive events, checking internal even pace (10.5.4) and accents (10.8).
  const cams = [];
  const boundaryKeys = new Map(); // shotIndex -> entry camera key
  const transitSegments = []; // [{fromEv, toEv, key, shotIndex, isShotEntry, fold}]

  // First pass: choose verbs for each transition.
  const transitions = [];
  for (let ei = 1; ei < events.length; ei++) {
    const prev = events[ei - 1];
    const curr = events[ei];
    const si = curr.shotIndex;
    const isShotEntry = curr.isShotEntry;
    const bnd = isShotEntry ? trailBoundaries[si] : null;
    const fold = isShotEntry ? bnd.fold : 'flat';
    const bClass = isShotEntry ? bnd.bClass : 'B1';
    const isSetPiece = isShotEntry ? bnd.isSetPiece : false;
    // Item 15 under joints: the previous anchor keeps 15 readable frames before the camera leaves it.
    const availFrames = curr.frame - prev.lastActivityFrame - (jointPlan ? 15 : MIN_HOLD_FRAMES);
    const available = availFrames / fps;
    const leadNeeded = curr.landing.hasRiders ? Math.max(0, curr.frame / fps - curr.landing.firstRiderT) : 0;
    const rng = stream(seed, 'verb', si * 10 + curr.localIdx, 0);

    let forcedVerb = null;
    let intendedVerb = null;
    if (curr.type === 'punch-in') {
      forcedVerb = 'whip';
      intendedVerb = 'whip';
    } else if (isShotEntry && bnd.verb) {
      forcedVerb = bnd.verb;
      intendedVerb = bnd.intendedVerb ?? bnd.verb;
    } else if (!isShotEntry && pinnedShots?.[si]?.internalVerbs?.[curr.localIdx - 1]) {
      forcedVerb = pinnedShots[si].internalVerbs[curr.localIdx - 1];
      intendedVerb = forcedVerb;
    }

    let picked;
    if (fold === 'jump') {
      picked = { verb: 'cut', durFrames: 0, durSec: 0, adjusted: false };
      intendedVerb = intendedVerb ?? 'cut';
    } else {
      picked = drawVerb({
        bClass,
        isSetPiece,
        fold,
        available,
        bpm,
        energyPct: shotEnergyPct[si],
        family,
        lastVerbUse,
        moveCounter,
        rng,
        leadNeeded,
        fps,
        forcedVerb,
      });
      intendedVerb = intendedVerb ?? picked.verb;
    }

    lastVerbUse.set(picked.verb, moveCounter);
    moveCounter++;

    if (isShotEntry) {
      shotCameraLogs[si].entryVerb = picked.verb;
      shotCameraLogs[si].entryVerbIntended = intendedVerb;
      if (picked.reason) shotCameraLogs[si].changes.push({ stage: 'camera', reason: picked.reason });
    }

    transitions.push({
      ei, prev, curr, si, isShotEntry, bnd, fold, bClass, isSetPiece, available, leadNeeded, picked, intendedVerb,
    });
  }

  // 10.5.4 Even pace check inside each shot: longest moving internal transit <= 2.0 * shortest; redraw offending verb once.
  for (let si = 0; si < shots.length; si++) {
    const internal = transitions.filter(tr => !tr.isShotEntry && tr.si === si && tr.curr.type !== 'punch-in');
    const moving = internal.filter(tr => tr.picked.verb !== 'cut' && tr.picked.durFrames > 0);
    if (moving.length >= 2) {
      const minD = Math.min(...moving.map(tr => tr.picked.durFrames));
      const maxD = Math.max(...moving.map(tr => tr.picked.durFrames));
      if (maxD > 2.0 * minD) {
        shotCameraLogs[si].paceFirstDrawOk = false;
        // Identify the offending transit (longest one) and redraw once favoring durations <= 2*minD.
        const offender = moving.find(tr => tr.picked.durFrames === maxD);
        const rng = stream(seed, 'verb_pace', si, 1);
        const targetMaxSec = (2.0 * minD) / fps;
        const redraw = drawVerb({
          bClass: 'B1',
          isSetPiece: false,
          fold: 'flat',
          available: Math.min(offender.available, targetMaxSec),
          bpm,
          energyPct: shotEnergyPct[si],
          family,
          lastVerbUse,
          moveCounter,
          rng,
          leadNeeded: offender.leadNeeded,
          fps,
        });
        shotCameraLogs[si].changes.push({
          stage: 'camera',
          reason: `pace redraw in shot ${si + 1}: ${offender.picked.verb}(${offender.picked.durFrames}f) -> ${redraw.verb}(${redraw.durFrames}f) (10.5.4)`,
        });
        offender.picked = redraw;
      }
    }
  }

  // Build actual camera keys, inserting accents (10.8) on long holds before departure.
  const shotInternalVerbs = shots.map(() => []);
  for (let ti = 0; ti < transitions.length; ti++) {
    const tr = transitions[ti];
    const { prev, curr, si, isShotEntry, bnd, fold, picked } = tr;
    if (!isShotEntry && curr.type !== 'punch-in') {
      shotInternalVerbs[si].push(picked.verb);
    }

    const transitF1 = curr.frame;
    const transitF0 = curr.forcedF0 != null ? curr.forcedF0 : (picked.verb === 'cut' ? transitF1 : transitF1 - picked.durFrames);
    let fromPose = prev.pose;

    // 10.8 Accents for long holds (not on last shot of clip).
    const prevShotIdx = prev.shotIndex;
    const isLastShot = prevShotIdx === shots.length - 1;
    const stillStartFrame = prev.lastActivityFrame;
    const stillGapSec = (transitF0 - stillStartFrame) / fps;
    if (!isLastShot && stillGapSec > maxStillSec) {
      const minStartSec = prev.frame / fps + 0.5;
      const maxEndSec = (transitF0 - MIN_HOLD_FRAMES) / fps;
      const accRng = stream(seed, 'accent', prevShotIdx * 10 + prev.localIdx, 0);
      const prevPlaque = placedPlaques[prevShotIdx];
      const prevShot = shots[prevShotIdx];
      const prevCluster = prev.landing.clusters.at(-1);
      const isLineLast = prevShot.clusters.at(-1) === prevCluster && (!shots[prevShotIdx + 1] || shots[prevShotIdx + 1].line !== prevShot.line);

      // Find first beat >= minStartSec that fits at least one moving accent.
      const punchDurF = Math.round(durs.whip * fps);
      const pullDurF = Math.round(durs.sweep * fps);
      const mustBreakStill = stillGapSec > maxStillSec + 0.2 - 1 / fps;
      let firstBeat = beatTimes.find(bt => bt >= minStartSec - 1e-6 && bt + durs.whip <= maxEndSec + 1e-6);
      if (firstBeat == null && mustBreakStill && minStartSec + durs.whip <= maxEndSec + 1e-6) {
        firstBeat = minStartSec;
      }

      if (firstBeat != null) {
        const beatFrame = Math.round(firstBeat * fps);
        const punchFits = beatFrame + punchDurF <= transitF0 - MIN_HOLD_FRAMES;
        let punchOk = prevCluster.tier !== 'XL' && punchFits;
        let pullOk = prevShot.clusters.length >= 2 && beatFrame + pullDurF <= transitF0 - MIN_HOLD_FRAMES;
        let pullPose = null;
        if (pullOk) {
          pullPose = pullAccentWorldPose(prevPlaque, vfov);
          // Check 10.4 floor (sung anchor >= 30% width or 22% height) and >= 65 px.
          const tv = Math.tan((vfov * Math.PI) / 360);
          const thP = tv * (16 / 9);
          const anchorW = prev.landing.groupWords.find(w => w.id === prev.landing.anchorWordId);
          const capPx = (anchorW.cap / (2 * pullPose.dist * tv)) * 720;
          const wShare = anchorW.boxW / (2 * pullPose.dist * thP);
          const hShare = anchorW.boxH / (2 * pullPose.dist * tv);
          if (capPx < 65 || (wShare < 0.30 && hShare < 0.22)) pullOk = false;
        }
        // If holding still would breach 13.1.7 (max_still + 0.2s) and neither standard punch nor pull fits (e.g., 1-cluster XL), allow a subtle XL punch.
        if (mustBreakStill && !punchOk && !pullOk && punchFits) {
          punchOk = true;
        }
        const stillAllowed = !mustBreakStill || (!punchOk && !pullOk);
        const pinnedAcc = pinnedShots?.[prevShotIdx]?.accents?.[prev.localIdx];
        let accType;
        if (pinnedAcc) {
          if ((pinnedAcc === 'punch' && punchOk) || (pinnedAcc === 'pull' && pullOk) || (pinnedAcc === 'still' && stillAllowed)) {
            accType = pinnedAcc;
          }
        }
        if (!accType) {
          const accOpts = [
            { value: 'punch', base: 40, weight: punchOk ? 40 * cooldownFactor(lastAccentUse.get('punch'), accentCounter, 2) : 0, valid: punchOk },
            { value: 'pull', base: 45, weight: pullOk ? 45 * (isLineLast ? 1.5 : 1) * cooldownFactor(lastAccentUse.get('pull'), accentCounter, 2) : 0, valid: pullOk },
            { value: 'still', base: 15, weight: stillAllowed ? 15 * cooldownFactor(lastAccentUse.get('still'), accentCounter, 2) : 0, valid: stillAllowed },
          ];
          accType = weightedChoice(accOpts, accRng, stillAllowed ? 'still' : (pullOk ? 'pull' : 'punch'));
        }
        lastAccentUse.set(accType, accentCounter);
        accentCounter++;
        shotCameraLogs[prevShotIdx].accentDecision = shotCameraLogs[prevShotIdx].accentDecision ?? {};
        shotCameraLogs[prevShotIdx].accentDecision[prev.localIdx] = accType;

        const accDur = accType === 'pull' ? pullDurF : punchDurF;
        const nearMotion = motionWindows.find(([a, b]) => beatFrame < b + MIN_HOLD_FRAMES && beatFrame + accDur > a - MIN_HOLD_FRAMES);
        if (nearMotion && accType !== 'still') {
          shotCameraLogs[prevShotIdx].changes.push({ stage: 'camera', reason: `accent ${accType} at ${beatFrame} dropped: within 8 frames of word motion ${nearMotion[0]}-${nearMotion[1]} (15.3)` });
          accType = 'still';
        }
        if (accType === 'punch' && punchOk) {
          const anchorW = prev.landing.groupWords.find(w => w.id === prev.landing.anchorWordId);
          const punchDist = readingDistance(anchorW.boxW, anchorW.boxH, 0.92, 0.70, vfov);
          const targetPose = { ...fromPose, dist: Math.min(fromPose.dist * 0.94, punchDist) };
          targetPose.position = add(targetPose.target, mul(targetPose.N, targetPose.dist));
          const accKey = {
            f0: beatFrame,
            f1: beatFrame + punchDurF,
            kind: 'accent',
            accentType: 'punch',
            verb: 'whip',
            ease: easeFor('whip', 'flat', easeMode),
            from: fromPose,
            to: targetPose,
            bow: false,
            stagger: false,
            hold_target_until: 0,
          };
          cams.push(accKey);
          fromPose = targetPose;
          shotCameraLogs[prevShotIdx].accentFrames.push([accKey.f0, accKey.f1, 'punch']);
        } else if (accType === 'pull' && pullOk && pullPose) {
          const accKey = {
            f0: beatFrame,
            f1: beatFrame + pullDurF,
            kind: 'accent',
            accentType: 'pull',
            verb: 'sweep',
            ease: easeFor('sweep', 'flat', easeMode),
            from: fromPose,
            to: pullPose,
            bow: false,
            stagger: Math.max(fromPose.dist, pullPose.dist) / Math.min(fromPose.dist, pullPose.dist) >= 2,
            hold_target_until: 0,
          };
          cams.push(accKey);
          fromPose = pullPose;
          shotCameraLogs[prevShotIdx].accentFrames.push([accKey.f0, accKey.f1, 'pull']);
        }
      }
    }

    const toPose = curr.pose;
    const travel = dist3(fromPose.target, toPose.target);
    const destFrameW = 2 * toPose.dist * th;
    const bow = (picked.verb === 'sweep' || picked.verb === 'glide') && travel > 1.5 * destFrameW;
    const stagger = Math.max(fromPose.dist, toPose.dist) / Math.min(fromPose.dist, toPose.dist) >= 2;
    const key = {
      f0: transitF0,
      f1: transitF1,
      kind: 'transit',
      verb: picked.verb,
      fold,
      shotIndex: si,
      isShotEntry,
      ease: easeFor(picked.verb, fold, easeMode),
      from: fromPose,
      to: toPose,
      bow,
      stagger,
      hold_target_until: 0,
    };
    if (fold === 'flip') {
      key.flip = bnd.sign ?? 1;
      key.flipAxis = bnd.flipAxis === 'R' ? placedPlaques[si - 1].R : placedPlaques[si - 1].U;
    }
    if (jointPlan) {
      const pj = isShotEntry ? jointPlan.pivotFor.get(si) : null;
      const ej = curr.landing.entryJoint;
      if (pj) {
        // Spec 16 to 22, 44: the camera pivots about the joint; plaque B is carried from f0.
        key.f0 = pj.f0; key.f1 = pj.f1; key.joint = pj.prim;
        delete key.flip; delete key.flipAxis;
        const A = placedPlaques[si - 1];
        if (pj.prim === 'pass-through') {
          key.verb = 'sweep'; key.ease = SHARP_EASE;
        } else {
          let P, axis, deg;
          if (pj.prim === 'flip') { P = fromPose.target; axis = bnd.flipAxis === 'R' ? A.R : A.U; deg = 180; }
          else if (pj.prim === 'pivot-roll') { const h = hingeLine(A, bnd.edge, add(fromPose.target, mul(sub(toPose.target, fromPose.target), 0.5))); P = h.P; axis = A.N; deg = 90; }
          else { const h = hingeLine(A, bnd.edge, fromPose.target); P = h.P; axis = h.axis; deg = 90; }
          key.verb = 'pivot'; key.ease = PIVOT_EASE; key.pivot = pivotSpec(fromPose, toPose, P, axis, deg);
          key.bow = false;
        }
      } else if (ej && !ej.carried && CATALOGUE[ej.prim]?.actor === 'object' && ej.f1 > ej.f0 && curr.type === 'landing') {
        // Object entrance: the camera follows the guest from the previous landing to its own, sharp ease (spec 13, 48.2).
        const f0 = Math.max(ej.f0, prev.lastActivityFrame);
        const f1 = Math.max(curr.frame, f0 + 4);
        if (f0 < f1 && f1 === curr.frame) {
          key.f0 = f0; key.f1 = f1; key.verb = 'follow'; key.ease = SHARP_EASE; key.joint = ej.prim; key.bow = false;
        }
      }
    }
    cams.push(key);
    if (isShotEntry) boundaryKeys.set(si, key);
    transitSegments.push({ fromEv: prev, toEv: curr, key, si, isShotEntry, fold });
  }

  // 3. Plan Reveal (section 14).
  const revealEval = planRevealPose(placedPlaques, vfov);
  const tStage = clamp((2 * 60) / bpm, 1.0, 1.6);
  const tStageFrames = Math.round(tStage * fps);
  const lastAnchorOnset = shots.at(-1).clusters.at(-1).anchor.t;
  const minRevealStart = lastAnchorOnset + maxStillSec;
  const maxRevealStart = revealUntil - tStage - 1.5;

  let revealStartSec;
  const firstAfter = beatTimes.find(bt => bt >= minRevealStart - 1e-6);
  if (firstAfter != null && firstAfter <= maxRevealStart + 1e-6) {
    revealStartSec = firstAfter;
  } else {
    const earlierBeats = beatTimes.filter(bt => bt <= maxRevealStart + 1e-6 && bt >= lastAnchorOnset + MIN_HOLD_FRAMES / fps);
    revealStartSec = earlierBeats.length ? earlierBeats.at(-1) : Math.max(lastAnchorOnset + MIN_HOLD_FRAMES / fps, maxRevealStart);
  }
  const revealF0 = Math.round(revealStartSec * fps);
  const revealF1 = Math.min(totalFrames - 1, revealF0 + tStageFrames);
  const lastPose = cams.length ? cams.at(-1).to : events[0].pose;
  const revealTo = revealEval.chosen.pose;

  const revealKey = {
    f0: revealF0,
    f1: revealF1,
    kind: 'reveal',
    verb: 'sweep',
    fold: 'reveal',
    ease: easeFor('sweep', 'flat', easeMode),
    from: lastPose,
    to: revealTo,
    bow: false,
    stagger: Math.max(lastPose.dist, revealTo.dist) / Math.min(lastPose.dist, revealTo.dist) >= 2,
    hold_target_until: 0.3,
  };
  cams.push(revealKey);

  // 4. Visibility (section 11) and Reveal return (14.4).
  // Plaque slab on frames:
  // - Plaque 0 switches on with its first word (no empty panel 0.00-0.80s, and preset doesn't spoil words before lyrics).
  // - With wordsMode === 'pop': slab and its earliest word switch on together during a moving transit (at f0 for depth,
  //   at first front-facing frame for flip, or once camera swings ~30% into move / leaves previous plaque) so no empty slab
  //   ever sits on screen and open plaques never cause blank transits.
  // - With wordsMode === 'preset': switches on at middle frame of previous move (except depth, which waits until f0 so it
  //   does not overlap the open plaque before the dive).
  const firstWordOfPlaque = placedPlaques.map(p => {
    let best = p.words[0];
    for (const w of p.words) {
      if (w.t < best.t) best = w;
    }
    return best;
  });
  const firstWordOnFrame = firstWordOfPlaque.map(w => Math.max(0, Math.round(w.t * fps) - 1));

  const plaqueTiming = placedPlaques.map((p, si) => ({
    on: si === 0 ? firstWordOnFrame[0] : 0,
    off: null,
    offOnScreen: false,
    offReason: null,
    reveal_on: null,
    reveal_stamp: false,
  }));

  for (let si = 1; si < placedPlaques.length; si++) {
    const entryKey = boundaryKeys.get(si);
    const bnd = trailBoundaries[si];
    const fwOn = firstWordOnFrame[si];
    if (wordsMode === 'preset') {
      if (bnd.fold === 'depth') {
        plaqueTiming[si].on = entryKey.f0;
      } else {
        const idx = cams.indexOf(entryKey);
        const prevMove = cams.slice(0, idx).reverse().find(k => k.verb !== 'cut' && k.f1 > k.f0);
        if (prevMove) {
          plaqueTiming[si].on = Math.floor((prevMove.f0 + prevMove.f1) / 2);
        } else {
          plaqueTiming[si].on = entryKey.f0;
        }
      }
    } else if (entryKey.verb === 'cut' || entryKey.f1 <= entryKey.f0) {
      plaqueTiming[si].on = Math.min(entryKey.f0, fwOn);
    } else if (bnd.fold === 'depth') {
      plaqueTiming[si].on = Math.min(entryKey.f0, fwOn);
    } else if (bnd.fold === 'flip') {
      const currP = placedPlaques[si];
      let frontF = fwOn;
      for (let f = entryKey.f0; f <= fwOn; f++) {
        const pose = I.poseAt(cams, f);
        if (dot(currP.N, sub(pose.position, currP.C)) > 0) {
          frontF = f;
          break;
        }
      }
      plaqueTiming[si].on = frontF;
    } else {
      const currP = placedPlaques[si];
      const prevP = placedPlaques[si - 1];
      const dur = Math.max(1, entryKey.f1 - entryKey.f0);
      const targetStart = entryKey.f0 + Math.max(1, Math.floor(0.30 * dur));
      let chosenOn = fwOn;
      for (let f = entryKey.f0; f <= fwOn; f++) {
        const pose = I.poseAt(cams, f);
        const currFront = dot(currP.N, sub(pose.position, currP.C)) > 0;
        const currSeen = currFront && plaqueOnScreen(currP, pose, vfov);
        if (!currSeen) continue;
        const prevGone = !plaqueOnScreen(prevP, pose, vfov);
        if (f >= targetStart || prevGone) {
          chosenOn = f;
          break;
        }
      }
      plaqueTiming[si].on = chosenOn;
    }
  }

  if (jointPlan) {
    for (let si = 1; si < placedPlaques.length; si++) {
      const pj = jointPlan.pivotFor.get(si);
      if (pj) plaqueTiming[si].on = pj.f0;
    }
    for (let si = 0; si < placedPlaques.length; si++) {
      const ons = placedPlaques[si].words.map(w => jointPlan.byWord.get(w.id)?.on).filter(x => x != null);
      if (ons.length) plaqueTiming[si].on = Math.min(plaqueTiming[si].on, ...ons);
    }
  }

  // Helper to hide a plaque during a transit key (11.3.2 & 11.3.3).
  const scheduleHideDuringTransit = (pi, entryKey, reason) => {
    if (plaqueTiming[pi].off != null) return;
    if (entryKey.verb === 'cut' || entryKey.f1 <= entryKey.f0) {
      const poseAtCut = I.poseAt(cams, Math.max(0, entryKey.f0 - 1));
      plaqueTiming[pi].off = entryKey.f0;
      plaqueTiming[pi].offOnScreen = plaqueOnScreen(placedPlaques[pi], poseAtCut, vfov);
      plaqueTiming[pi].offReason = reason;
      return;
    }
    let offFrame = null;
    for (let f = entryKey.f0; f <= entryKey.f1; f++) {
      const pose = I.poseAt(cams, f);
      if (!plaqueOnScreen(placedPlaques[pi], pose, vfov)) {
        offFrame = f;
        break;
      }
    }
    if (offFrame != null) {
      plaqueTiming[pi].off = offFrame;
      plaqueTiming[pi].offOnScreen = false;
      plaqueTiming[pi].offReason = `${reason} (off-screen at f=${offFrame})`;
    } else {
      const mid = Math.floor((entryKey.f0 + entryKey.f1) / 2);
      plaqueTiming[pi].off = mid;
      plaqueTiming[pi].offOnScreen = true;
      plaqueTiming[pi].offReason = `${reason} (on-screen fallback at mid f=${mid})`;
    }
  };

  // Apply depth hide (11.3.4), early hide of i-2 (11.3.3), and window hide of i-3 (11.3.2).
  for (let si = 1; si < placedPlaques.length; si++) {
    const bnd = trailBoundaries[si];
    const entryKey = boundaryKeys.get(si);
    // 11.3.4 Depth: A switches off on first frame camera is behind A's face plane.
    if (bnd.fold === 'depth') {
      const prevP = placedPlaques[si - 1];
      let behindF = null;
      for (let f = entryKey.f0; f <= entryKey.f1; f++) {
        const pose = I.poseAt(cams, f);
        if (dot(sub(pose.position, prevP.C), prevP.N) < 0) {
          behindF = f;
          break;
        }
      }
      plaqueTiming[si - 1].off = behindF ?? entryKey.f1;
      plaqueTiming[si - 1].offOnScreen = false; // camera is behind its face plane, FrontSide culled
      plaqueTiming[si - 1].offReason = `depth exit behind face plane at f=${plaqueTiming[si - 1].off} (11.3.4)`;
    }
    // 11.3.3 Early hide of i-2 flagged by 9.6.2 (d) or (e).
    if (bnd.earlyHidePrev2 && si >= 2) {
      scheduleHideDuringTransit(si - 2, entryKey, `early hide of p${si - 1} during transit into shot ${si + 1} (11.3.3)`);
    }
    // 11.3.2 Window hide of i-3 (keeping at most i, i-1, i-2 on).
    if (si >= 3) {
      scheduleHideDuringTransit(si - 3, entryKey, `window hide of p${si - 2} during transit into shot ${si + 1} (11.3.2)`);
    }
  }

  // Reveal return (14.4).
  const revealStartPose = I.poseAt(cams, revealF0);
  const hiddenIndices = [];
  for (let pi = 0; pi < placedPlaques.length; pi++) {
    if (plaqueTiming[pi].off != null) hiddenIndices.push(pi);
  }
  const offAtRevealStart = [];
  const onAtRevealStart = [];
  for (const pi of hiddenIndices) {
    if (plaqueOnScreen(placedPlaques[pi], revealStartPose, vfov)) onAtRevealStart.push(pi);
    else offAtRevealStart.push(pi);
  }
  for (const pi of offAtRevealStart) {
    plaqueTiming[pi].reveal_on = revealF0;
    plaqueTiming[pi].reveal_stamp = false;
  }
  // Newest first, one every 2 frames, each with the 3-frame stamp.
  onAtRevealStart.sort((a, b) => b - a);
  onAtRevealStart.forEach((pi, k) => {
    plaqueTiming[pi].reveal_on = Math.min(revealF1, revealF0 + 2 * k);
    plaqueTiming[pi].reveal_stamp = true;
  });
  // Near-camera guard (14.4): any non-final plaque within 0.9 * max(w, h) of camera (or 0.65 * max(w, h) to its slab box)
  // stays off during pull-back until the camera has passed it.
  const distToBox = (pt, box) => {
    let s = 0;
    for (let i = 0; i < 3; i++) {
      const d = pt[i] < box.min[i] ? box.min[i] - pt[i] : pt[i] > box.max[i] ? pt[i] - box.max[i] : 0;
      s += d * d;
    }
    return Math.sqrt(s);
  };
  for (let pi = 0; pi < placedPlaques.length - 1; pi++) {
    const p = placedPlaques[pi];
    const box = slabAABB(p);
    const maxExt = Math.max(p.w, p.h);
    const nearRadius = 0.9 * maxExt;
    const boxNearRadius = 0.55 * maxExt;
    const scanStart = plaqueTiming[pi].reveal_on ?? revealF0;
    let lastNear = -1;
    for (let f = scanStart; f <= revealF1; f++) {
      const pose = I.poseAt(cams, f);
      if (dist3(pose.position, p.C) < nearRadius || distToBox(pose.position, box) < boxNearRadius) {
        lastNear = f;
      }
    }
    if (lastNear >= 0) {
      if (plaqueTiming[pi].off == null) {
        plaqueTiming[pi].off = revealF0;
        plaqueTiming[pi].offOnScreen = plaqueOnScreen(p, revealStartPose, vfov);
        plaqueTiming[pi].offReason = `reveal near-camera hide of p${pi + 1} until f=${Math.min(revealF1, lastNear + 1)} (14.4)`;
        plaqueTiming[pi].reveal_stamp = true;
      }
      plaqueTiming[pi].reveal_on = Math.min(revealF1, lastNear + 1);
    }
  }

  // For ease-only forks (Clip E, rulebook 18.8.5 / 18.9.6), geometry and timing stay identical to Clip A.
  if (preservePinnedTiming && pinnedShots) {
    for (let pi = 0; pi < plaqueTiming.length; pi++) {
      const ptPin = pinnedShots[pi]?.plaqueTiming;
      if (ptPin) {
        plaqueTiming[pi].on = ptPin.on;
        plaqueTiming[pi].off = ptPin.off;
        plaqueTiming[pi].offOnScreen = ptPin.offOnScreen;
        plaqueTiming[pi].offReason = ptPin.offReason;
        plaqueTiming[pi].reveal_on = ptPin.reveal_on;
        plaqueTiming[pi].reveal_stamp = ptPin.reveal_stamp;
      }
    }
  }

  // Word visibility (11.1):
  // - pop: plaque's earliest word switches on with the plaque (so no slab appears empty); other anchors/pickups switch on
  //   1 frame before onset with stamp=true; riders 1 frame before onset with stamp=false.
  // - preset: every word switches on with the plaque and stamp=false.
  const wordTimings = new Map();
  for (let si = 0; si < placedPlaques.length; si++) {
    const pt = plaqueTiming[si];
    const firstId = firstWordOfPlaque[si]?.id;
    for (const w of placedPlaques[si].words) {
      const onsetF = Math.round(w.t * fps);
      const baseOn = Math.max(0, onsetF - 1);
      const on = wordsMode === 'preset' ? pt.on : (w.id === firstId ? Math.min(baseOn, pt.on) : baseOn);
      const stamp = wordsMode === 'preset' ? false : (w.role !== 'rider' && on === baseOn);
      const jw = jointPlan?.byWord.get(w.id);
      // Carried words switch on with the pivot (14.3), but not while the camera still sees them edge-on or from behind.
      if (jw?.joint?.carried) {
        const pj = jointPlan.pivotFor.get(si);
        if (pj) {
          const wC = add(placedPlaques[si].C, add(mul(placedPlaques[si].R, w.x), mul(placedPlaques[si].U, w.y)));
          // First frame from which the word faces the camera and its centre stays in frame for 4 frames (13.1.6).
          const okAt = f => {
            const pose = I.poseAt(cams, f);
            const toCam = sub(pose.position, wC);
            const q = I.project(wC, pose, vfov);
            return dot(placedPlaques[si].N, toCam) > 0.17 * Math.hypot(...toCam) && q && Math.abs(q.x) < 1 && Math.abs(q.y) < 1;
          };
          for (let f = pj.f0; f <= pj.f1; f++) {
            if ([0, 1, 2, 3].every(k => okAt(f + k))) { jw.on = Math.max(jw.on ?? f, f); break; }
          }
        }
      }
      wordTimings.set(w.id, {
        // 45.3/45.4: a popped first word of a plaque keeps the old rule and switches on with its plaque during the transit.
        on: jw ? (w.id === firstId && (!jw.joint || ['pop', 'travel'].includes(jw.joint.prim)) && wordsMode !== 'preset' ? Math.min(jw.on, pt.on) : jw.on) : on,
        stamp: jw ? jw.stamp : stamp,
        motion: jw?.motion ?? [],
        clip: jw?.clip ?? [],
        joint: jw?.joint ?? null,
        pre_offset: jw?.pre_offset ?? null,
        off: pt.off,
        reveal_on: pt.reveal_on,
        reveal_stamp: pt.reveal_stamp,
      });
    }
  }

  return {
    cams,
    plaqueTiming,
    wordTimings,
    shotLandings,
    shotCameraLogs,
    shotInternalVerbs,
    revealEval,
    revealF0,
    revealF1,
    totalFrames,
    events,
  };
}
