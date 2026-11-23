// Plaque composition: rulebook section 7.
import { stream, weightedChoice, cooldownFactor } from './rng.mjs';
import { KIT, JERSEY_BOLD, isJerseyFont } from './style.mjs';

export function measure(text, font, cap, metrics) {
  const m = metrics.fonts[font];
  if (!m) throw Error(`Missing font metrics: ${font}`);
  const fontPx = cap / m.cap;
  let advance = 0, previous = '';
  for (const ch of text) {
    advance += (m.adv[ch] ?? m.fallback) + (m.kern[previous + ch] ?? 0);
    previous = ch;
  }
  return { textW: advance * fontPx, fontPx };
}

// Spec 40.2: per-letter x extents (centred on the word box centre, in the word's own units) for `sprout`.
export function letterExtents(text, font, cap, metrics) {
  const m = metrics.fonts[font];
  if (!m) return null;
  const fontPx = cap / m.cap;
  const { textW } = measure(text, font, cap, metrics);
  const out = [];
  let x = -textW / 2, previous = '';
  for (const ch of text) {
    x += (m.kern[previous + ch] ?? 0) * fontPx;
    const a = (m.adv[ch] ?? m.fallback) * fontPx;
    out.push({ ch, x0: x, x1: x + a, cx: x + a / 2 });
    x += a;
    previous = ch;
  }
  return out;
}

// Jersey fonts are drawn bold by an outward stroke JERSEY_BOLD x cap wide (brief 5): the box carries that width so
// layout and the overlap checks see the drawn letters. Song setting jersey_bold reaches here as KTE_JERSEY_BOLD.
export const jerseyBold = () => Number(process.env.KTE_JERSEY_BOLD ?? JERSEY_BOLD);
export function wordBox(text, font, cap, kind, metrics) {
  const m = measure(text, font, cap, metrics), fontPx = m.fontPx;
  const textW = m.textW + (isJerseyFont(font) ? jerseyBold() * cap : 0);
  const block = kind === 'block';
  const pad = (block ? 0.28 : 0.08) * cap;
  return { w: textW + 2 * pad, h: cap + 2 * pad + (block ? 0.10 : 0.15) * cap, fontPx, pad };
}

// Coordinates in plaque space, x right and y up.
// Each placed word keeps:
//   boxW, boxH: unrotated word box dimensions (for PlaneGeometry in viewer)
//   w, h: axis-aligned plaque-space extents (for layout packing; swapped if turn is +-90)
//   turn: rotation in degrees about +N (0, +90 CCW, -90 CW)
export function clusterBlock(cluster, arrangement, metrics) {
  const { anchor, riders = [] } = cluster;
  const ab = wordBox(anchor.text, anchor.font, anchor.cap, anchor.kind, metrics);
  const a = { ...ab, boxW: ab.w, boxH: ab.h, word: anchor, x: 0, y: 0, turn: 0, scale: 1 };
  const rs = riders.map(word => {
    const rb = wordBox(word.text, word.font, word.cap, word.kind, metrics);
    return { ...rb, boxW: rb.w, boxH: rb.h, word, x: 0, y: 0, turn: 0, scale: 1 };
  });
  const gap = 0.10 * anchor.cap;
  const between = (left, right) => 0.25 * Math.sqrt(left.word.cap * right.word.cap);
  if (!rs.length && arrangement !== 'none') throw Error('A rider arrangement needs riders');
  if (rs.length === 1 && !['above-left', 'left-top', 'perp-left'].includes(arrangement)) throw Error('Invalid single-rider arrangement');
  if (rs.length > 1 && !['inline-left', 'left-top', 'above-left'].includes(arrangement)) throw Error('Invalid multiple-rider arrangement');

  if (arrangement === 'perp-left') {
    const r = rs[0];
    if (r.boxW * 0.8 > a.boxH) throw Error('perp-left rider cannot fit the anchor edge');
    const scale = Math.min(1, a.boxH / r.boxW);
    r.boxW *= scale;
    r.boxH *= scale;
    r.fontPx *= scale;
    r.pad *= scale;
    r.scale = scale;
    r.turn = 90;
    r.w = r.boxH;
    r.h = r.boxW;
    r.x = -a.w / 2 - gap - r.w / 2;
    r.y = 0;
  } else if (arrangement === 'left-top') {
    let top = a.h / 2;
    for (let i = 0; i < rs.length; i++) {
      const r = rs[i];
      r.x = -a.w / 2 - gap - r.w / 2;
      r.y = top - r.h / 2;
      top -= r.h + (rs[i + 1] ? between(r, rs[i + 1]) : 0);
    }
  } else if (arrangement === 'above-left' || arrangement === 'inline-left') {
    const width = rs.reduce((n, r, i) => n + r.w + (i ? between(rs[i - 1], r) : 0), 0);
    let left = arrangement === 'above-left' ? -a.w / 2 : -a.w / 2 - gap - width;
    for (let i = 0; i < rs.length; i++) {
      const r = rs[i];
      r.x = left + r.w / 2;
      r.y = arrangement === 'above-left' ? a.h / 2 + gap + r.h / 2 : -anchor.cap / 2 + r.word.cap / 2;
      left += r.w + (rs[i + 1] ? between(r, rs[i + 1]) : 0);
    }
  }
  const words = [a, ...rs];
  const x0 = Math.min(...words.map(w => w.x - w.w / 2));
  const x1 = Math.max(...words.map(w => w.x + w.w / 2));
  const y0 = Math.min(...words.map(w => w.y - w.h / 2));
  const y1 = Math.max(...words.map(w => w.y + w.h / 2));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  for (const w of words) { w.x -= cx; w.y -= cy; }
  return { w: x1 - x0, h: y1 - y0, words, arrangement };
}

