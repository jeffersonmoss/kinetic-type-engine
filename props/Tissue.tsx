// Tissue: the toilet paper of Paper Trail (storyboard items 7, 53 and 54; kit brief 1, 18 November 2026).
// 1. tissue(): a BoardPath builder modelled on hose() in HosePath.tsx. A flat band of paper (default 150 wide) through
//    world points, drawn flat-on (seen from above): perforations at arc lengths the board gives it (so the layout can put
//    one between each pair of words), a torn corner on its very first sheet (one fixed shape, TORN_CORNER, which
//    TissueSheet can draw too, so the first sheet looks the same wherever it is seen), a faint dot emboss, a thin edge in
//    the palette's shadow role so it reads on Manila, square folds at the vertices you name, gentle bends elsewhere,
//    `upTo` to draw it on by length, and optionally a ragged torn end where the paper runs out.
// 2. Roll: a toilet roll lying on its side in three-quarter view, the cardboard tube showing in its end; `remaining` 1 to
//    0 (at 0 only the bare tube), `turn` degrees about its axis (the sheet perforations on its side slide round).
// 3. TissueSheet: one loose square sheet, perforated (serrated) on two opposite edges, `curl` (a corner lifts and folds
//    back), an optional caption printed on it (the echo sheets, storyboard item 62), optionally the first sheet's torn
//    corner.
// Colours are palette roles read at draw time: `paper` for the tissue, `body` for the tube, `shadow` for the edges.
import React from 'react';
import {DEFAULT_FONT, FONT_FAMILY, FONT_INFO, FONT_STYLE, FONTS, FPS, PALETTE, mixHex, spreadAt, textWidth} from '../engine';
import type {BoardPath, DecorGraphic, Pt, VerbCue, WordOpts} from '../engine';
import {type PropBase, type PropGraphicOpts, place, propGraphic, propPoint, propQuad, propTransform} from './common';
import {roleColours} from './roles';

const f2 = (n: number) => n.toFixed(2);
const D2R = Math.PI / 180;
const dirOf = (deg: number): Pt => ({x: Math.cos(deg * D2R), y: Math.sin(deg * D2R)});
const addv = (a: Pt, b: Pt, k = 1): Pt => ({x: a.x + b.x * k, y: a.y + b.y * k});
const cross = (a: Pt, b: Pt) => a.x * b.y - a.y * b.x;
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const pathD = (pts: Pt[], close = true) => pts.map((v, k) => `${k ? 'L' : 'M'}${f2(v.x)} ${f2(v.y)}`).join('') + (close ? 'Z' : '');

/** Colours of the tissue pieces: paper, its back (the folded flap), edge, perforation and emboss marks. */
const tissueColours = (o: {colour?: string; edge?: string; perf?: string; emboss?: string; back?: string}) => {
  const paper = o.colour ?? roleColours().paper;
  const shadow = PALETTE.shadow;
  return {
    paper,
    back: o.back ?? mixHex(paper, shadow, 0.1),
    edge: o.edge ?? shadow,
    perf: o.perf ?? mixHex(paper, shadow, 0.42),
    emboss: o.emboss ?? mixHex(paper, shadow, 0.13),
  };
};

// ------------------------------------------------------------------ the torn corner (one fixed shape)

/** The first sheet's torn corner as fractions of the band width: (u along the paper from its start edge, v in from the
 *  torn long edge). The tear runs from the start edge, 0.40 W in from the long edge, to the long edge, 0.34 W along.
 *  Fixed numbers, so the corner is the same shape on the strip, on a TissueSheet and on exhibit A. */
export const TORN_CORNER: readonly [number, number][] = [
  [0, 0.4], [0.03, 0.375], [0.045, 0.33], [0.085, 0.3], [0.1, 0.25], [0.145, 0.225], [0.16, 0.17], [0.205, 0.145],
  [0.22, 0.1], [0.265, 0.075], [0.285, 0.035], [0.32, 0.02], [0.34, 0],
];
/** The ragged end where the paper runs out (storyboard item 244): offsets back from the end, as fractions of the band
 *  width, at evenly spaced points across it. */
const RAGGED_END: readonly number[] = [0.02, 0.07, 0.03, 0.09, 0.05, 0.1, 0.04, 0.08, 0.02, 0.06, 0.03];

// ------------------------------------------------------------------ the band's centreline

