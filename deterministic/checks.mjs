// Hard checks (13.1) and score calculation (13.2) using KT_INTERP.
import './interp.js';
import { moveFloor, maxStill, MIN_HOLD_FRAMES } from './camera.mjs';
import { slabBounds, slabCenter, boxesIntersect, hairpinOK, rayIntersectsBox, FOLD_AXIS, effectiveTurnSign, ATTACHED_KINDS } from './plan_trail.mjs';
import { CATALOGUE } from './primitives.mjs';
import { wordPolygonAt, wordFullPolygonAt, polyArea3 } from './scene_probe.mjs';

export const SCORE_WEIGHTS = Object.freeze({
  neighbour: 2,
  fill: 1.5,
  joint_variety: 1,
  attach: 1.5,
  mix: 1,
  forced_repeats: -2,
  pivot_purity: 0.5,
  peaks: 1,
  reveal: 1,
  pace: 0.5,
  verb_mix: 0.5,
  seen_hides: -1.5,
  fallbacks: -2,
  flow_breaks: -1,
  // Fable's rule audit ruling, 22 November 2026 (A3, A7): former vetoes scored per 30 joints or per landing.
  wall_of_lines: -1,
  run_mismatch: -1,
  v2v3_breaks: -0.5,
});

export const CHECK_NAMES = Object.freeze([
  '13.1.1_readable_anchor',
  '13.1.2_rider_seen',
  '13.1.3_focus_dominance',
  '13.1.4_no_wall_of_lines',
  '13.1.5_no_blank_transit',
  '13.1.6_no_flash',
  '13.1.7_floors_and_stillness',
  '13.1.8_trail',
  '13.1.9_sync',
  '13.1.10_sung_word_whole',
  '13.1.11_window_discipline',
  '13.1.12_reveal',
  '13.1.13_protected_reading',
  '13.1.14_variety',
  '13.1.15_attachment',
  '13.1.16_clean_motion',
  '13.1.17_families',
]);
// Spec 37.1 target bands over anchor joints.
export const MIX_BANDS = Object.freeze({
  hinge: [0.25, 0.35], hide: [0.10, 0.20], slide: [0.08, 0.20], push: [0.08, 0.17], grow: [0.05, 0.17], flip: [0, 0.08], pop: [0.12, 0.25], travel: [0, 0.10],
});

export function scoreFromTerms(terms) {
  let score = 0;
  for (const [name, weight] of Object.entries(SCORE_WEIGHTS)) {
    if (typeof terms[name] !== 'number' || !Number.isFinite(terms[name])) {
      throw Error(`Missing or invalid score term: ${name}`);
    }
    score += weight * terms[name];
  }
  return score;
}

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const boxOf = pts => ({ x0: Math.min(...pts.map(p => p[0])), x1: Math.max(...pts.map(p => p[0])), y0: Math.min(...pts.map(p => p[1])), y1: Math.max(...pts.map(p => p[1])) });
function isVisible(item, f) {
  return (f >= item.on && (item.off == null || f < item.off)) || (item.reveal_on != null && f >= item.reveal_on);
}

function posesEqual(a, b) {
  for (let i = 0; i < 3; i++) {
    if (Math.abs(a.position[i] - b.position[i]) > 1e-6) return false;
    if (Math.abs(a.R[i] - b.R[i]) > 1e-6) return false;
    if (Math.abs(a.U[i] - b.U[i]) > 1e-6) return false;
    if (Math.abs(a.N[i] - b.N[i]) > 1e-6) return false;
  }
  return true;
}

// Sutherland-Hodgman clip of a 2D polygon against half-planes.
function clipPoly2D(poly, inside, intersect) {
  if (!poly.length) return [];
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i];
    const prev = poly[(i + poly.length - 1) % poly.length];
    const curIn = inside(cur), prevIn = inside(prev);
    if (curIn) {
      if (!prevIn) out.push(intersect(prev, cur));
      out.push(cur);
    } else if (prevIn) {
      out.push(intersect(prev, cur));
    }
  }
  return out;
}

function clipToRect(poly, minX, maxX, minY, maxY) {
  let p = poly;
  p = clipPoly2D(p, v => v[0] >= minX, (a, b) => {
    const t = (minX - a[0]) / (b[0] - a[0]);
    return [minX, a[1] + t * (b[1] - a[1])];
  });
  p = clipPoly2D(p, v => v[0] <= maxX, (a, b) => {
    const t = (maxX - a[0]) / (b[0] - a[0]);
    return [maxX, a[1] + t * (b[1] - a[1])];
  });
  p = clipPoly2D(p, v => v[1] >= minY, (a, b) => {
    const t = (minY - a[1]) / (b[1] - a[1]);
    return [a[0] + t * (b[0] - a[0]), minY];
  });
  p = clipPoly2D(p, v => v[1] <= maxY, (a, b) => {
    const t = (maxY - a[1]) / (b[1] - a[1]);
    return [a[0] + t * (b[0] - a[0]), maxY];
  });
  return p;
}

function polyArea(poly) {
  if (poly.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(sum) / 2;
}

// Clip 3D polygon to camera front plane depth >= nearZ and project to 2D NDC.
function projectQuad(corners3D, pose, tv, th, nearZ = 1.0) {
  const camPts = corners3D.map(pt => {
    const d = sub(pt, pose.position);
    return [dot(d, pose.R), dot(d, pose.U), -dot(d, pose.N)];
  });
  const clipped3D = [];
  for (let i = 0; i < camPts.length; i++) {
    const cur = camPts[i];
    const prev = camPts[(i + camPts.length - 1) % camPts.length];
    const curIn = cur[2] >= nearZ, prevIn = prev[2] >= nearZ;
    if (curIn) {
      if (!prevIn) {
        const t = (nearZ - prev[2]) / (cur[2] - prev[2]);
        clipped3D.push([prev[0] + t * (cur[0] - prev[0]), prev[1] + t * (cur[1] - prev[1]), nearZ]);
      }
      clipped3D.push(cur);
    } else if (prevIn) {
      const t = (nearZ - prev[2]) / (cur[2] - prev[2]);
      clipped3D.push([prev[0] + t * (cur[0] - prev[0]), prev[1] + t * (cur[1] - prev[1]), nearZ]);
    }
  }
  if (clipped3D.length < 3) return null;
  const poly2D = clipped3D.map(([cx, cy, cz]) => [cx / (cz * th), cy / (cz * tv)]);
  const allInFront = camPts.every(c => c[2] >= nearZ);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of poly2D) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  const fullArea = polyArea(poly2D);
  const inScreen = clipToRect(poly2D, -1, 1, -1, 1);
  const inFrameArea = polyArea(inScreen);
  const minDepth = Math.min(...clipped3D.map(c => c[2]));
  const maxDepth = Math.max(...clipped3D.map(c => c[2]));
  return {
    poly2D, inScreen, fullArea, inFrameArea,
    inFrameShare: fullArea > 1e-9 ? inFrameArea / fullArea : 0,
    x0, x1, y0, y1, allInFront, minDepth, maxDepth,
  };
}

function wordCorners(w) {
  const hw = w.w / 2, hh = w.h / 2;
  const r = mul(w.R, hw), u = mul(w.U, hh);
  return [
    add(w.C, add(mul(r, -1), mul(u, -1))),
    add(w.C, add(r, mul(u, -1))),
    add(w.C, add(r, u)),
    add(w.C, add(mul(r, -1), u)),
  ];
}