const SLOTS = [['narrow', KIT.narrow], ['standard', KIT.standard], ['wide', KIT.wide]];

function fontForWord(word, slotFont, adlibShot) {
  if (adlibShot || word.isDigit || word.accent) return KIT.accent;
  return slotFont;
}

function tryClusterBlock(cluster, slotFont, adlibShot, metrics) {
  const arr = cluster.arrangement ?? 'none';
  try {
    return clusterBlock({
      anchor: { ...cluster.anchor, font: fontForWord(cluster.anchor, slotFont, adlibShot) },
      riders: (cluster.riders ?? []).map(w => ({ ...w, font: fontForWord(w, slotFont, adlibShot) })),
    }, arr, metrics);
  } catch {
    return null;
  }
}

function splitRows(n, k, start = 0) {
  if (k === 1) return [[[start, n]]];
  const out = [];
  for (let end = start + 1; end <= n - k + 1; end++) {
    for (const tail of splitRows(n, k - 1, end)) out.push([[start, end], ...tail]);
  }
  return out;
}

function slotAssignments(n) {
  if (n === 0) return [[]];
  return slotAssignments(n - 1).flatMap(a => SLOTS.map(s => [...a, s]));
}

function scoreCandidate({ words, W, height, dValues, clusters, caps, contrast, rowCaps, rowCount, targetAspect = null }) {
  const area = words.reduce((n, w) => n + w.boxW * w.boxH, 0);
  const fill = area / (W * height);
  const fidelity = Math.max(0, 1 - dValues.reduce((n, x) => n + Math.abs(Math.log(x)), 0) / dValues.length / Math.log(1.30));
  const heroIndex = clusters.reduce((best, c, i) => (c.anchor.E ?? 0) > (clusters[best].anchor.E ?? 0) ? i : best, 0);
  const hero = caps[heroIndex] >= Math.max(...caps) - 1e-6 ? 1 : 0;
  const aspect = W / height;
  let aspectScore;
  if (targetAspect != null) {
    const lo = Math.max(0.55, targetAspect * 0.65), hi = Math.max(1.25, targetAspect * 1.45);
    aspectScore = aspect < lo ? Math.max(0, (aspect - 0.35) / Math.max(0.1, lo - 0.35))
      : aspect <= hi ? 1
      : Math.max(0, (hi + 1.4 - aspect) / 1.4);
  } else {
    aspectScore = aspect < 1 ? Math.max(0, (aspect - 0.6) / 0.4) : aspect <= 2.6 ? 1 : Math.max(0, (4 - aspect) / 1.4);
  }
  const sameText = new Set(clusters.map(c => c.anchor.text)).size === 1;
  const wall = rowCount === 3 && Math.max(...rowCaps) / Math.min(...rowCaps) <= 1.3 && !sameText ? 1 : 0;
  const Q = 0.35 * fill + 0.25 * fidelity + 0.20 * hero + 0.20 * aspectScore + 0.10 * contrast - 0.30 * wall;
  return { Q, terms: { fill, fidelity, hero, aspect: aspectScore, contrast, wall } };
}