export interface TissueDef {
  id: string;
  label?: string;
  /** World points the band runs through (at least 2): straight runs joined by bends, or by square folds at `folds`. */
  points: Pt[];
  /** Band width, world px (default 150). */
  width?: number;
  /** Indices of interior points (1 to points.length - 2) where the paper is folded flat (a 90 degree turn gives the
   *  square fold: the outer corner becomes a 45 degree crease with the flap's back showing). */
  folds?: number[];
  /** Radius of the other corners, world px (default 110; at least half the width plus a little reads cleanly). */
  bend?: number;
  /** Perforations: arc lengths along the band (world px from its start). The layout puts one between words. */
  perforations?: number[];
  /** Perforations that move and draw on (Fable gate loop 1, item 49: TRAIL's inner perforations open with the spread):
   *  by song seconds, each at arc length `s`, drawn across the band from its left edge (left of the way it runs) by
   *  `drawn` (0 none, 1 all the way). Drawn in addition to `perforations`. `spreadPerforations()` builds them for a
   *  `spread` word. */
  openingPerforations?: (t: number) => {s: number; drawn: number}[];
  /** Torn corner on the very first sheet (default true), on the long edge to the 'left' (default) or 'right' of the
   *  direction the band runs (left of a band running right is its upper edge). */
  torn?: boolean;
  tornSide?: 'left' | 'right';
  /** The band's end is the ragged end of the paper (the roll has run out). Drawn only when the whole band is drawn. */
  raggedEnd?: boolean;
  /** How much is drawn (world px of arc length from the start), fixed or by song seconds; default all. */
  upTo?: number | ((t: number) => number);
  /** Dot emboss (default true): rows of faint dots `embossPitch` (22) px apart. */
  emboss?: boolean;
  embossPitch?: number;
  /** Colours: paper (default the paper role), back of a folded flap, edge (default the shadow role), perforation and
   *  emboss marks (default paper mixed toward the shadow role). */
  colour?: string; back?: string; edge?: string; perf?: string; embossColour?: string;
  /** Edge line width, world px (default 2.5). */
  edgeWidth?: number;
  opacity?: number;
}

interface Sample {p: Pt; h: number; s: number}
interface Fold {s: number; v: Pt; h1: number; h2: number}
interface TissueGeom {pieces: Sample[][]; folds: Fold[]; length: number; W: number}

const angleDiff = (a: number, b: number) => { let d = b - a; while (d > 180) d -= 360; while (d < -180) d += 360; return d; };

const buildGeom = (def: Pick<TissueDef, 'points' | 'folds' | 'bend' | 'width'>): TissueGeom => {
  const P = def.points;
  const W = def.width ?? 150;
  if (P.length < 2) throw new Error('tissue(): at least 2 points');
  const folds = new Set(def.folds ?? []);
  const bendR = def.bend ?? 110;
  const n = P.length;
  const head = (a: Pt, b: Pt) => Math.atan2(b.y - a.y, b.x - a.x) / D2R;
  // the corner cut-back length (tangent length) at each interior vertex that bends
  const segLen = Array.from({length: n - 1}, (_, k) => dist(P[k], P[k + 1]));
  const cut: number[] = Array(n).fill(0);
  const radius: number[] = Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    if (folds.has(i)) continue;
    const th = Math.abs(angleDiff(head(P[i - 1], P[i]), head(P[i], P[i + 1]))) * D2R;
    if (th < 0.5 * D2R) continue;
    const tmax = 0.45 * Math.min(segLen[i - 1], segLen[i]);
    const t = Math.min(bendR * Math.tan(th / 2), tmax);
    cut[i] = t;
    radius[i] = t / Math.tan(th / 2);
  }
  const pieces: Sample[][] = [[]];
  const foldList: Fold[] = [];
  let s = 0;
  const push = (p: Pt, h: number) => {
    const cur = pieces[pieces.length - 1];
    const last = cur[cur.length - 1];
    if (last) s += dist(last.p, p);
    cur.push({p, h, s});
  };
  for (let k = 0; k < n - 1; k++) {
    const h = head(P[k], P[k + 1]);
    const d = dirOf(h);
    const a = addv(P[k], d, cut[k]);
    const b = addv(P[k + 1], d, -cut[k + 1]);
    if (k === 0) push(a, h);
    else if (folds.has(k)) {
      // a fold: the old piece ends at the vertex, a new piece starts there with the new heading
      const prev = pieces[pieces.length - 1];
      const end = prev[prev.length - 1];
      foldList.push({s: end.s, v: end.p, h1: end.h, h2: h});
      pieces.push([{p: end.p, h, s: end.s}]);
    }
    push(b, h);
    // the bend at P[k + 1]: an arc from b to the start of the next segment
    const i = k + 1;
    if (i < n - 1 && cut[i] > 0) {
      const h2 = head(P[i], P[i + 1]);
      const turn = angleDiff(h, h2);
      const r = radius[i];
      const side = turn > 0 ? 1 : -1; // centre to the right (+90 on screen) for a clockwise turn
      const c = addv(b, dirOf(h + 90 * side), r);
      const steps = Math.max(2, Math.ceil(Math.abs(turn) / 4));
      for (let j = 1; j <= steps; j++) {
        const hj = h + (turn * j) / steps;
        push(addv(c, dirOf(hj - 90 * side), r), hj);
      }
    }
  }
  return {pieces, folds: foldList, length: s, W};
};

const allSamples = (G: TissueGeom) => G.pieces.flat();
/** Point and heading at arc length s (clamped to the band). */
const geomAt = (G: TissueGeom, s: number): {p: Pt; heading: number} => {
  const u = Math.max(0, Math.min(G.length, s));
  for (const pc of G.pieces) {
    if (u > pc[pc.length - 1].s && pc !== G.pieces[G.pieces.length - 1]) continue;
    let lo = 0, hi = pc.length - 1;
    if (hi === 0) return {p: pc[0].p, heading: pc[0].h};
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pc[m].s <= u) lo = m; else hi = m; }
    const A = pc[lo], B = pc[hi];
    const k = Math.max(0, Math.min(1, (u - A.s) / (B.s - A.s || 1)));
    return {p: {x: A.p.x + (B.p.x - A.p.x) * k, y: A.p.y + (B.p.y - A.p.y) * k}, heading: A.h + angleDiff(A.h, B.h) * k};
  }
  const last = allSamples(G).slice(-1)[0];
  return {p: last.p, heading: last.h};
};
/** The normal used for the band's sides: +W/2 is to the right of the way the band runs (down, for a band running right). */
const nrm = (h: number): Pt => dirOf(h + 90);
/** World point at (arc length s, offset across n) with the heading of piece `pc` (so fold ends use their own piece). */
const across = (smp: {p: Pt; h: number}, n: number) => addv(smp.p, nrm(smp.h), n);