function plaqueFaceCorners(p, zOffset = 0) {
  const hw = p.w / 2, hh = p.h / 2;
  const r = mul(p.R, hw), u = mul(p.U, hh), base = add(p.C, mul(p.N, zOffset));
  return [
    add(base, add(mul(r, -1), mul(u, -1))),
    add(base, add(r, mul(u, -1))),
    add(base, add(r, u)),
    add(base, add(mul(r, -1), u)),
  ];
}

function plaqueCorners8(p) {
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

function pointInPoly2D(px, py, poly) {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    const intersect = ((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Compute union screen coverage fraction on a 32x18 grid for a list of projected screen polygons.
function computeCoverage(screenPolys) {
  if (!screenPolys.length) return 0;
  const cols = 32, rows = 18;
  const boxes = screenPolys.map(poly => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of poly) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    return { poly, x0, x1, y0, y1 };
  });
  let covered = 0;
  for (let ry = 0; ry < rows; ry++) {
    const cy = -1 + ((ry + 0.5) * 2) / rows;
    for (let rx = 0; rx < cols; rx++) {
      const cx = -1 + ((rx + 0.5) * 2) / cols;
      for (let bi = 0; bi < boxes.length; bi++) {
        const b = boxes[bi];
        if (cx < b.x0 || cx > b.x1 || cy < b.y0 || cy > b.y1) continue;
        if (pointInPoly2D(cx, cy, b.poly)) { covered++; break; }
      }
    }
  }
  return covered / (cols * rows);
}

function wordCapPx(w, pose, tv, th) {
  const I = globalThis.KT_INTERP;
  const pTop = add(w.C, mul(w.U, w.cap / 2));
  const pBot = add(w.C, mul(w.U, -w.cap / 2));
  const q1 = I.project(pTop, pose, undefined);
  const q2 = I.project(pBot, pose, undefined);
  if (!q1 || !q2) {
    // Fallback using centre depth if cap endpoints straddle.
    const d = -dot(sub(w.C, pose.position), pose.N);
    return d > 0 ? (w.cap / (2 * d * tv)) * 720 : 0;
  }
  // Use exact vfov-based tv/th projection rather than default 40.
  const d1 = sub(pTop, pose.position), z1 = -dot(d1, pose.N);
  const d2 = sub(pBot, pose.position), z2 = -dot(d2, pose.N);
  if (z1 <= 0 || z2 <= 0) return 0;
  const x1 = (dot(d1, pose.R) / (z1 * th)) * 640;
  const y1 = (dot(d1, pose.U) / (z1 * tv)) * 360;
  const x2 = (dot(d2, pose.R) / (z2 * th)) * 640;
  const y2 = (dot(d2, pose.U) / (z2 * tv)) * 360;
  return Math.hypot(x2 - x1, y2 - y1);
}

// Evaluate all 12 hard checks (13.1) and all 10 score terms (13.2) for a built scene.
export function evaluateScene({ scene, shots, placedPlaques, trailBoundaries, cameraPlan, map, wordsMode = 'pop', jointPlan = null }) {
  const I = globalThis.KT_INTERP;
  const J = !!scene.meta.joints_version;
  const fps = scene.meta.fps;
  const vfov = scene.meta.vfov;
  const tv = Math.tan((vfov * Math.PI) / 360);
  const th = tv * (16 / 9);
  const frames = scene.meta.frames;
  const revealF0 = cameraPlan.revealF0;
  const bpm = map.tempo_bpm;

  const plaqueById = new Map(scene.plaques.map(p => [p.id, p]));
  const plaqueAABB = new Map(scene.plaques.map(p => [p.id, slabBounds(p, 0)]));
  const wordById = new Map(scene.words.map(w => [w.id, w]));
  const wordCornersMap = new Map(scene.words.map(w => [w.id, wordCorners(w)]));
  // Spec 48.5: animated and clipped word quads. Rest corners when the word has no motion or clip.
  const animated = w => J && ((w.motion && w.motion.length) || (w.clip && w.clip.length));
  const activeAt = (w, f) => animated(w) && ((w.motion ?? []).some(m => f >= m.f0 - 1 && f <= m.f1) || (w.clip ?? []).some(c => f >= c.f0 - 1 && f <= c.f1));
  const cornersAt = (w, f) => {
    if (!animated(w)) return wordCornersMap.get(w.id);
    const poly = wordPolygonAt(w, f, wordById);
    return poly.length >= 3 ? poly : null;
  };
  const projWordAt = (w, f, pose) => { const c = cornersAt(w, f); return c ? projectQuad(c, pose, tv, th) : null; };
  const settleOf = w => (w.joint && !['pop', 'travel'].includes(w.joint.prim) ? w.joint.f1 : w.on);
  const plaqueFrontCornersMap = new Map(scene.plaques.map(p => [p.id, plaqueFaceCorners(p, 0)]));
  const plaqueBackCornersMap = new Map(scene.plaques.map(p => [p.id, plaqueFaceCorners(p, -p.thickness)]));

  const checks = Object.fromEntries(CHECK_NAMES.map(name => [name, { pass: true, failures: [] }]));
  const fail = (name, detail) => {
    checks[name].pass = false;
    if (checks[name].failures.length < 15) checks[name].failures.push(detail);
  };

  // Precompute pose per frame.
  const poses = new Array(frames);
  for (let f = 0; f < frames; f++) poses[f] = I.poseAt(scene.cams, f);

  // Build mapping of wordId -> shot index, onset time, cluster, and landing info.
  const wordMeta = new Map();
  for (let si = 0; si < shots.length; si++) {
    for (let ci = 0; ci < shots[si].clusters.length; ci++) {
      const c = shots[si].clusters[ci];
      wordMeta.set(c.anchor.id, { si, ci, word: c.anchor, anchor: c.anchor, isAnchor: true });
      for (const r of c.riders) {
        wordMeta.set(r.id, { si, ci, word: r, anchor: c.anchor, isAnchor: false });
      }
    }
  }

  // Helper: check if word w is front-facing and not occluded at its centre by any other visible panel slab.
  function isWordUnoccluded(w, pose, visiblePanelPlaques) {
    const viewVec = sub(pose.position, w.C);
    if (dot(w.N, viewVec) <= 0) return false; // back-face culled (FrontSide)
    for (let i = 0; i < visiblePanelPlaques.length; i++) {
      const p = visiblePanelPlaques[i];
      if (p.id === w.plaque) continue;
      if (rayIntersectsBox(pose.position, w.C, plaqueAABB.get(p.id))) return false;
    }
    return true;
  }

  // Per-frame scan for 13.1.5 (blank transit), 13.1.6 (no flash), 13.1.2 (rider seen),
  // plus landing-frame checks (13.1.1, 13.1.3, 13.1.4, 13.1.10) and window discipline (13.1.11).
  const firstWordOn = Math.min(...scene.words.map(w => w.on));
  const riderSeenFrames = new Map();
  const riderWindow = new Map();
  for (const w of scene.words) {
    if (w.role === 'rider') {
      const m = wordMeta.get(w.id);
      riderSeenFrames.set(w.id, 0);
      riderWindow.set(w.id, [
        Math.max(0, Math.floor((m.word.t - 0.1) * fps)),
        Math.min(frames - 1, Math.ceil((m.anchor.t + 0.6) * fps)),
      ]);
    }
  }

  // Track first-seen streak per word before reveal (13.1.6).
  const firstSeenState = new Map();
  for (const w of scene.words) firstSeenState.set(w.id, { firstF: -1, streak: 0, ended: false });

  // Cache frame computations when pose and visible IDs are identical.
  let blankStreak = 0;
  let wallLandings = 0, wallBreaks = 0;
  let maxBlankStreak = 0;
  let prevPose = null;
  let prevVisKey = '';
  let cachedFrameData = null;

  function analyzeFrame(f) {
    const pose = poses[f];
    const visPlaques = [];
    const visPanels = [];
    const visWords = [];
    let visKey = f >= revealF0 ? 'R|' : 'S|';
    for (let i = 0; i < scene.plaques.length; i++) {
      const p = scene.plaques[i];
      if (isVisible(p, f)) {
        visPlaques.push(p);
        if (p.surface === 'panel') visPanels.push(p);
        visKey += p.id + ',';
      }
    }
    visKey += '|';
    for (let i = 0; i < scene.words.length; i++) {
      const w = scene.words[i];
      if (isVisible(w, f)) {
        visWords.push(w);
        visKey += w.id + ',';
        if (activeAt(w, f)) visKey += `@${f},`;
      }
    }

    if (prevPose && posesEqual(pose, prevPose) && visKey === prevVisKey && cachedFrameData) {
      return cachedFrameData;
    }

    const screenPolys = [];
    for (let i = 0; i < visPanels.length; i++) {
      const p = visPanels[i];
      const frontFacing = dot(p.N, sub(pose.position, p.C)) >= 0;
      const proj = projectQuad(frontFacing ? plaqueFrontCornersMap.get(p.id) : plaqueBackCornersMap.get(p.id), pose, tv, th);
      if (proj && proj.inScreen.length >= 3) screenPolys.push(proj.inScreen);
    }

    const wordProj = new Map();
    const wordPolys = [];
    for (let i = 0; i < visWords.length; i++) {
      const w = visWords[i];
      const frontVisible = f >= revealF0 || isWordUnoccluded(w, pose, visPanels);
      if (!frontVisible) continue;
      const proj = projWordAt(w, f, pose);
      if (proj && proj.inFrameArea > 1e-7) {
        wordProj.set(w.id, proj);
        screenPolys.push(proj.inScreen);
        wordPolys.push(proj.inScreen);
      }
    }

    const coverage = computeCoverage(screenPolys);
    // Spec 48.1: blank transit counts word ink boxes only.
    const wordCoverage = J ? computeCoverage(wordPolys) : coverage;
    const data = { pose, visPlaques, visPanels, visWords, wordProj, coverage, wordCoverage };
    prevPose = pose;
    prevVisKey = visKey;
    cachedFrameData = data;
    return data;
  }

  // Step every frame up to revealF0 (and reveal frames for blank transit).
  for (let f = 0; f < frames; f++) {
    const fd = analyzeFrame(f);
    if (f >= firstWordOn) {
      // Ruling A4: a streak needs 6 frames under 3% word ink, and a word at least half in frame breaks it.
      const halfWord = [...fd.wordProj.values()].some(pr => pr.inFrameShare >= 0.5 - 1e-6);
      if (fd.wordCoverage < 0.03 && !halfWord) {
        blankStreak++;
        if (blankStreak > maxBlankStreak) maxBlankStreak = blankStreak;
        if (blankStreak > 5) {
          fail('13.1.5_no_blank_transit', `frame ${f}: coverage ${(fd.wordCoverage * 100).toFixed(2)}% (streak ${blankStreak})`);
        }
      } else {
        blankStreak = 0;
      }
    }
    if (f < revealF0) {
      for (const [wid, st] of firstSeenState) {
        const proj = fd.wordProj.get(wid);
        const seen = !!(proj && proj.inFrameShare >= 0.25 - 1e-6); // ruling A5: slivers under 25% are not sightings
        if (st.firstF < 0) {
          if (seen) { st.firstF = f; st.streak = 1; }
        } else if (!st.ended) {
          if (seen) st.streak++;
          else st.ended = true;
        }
      }
      for (const [wid, [w0, w1]] of riderWindow) {
        if (f >= w0 && f <= w1) {
          const proj = fd.wordProj.get(wid);
          if (proj && proj.inFrameShare >= 0.5 - 1e-6) {
            riderSeenFrames.set(wid, riderSeenFrames.get(wid) + 1);
          }
        }
      }
    }
  }

  // Finalize 13.1.6 No flash.
  for (const [wid, st] of firstSeenState) {
    if (st.firstF < 0) {
      fail('13.1.6_no_flash', `word ${wid} never seen before reveal`);
    } else if (st.streak < 4) {
      fail('13.1.6_no_flash', `word ${wid} (${wordById.get(wid).text}) first seen at f=${st.firstF} for only ${st.streak} frames`);
    }
  }

  // Check landings: 13.1.1, 13.1.2 (rider height), 13.1.3 (focus dominance), 13.1.4 (wall of lines),
  // 13.1.10 (sung word whole), plus score terms `neighbour` and `fill`.
  const cos1 = Math.cos((1 * Math.PI) / 180);
  const cos10 = Math.cos((10 * Math.PI) / 180);
  let posterLandingsCount = 0;
  let posterWithNeighbourCount = 0;
  let landingFillSum = 0;
  let landingCount = 0;

  const events = cameraPlan.events;
  for (let ei = 0; ei < events.length; ei++) {
    const ev = events[ei];
    const landF = ev.frame;
    const l = ev.landing;
    const fd = analyzeFrame(landF);
    const pose = fd.pose;

    // Score terms: fill (13.2.1) & neighbour (13.2.1).
    landingCount++;
    landingFillSum += Math.min(1, fd.coverage / 0.35);

    const groupWordIds = new Set(l.groupWords.map(w => w.id));
    if (l.kind === 'poster') {
      posterLandingsCount++;
      let hasNeighbour = false;
      for (const [wid, proj] of fd.wordProj) {
        if (groupWordIds.has(wid)) continue;
        // 2% of frame = 0.02 * 4 = 0.08 NDC^2.
        if (proj.inFrameArea / 4 >= 0.02) { hasNeighbour = true; break; }
      }
      if (hasNeighbour) posterWithNeighbourCount++;
    }

    // 13.1.2 Rider height >= 30 px at anchor's landing.
    for (const c of l.clusters) {
      for (const r of c.riders) {
        const rw = wordById.get(r.id);
        const hPx = wordCapPx(rw, pose, tv, th);
        if (hPx < 30 - 1e-3) {
          fail('13.1.2_rider_seen', `rider ${r.id} (${r.text}) cap ${hPx.toFixed(1)}px < 30px at landing f=${landF}`);
        }
      }
    }

    // 13.1.3 Focus dominance at landing frame.
    let As = 0;
    const sungAnchorWord = wordById.get(l.anchorWordId);
    if (l.kind === 'poster') {
      As = fd.wordProj.get(sungAnchorWord.id)?.inFrameArea ?? 0;
    } else {
      // Group box area in screen space (union AABB of group words projected).
      let gx0 = Infinity, gx1 = -Infinity, gy0 = Infinity, gy1 = -Infinity;
      for (const gw of l.groupWords) {
        const wObj = wordById.get(gw.id);
        const p = projWordAt(wObj, landF, pose);
        if (p && p.inScreen.length) {
          for (const [x, y] of p.inScreen) {
            if (x < gx0) gx0 = x;
            if (x > gx1) gx1 = x;
            if (y < gy0) gy0 = y;
            if (y > gy1) gy1 = y;
          }
        }
      }
      if (gx1 > gx0 && gy1 > gy0) As = (gx1 - gx0) * (gy1 - gy0);
    }

    for (const [wid, proj] of fd.wordProj) {
      if (groupWordIds.has(wid)) continue;
      if (proj.inFrameShare >= 0.5 - 1e-6) {
        if (proj.inFrameArea > As * 1.0 + 1e-5) { // ruling A2.1 (was As/1.6)
          fail('13.1.3_focus_dominance', `f=${landF} (${sungAnchorWord.text}): ${wid} (${wordById.get(wid).text}) >=50% in frame area ${(proj.inFrameArea / 4).toFixed(3)} > As ${(As / 4).toFixed(3)}`);
        }
      } else {
        if (proj.inFrameArea > 2 * As + 1e-5) { // ruling A2.2 (was As)
          fail('13.1.3_focus_dominance', `f=${landF} (${sungAnchorWord.text}): ${wid} (${wordById.get(wid).text}) <50% in frame area ${(proj.inFrameArea / 4).toFixed(3)} > 2 As ${(As / 2).toFixed(3)}`);
        }
        const centerClip = clipToRect(proj.inScreen, -0.5, 0.5, -0.5, 0.5);
        if (polyArea(centerClip) > 1e-6) {
          fail('13.1.3_focus_dominance', `f=${landF} (${sungAnchorWord.text}): clipped neighbour ${wid} (${wordById.get(wid).text}) enters central half`);
        }
      }
    }

    // 13.1.4 No wall of lines at landing frame.
    const sungCap = wordCapPx(sungAnchorWord, pose, tv, th);
    let wallCount = 0;
    for (const [wid, proj] of fd.wordProj) {
      if (groupWordIds.has(wid)) continue;
      const ow = wordById.get(wid);
      if (ow.text === sungAnchorWord.text) continue;
      if (proj.inFrameShare < 0.6 - 1e-6) continue;
      if (Math.abs(dot(ow.R, sungAnchorWord.R)) < cos10) continue;
      const oCap = wordCapPx(ow, pose, tv, th);
      if (oCap >= 0.5 * sungCap - 1e-3 && oCap <= 2.0 * sungCap + 1e-3) wallCount++;
    }
    wallLandings++;
    if (wallCount > 2) {
      wallBreaks++;
      fail('13.1.4_no_wall_of_lines', `f=${landF} (${sungAnchorWord.text}): ${wallCount} parallel words in frame`);
    }

    // Determine the still hold interval starting at landF.
    let stillEnd = landF;
    while (stillEnd + 1 < frames && posesEqual(poses[stillEnd + 1], pose)) stillEnd++;

    // 13.1.7 Stillness: 8 still frames after each landing.
    if (stillEnd - landF + 1 < MIN_HOLD_FRAMES) {
      fail('13.1.7_floors_and_stillness', `landing f=${landF} (${sungAnchorWord.text}) still for only ${stillEnd - landF + 1} frames < 8`);
    }

    // 13.1.10 Sung word whole on every still frame after landing (while anchor is on).
    for (const c of l.clusters) {
      const aw = wordById.get(c.anchor.id);
      const startCheck = Math.max(landF, J ? settleOf(aw) : aw.on);
      if (startCheck <= stillEnd) {
        const proj = projWordAt(aw, startCheck, pose);
        if (!proj || !proj.allInFront || proj.x0 < -1 - 1e-3 || proj.x1 > 1 + 1e-3 || proj.y0 < -1 - 1e-3 || proj.y1 > 1 + 1e-3) {
          fail('13.1.10_sung_word_whole', `f=${startCheck}..${stillEnd}: ${aw.id} (${aw.text}) clipped [${proj?.x0?.toFixed(3)},${proj?.x1?.toFixed(3)}] x [${proj?.y0?.toFixed(3)},${proj?.y1?.toFixed(3)}]`);
        }
      }
    }

    // 13.1.1 Readable anchor (skip duplicate check on punch-in if already checked; check every anchor once from its pop/landing).
    if (ev.type === 'landing') {
      for (let ci = 0; ci < l.clusters.length; ci++) {
        const c = l.clusters[ci];
        const aw = wordById.get(c.anchor.id);
        // Spec 47.1: words with entrances are judged by 13.1.13 instead of the 8-frame streak here.
        if (J && aw.joint && !['pop', 'travel'].includes(aw.joint.prim) && !aw.joint.carried) continue;
        const popF = Math.max(landF, wordsMode === 'preset' ? Math.round(c.anchor.t * fps) - 1 : aw.on);
        let streak = 0;
        let failReason = '';
        for (let f = popF; f <= Math.min(frames - 1, popF + 20); f++) {
          const pF = poses[f];
          if (f > popF && !posesEqual(pF, poses[popF])) { failReason = `camera moved at f=${f}`; break; }
          if (!isVisible(aw, f)) { failReason = `not visible at f=${f}`; break; }
          const proj = projWordAt(aw, f, pF);
          if (!proj || !proj.allInFront || proj.x0 < -0.92 - 1e-3 || proj.x1 > 0.92 + 1e-3 || proj.y0 < -0.92 - 1e-3 || proj.y1 > 0.92 + 1e-3) {
            failReason = `outside safe frame at f=${f} (${proj?.x0?.toFixed(3)},${proj?.x1?.toFixed(3)},${proj?.y0?.toFixed(3)},${proj?.y1?.toFixed(3)})`;
            break;
          }
          const cPx = wordCapPx(aw, pF, tv, th);
          if (cPx < 65 - 1e-3) { failReason = `cap ${cPx.toFixed(1)}px < 65px`; break; }
          if (dot(aw.U, pF.U) < cos1 || dot(aw.R, pF.R) < cos1 || dot(aw.N, pF.N) <= 0) {
            failReason = `not upright within 1 deg`;
            break;
          }
          // Check nothing overlapping it on this frame.
          const fData = analyzeFrame(f);
          let overlapped = false;
          for (const op of fData.visPanels) {
            if (op.id === aw.plaque) continue;
            const opBox = plaqueAABB.get(op.id);
            if (rayIntersectsBox(pF.position, aw.C, opBox)) { overlapped = true; failReason = `occluded by slab ${op.id}`; break; }
          }
          if (!overlapped) {
            for (const [oid, oProj] of fData.wordProj) {
              if (oid === aw.id) continue;
              const ow = wordById.get(oid);
              if (ow.plaque === aw.plaque) continue;
              // If other word is closer (or on an open plaque overlapping 2D box), check 2D box overlap.
              const awPlaque = plaqueById.get(aw.plaque);
              const closerOrOpen = oProj.minDepth < proj.maxDepth - 1e-3 || awPlaque.surface === 'open';
              if (closerOrOpen && oProj.x0 < proj.x1 - 1e-4 && oProj.x1 > proj.x0 + 1e-4 && oProj.y0 < proj.y1 - 1e-4 && oProj.y1 > proj.y0 + 1e-4) {
                overlapped = true;
                failReason = `overlapped by word ${oid} (${ow.text})`;
                break;
              }
            }
          }
          if (overlapped) break;
          streak++;
          if (streak >= 8) break;
        }
        if (streak < 8) {
          fail('13.1.1_readable_anchor', `${aw.id} (${aw.text}) from f=${popF}: ${streak} frames (${failReason})`);
        }
      }
    }
  }

  // Finalize 13.1.2 Rider seen count >= 3 frames.
  for (const [wid, count] of riderSeenFrames) {
    if (count < 3) {
      fail('13.1.2_rider_seen', `rider ${wid} (${wordById.get(wid).text}) seen >=50% in frame on only ${count} frames < 3`);
    }
  }

  // 13.1.7 Move floors and max_still + 0.2 s stretch outside reveal.
  for (const key of scene.cams) {
    if (key.kind === 'transit' && key.verb !== 'cut') {
      const durSec = (key.f1 - key.f0) / fps;
      // Spec 48.2: follow keys have a 4-frame floor; pivot keys keep their kind's floor.
      if (J && key.verb === 'follow') {
        if (key.f1 - key.f0 < 4) fail('13.1.7_floors_and_stillness', `follow f=${key.f0}..${key.f1} under 4 frames`);
        continue;
      }
      if (J && key.joint && CATALOGUE[key.joint]?.floor) {
        if (key.f1 - key.f0 < CATALOGUE[key.joint].floor) fail('13.1.7_floors_and_stillness', `pivot ${key.joint} f=${key.f0}..${key.f1} under ${CATALOGUE[key.joint].floor} frames`);
        continue;
      }
      const fl = moveFloor(key.fold ?? 'flat');
      if (durSec < fl - 1e-6 || durSec < 0.20 - 1e-6) {
        fail('13.1.7_floors_and_stillness', `transit f=${key.f0}..${key.f1} (${key.fold}/${key.verb}) dur ${durSec.toFixed(3)}s < floor ${fl}s`);
      }
    }
  }
  const maxAllowedStillFrames = Math.round((maxStill(bpm) + 0.2) * fps);
  const popFrames = new Set(scene.words.map(w => w.on));
  // In preset mode, rule 10.8 forbids accents on the last shot while rule 14.4 holds reveal until after the last anchor's onset.
  const lastShotId = scene.plaques.at(-1)?.id;
  const lastShotOnsetFrames = new Set(
    scene.words.filter(w => w.plaque === lastShotId && w.role !== 'rider')
      .map(w => Math.max(0, Math.round((wordMeta.get(w.id)?.word.t ?? 0) * fps) - 1))
  );
  let idleStreak = 0;
  const firstLandF = events[0]?.frame ?? 0;
  for (let f = firstLandF + 1; f < revealF0; f++) {
    const moving = !posesEqual(poses[f], poses[f - 1]) || (J && scene.words.some(w => (w.motion ?? []).some(m => f >= m.f0 && f <= m.f1)));
    const popped = (wordsMode === 'pop' && popFrames.has(f)) || (wordsMode === 'preset' && lastShotOnsetFrames.has(f));
    if (moving || popped) idleStreak = 0;
    else {
      idleStreak++;
      if (idleStreak > maxAllowedStillFrames) {
        fail('13.1.7_floors_and_stillness', `idle stretch ${idleStreak}f (${(idleStreak / fps).toFixed(2)}s) > max_still+0.2 at f=${f}`);
        idleStreak = 0; // report once per stretch
      }
    }
  }

  // 13.1.8 Trail: 9.6.2 (a) solid trail, (b) hairpin, (c) corkscrew.
  const turnHistory = [];
  for (let i = 1; i < placedPlaques.length; i++) {
    const p = placedPlaques[i];
    const bnd = trailBoundaries[i];
    const fold = bnd.fold;
    const grown = slabBounds(p, 60);
    const exact = slabBounds(p, 0);
    for (let j = 0; j < i; j++) {
      const other = slabBounds(placedPlaques[j], 0);
      if (fold === 'flip' && j === i - 1) {
        if (boxesIntersect(exact, other)) fail('13.1.8_trail', `p${i + 1} intersects p${j + 1} (flip)`);
      } else if (J && j === i - 1 && ATTACHED_KINDS.includes(bnd.kind)) {
        // Spec 41.3 / 48.3: attached pair treated as 1 unit thick, candidate shrunk by 1 unit.
        if (boxesIntersect(slabBounds({ ...p, thickness: 1 }, -1), slabBounds({ ...placedPlaques[j], thickness: 1 }, 0))) {
          fail('13.1.8_trail', `p${i + 1} (attached ${bnd.kind}) intersects p${j + 1}`);
        }
      } else {
        if (boxesIntersect(grown, other)) fail('13.1.8_trail', `p${i + 1} grown(60) intersects p${j + 1}`);
      }
    }
    if (i >= 2 && fold !== 'flip' && fold !== 'jump') {
      if (!hairpinOK(slabCenter(placedPlaques[i - 2]), slabCenter(placedPlaques[i - 1]), slabCenter(p))) {
        fail('13.1.8_trail', `hairpin at p${i + 1}`);
      }
    }
    const axis = FOLD_AXIS[fold];
    const effSign = effectiveTurnSign(fold, bnd.edge, bnd.sign);
    if (axis !== 'none' && axis !== 'depth' && effSign !== 0) {
      if (turnHistory.length >= 2) {
        const t1 = turnHistory.at(-1), t2 = turnHistory.at(-2);
        if (t1.axis === axis && t2.axis === axis && t1.sign === effSign && t2.sign === effSign) {
          fail('13.1.8_trail', `corkscrew at p${i + 1} (${axis} ${effSign})`);
        }
      }
      turnHistory.push({ axis, sign: effSign });
    }
  }

  // 13.1.9 Sync: every word on by onset frame; every landing completes onsetFrame - 1 (+-1 frame).
  for (const w of scene.words) {
    const m = wordMeta.get(w.id);
    const onsetF = Math.round(m.word.t * fps);
    if (w.on > onsetF) {
      fail('13.1.9_sync', `word ${w.id} on=${w.on} > onsetF=${onsetF}`);
    }
  }
  if (J) {
    for (const w of scene.words) {
      const j = w.joint;
      if (!j || ['pop', 'travel'].includes(j.prim)) continue;
      const onsetF = Math.round(wordMeta.get(w.id).word.t * fps);
      if (j.mode === 'attack') {
        if (j.f1 > onsetF + 5) fail('13.1.9_sync', `attack ${w.id} (${w.text}) settles at ${j.f1} > onset+5 ${onsetF + 5}`);
        // Half revealed by onset + 2: the sharp ease passes 0.5 within 2 frames only when D <= 6 and f0 = L.
        if (j.f0 > onsetF - 1 || j.f1 - j.f0 > 6) fail('13.1.9_sync', `attack ${w.id} (${w.text}) not half revealed by onset+2`);
      } else if (j.f1 > onsetF && !(j.carried && w.role === 'rider')) {
        // A rider carried by a pivot may be sung while the camera is still turning (Clip A pins THE inside the flip).
        fail('13.1.9_sync', `${j.mode} ${w.id} (${w.text}) settles at ${j.f1} > onset ${onsetF}`);
      }
    }
  }
  for (const ev of events) {
    const expected = Math.max(0, ev.landing.onsetFrame - 1);
    const ej = ev.landing.entryJoint;
    if (J && ej && ej.mode === 'attack' && ev.frame >= expected - 1 && ev.frame <= expected + 6) continue;
    // Rough cut 2: a pivot now lands by the earliest onset of the words it carries (plan_joints.mjs planPivot), which
    // may be before the anchor's onset.
    const fpsS = scene.meta?.fps ?? 30;
    const groupFirst = Math.min(...(ev.landing.groupWords ?? []).map(g => (g.t != null ? Math.max(0, Math.round(g.t * fpsS) - 1) : Infinity)));
    // The same holds for a cut (travel) landing, which arrives on the group's first sung word.
    // Amendment 8 (Neon): only pivot and travel (cut) landings take the group-first tolerance.
    if (J && ej && (ej.carriedIds || ej.prim === 'travel') && Math.abs(ev.frame - Math.min(expected, groupFirst)) <= 1) continue;
    if (Math.abs(ev.frame - expected) > 1) {
      fail('13.1.9_sync', `landing at f=${ev.frame} differs from expected ${expected}`);
    }
  }

  // 13.1.11 Window discipline: plaques i and i-1 never off during shot i (except i-1 left by depth).
  for (let si = 0; si < shots.length; si++) {
    const shotLandings = cameraPlan.shotLandings[si];
    const sStart = shotLandings[0].landingFrame;
    const nextShotEntry = si + 1 < shots.length ? cameraPlan.cams.find(k => k.isShotEntry && k.shotIndex === si + 1) : null;
    const sEnd = nextShotEntry ? Math.max(sStart, nextShotEntry.f0 - 1) : revealF0 - 1;
    const pi = scene.plaques[si];
    const prevP = si > 0 ? scene.plaques[si - 1] : null;
    const prevLeftByDepth = si > 0 && trailBoundaries[si].fold === 'depth';
    for (let f = sStart; f <= sEnd; f++) {
      if (!isVisible(pi, f)) {
        fail('13.1.11_window_discipline', `plaque p${si + 1} off during shot ${si + 1} at f=${f}`);
        break;
      }
      if (prevP && !prevLeftByDepth && !isVisible(prevP, f)) {
        fail('13.1.11_window_discipline', `plaque p${si} off during shot ${si + 1} at f=${f}`);
        break;
      }
    }
  }

  // 13.1.12 Reveal (14.5): last frame every plaque on, all corners in frame, <= 25% more than half covered.
  const lastF = frames - 1;
  const lastPose = poses[lastF];
  for (const p of scene.plaques) {
    if (!isVisible(p, lastF)) {
      fail('13.1.12_reveal', `plaque ${p.id} not visible on last frame ${lastF}`);
    }
    for (const c of plaqueCorners8(p)) {
      const q = I.project(c, lastPose, vfov);
      if (!q || Math.abs(q.x) > 1 + 1e-3 || Math.abs(q.y) > 1 + 1e-3) {
        fail('13.1.12_reveal', `plaque ${p.id} corner outside frame on last frame (${q?.x?.toFixed(3)}, ${q?.y?.toFixed(3)})`);
        break;
      }
    }
  }
  if (cameraPlan.revealEval.flagged || cameraPlan.revealEval.chosen.coverShare > 0.25 + 1e-6) {
    fail('13.1.12_reveal', `reveal coverShare ${(cameraPlan.revealEval.chosen.coverShare * 100).toFixed(1)}% > 25%`);
  }

  // ---------- Attached word transitions (spec 47) ----------
  const jointTerms = { joint_variety: 0, attach: 0, mix: 0, forced_repeats: 0, pivot_purity: 1 };
  const jointsCount = J && jointPlan ? jointPlan.joints.length : 0;
  if (J) {
    const joints = jointPlan ? jointPlan.joints : [];
    const anchorJ = joints.filter(j => j.track === 'anchor');
    const cosA40 = Math.cos((40 * Math.PI) / 180);

    // 13.1.13 Protected reading (item 15): 15 readable frames, 8 consecutive with the camera dead still.
    for (const aw of scene.words) {
      if (aw.role === 'rider') continue;
      const start = aw.on;
      const end = Math.min(revealF0, aw.off ?? revealF0);
      let readable = 0, still = 0, bestStill = 0;
      for (let f = start; f < end && !(readable >= 15 && bestStill >= 8); f++) {
        const pF = poses[f];
        let ok = isVisible(aw, f) && !(aw.motion ?? []).some(m => f >= m.f0 && f < m.f1);
        if (ok) {
          const full = wordFullPolygonAt(aw, f), cut = cornersAt(aw, f);
          ok = !!cut && Math.abs(polyArea3(cut) - polyArea3(full)) <= 1e-6 * Math.max(1, polyArea3(full));
        }
        let proj = null;
        if (ok) { proj = projWordAt(aw, f, pF); ok = !!proj && proj.allInFront && proj.inFrameShare >= 0.9; }
        if (ok) ok = dot(aw.N, pF.N) >= cosA40 && wordCapPx(aw, pF, tv, th) >= 65 - 1e-3;
        if (ok) {
          readable++;
          if (f > start && posesEqual(pF, poses[f - 1])) { still++; bestStill = Math.max(bestStill, still); } else { still = 1; bestStill = Math.max(bestStill, still); }
        } else still = 0;
      }
      if (readable < 15 || bestStill < 8) fail('13.1.13_protected_reading', `${aw.id} (${aw.text}) ${aw.joint?.prim ?? ''}: ${readable} readable, ${bestStill} still in a row`);
    }

    // 13.1.14 Variety: V1 on both tracks, V2 on the anchor track, V3 on boundaries, run rules, forced-repeat cap.
    const ordered = [...joints].sort((a, b) => a.index - b.index);
    const sameRun = (a, b) => a.run != null && a.run === b.run;
    const checkV1 = (list, name) => {
      for (let k = 1; k < list.length; k++) {
        const a = list[k - 1], b = list[k];
        if (a.prim === b.prim && !(sameRun(a, b) && a.prim !== 'pop') && !b.forced_repeat) fail('13.1.14_variety', `V1 ${name}: ${a.text} and ${b.text} both ${b.prim}`);
      }
    };
    checkV1(ordered, 'full');
    checkV1(anchorJ, 'anchor');
    for (let k = 1; k < anchorJ.length; k++) {
      const a = anchorJ[k - 1], b = anchorJ[k];
      if (['pop', 'travel'].includes(a.prim) || ['pop', 'travel'].includes(b.prim) || sameRun(a, b) || b.forced_repeat) continue;
      if (a.family === b.family && (a.edge ?? null) === (b.edge ?? null)) fail('13.1.14_variety', `V2: ${a.text} and ${b.text} share ${b.family}/${b.edge}`);
    }
    for (let i = 2; i < trailBoundaries.length; i++) {
      const a = trailBoundaries[i - 1].kind, b = trailBoundaries[i].kind;
      if (a && a === b && a !== 'butt') fail('13.1.14_variety', `V3: boundaries ${i} and ${i + 1} both ${b}`);
      if (a === 'butt' && b === 'butt' && trailBoundaries[i - 2]?.kind === 'butt' && i >= 3) fail('13.1.14_variety', `V3: three butts in a row at ${i + 1}`);
    }
    const runs = new Map();
    for (const j of ordered) if (j.run != null) (runs.get(j.run) ?? runs.set(j.run, []).get(j.run)).push(j);
    for (const [ri, list] of runs) {
      const tail = list.slice(1); // joints 2..n
      for (let k = 0; k < tail.length; k++) {
        const seg = Math.floor((k + 1) / 4);
        const ref = tail.find((x, kk) => Math.floor((kk + 1) / 4) === seg);
        if (tail[k].prim !== ref.prim && !tail[k].forced_repeat) fail('13.1.14_variety', `run ${ri + 1}: joint ${k + 2} ${tail[k].prim} differs from ${ref.prim}`);
      }
      let streak = 1;
      for (let k = 1; k < tail.length; k++) { streak = tail[k].prim === tail[k - 1].prim ? streak + 1 : 1; if (streak > 4) fail('13.1.14_variety', `run ${ri + 1}: more than 4 joints share ${tail[k].prim}`); }
      const after = ordered.find(j => j.index > list.at(-1).index);
      const last = list.at(-1);
      if (after && (after.prim === last.prim || after.family === last.family) && !after.forced_repeat) fail('13.1.14_variety', `32.5: ${after.text} after run repeats ${last.prim}/${last.family}`);
    }
    const forcedN = ordered.filter(j => j.forced_repeat).length;
    if (forcedN > 2 * Math.max(1, Math.ceil(ordered.length / 30))) fail('13.1.14_variety', `${forcedN} forced repeats for ${ordered.length} joints`);

    const byPlaqueJ = new Map(scene.plaques.map(p => [p.id, p]));
    // 13.1.15 Attachment: hinge line or clip plane near the host edge at f0, overlap rule, host 60% in frame.
    for (const j of ordered) {
      const cat = CATALOGUE[j.prim];
      if (!cat || cat.actor !== 'object' || !j.host || j.tickRail) continue;
      const G = wordById.get(j.word), H = wordById.get(j.host);
      const minCap = Math.min(G.cap, H.cap);
      const hShift = (H.motion ?? []).length ? I.wordShift(H, j.f0) : [0, 0, 0];
      const Hc = add(H.C, hShift);
      // Host edge named by the joint, in the plaque's frame; the host is taken at its pose at f0 (pre-offset included).
      const PL = byPlaqueJ.get(G.plaque);
      const ax = { right: PL.R, left: mul(PL.R, -1), top: PL.U, bottom: mul(PL.U, -1) }[j.edge] ?? PL.R;
      const half = Math.abs(dot(H.R, ax)) > 0.5 ? H.w / 2 : H.h / 2;
      const edgeOff = dot(Hc, ax) + half;
      let refPoint = null;
      const seg0 = (G.motion ?? []).find(m => m.f0 === j.f0 && (m.kind === 'hinge' || m.kind === 'scale'));
      const clip0 = (G.clip ?? []).find(c => c.f0 === j.f0);
      if (clip0) refPoint = add(clip0.P, clip0.ride ? I.wordShift(wordById.get(clip0.ride), j.f0) : [0, 0, 0]);
      else if (seg0) refPoint = add(seg0.P, (G.motion ?? []).some(m => m.kind === 'shift') ? I.wordShift(G, j.f0) : [0, 0, 0]);
      if (refPoint && !['rail', 'dock'].includes(j.prim) && Math.abs(dot(refPoint, ax) - edgeOff) > 0.35 * minCap + 1e-6) {
        fail('13.1.15_attachment', `${G.text} ${j.prim}: hinge/clip ${Math.abs(dot(refPoint, ax) - edgeOff).toFixed(2)} from ${H.text} edge`);
      }
      for (let f = j.f0; f <= j.f1; f++) {
        const pr = projWordAt(H, f, poses[f]);
        if (!pr || pr.inFrameShare < 0.6 - 1e-6) { fail('13.1.15_attachment', `${G.text} ${j.prim}: host ${H.text} under 60% in frame at f=${f}`); break; }
      }
    }

    // 13.1.16 Clean motion.
    const byPlaque = new Map(scene.plaques.map(p => [p.id, p]));
    for (const w of scene.words) {
      if (!(w.motion ?? []).length) continue;
      const P = byPlaque.get(w.plaque);
      const lastEnd = Math.max(...w.motion.map(m => m.f1));
      if (lastEnd >= revealF0) fail('13.1.16_clean_motion', `${w.text} motion ends ${lastEnd} after reveal ${revealF0}`);
      if (P.off != null && lastEnd >= P.off) fail('13.1.16_clean_motion', `${w.text} motion ends ${lastEnd} after its plaque hides at ${P.off}`);
      const hostId = w.joint?.host;
      // Ruling A9.2: a moving word's ink overlaps another visible word's ink, both inside the frame, for 2 or more
      // consecutive frames (host and its pusher excepted). Overlap is measured on the in-frame parts of the projected
      // (clipped) ink polygons' boxes, so words off screen, switched off or clipped away no longer count.
      for (const m of w.motion) {
        const runs = new Map();
        for (let f = m.f0; f <= m.f1; f += 1) {
          if (!isVisible(w, f) || m.kind === 'hinge') continue;
          const pw = projWordAt(w, f, poses[f]);
          if (!pw || pw.inFrameArea < 1e-6) { runs.clear(); continue; }
          const bw = boxOf(pw.inScreen);
          for (const o of scene.words) {
            if (o.id === w.id || o.id === hostId || !isVisible(o, f) || o.joint?.host === w.id) continue;
            const po = projWordAt(o, f, poses[f]);
            if (!po || po.inFrameArea < 1e-6) { runs.delete(o.id); continue; }
            const bo = boxOf(po.inScreen), m2 = 0.002;
            const hit = bw.x0 < bo.x1 - m2 && bw.x1 > bo.x0 + m2 && bw.y0 < bo.y1 - m2 && bw.y1 > bo.y0 + m2;
            const n = hit ? (runs.get(o.id) ?? 0) + 1 : 0;
            runs.set(o.id, n);
            if (n === 2) fail('13.1.16_clean_motion', `f=${f - 1}: moving ${w.text} overlaps ${o.text}`);
          }
        }
      }
      for (const m of w.motion) {
        if (w.joint?.prim === 'fold-down' && m.kind === 'hinge') {
          for (let f = m.f0; f <= m.f1; f++) {
            const full = wordFullPolygonAt(w, f);
            const dmin = Math.min(...full.map(q => Math.hypot(...sub(q, poses[f].position))));
            if (dmin < 0.5 * poses[f].dist) { fail('13.1.16_clean_motion', `fold-down ${w.text} within half the camera distance at f=${f}`); break; }
          }
        }
      }
    }
    const ent = ordered.filter(j => j.f1 > j.f0 && !j.carried && !j.carriedIds).sort((a, b) => a.f0 - b.f0);
    // Rough cut 2 (22 November 2026): a zoom grows in place and touches no other word, so its timing may overlap a
    // neighbouring entrance; real collisions are caught by the in-frame ink-box overlap test above.
    // Amendment 5 (Fable 11): a zoom may overlap a neighbouring entrance by at most 2 frames.
    for (let k = 1; k < ent.length; k++) if (ent[k].f0 < ent[k - 1].f1 - ((ent[k].prim === 'zoom' || ent[k - 1].prim === 'zoom') ? 2 : 0)) fail('13.1.16_clean_motion', `entrances overlap: ${ent[k - 1].text} ${ent[k - 1].f0}-${ent[k - 1].f1} and ${ent[k].text} ${ent[k].f0}-${ent[k].f1}`);

    // 13.1.17 Families.
    const famCount = fam => anchorJ.filter(j => j.family === fam).length;
    const need = anchorJ.length >= 40 ? 2 : anchorJ.length >= 12 ? 1 : 0;
    for (const fam of ['slide', 'hide', 'push', 'hinge']) if (famCount(fam) < need) fail('13.1.17_families', `${fam} used ${famCount(fam)} times (< ${need}) over ${anchorJ.length} anchor joints`);

    // Score terms (spec 49).
    jointTerms.joint_variety = Math.min(1, new Set(ordered.map(j => j.prim)).size / 10);
    const attachedShare = anchorJ.length ? anchorJ.filter(j => !['pop', 'travel'].includes(j.prim)).length / anchorJ.length : 0;
    jointTerms.attach = Math.min(1, attachedShare / 0.6);
    let met = 0;
    for (const [fam, [lo, hi]] of Object.entries(MIX_BANDS)) {
      const share = anchorJ.length ? anchorJ.filter(j => (j.family === 'flip' ? 'flip' : j.family) === fam).length / anchorJ.length : 0;
      if (share >= lo - 1e-9 && share <= hi + 1e-9) met++;
    }
    jointTerms.mix = met / Object.keys(MIX_BANDS).length;
    jointTerms.forced_repeats = forcedN;
    const pivotKeys = scene.cams.filter(k => k.pivot);
    let pivFrames = 0, pureFrames = 0;
    for (const k of pivotKeys) {
      const si = k.shotIndex ?? scene.plaques.findIndex(p => k.to && Math.abs(dot(sub(k.to.target, p.C), p.N) - 0.5) < 2) ;
      for (let f = k.f0; f < k.f1; f++) {
        pivFrames++;
        let cover = 0;
        for (const p of scene.plaques) {
          if (!isVisible(p, f)) continue;
          const pi = scene.plaques.indexOf(p);
          if (pi === si || pi === si - 1) continue;
          const pr = projectQuad(plaqueFrontCornersMap.get(p.id), poses[f], tv, th);
          if (pr) cover += pr.inFrameArea / 4;
        }
        if (cover < 0.04) pureFrames++;
      }
    }
    jointTerms.pivot_purity = pivFrames ? pureFrames / pivFrames : 1;
  }

  // ---------- Score terms (13.2.1) ----------
  const neighbour = posterLandingsCount > 0 ? posterWithNeighbourCount / posterLandingsCount : 0;
  const fill = landingCount > 0 ? landingFillSum / landingCount : 0;

  const actualBounds = trailBoundaries.slice(1);
  const distinctFolds = new Set(actualBounds.map(b => b.fold)).size;
  let variety = Math.min(1, distinctFolds / 6);
  const ordinaryBounds = actualBounds.filter(b => !b.isSetPiece && !b.isEcho);
  if (ordinaryBounds.length >= 8) {
    const counts = new Map();
    for (const b of ordinaryBounds) counts.set(b.fold, (counts.get(b.fold) ?? 0) + 1);
    const maxShare = Math.max(...counts.values()) / ordinaryBounds.length;
    if (maxShare > 0.45) variety = 0;
  }

  const setPieces = actualBounds.filter(b => b.isSetPiece);
  const peaks = setPieces.length > 0
    ? setPieces.filter(b => b.fold === b.intendedFold).length / setPieces.length
    : 1;

  // Reveal score (13.2.1): 0.5 * (trail bbox fill of 86% box) + 0.5 * min(1, summed projected plaque area / (0.25 * frame area)).
  let rx0 = Infinity, rx1 = -Infinity, ry0 = Infinity, ry1 = -Infinity;
  let summedPlaqueArea = 0;
  for (const p of scene.plaques) {
    for (const c of plaqueCorners8(p)) {
      const q = I.project(c, lastPose, vfov);
      if (q) {
        if (q.x < rx0) rx0 = q.x;
        if (q.x > rx1) rx1 = q.x;
        if (q.y < ry0) ry0 = q.y;
        if (q.y > ry1) ry1 = q.y;
      }
    }
    const frontFacing = dot(p.N, sub(lastPose.position, p.C)) >= 0;
    const proj = projectQuad(frontFacing ? plaqueFrontCornersMap.get(p.id) : plaqueBackCornersMap.get(p.id), lastPose, tv, th);
    if (proj) summedPlaqueArea += proj.inFrameArea;
  }
  const cx0 = Math.max(-0.86, rx0), cx1 = Math.min(0.86, rx1);
  const cy0 = Math.max(-0.86, ry0), cy1 = Math.min(0.86, ry1);
  const boxFill = (cx1 > cx0 && cy1 > cy0) ? ((cx1 - cx0) * (cy1 - cy0)) / (1.72 * 1.72) : 0;
  const areaTerm = Math.min(1, summedPlaqueArea / (0.25 * 4));
  const upsideDownShare = cameraPlan.revealEval.chosen.upsideDownShare ?? 0;
  const reveal = (0.5 * boxFill + 0.5 * areaTerm) * (1 - 0.5 * upsideDownShare);

  const pace = cameraPlan.shotCameraLogs.filter(l => l.paceFirstDrawOk).length / Math.max(1, shots.length);

  // verb_mix: windows of 4 consecutive shot-entry moves containing >=1 of {cut, whip} and >=1 of {sweep, glide}.
  const entryVerbs = cameraPlan.shotCameraLogs.slice(1).map(l => l.entryVerb);
  let verbMix = 1;
  if (entryVerbs.length >= 4) {
    let okWins = 0;
    const totalWins = entryVerbs.length - 3;
    for (let i = 0; i < totalWins; i++) {
      const win = entryVerbs.slice(i, i + 4);
      const hasFast = win.some(v => v === 'cut' || v === 'whip');
      const hasSmooth = win.some(v => v === 'sweep' || v === 'glide' || v === 'follow' || v === 'pivot');
      if (hasFast && hasSmooth) okWins++;
    }
    verbMix = okWins / totalWins;
  }

  const seenHidesCount = cameraPlan.plaqueTiming.filter(pt => pt.offOnScreen).length;
  const seen_hides = seenHidesCount / Math.max(1, shots.length);

  const fallbackCount = actualBounds.filter(b => b.fallbackUsed).length;
  const jumpCount = actualBounds.filter(b => b.isJump).length;
  const fallbacks = actualBounds.length > 0 ? (fallbackCount + 2 * jumpCount) / actualBounds.length : 0;

  const b2Bounds = actualBounds.filter(b => b.bClass === 'B2');
  const flow_breaks = b2Bounds.length > 0
    ? b2Bounds.filter(b => b.flowBreak).length / b2Bounds.length
    : 0;

  // Ruling A3, A6, A7, A8, A10 (Fable, 22 November 2026): demote former vetoes to score terms or logged flags.
  const flags = [];
  const nJ = Math.max(1, jointsCount);
  const varietyMsgs = checks['13.1.14_variety'].failures;
  const runMismatch = varietyMsgs.filter(m => /^run \d+: joint/.test(m)).length;
  const v2v3 = varietyMsgs.filter(m => /^V2|^V3|^32\.5/.test(m)).length;
  const demote = (name, keep = () => false) => {
    const c = checks[name], moved = c.failures.filter(m => !keep(m));
    for (const m of moved) flags.push(`${name}: ${m}`);
    c.failures = c.failures.filter(keep); c.pass = c.failures.length === 0;
  };
  demote('13.1.4_no_wall_of_lines');
  demote('13.1.12_reveal');
  demote('13.1.14_variety');
  demote('13.1.17_families');
  // A8.1 time-boxed bug hunt: the shove contact-distance message (always RING, always 416-423 px) was not explained in
  // the time box, so shove's hinge/clip distance is a logged flag; A8.3 host-in-frame is a logged flag too (eligibility
  // in planJoints not built). Contact distance for the other primitives stays hard.
  demote('13.1.15_attachment', m => !/ shove: hinge\/clip /.test(m) && !/host .* under 60% in frame/.test(m));
  const joint_variety = J ? jointTerms.joint_variety : variety;
  const terms = { neighbour, fill, joint_variety, peaks, reveal, pace, verb_mix: verbMix, seen_hides, fallbacks, flow_breaks, attach: jointTerms.attach, mix: jointTerms.mix, forced_repeats: (jointTerms.forced_repeats * 30) / nJ, pivot_purity: jointTerms.pivot_purity,
    wall_of_lines: wallLandings ? wallBreaks / wallLandings : 0, run_mismatch: (runMismatch * 30) / nJ, v2v3_breaks: (v2v3 * 30) / nJ };
  const score = scoreFromTerms(terms);
  const failedChecks = CHECK_NAMES.filter(name => !checks[name].pass);

  return {
    passed: failedChecks.length === 0,
    failedChecks,
    checks,
    flags,
    terms,
    score,
    stats: {
      maxBlankStreak,
      seenHidesCount,
      fallbackCount,
      jumpCount,
      backtracks: trailBoundaries.backtracks ?? 0,
    },
  };
}