// Enumerate and score the row family (7.4.1-7.4.3, 7.5).
export function enumerateRows(
  clusters,
  W,
  metrics,
  { mortar = 0.30, inlineJitter = [], lineJitter = [], align = 'left', rowAligns = null, adlibShot = false, allowRelaxed = false, targetAspect = null } = {}
) {
  if (!clusters.length) throw Error('A plaque needs at least one cluster');
  const all = [];
  for (let count = 1; count <= Math.min(3, clusters.length); count++) {
    for (const split of splitRows(clusters.length, count)) {
      for (const assignment of slotAssignments(count)) {
        let validBlocks = true;
        const rows = split.map(([start, end], ri) => {
          const [slot, font] = assignment[ri];
          const blocks = [];
          for (let ci = start; ci < end; ci++) {
            const blk = tryClusterBlock(clusters[ci], font, adlibShot, metrics);
            if (!blk) { validBlocks = false; break; }
            blocks.push(blk);
          }
          if (!validBlocks) return null;
          const gaps = blocks.slice(1).map((_, j) =>
            mortar * Math.sqrt(clusters[start + j].anchor.cap * clusters[start + j + 1].anchor.cap) * (inlineJitter[start + j] ?? 1)
          );
          return {
            start, end, slot, font, blocks, gaps,
            natural: blocks.reduce((n, b) => n + b.w, 0) + gaps.reduce((n, g) => n + g, 0),
          };
        });
        if (!validBlocks) continue;

        const scales = rows.map(r => W / r.natural);
        const ref = Math.exp(rows.reduce((n, r, i) => n + (r.end - r.start) * Math.log(scales[i]), 0) / clusters.length);
        const d = scales.map(s => s / ref);
        const minD = Math.min(...d);
        if (!allowRelaxed && minD < 0.78) continue;

        rows.forEach((r, i) => {
          r.d = Math.min(d[i], 1.30);
          r.scale = ref * r.d;
          r.width = r.natural * r.scale;
          r.height = Math.max(...r.blocks.map(b => b.h * r.scale));
          r.maxCap = Math.max(...clusters.slice(r.start, r.end).map(c => c.anchor.cap * r.scale));
        });
        const gaps = rows.slice(1).map((r, i) => mortar * Math.sqrt(rows[i].maxCap * r.maxCap) * (lineJitter[i] ?? 1));
        const height = rows.reduce((n, r) => n + r.height, 0) + gaps.reduce((n, g) => n + g, 0);
        const words = [];
        let top = height / 2;
        rows.forEach((r, ri) => {
          const rAlign = rowAligns?.[ri] ?? align;
          let x = rAlign === 'right' ? W / 2 - r.width : rAlign === 'centre' ? -r.width / 2 : -W / 2;
          const cy = top - r.height / 2;
          r.blocks.forEach((block, bi) => {
            const bx = x + block.w * r.scale / 2;
            for (const word of block.words) {
              words.push({
                ...word,
                x: bx + word.x * r.scale,
                y: cy + word.y * r.scale,
                w: word.w * r.scale,
                h: word.h * r.scale,
                boxW: word.boxW * r.scale,
                boxH: word.boxH * r.scale,
                fontPx: word.fontPx * r.scale,
                pad: word.pad * r.scale,
                cap: word.word.cap * r.scale * (word.scale ?? 1),
                font: word.word.font,
                slot: r.slot,
                rowScale: r.scale,
                cluster: r.start + bi,
                row: ri,
              });
            }
            x += block.w * r.scale + (r.gaps[bi] ?? 0) * r.scale;
          });
          top -= r.height + (gaps[ri] ?? 0);
        });
        const caps = clusters.map((c, i) => c.anchor.cap * rows.find(r => i >= r.start && i < r.end).scale);
        const contrast = rows.length > 1 ? rows.slice(1).filter((r, i) => r.slot !== rows[i].slot).length / (rows.length - 1) : 0;
        const { Q, terms } = scoreCandidate({
          words, W, height,
          dValues: rows.map(r => r.d),
          clusters, caps, contrast,
          rowCaps: rows.map(r => r.maxCap),
          rowCount: rows.length,
          targetAspect,
        });
        all.push({
          layout: `rows-${count}`,
          split,
          slots: assignment.map(x => x[0]),
          rows,
          words,
          w: W,
          h: height,
          refScale: ref,
          minD,
          Q,
          terms,
        });
      }
    }
  }
  return all;
}