/** Where a band side (offset o from the vertex along the piece's normal) meets a fold's crease. */
const creasePoint = (fd: Fold, h: number, o: number): Pt => {
  const d = dirOf(h), c = addv(dirOf(fd.h1), dirOf(fd.h2));
  const cc = cross(d, c);
  if (Math.abs(cc) < 1e-6) return addv(fd.v, nrm(h), o);
  const r = {x: -o * nrm(h).x, y: -o * nrm(h).y};
  const u = cross(r, c) / cc;
  return addv(addv(fd.v, nrm(h), o), d, u);
};

/** The outline of one piece of the band from arc length a to b (both inside the piece), with its ends shaped: the torn
 *  corner at s = 0, crease ends at folds, the ragged end at the band's end. Returns world points. */
const pieceOutline = (G: TissueGeom, def: TissueDef, pi: number, a: number, b: number): Pt[] => {
  const pc = G.pieces[pi];
  const W = G.W, half = W / 2;
  const at = (s: number): Sample => {
    let lo = 0, hi = pc.length - 1;
    if (hi === 0) return pc[0];
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pc[m].s <= s) lo = m; else hi = m; }
    const A = pc[lo], B = pc[hi];
    const k = Math.max(0, Math.min(1, (s - A.s) / (B.s - A.s || 1)));
    return {p: {x: A.p.x + (B.p.x - A.p.x) * k, y: A.p.y + (B.p.y - A.p.y) * k}, h: A.h + angleDiff(A.h, B.h) * k, s};
  };
  const mids = pc.filter((q) => q.s > a + 0.01 && q.s < b - 0.01);
  const spine = [at(a), ...mids, at(b)];
  const right = spine.map((q) => across(q, half));
  const left = spine.map((q) => across(q, -half));
  const startFold = G.folds.find((fd) => Math.abs(fd.s - a) < 0.01 && pi > 0 && Math.abs(pc[0].s - fd.s) < 0.01);
  const endFold = G.folds.find((fd) => Math.abs(fd.s - b) < 0.01 && pi < G.pieces.length - 1 && Math.abs(pc[pc.length - 1].s - fd.s) < 0.01);
  const h0 = spine[0].h, h1 = spine[spine.length - 1].h;
  if (startFold) { left[0] = creasePoint(startFold, h0, -half); right[0] = creasePoint(startFold, h0, half); }
  if (endFold) { left[left.length - 1] = creasePoint(endFold, h1, -half); right[right.length - 1] = creasePoint(endFold, h1, half); }
  // end shape (between the last right point and the last left point, walking from right to left)
  const endPts: Pt[] = [];
  const isEnd = pi === G.pieces.length - 1 && b >= G.length - 0.01;
  if (isEnd && def.raggedEnd) {
    const e = spine[spine.length - 1];
    RAGGED_END.forEach((back, k) => {
      const n = half - (W * k) / (RAGGED_END.length - 1);
      endPts.push(addv(across(e, n), dirOf(e.h), -back * W));
    });
    right[right.length - 1] = endPts[0];
    left[left.length - 1] = endPts[endPts.length - 1];
    endPts.shift(); endPts.pop();
  }
  // start shape (between the first left point and the first right point, walking from left to right)
  const startPts: Pt[] = [];
  const torn = (def.torn ?? true) && pi === 0 && a <= 0.01;
  if (torn) {
    const sgn = (def.tornSide ?? 'left') === 'left' ? -1 : 1;
    const e = spine[0];
    // torn edge points (u along, v in from the torn edge), from the start edge to the long edge
    const tearPts = TORN_CORNER.map(([u, v]) => addv(across(e, sgn * (half - v * W)), dirOf(e.h), u * W));
    const along = TORN_CORNER[TORN_CORNER.length - 1][0] * W;
    if (sgn < 0) {
      // the torn edge is the left side: walking left side backward ends at its start point; replace it
      left[0] = tearPts[tearPts.length - 1];
      startPts.push(...tearPts.slice(0, -1).reverse());
    } else {
      right[0] = tearPts[tearPts.length - 1];
      startPts.push(...tearPts.slice(0, -1));
    }
    // drop side points that the tear has cut away (they lie within `along` of the start on that side)
    const side = sgn < 0 ? left : right;
    for (let k = 1; k < side.length - 1; k++) if (spine[k].s - a < along) side[k] = side[0];
  }
  // polygon: right side forward, the end, left side backward, the start
  return [...right, ...endPts, ...left.reverse(), ...startPts];
};