// Enumerate two-up candidates (7.4.4): exactly 3 clusters with top-tier cluster first or last.
export function enumerateTwoUp(
  clusters,
  W,
  metrics,
  { mortar = 0.30, inlineJitter = [], lineJitter = [], adlibShot = false } = {}
) {
  if (clusters.length !== 3) return [];
  const heroIndex = clusters.reduce((best, c, i) => (c.anchor.E ?? 0) > (clusters[best].anchor.E ?? 0) ? i : best, 0);
  if (heroIndex !== 0 && heroIndex !== 2) return [];
  const bigFirst = heroIndex === 0;
  const bigCluster = clusters[heroIndex];
  const s1Cluster = clusters[bigFirst ? 1 : 0];
  const s2Cluster = clusters[bigFirst ? 2 : 1];
  const iJit = inlineJitter[0] ?? 1;
  const lJit = lineJitter[0] ?? 1;
  const all = [];

  for (const [bigSlot, bigFont] of SLOTS) {
    const bigBlk = tryClusterBlock(bigCluster, bigFont, adlibShot, metrics);
    if (!bigBlk) continue;
    for (const [stackSlot, stackFont] of SLOTS) {
      const b1 = tryClusterBlock(s1Cluster, stackFont, adlibShot, metrics);
      const b2 = tryClusterBlock(s2Cluster, stackFont, adlibShot, metrics);
      if (!b1 || !b2) continue;
      // Stack blocks scaled to common width u.
      const k1 = b1.h / b1.w, k2 = b2.h / b2.w;
      const c1 = s1Cluster.anchor.cap / b1.w, c2 = s2Cluster.anchor.cap / b2.w;
      const kLineGap = mortar * Math.sqrt(c1 * c2) * lJit;
      const kH = k1 + k2 + kLineGap;
      const kS0 = kH / bigBlk.h;
      const kBigW = bigBlk.w * kS0;
      const cBig = bigCluster.anchor.cap * kS0;
      const kInGap = mortar * Math.sqrt(cBig * Math.sqrt(c1 * c2)) * iJit;
      const u = W / (kBigW + kInGap + 1);

      const s0 = u * kS0;
      const s1 = u / b1.w;
      const s2 = u / b2.w;
      const sMean = Math.cbrt(s0 * s1 * s2);
      const ratios = [s0 / sMean, s1 / sMean, s2 / sMean];
      if (ratios.some(r => r < 0.55 || r > 1.80)) continue;

      const H = u * kH;
      const bigW = u * kBigW;
      const inGap = u * kInGap;
      const lineGap = u * kLineGap;
      const h1 = b1.h * s1;
      const h2 = b2.h * s2;

      const bigCX = bigFirst ? -W / 2 + bigW / 2 : W / 2 - bigW / 2;
      const stackCX = bigFirst ? -W / 2 + bigW + inGap + u / 2 : -W / 2 + u / 2;
      const y1 = H / 2 - h1 / 2;
      const y2 = -H / 2 + h2 / 2;

      const placeBlock = (blk, cx, cy, sc, slot, ci) => blk.words.map(word => ({
        ...word,
        x: cx + word.x * sc,
        y: cy + word.y * sc,
        w: word.w * sc,
        h: word.h * sc,
        boxW: word.boxW * sc,
        boxH: word.boxH * sc,
        fontPx: word.fontPx * sc,
        pad: word.pad * sc,
        cap: word.word.cap * sc * (word.scale ?? 1),
        font: word.word.font,
        slot,
        rowScale: sc,
        cluster: ci,
      }));

      const words = bigFirst
        ? [...placeBlock(bigBlk, bigCX, 0, s0, bigSlot, 0), ...placeBlock(b1, stackCX, y1, s1, stackSlot, 1), ...placeBlock(b2, stackCX, y2, s2, stackSlot, 2)]
        : [...placeBlock(b1, stackCX, y1, s1, stackSlot, 0), ...placeBlock(b2, stackCX, y2, s2, stackSlot, 1), ...placeBlock(bigBlk, bigCX, 0, s0, bigSlot, 2)];

      const caps = bigFirst
        ? [bigCluster.anchor.cap * s0, s1Cluster.anchor.cap * s1, s2Cluster.anchor.cap * s2]
        : [s1Cluster.anchor.cap * s1, s2Cluster.anchor.cap * s2, bigCluster.anchor.cap * s0];
      const contrast = bigSlot !== stackSlot ? 1 : 0;
      const { Q, terms } = scoreCandidate({
        words, W, height: H,
        dValues: ratios,
        clusters, caps, contrast,
        rowCaps: [],
        rowCount: 2,
      });
      all.push({
        layout: 'two-up',
        split: bigFirst ? [[0, 1], [1, 3]] : [[0, 2], [2, 3]],
        slots: [bigSlot, stackSlot],
        words,
        w: W,
        h: H,
        refScale: sMean,
        Q,
        terms,
      });
    }
  }
  return all;
}

// Enumerate perpendicular-edge candidates (7.4.5): first turned +90 CCW on left, or last turned -90 CW on right.
export function enumeratePerp(
  clusters,
  W,
  metrics,
  { mortar = 0.30, inlineJitter = [], lineJitter = [], align = 'left', rowAligns = null, adlibShot = false, groupedClusterIndices = null } = {}
) {
  if (clusters.length < 2) return [];
  const all = [];
  const sides = [
    { side: 'left', turnDeg: 90, turnedIdx: 0, restIndices: clusters.slice(1).map((_, i) => i + 1) },
    { side: 'right', turnDeg: -90, turnedIdx: clusters.length - 1, restIndices: clusters.slice(0, -1).map((_, i) => i) },
  ];

  for (const { side, turnDeg, turnedIdx, restIndices } of sides) {
    // A cluster sharing a multi-cluster stack landing group must stay upright with its groupmates (10.4, 13.1.1).
    if (groupedClusterIndices?.has(turnedIdx)) continue;
    const turnedCluster = clusters[turnedIdx];
    // Respect "at most one element turned 90 degrees" (7.0): do not turn a cluster that already has a perp-left rider.
    if (turnedCluster.arrangement === 'perp-left') continue;
    const restClusters = restIndices.map(i => clusters[i]);
    const restUnitLayouts = enumerateRows(restClusters, 1.0, metrics, {
      mortar, inlineJitter, lineJitter, align, rowAligns, adlibShot,
    });
    if (!restUnitLayouts.length) continue;

    for (const [turnSlot, turnFont] of SLOTS) {
      const turnBlk = tryClusterBlock(turnedCluster, turnFont, adlibShot, metrics);
      if (!turnBlk) continue;
      for (const rest of restUnitLayouts) {
        // Length of turned element (its unrotated width) equals height of rest (W_rest * rest.h).
        const kSt = rest.h / turnBlk.w; // s_t = W_rest * kSt
        const kTurnW = turnBlk.h * kSt; // horizontal thickness of turned block = W_rest * kTurnW
        const adjRestCluster = side === 'left' ? 0 : restClusters.length - 1;
        const adjRestRow = rest.rows.find(r => adjRestCluster >= r.start && adjRestCluster < r.end);
        const cAdj1 = restClusters[adjRestCluster].anchor.cap * adjRestRow.scale;
        const cTurn1 = turnedCluster.anchor.cap * kSt;
        const iJit = inlineJitter[side === 'left' ? 0 : clusters.length - 2] ?? 1;
        const kGap = mortar * Math.sqrt(cTurn1 * cAdj1) * iJit;

        const wRest = W / (1 + kTurnW + kGap);
        const sTurn = wRest * kSt;
        const turnW = wRest * kTurnW;
        const gap = wRest * kGap;
        const H = wRest * rest.h;

        const clusterScales = [];
        for (let ci = 0; ci < clusters.length; ci++) {
          if (ci === turnedIdx) clusterScales.push(sTurn);
          else {
            const ri = restIndices.indexOf(ci);
            const r = rest.rows.find(row => ri >= row.start && ri < row.end);
            clusterScales.push(r.scale * wRest);
          }
        }
        const sMean = Math.exp(clusterScales.reduce((s, x) => s + Math.log(x), 0) / clusterScales.length);
        const turnRatio = sTurn / sMean;
        if (turnRatio < 0.55 || turnRatio > 1.80) continue;

        const turnCX = side === 'left' ? -W / 2 + turnW / 2 : W / 2 - turnW / 2;
        const restCX = side === 'left' ? -W / 2 + turnW + gap + wRest / 2 : -W / 2 + wRest / 2;

        const turnedWords = turnBlk.words.map(word => {
          const lx = word.x * sTurn, ly = word.y * sTurn;
          const rx = turnDeg === 90 ? -ly : ly;
          const ry = turnDeg === 90 ? lx : -lx;
          return {
            ...word,
            x: turnCX + rx,
            y: ry,
            w: word.boxH * sTurn,
            h: word.boxW * sTurn,
            boxW: word.boxW * sTurn,
            boxH: word.boxH * sTurn,
            fontPx: word.fontPx * sTurn,
            pad: word.pad * sTurn,
            cap: word.word.cap * sTurn * (word.scale ?? 1),
            font: word.word.font,
            turn: turnDeg,
            slot: turnSlot,
            rowScale: sTurn,
            cluster: turnedIdx,
          };
        });

        const restWords = rest.words.map(word => ({
          ...word,
          x: restCX + word.x * wRest,
          y: word.y * wRest,
          w: word.w * wRest,
          h: word.h * wRest,
          boxW: word.boxW * wRest,
          boxH: word.boxH * wRest,
          fontPx: word.fontPx * wRest,
          pad: word.pad * wRest,
          cap: word.cap * wRest,
          rowScale: word.rowScale * wRest,
          cluster: restIndices[word.cluster],
        }));

        const words = side === 'left' ? [...turnedWords, ...restWords] : [...restWords, ...turnedWords];
        const caps = clusters.map((c, ci) => c.anchor.cap * clusterScales[ci]);
        const dValues = clusterScales.map(s => s / sMean);
        const restContrast = rest.rows.length > 1
          ? rest.rows.slice(1).filter((r, i) => r.slot !== rest.rows[i].slot).length
          : 0;
        const turnContrast = turnSlot !== rest.slots[0] ? 1 : 0;
        const contrast = (restContrast + turnContrast) / rest.rows.length;

        const { Q, terms } = scoreCandidate({
          words, W, height: H,
          dValues,
          clusters, caps, contrast,
          rowCaps: rest.rows.map(r => r.maxCap * wRest),
          rowCount: rest.rows.length,
        });
        all.push({
          layout: 'perp',
          side,
          split: rest.split,
          slots: [turnSlot, ...rest.slots],
          words,
          w: W,
          h: H,
          refScale: sMean,
          Q,
          terms,
        });
      }
    }
  }
  return all;
}