/** Length of a tissue band in world px (the same centreline the BoardPath uses). */
export const tissueLength = (def: Pick<TissueDef, 'points' | 'folds' | 'bend' | 'width'>) => buildGeom(def).length;
/** Point and heading (world degrees) at arc length s of a tissue band. */
export const tissuePointAt = (def: Pick<TissueDef, 'points' | 'folds' | 'bend' | 'width'>, s: number) => geomAt(buildGeom(def), s);
/** World outline polygons of the band between arc lengths s0 and s1 (one per straight-or-bent piece; a fold splits
 *  them): for keepClear, a sheet's box, or a graphic's box. */
export const tissueQuads = (def: TissueDef, s0: number, s1: number): Pt[][] => {
  const G = buildGeom(def);
  const out: Pt[][] = [];
  G.pieces.forEach((pc, pi) => {
    const a = Math.max(s0, pc[0].s), b = Math.min(s1, pc[pc.length - 1].s);
    if (b - a > 0.5) out.push(pieceOutline(G, {...def, torn: false, raggedEnd: false}, pi, a, b));
  });
  return out;
};
/** The sheet a word sits on: given perforation positions, the arc lengths [start, end] of the sheet holding arc length s. */
export const tissueSheetAt = (perforations: number[], length: number, s: number): [number, number] => {
  const p = [...perforations].sort((x, y) => x - y);
  let a = 0, b = length;
  for (const q of p) { if (q <= s) a = q; else { b = q; break; } }
  return [a, b];
};

/** The inner perforations of a `spread` word printed along a straight run of band (Fable gate loop 1, item 49), for
 *  `openingPerforations`. Before the spread none is drawn, so no perforation crosses the word; as each gap opens its
 *  perforation sits at the middle of the gap and draws on across the band in step with it, fully drawn when the gap is
 *  fully open. `cue` is the word's `spread()` cue (it must have `at`); `start` is the arc length of the word's landed
 *  left edge on the band; `advances` the letter advances and `size` the font size, in world px (a block at scale 1:
 *  the word's layout `adv` and `size`); `zoom` the camera zoom at the cue's start (default 1), as the verb uses it to
 *  set its frames. Assumes the word reads along the way the band runs. */
export const spreadPerforations = (cue: VerbCue, o: {start: number; advances: number[]; size: number; zoom?: number}) => {
  const n = o.advances.length;
  const gap = Number(cue.params?.to ?? 0.5) * o.size;
  const at = cue.at ?? 0;
  return (t: number): {s: number; drawn: number}[] => {
    const sp = spreadAt(cue, o.size, n, t * FPS - at * FPS, o.zoom ?? 1);
    const out: {s: number; drawn: number}[] = [];
    let edge = o.start;
    for (let k = 0; k < n - 1; k++) {
      edge += o.advances[k];
      const opened = sp.dx[k + 1] - sp.dx[k];
      out.push({s: edge + (sp.dx[k] + sp.dx[k + 1]) / 2, drawn: gap > 0 ? opened / gap : 0});
    }
    return out;
  };
};

/** Word options for type printed on the tissue (Fable gate loop 1, item 48): flat ink, no offset shadow (the engine
 *  otherwise gives emphasis words on a dark ground one). Spread into `block.style`: `style: tissuePrint([95, 96])`.
 *  `colour` defaults to the palette's ground role (Night in Paper Trail). Echo captions on a TissueSheet keep their
 *  pressed-in emboss; this is for sung words on the band. */
export const tissuePrint = (words: number[], colour?: string): Record<number, WordOpts> =>
  Object.fromEntries(words.map((i) => [i, {shadow: false, colour: colour ?? PALETTE.ground}]));

/** Builds the tissue BoardPath. Put it in `board.paths`; anchors name it ({path: id, s}). */
export const tissue = (def: TissueDef): BoardPath => {
  const G = buildGeom(def);
  const upTo = (t: number) => Math.max(0, Math.min(G.length, typeof def.upTo === 'function' ? def.upTo(t) : def.upTo ?? G.length));
  return {
    id: def.id,
    label: def.label ?? `tissue ${def.id}`,
    pointAt: (s) => geomAt(G, s),
    tipAt: (t) => geomAt(G, upTo(t)),
    draw: (c) => {
      const L = upTo(c.t);
      if (L <= 0.5) return null;
      const col = tissueColours({colour: def.colour, edge: def.edge, perf: def.perf, emboss: def.embossColour, back: def.back});
      const ew = def.edgeWidth ?? 2.5;
      const W = G.W, half = W / 2;
      const polys: React.ReactNode[] = [];
      G.pieces.forEach((pc, pi) => {
        const a = pc[0].s, b = Math.min(L, pc[pc.length - 1].s);
        if (b - a <= 0.5) return;
        polys.push(<path key={`p${pi}`} d={pathD(pieceOutline(G, def, pi, a, b))} fill={col.paper} stroke={col.edge} strokeWidth={ew} strokeLinejoin="round" />);
        // the fold at this piece's start: the flap (the triangle between the crease and the inner corner) shows its back
        const fd = pi > 0 ? G.folds.find((q) => Math.abs(q.s - a) < 0.01) : undefined;
        if (fd && L > fd.s + 0.5) {
          const d1 = dirOf(fd.h1), n1 = nrm(fd.h1);
          const inner = Math.sign(n1.x * dirOf(fd.h2).x + n1.y * dirOf(fd.h2).y) || 1;
          const pA = creasePoint(fd, fd.h1, -half), pB = creasePoint(fd, fd.h1, half);
          const corner = addv(addv(fd.v, d1, -half), n1, inner * half);
          polys.push(<path key={`f${pi}`} d={pathD([pA, pB, corner])} fill={col.back} stroke={col.edge} strokeWidth={ew} strokeLinejoin="round" />);
          polys.push(<path key={`c${pi}`} d={pathD([pA, pB], false)} stroke={col.edge} strokeWidth={ew * 1.6} strokeLinecap="round" />);
        }
      });
      // emboss: rows of dots across the band, alternate rows offset (a quilted look), clear of perforations
      const perfs = def.perforations ?? [];
      let dots = '';
      if (def.emboss ?? true) {
        const pitch = def.embossPitch ?? 22;
        const cols = 6, gap = W / (cols + 1);
        for (let s = pitch / 2, row = 0; s < L - 4; s += pitch, row++) {
          if (perfs.some((q) => Math.abs(q - s) < 6)) continue;
          if ((def.torn ?? true) && s < TORN_CORNER[TORN_CORNER.length - 1][0] * W + 4) continue;
          const g = geomAt(G, s);
          const smp = {p: g.p, h: g.heading};
          for (let k = 0; k < cols - (row % 2); k++) {
            const n = -half + gap * (k + 1 + (row % 2) * 0.5);
            const q = across(smp, n);
            dots += `M${f2(q.x)} ${f2(q.y)}h0.01`;
          }
        }
      }
      // perforations: a dashed line across the band, inset from its edges
      const perfD = perfs.filter((s) => s > 0 && s < L).map((s) => {
        const g = geomAt(G, s); const smp = {p: g.p, h: g.heading};
        const a = across(smp, -half + 5), b = across(smp, half - 5);
        return `M${f2(a.x)} ${f2(a.y)}L${f2(b.x)} ${f2(b.y)}`;
      }).join('') + (def.openingPerforations?.(c.t) ?? []).filter((q) => q.s > 0 && q.s < L && q.drawn > 0.001).map((q) => {
        // a perforation drawing on: from the band's left edge across, by `drawn`, in the same dashes
        const g = geomAt(G, q.s); const smp = {p: g.p, h: g.heading};
        const a = across(smp, -half + 5), b = across(smp, -half + 5 + (W - 10) * Math.min(1, q.drawn));
        return `M${f2(a.x)} ${f2(a.y)}L${f2(b.x)} ${f2(b.y)}`;
      }).join('');
      return (
        <g opacity={def.opacity ?? 1}>
          {polys}
          {dots && <path d={dots} stroke={col.emboss} strokeWidth={3.4} strokeLinecap="round" fill="none" />}
          {perfD && <path d={perfD} stroke={col.perf} strokeWidth={2.4} strokeDasharray={`${f2(W / 15)} ${f2(W / 28)}`} fill="none" />}
        </g>
      );
    },
  };
};

// ------------------------------------------------------------------ Roll