// Compose all plaques for all shots (section 7).
export function composePlaques(shots, metrics, seed, { mortar = 0.30, pinnedShots = null, stage = null, fps = 30 } = {}) {
  const tierMeasure = { S: 0.8, M: 0.8, L: 1.0, XL: 1.25 };
  const lastArrCluster = new Map();
  const lastLayoutShot = new Map();
  const lastSingleSlotShot = new Map();
  let clusterCounter = 0;
  const plaques = [];
  const I = globalThis.KT_INTERP;
  const stageActive = !!(stage && I?.hasKeepClearProps?.(stage));

  for (let si = 0; si < shots.length; si++) {
    const shot = shots[si];
    const pinned = pinnedShots?.[si];
    const arrRng = stream(seed, 'plaque_arr', si, 0);
    const jitterRng = stream(seed, 'plaque_jitter', si, 0);
    const rng = stream(seed, 'plaque', si, 0);
    const changes = [];

    // 1. Measure W (7.3, 9.5.1, 9.5.4).
    let W = 1000 * (tierMeasure[shot.topTier] ?? 1.0);
    if (shot.echo && plaques[si - 1]) {
      W = plaques[si - 1].measureW * 1.25;
    } else if (shot.motifOf != null && plaques[shot.motifOf]) {
      W = plaques[shot.motifOf].measureW * (shot.motifScale ?? 1);
    }

    // 2. Rider arrangements per cluster (7.2), with cooldown tau 2 clusters.
    const arrangements = [];
    for (let ci = 0; ci < shot.clusters.length; ci++) {
      const c = shot.clusters[ci];
      let arr = 'none';
      if (c.riders.length === 0) {
        arr = 'none';
      } else if (pinned?.arrangements?.[ci]) {
        arr = pinned.arrangements[ci];
      } else if (shot.motifOf != null && plaques[shot.motifOf]?.arrangements?.[ci]) {
        arr = plaques[shot.motifOf].arrangements[ci];
      } else if (shot.echo && plaques[si - 1]?.arrangements?.[ci]) {
        arr = plaques[si - 1].arrangements[ci];
      } else if (c.riders.length === 1) {
        // Test perp-left eligibility with standard font.
        const aBox = wordBox(c.anchor.text, fontForWord(c.anchor, KIT.standard, shot.adlib), c.anchor.cap, c.anchor.kind, metrics);
        const rBox = wordBox(c.riders[0].text, fontForWord(c.riders[0], KIT.standard, shot.adlib), c.riders[0].cap, c.riders[0].kind, metrics);
        const perpOk = rBox.w * 0.8 <= aBox.h;
        const opts = [
          { value: 'above-left', base: 40, weight: 40 * cooldownFactor(lastArrCluster.get('above-left'), clusterCounter, 2), valid: true },
          { value: 'left-top', base: 40, weight: 40 * cooldownFactor(lastArrCluster.get('left-top'), clusterCounter, 2), valid: true },
          { value: 'perp-left', base: 20, weight: 20 * cooldownFactor(lastArrCluster.get('perp-left'), clusterCounter, 2), valid: perpOk },
        ];
        arr = weightedChoice(opts, arrRng, 'above-left');
      } else {
        const opts = [
          { value: 'inline-left', base: 50, weight: 50 * cooldownFactor(lastArrCluster.get('inline-left'), clusterCounter, 2), valid: true },
          { value: 'left-top', base: 30, weight: 30 * cooldownFactor(lastArrCluster.get('left-top'), clusterCounter, 2), valid: true },
          { value: 'above-left', base: 20, weight: 20 * cooldownFactor(lastArrCluster.get('above-left'), clusterCounter, 2), valid: true },
        ];
        arr = weightedChoice(opts, arrRng, 'inline-left');
      }
      if (arr !== 'none') lastArrCluster.set(arr, clusterCounter);
      c.arrangement = arr;
      arrangements.push(arr);
      clusterCounter++;
    }

    // 3. Seeded jitters and clamped-row alignments (7.4.3, 7.4.6) from isolated stream so pins never shift jitters.
    const inlineJitter = shot.clusters.map(() => 0.85 + 0.30 * jitterRng());
    const lineJitter = [0, 1, 2].map(() => 0.85 + 0.30 * jitterRng());
    const aligns = ['left', 'centre', 'right'];
    const rowAligns = [0, 1, 2].map(() => aligns[Math.floor(jitterRng() * 3)]);

    let chosen;
    let intended = {};

    // 4. Single-cluster shot (7.7) vs multi-cluster shot (7.4-7.5).
    if (shot.clusters.length === 1) {
      let slot;
      if (pinned?.slots?.[0]) {
        slot = pinned.slots[0];
      } else if (shot.motifOf != null && plaques[shot.motifOf]) {
        slot = plaques[shot.motifOf].slots[0];
      } else if (shot.echo && plaques[si - 1]) {
        slot = plaques[si - 1].slots[0];
      } else {
        const opts = SLOTS.map(([s]) => ({
          value: s,
          base: 1,
          weight: cooldownFactor(lastSingleSlotShot.get(s), si, 2),
        }));
        slot = weightedChoice(opts, rng, 'standard');
      }
      let blk = tryClusterBlock(shot.clusters[0], KIT[slot], shot.adlib, metrics);
      if (!blk) {
        // If perp-left rider didn't fit in chosen slot, fall back to standard or above-left.
        const origSlot = slot;
        for (const [altSlot, altFont] of SLOTS) {
          blk = tryClusterBlock(shot.clusters[0], altFont, shot.adlib, metrics);
          if (blk) { slot = altSlot; break; }
        }
        if (!blk) {
          shot.clusters[0].arrangement = 'above-left';
          arrangements[0] = 'above-left';
          blk = tryClusterBlock(shot.clusters[0], KIT[slot], shot.adlib, metrics);
        }
        changes.push({ stage: 'compose_plaques', reason: `single-cluster slot/arrangement adjusted from ${origSlot} to ${slot}/${arrangements[0]}` });
      }
      lastSingleSlotShot.set(slot, si);
      const scale = W / blk.w;
      const height = blk.h * scale;
      const words = blk.words.map(word => ({
        ...word,
        x: word.x * scale,
        y: word.y * scale,
        w: word.w * scale,
        h: word.h * scale,
        boxW: word.boxW * scale,
        boxH: word.boxH * scale,
        fontPx: word.fontPx * scale,
        pad: word.pad * scale,
        cap: word.word.cap * scale * (word.scale ?? 1),
        font: word.word.font,
        slot,
        rowScale: scale,
        cluster: 0,
      }));
      const area = words.reduce((n, w) => n + w.boxW * w.boxH, 0);
      chosen = {
        layout: 'single',
        slots: [slot],
        words,
        w: W,
        h: height,
        Q: area / (W * height),
        terms: { fill: area / (W * height), fidelity: 1, hero: 1, aspect: 1, contrast: 0, wall: 0 },
      };
      intended = { layout: 'single', slots: [slot], arrangements: [...arrangements] };
    } else {
      // Clusters belonging to a multi-cluster stack group share one still camera orientation (10.4).
      const groupedClusterIndices = new Set();
      for (const grp of shot.groups ?? []) {
        if (grp.length > 1) {
          for (const c of grp) groupedClusterIndices.add(shot.clusters.indexOf(c));
        }
      }
      // Brief 18: if a keep-clear prop narrows the available screen area during this shot, steer row aspect ratios
      // toward the clear band's shape so plaques stack taller rather than stretching wide across the prop.
      let targetAspect = null;
      if (stageActive && shot.words?.length) {
        const f0 = Math.round(Math.min(...shot.words.map(w => w.t)) * fps);
        const f1 = Math.round(Math.max(...shot.words.map(w => w.end ?? w.t)) * fps) + 15;
        const obs = I.keepClearObstaclesInRange(stage, f0, f1);
        if (obs.length) {
          const rects = I.clearRectsFromObstacles(obs, { minW: 80, minH: 80 });
          if (rects.length) {
            const mainAspect = rects[0].w / rects[0].h;
            if (mainAspect < 1.35) targetAspect = mainAspect;
          }
        }
      }
      // Enumerate in fixed order: rows-1, rows-2, rows-3, two-up, perp (7.4).
      let candidates = [
        ...enumerateRows(shot.clusters, W, metrics, { mortar, inlineJitter, lineJitter, rowAligns, adlibShot: shot.adlib, targetAspect }),
        ...enumerateTwoUp(shot.clusters, W, metrics, { mortar, inlineJitter, lineJitter, adlibShot: shot.adlib }),
        ...enumeratePerp(shot.clusters, W, metrics, { mortar, inlineJitter, lineJitter, rowAligns, adlibShot: shot.adlib, groupedClusterIndices }),
      ];

      if (!candidates.length) {
        // Fallback: relax row d_r >= 0.78 floor and pick the candidate closest to valid.
        const relaxed = enumerateRows(shot.clusters, W, metrics, {
          mortar, inlineJitter, lineJitter, rowAligns, adlibShot: shot.adlib, allowRelaxed: true, targetAspect,
        });
        if (!relaxed.length) {
          // Last resort: drop perp-left rider arrangements that failed across all slots.
          for (let ci = 0; ci < shot.clusters.length; ci++) {
            if (shot.clusters[ci].arrangement === 'perp-left') {
              shot.clusters[ci].arrangement = 'above-left';
              arrangements[ci] = 'above-left';
            }
          }
          candidates = enumerateRows(shot.clusters, W, metrics, {
            mortar, inlineJitter, lineJitter, rowAligns, adlibShot: shot.adlib, allowRelaxed: true, targetAspect,
          });
        } else {
          relaxed.sort((a, b) => b.minD - a.minD || b.Q - a.Q);
          candidates = [relaxed[0]];
        }
        changes.push({ stage: 'compose_plaques', reason: `relaxed d_r>=0.78 floor (minD=${candidates[0].minD?.toFixed(3)})` });
      }

      const pickNormal = pool => {
        const qMax = Math.max(...pool.map(c => c.Q));
        const top = pool.filter(c => c.Q >= qMax - 0.05);
        const opts = top.map(c => ({
          value: c,
          base: 1,
          weight: cooldownFactor(lastLayoutShot.get(c.layout), si, 2),
        }));
        return weightedChoice(opts, rng, top[0]);
      };

      if (pinned?.layout) {
        intended = { layout: pinned.layout, slots: pinned.slots, arrangements: [...arrangements], pinned: true };
        const exact = candidates.filter(c =>
          c.layout === pinned.layout
          && JSON.stringify(c.slots) === JSON.stringify(pinned.slots)
          && (pinned.side == null || c.side === pinned.side)
        );
        const sameClass = candidates.filter(c => c.layout === pinned.layout);
        if (exact.length) {
          exact.sort((a, b) => b.Q - a.Q);
          chosen = exact[0];
        } else if (sameClass.length) {
          chosen = pickNormal(sameClass);
          changes.push({ stage: 'compose_plaques', reason: `pinned slots ${pinned.slots.join('/')} invalid under fork; kept layout ${pinned.layout} with slots ${chosen.slots.join('/')}` });
        } else {
          chosen = pickNormal(candidates);
          changes.push({ stage: 'compose_plaques', reason: `pinned layout ${pinned.layout} invalid under fork; chose ${chosen.layout}` });
        }
      } else if (shot.motifOf != null && plaques[shot.motifOf]) {
        const ref = plaques[shot.motifOf];
        intended = { layout: ref.layout, slots: ref.slots, arrangements: [...arrangements], motifOf: shot.motifOf + 1 };
        const exact = candidates.filter(c => c.layout === ref.layout && JSON.stringify(c.slots) === JSON.stringify(ref.slots));
        chosen = exact.length ? exact.sort((a, b) => b.Q - a.Q)[0] : pickNormal(candidates);
        if (!exact.length) changes.push({ stage: 'compose_plaques', reason: `motif layout ${ref.layout} unavailable; chose ${chosen.layout}` });
      } else if (shot.parallelOf != null && plaques[shot.parallelOf]) {
        const ref = plaques[shot.parallelOf];
        const sameClass = candidates.filter(c => c.layout === ref.layout);
        chosen = sameClass.length ? pickNormal(sameClass) : pickNormal(candidates);
        intended = { layout: ref.layout, slots: chosen.slots, arrangements: [...arrangements], parallelOf: shot.parallelOf + 1 };
        if (!sameClass.length) changes.push({ stage: 'compose_plaques', reason: `parallel layout ${ref.layout} unavailable; chose ${chosen.layout}` });
      } else {
        chosen = pickNormal(candidates);
        intended = { layout: chosen.layout, slots: chosen.slots, arrangements: [...arrangements] };
      }
      lastLayoutShot.set(chosen.layout, si);
    }

    // 5. Re-centre words within their composition box and add panel padding (7.6).
    const x0 = Math.min(...chosen.words.map(w => w.x - w.w / 2));
    const x1 = Math.max(...chosen.words.map(w => w.x + w.w / 2));
    const y0 = Math.min(...chosen.words.map(w => w.y - w.h / 2));
    const y1 = Math.max(...chosen.words.map(w => w.y + w.h / 2));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const compW = x1 - x0, compH = y1 - y0;
    const words = chosen.words.map(w => ({
      ...w,
      x: w.x - cx,
      y: w.y - cy,
      id: w.word.id,
      text: w.word.text,
      role: w.word.role,
      t: w.word.t,
      style: w.word.style,
      kind: w.word.kind,
      stylePinned: w.word.stylePinned,
    }));

    const anchorWords = words.filter(w => w.role !== 'rider');
    const meanAnchorCap = anchorWords.reduce((s, w) => s + w.cap, 0) / anchorWords.length;
    // Spec 40.1: panels are invisible, so the pad is only spacing; 0.15 (was 0.35) x mean anchor cap.
    const panelPad = 0.15 * meanAnchorCap * (mortar / 0.30);
    const slabW = compW + 2 * panelPad;
    const slabH = compH + 2 * panelPad;
    const thickness = 0.05 * W;

    // Precompute cluster bounding boxes in plaque local coords.
    const clusterBoxes = shot.clusters.map((_, ci) => {
      const cw = words.filter(w => w.cluster === ci);
      const bx0 = Math.min(...cw.map(w => w.x - w.w / 2));
      const bx1 = Math.max(...cw.map(w => w.x + w.w / 2));
      const by0 = Math.min(...cw.map(w => w.y - w.h / 2));
      const by1 = Math.max(...cw.map(w => w.y + w.h / 2));
      const anchor = cw.find(w => w.role !== 'rider') ?? cw[0];
      return {
        ci,
        cx: (bx0 + bx1) / 2,
        cy: (by0 + by1) / 2,
        w: bx1 - bx0,
        h: by1 - by0,
        anchor,
        words: cw,
      };
    });

    plaques.push({
      id: `p${si + 1}`,
      shot: si + 1,
      shotIndex: si,
      measureW: W,
      w: slabW,
      h: slabH,
      compW,
      compH,
      panelPad,
      thickness,
      layout: chosen.layout,
      side: chosen.side ?? null,
      slots: chosen.slots,
      arrangements,
      Q: chosen.Q,
      terms: chosen.terms,
      words,
      clusterBoxes,
      maxCap: Math.max(...anchorWords.map(w => w.cap)),
      lastCap: clusterBoxes.at(-1).anchor.cap,
      firstCap: clusterBoxes[0].anchor.cap,
      intended,
      changes,
    });
  }

  return plaques;
}