/** Natural size: the full roll's diameter, 180 design units. */
export const ROLL_DIAMETER = 180;
/** The cardboard tube's radius as a fraction of the full roll's radius (a real roll: 42 of 115 mm). */
export const ROLL_TUBE_RATIO = 0.37;
export interface RollProps extends PropBase {
  /** `size` is the full roll's diameter in world px (default 180). Anchor: where the roll's near end touches the
   *  ground (the lowest point of its near face), so it stays on the ground as it runs down. */
  /** 1 a full roll, 0 the bare cardboard tube (radius follows the paper's area, so it thins slowly then fast). */
  remaining?: number;
  /** Degrees the roll has turned about its axis (positive rolls it toward +x): the sheet perforations on its side and
   *  the tube's seam slide round. */
  turn?: number;
  /** Length of the roll along its axis, design units (default 0.85 of the diameter: 153, about the band's width). */
  length?: number;
  /** Screen direction the axis recedes in, degrees (default -28: back and to the right). */
  axis?: number;
  /** How far the end face is turned toward the viewer: the face's minor/major ratio (default 0.5). */
  face?: number;
  /** Arc length of one sheet on the roll's side, design units (default 170, as on the strip). */
  sheet?: number;
  /** Lying across a tissue band, laying it (Fable gate loop 1, item 47). The axis lies across the band, at right angles
   *  to the way it runs (`heading`, world degrees, default 0: running right), and the contact line (where roll meets
   *  paper) spans exactly the band's `width` (world px, default 150), so the band comes out from under the roll's
   *  trailing side with no gap or overlap. `skew` (default 0.22) is the slight three-quarter view: how far the near
   *  end face (on the band's right-hand edge, the lower edge of a band running right) turns toward the viewer, so the
   *  tube's hole shows there. In this mode the anchor (x, y) is the middle of the contact line: put it on the band's
   *  centreline at its drawn tip (`tissue().tipAt(t)`); `axis`, `face` and `length` are set by it, and a positive
   *  `turn` rolls it forward along `heading`. The far end's top shows a little past the band's far edge (the roll's
   *  height seen at the skew). */
  across?: {heading?: number; width?: number; skew?: number};
}
const rollGeom = (p: RollProps) => {
  const R1 = ROLL_DIAMETER / 2;
  const rt = R1 * ROLL_TUBE_RATIO;
  const rem = Math.max(0, Math.min(1, p.remaining ?? 1));
  const R = Math.sqrt(rt * rt + rem * (R1 * R1 - rt * rt));
  const ac = p.across;
  const k = ac ? Math.max(0.02, Math.min(0.9, ac.skew ?? 0.22)) : p.face ?? 0.5;
  // across a band: the axis points from the near face (the band's right-hand edge) to the far one (its left-hand edge)
  const al = ac ? (ac.heading ?? 0) - 90 : p.axis ?? -28;
  const sc = place(p, ROLL_DIAMETER).scale ?? 1;
  const len = ac ? (ac.width ?? 150) / sc / Math.sqrt(1 - k * k) : p.length ?? 0.85 * ROLL_DIAMETER;
  const ad = dirOf(al), perp = dirOf(al + 90);
  const A = {x: ad.x * len * Math.sqrt(1 - k * k), y: ad.y * len * Math.sqrt(1 - k * k)};
  // the lowest point of the rotated near-face ellipse sits on the anchor; its centre is above it. Across a band, the
  // near face's contact point (its point at phi 180, the paper under it) sits half the band's width before the anchor,
  // so the anchor is the middle of the contact line.
  const lowR = (r: number) => Math.sqrt((k * r * ad.y) ** 2 + (r * perp.y) ** 2);
  const C = ac ? {x: -A.x / 2 + ad.x * k * R, y: -A.y / 2 + ad.y * k * R} : {x: 0, y: -lowR(R)};
  /** The two ends of the line where the roll meets the paper or ground (design space). */
  const contact: [Pt, Pt] = ac ? [{x: -A.x / 2, y: -A.y / 2}, {x: A.x / 2, y: A.y / 2}] : [{x: 0, y: 0}, A];
  /** A point on a face ellipse of radius r at angle phi (0 along the axis direction, 90 along perp), face centre c. */
  const onFace = (c: Pt, r: number, phi: number): Pt => addv(addv(c, ad, k * r * Math.cos(phi * D2R)), perp, r * Math.sin(phi * D2R));
  return {R1, rt, rem, R, k, al, len, ad, perp, A, C, onFace, contact, sheet: p.sheet ?? 170};
};
/** The roll's design-space bounding box (anchor at 0, 0). */
const rollBox = (p: RollProps) => {
  const g = rollGeom(p);
  const pts: Pt[] = [];
  for (let a = 0; a < 360; a += 10) { pts.push(g.onFace(g.C, g.R, a)); pts.push(addv(g.onFace(g.C, g.R, a), g.A)); }
  const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
  return {x: Math.min(...xs) - 3, y: Math.min(...ys) - 3, w: Math.max(...xs) - Math.min(...xs) + 6, h: Math.max(...ys) - Math.min(...ys) + 6};
};
/** World quad around the roll (both end faces and the side). */
export const rollQuad = (p: RollProps): Pt[] => propQuad(place(p, ROLL_DIAMETER), rollBox(p));
/** World point under the middle of the roll on the ground, where the paper leaves it (lay the band's start here).
 *  With `across`, the middle of the line where roll meets paper: the anchor itself, on the band's centreline. */
export const rollContact = (p: RollProps): Pt => {
  const g = rollGeom(p);
  return propPoint(place(p, ROLL_DIAMETER), {x: (g.contact[0].x + g.contact[1].x) / 2, y: (g.contact[0].y + g.contact[1].y) / 2});
};
/** World ends of the line where the roll meets the paper or ground: the near end first. With `across`, the band's
 *  right-hand and left-hand edges under the roll's axis. */
export const rollContactLine = (p: RollProps): [Pt, Pt] => {
  const g = rollGeom(p), pl = place(p, ROLL_DIAMETER);
  return [propPoint(pl, g.contact[0]), propPoint(pl, g.contact[1])];
};
/** World radius of the roll at its `remaining` (the tube's at 0). */
export const rollRadius = (p: RollProps) => rollGeom(p).R * (place(p, ROLL_DIAMETER).scale ?? 1);

export const Roll: React.FC<RollProps> = (p) => {
  const g = rollGeom(p);
  const C = roleColours(p.colours);
  const paper = C.paper, card = C.body, edge = PALETTE.shadow;
  const sw = (p.hero ? 4 : 3) / (place(p, ROLL_DIAMETER).scale ?? 1);
  const bare = g.rem <= 0.001;
  const outer = bare ? card : paper;
  const ell = (c: Pt, r: number, fill: string, stroke?: string, w = sw, key?: string) => (
    <ellipse key={key} cx={f2(c.x)} cy={f2(c.y)} rx={f2(g.k * r)} ry={f2(r)} transform={`rotate(${f2(g.al)} ${f2(c.x)} ${f2(c.y)})`} fill={fill} stroke={stroke} strokeWidth={stroke ? f2(w) : undefined} />
  );
  const far = addv(g.C, g.A);
  const t1 = g.onFace(g.C, g.R, 90), t2 = g.onFace(g.C, g.R, -90);
  const body = [t1, addv(t1, g.A), addv(t2, g.A), t2];
  // generator lines on the visible side (cos phi > 0): sheet perforations on paper, the spiral seam on the bare tube
  // across a band, a positive turn rolls the roll forward along the band's heading: its top surface moves forward
  const turn = (p.turn ?? 0) * (p.across ? -1 : 1);
  const gens: React.ReactNode[] = [];
  if (!bare) {
    const step = (g.sheet / g.R) / D2R; // degrees per sheet at this radius
    const n = Math.ceil(360 / step) + 1;
    for (let j = -n; j <= n; j++) {
      const phi = j * step - turn;
      const cphi = Math.cos(phi * D2R);
      if (cphi < 0.12) continue;
      const a = g.onFace(g.C, g.R, phi), b = addv(a, g.A);
      gens.push(<path key={`g${j}`} d={pathD([a, b], false)} stroke={mixHex(paper, edge, 0.4)} strokeWidth={f2(sw * 0.7)} strokeDasharray={`${f2(9)} ${f2(6)}`} opacity={Math.min(1, cphi * 2)} />);
    }
  } else {
    // the tube's spiral seam: a line climbing round the tube, its near end at angle -turn
    for (const off of [0, 180]) {
      const phi = off - turn;
      const cphi = Math.cos(phi * D2R);
      if (cphi < 0.12) continue;
      const a = g.onFace(g.C, g.R, phi), b = addv(g.onFace(g.C, g.R, phi + 35), g.A);
      gens.push(<path key={`s${off}`} d={pathD([a, b], false)} stroke={mixHex(card, edge, 0.45)} strokeWidth={f2(sw * 0.8)} opacity={Math.min(1, cphi * 2)} />);
    }
  }
  // near face: paper end with faint layer rings, the tube ring and its shaded hollow
  const rings = bare ? [] : [0.25, 0.5, 0.75].map((u) => g.rt + (g.R - g.rt) * u).filter((r) => r - g.rt > 4);
  const tubeIn = g.rt - 4;
  return (
    <g transform={propTransform(place(p, ROLL_DIAMETER))} opacity={p.opacity ?? 1}>
      {ell(far, g.R, outer, edge)}
      <path d={pathD(body)} fill={outer} />
      <path d={pathD([t1, addv(t1, g.A)], false) + pathD([t2, addv(t2, g.A)], false)} stroke={edge} strokeWidth={f2(sw)} strokeLinecap="round" />
      {gens}
      {ell(g.C, g.R, bare ? card : mixHex(paper, edge, 0.05), edge)}
      {rings.map((r, k) => ell(g.C, r, 'none', mixHex(paper, edge, 0.16), sw * 0.6, `r${k}`))}
      {!bare && ell(g.C, g.rt, card, edge, sw * 0.8)}
      {ell(g.C, tubeIn, mixHex(card, edge, 0.6), edge, sw * 0.6)}
      {/* the hollow's far rim: the tube's inner wall in shade, darker toward the back */}
      {ell(addv(g.C, g.ad, g.k * tubeIn * 0.35), tubeIn * 0.82, mixHex(card, edge, 0.78))}
    </g>
  );
};
export const rollGraphic = (o: PropGraphicOpts<RollProps>): DecorGraphic => propGraphic(o, Roll, rollQuad);

// ------------------------------------------------------------------ TissueSheet

/** Natural size: one sheet's side, 150 design units (the band's width). */
export const TISSUE_SHEET_SIZE = 150;
export interface TissueSheetProps extends PropBase {
  /** `size` is the sheet's side in world px (default 150). Anchor: the sheet's centre. */
  /** 0 flat; up to 1 the lower right corner lifts and folds back (a loose sheet), showing its back. */
  curl?: boolean | number;
  /** Text printed on the sheet (the echo sheets: PAPER TRAIL). Split onto rows at spaces; each row fitted to
   *  `captionWidth` of the sheet. */
  caption?: string;
  /** Font key of the caption (default `stamp` when configured, else the default font), its colour (default the
   *  detail role mixed half way to the shadow role, about Slate), its width as a fraction of the sheet (default 0.74). */
  captionFont?: string;
  captionColour?: string;
  captionWidth?: number;
  /** The first sheet's torn corner (TORN_CORNER), at the top left. */
  torn?: boolean;
  /** Paper colour (default the paper role). */
  colour?: string;
}
export interface SheetCaptionRow {text: string; x: number; baseline: number; size: number; w: number; cap: number}
/** The caption rows of a sheet in WORLD px (unrotated sheets only are exact): text, left x, baseline, font size, width,
 *  cap height. Hand them to the engine's caption() if the caption must be checked like a sung word. */
export const tissueSheetCaption = (p: TissueSheetProps): {font: string; rows: SheetCaptionRow[]} => {
  const font = p.captionFont ?? (FONTS.stamp ? 'stamp' : DEFAULT_FONT);
  if (!p.caption) return {font, rows: []};
  const upper = FONTS[font]?.upper;
  const texts = p.caption.split(/\s+/).filter(Boolean).map((t) => (upper ? t.toUpperCase() : t));
  const s = (p.size ?? TISSUE_SHEET_SIZE) / TISSUE_SHEET_SIZE;
  const Wd = TISSUE_SHEET_SIZE * (p.captionWidth ?? 0.74);
  const cap = FONT_INFO[font]?.cap ?? 0.7;
  // one size for every row: the widest row fills the width; rows stacked with 0.36 cap leading
  const unit = Math.max(...texts.map((t) => textWidth(t, font, 100) / 100));
  let size = Wd / unit;
  const lead = 1.36 * cap * size;
  const maxH = TISSUE_SHEET_SIZE * 0.7;
  if (lead * texts.length > maxH) size *= maxH / (lead * texts.length);
  const pitch = 1.36 * cap * size;
  const top = -((texts.length - 1) * pitch + cap * size) / 2;
  const rows = texts.map((t, k) => {
    const w = textWidth(t, font, size);
    return {text: t, x: p.x + (-w / 2) * s, baseline: p.y + (top + cap * size + k * pitch) * s, size: size * s, w: w * s, cap: cap * size * s};
  });
  return {font, rows};
};
const sheetCurl = (p: TissueSheetProps) => (p.curl === true ? 1 : p.curl === false || p.curl === undefined ? 0 : Math.max(0, Math.min(1, p.curl)));
export const TissueSheet: React.FC<TissueSheetProps> = (p) => {
  const S = TISSUE_SHEET_SIZE, h = S / 2;
  const q = place(p, S);
  const sc = q.scale ?? 1;
  const col = tissueColours({colour: p.colour});
  const ew = 2.5 / sc;
  const curl = sheetCurl(p);
  // The sheet as one sheet of a band running right: its left and right edges are the perforations it was torn off at
  // (fine teeth), its top and bottom edges are the roll's straight sides. The curl folds the lower right corner back
  // along a line cutting `c` off each of its two edges. Outline clockwise from the top left.
  const teeth = (x: number, y0: number, y1: number, dir: number): Pt[] => {
    const n = Math.max(1, Math.round(Math.abs(y1 - y0) / 7));
    const out: Pt[] = [];
    for (let k = 0; k <= n; k++) out.push({x: x + (k % 2 ? dir * 2.2 : 0), y: y0 + ((y1 - y0) * k) / n});
    return out;
  };
  const c = curl * S * 0.42;
  // the first sheet's torn corner (TORN_CORNER) at the top left: u runs along the top edge from the left (start) edge,
  // v down from the top (torn long) edge; the tear goes from the left edge, 0.40 S down, to the top edge, 0.34 S along
  const tear = TORN_CORNER.map(([u, v]) => ({x: -h + u * S, y: -h + v * S}));
  const topStart = p.torn ? tear[tear.length - 1].x : -h;
  const leftEnd = p.torn ? tear[0].y : -h;
  const shape: Pt[] = [
    {x: topStart, y: -h}, {x: h, y: -h},
    ...teeth(h, -h, h - c, 1).slice(1),
    ...(c > 0 ? [{x: h - c, y: h}] : []),
    {x: -h, y: h},
    ...teeth(-h, h, leftEnd, -1).slice(1),
    ...(p.torn ? tear.slice(1, -1) : []),
  ];
  // emboss dots
  let dots = '';
  for (let y = -h + 12, row = 0; y < h - 6; y += 22, row++) {
    for (let x = -h + S / 7 * (1 + (row % 2) * 0.5); x < h - 8; x += S / 7) {
      if (c > 0 && x + y > h * 2 - c - 6) continue;
      if (p.torn && x < -h + 0.36 * S && y < -h + 0.42 * S) continue;
      dots += `M${f2(x)} ${f2(y)}h0.01`;
    }
  }
  const {font, rows} = tissueSheetCaption({...p, x: 0, y: 0, size: S, angle: 0});
  const capCol = p.captionColour ?? mixHex(roleColours(p.colours).muted, PALETTE.shadow, 0.5);
  const fam = FONT_FAMILY[font], st = FONT_STYLE[font];
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <path d={pathD(shape)} fill={col.paper} stroke={col.edge} strokeWidth={f2(ew)} strokeLinejoin="round" />
      {dots && <path d={dots} stroke={col.emboss} strokeWidth={3.4 / Math.max(1, sc * 0.6)} strokeLinecap="round" fill="none" />}
      {rows.map((r, k) => (
        <g key={k}>
          {/* embossed: a faint pressed-in shadow line under the print */}
          <text x={f2(r.x + 1.2)} y={f2(r.baseline + 1.2)} fontFamily={fam} fontStyle={st?.fontStyle} fontWeight={st?.fontWeight} fontSize={f2(r.size)} textLength={f2(r.w)} lengthAdjust="spacingAndGlyphs" fill={mixHex(col.paper, PALETTE.shadow, 0.18)}>{r.text}</text>
          <text x={f2(r.x)} y={f2(r.baseline)} fontFamily={fam} fontStyle={st?.fontStyle} fontWeight={st?.fontWeight} fontSize={f2(r.size)} textLength={f2(r.w)} lengthAdjust="spacingAndGlyphs" fill={capCol}>{r.text}</text>
        </g>
      ))}
      {c > 0 && (
        // the curled corner: the flap folded back over the sheet along the crease, its back showing
        <path d={pathD([{x: h, y: h - c}, {x: h - c, y: h}, {x: h - c * 1.08, y: h - c * 1.08}])} fill={col.back} stroke={col.edge} strokeWidth={f2(ew)} strokeLinejoin="round" />
      )}
    </g>
  );
};
/** World quad of the sheet. */
export const tissueSheetQuad = (p: TissueSheetProps): Pt[] => propQuad(place(p, TISSUE_SHEET_SIZE), {x: -77, y: -78, w: 154, h: 156});
export const tissueSheetGraphic = (o: PropGraphicOpts<TissueSheetProps>): DecorGraphic => propGraphic(o, TissueSheet, tissueSheetQuad);
