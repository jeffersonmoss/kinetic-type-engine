// Line-type elements and decor graphics with a finite life (ruling 198, Fable review of ProofV3 items 36 and 46, and
// Jefferson's note on stray lines that linger). Every line the engine draws (board rules, seam hairlines, extrude strokes,
// door hinge rules, brake skids) and every board graphic retires with the thing it belongs to, or at an explicit end
// time, unless the storyboard names it as persistent. The validator reads the same geometry the renderer draws:
//   lineMarks(board, f)     every line-type element on the board at frame f (world segments, with owners)
//   graphicLife(g, t)       a DecorGraphic's life at song seconds t (null outside [from, until))
//   rays({...})             Gold rays round words, growing out and retracting over 6 frames to nothing by `until`
import React from 'react';
import {FPS, PALETTE} from './config';
import {wordCorners} from './layout';
import {ruleAt} from './rules';
import type {Board, BoardCtx, BoardLayout, DecorGraphic, Pt} from './types';
import {clamp} from './util';
import {verbFor, baseCtx, boardCues, retireFrame, wordStateAt} from './wordState';
import {blockToWorld, layoutBoard} from './layout';
import {FONT_INFO} from './metrics';
import {rot} from './util';

/** Frames a line or graphic may stay in frame after every owner has retired or left frame (ruling 198). */
export const LINGER_FRAMES = 20;
/** Frames a engine-drawn line takes to fade when its owner retires. */
export const LINE_EXIT_FRAMES = 6;
/** Minimum exit of a decor graphic (MIN_TRANSITION_FRAMES). */
export const GRAPHIC_EXIT_FRAMES = 6;

/** One line segment drawn at a frame, in world px. */
export interface LineSeg {
  id: string;
  a: Pt; b: Pt;
  /** World px. */
  width: number;
  opacity: number;
  colour?: string;
  /** The words it belongs to (it retires with them). Empty: no owner (the validator then needs `persistent`). */
  owner: number[];
  persistent?: boolean;
  kind: 'rule' | 'seam' | 'extrude' | 'hinge' | 'skid' | 'graphic';
}

/** The latest retire frame of a set of words (Infinity if none is on the board). */
export const ownersRetire = (board: Board, words: number[]): number => {
  const L = layoutBoard(board);
  const ws = words.filter((i) => L.words.has(i));
  return ws.length ? Math.max(...ws.map((i) => retireFrame(board, i))) : Infinity;
};
/** Opacity factor of a engine line that fades out over LINE_EXIT_FRAMES from frame `from`. */
export const exitFade = (f: number, from: number, frames = LINE_EXIT_FRAMES) => 1 - clamp((f - from) / frames);

/** Draws line segments (world px) as SVG lines; `zoom` keeps them at least 2 px on screen. */
export const drawLines = (segs: LineSeg[] | null | undefined, zoom: number): React.ReactNode =>
  segs && segs.length ? React.createElement('g', null, ...segs.filter((s) => s.opacity > 0.003).map((s) =>
    React.createElement('line', {key: s.id, x1: s.a.x, y1: s.a.y, x2: s.b.x, y2: s.b.y, stroke: s.colour ?? PALETTE.paper, strokeWidth: Math.max(s.width, 2 / Math.max(0.01, zoom)), opacity: s.opacity, strokeLinecap: 'butt'}))) : null;

/** A word's ink at frame f in world px (highest ascender to lowest descender, across its advance, under its render
 *  state), as validateRules.ts inkQuad has it on screen. */
const inkWorld = (L: BoardLayout, i: number, f: number): Pt[] | null => {
  const w = L.words.get(i)!;
  const m = wordStateAt(L.board, i, f);
  if (m.hidden || m.opacity <= 0.05) return null;
  const fi = FONT_INFO[w.font];
  const asc = /[bdfhklt'’]/.test(w.text) ? Math.max(0, fi.asc - fi.cap) * w.size : 0;
  const desc = /[gjpqy,;]/.test(w.text) ? fi.inkDesc * w.size : 0;
  const cx = w.x + w.w / 2, cy = w.y + w.h / 2;
  const b = L.blocks[w.block];
  // Paper Trail K2: a spread word's box reaches past its advance (m.extend; undefined for every other word)
  const x0 = w.x - (m.extend?.l ?? 0), x1 = w.x + w.w + (m.extend?.r ?? 0);
  return [{x: x0, y: w.y - asc}, {x: x1, y: w.y - asc}, {x: x1, y: w.baseline + desc}, {x: x0, y: w.baseline + desc}].map((p) => {
    const q = rot({x: (p.x - cx) * m.sx, y: (p.y - cy) * m.sy}, m.rot);
    return blockToWorld(b, {x: q.x + cx + m.dx, y: q.y + cy + m.dy});
  });
};
/** Parameter interval [t0, t1] of segment a-b inside convex polygon q grown by d (Cyrus-Beck), or null. */
const segInside = (a: Pt, b: Pt, q: Pt[], d: number): [number, number] | null => {
  let area = 0;
  for (let k = 0; k < q.length; k++) { const p = q[k], r = q[(k + 1) % q.length]; area += p.x * r.y - r.x * p.y; }
  const sgn = area >= 0 ? 1 : -1;
  let t0 = 0, t1 = 1;
  const dir = {x: b.x - a.x, y: b.y - a.y};
  for (let k = 0; k < q.length; k++) {
    const p = q[k], r = q[(k + 1) % q.length];
    const ex = r.x - p.x, ey = r.y - p.y, l = Math.hypot(ex, ey) || 1;
    const n = {x: (sgn * ey) / l, y: (-sgn * ex) / l}; // outward
    const c = n.x * p.x + n.y * p.y + d;
    const num = c - (n.x * a.x + n.y * a.y), den = n.x * dir.x + n.y * dir.y;
    if (Math.abs(den) < 1e-12) { if (num < 0) return null; continue; }
    const t = num / den;
    if (den > 0) t1 = Math.min(t1, t); else t0 = Math.max(t0, t);
    if (t0 > t1) return null;
  }
  return [t0, t1];
};
/**
 * Kit pass 21 (decor-ink): a hairline a verb draws (a SEAM, a DOOR hinge) is routed round the ink of every unretired
 * word it does not belong to: the parts of it that would cross that ink, plus a clearance of half its width and 4 px
 * on screen, are left out, so it breaks round a neighbouring row instead of drawing through it. Pieces shorter than
 * 6 px on screen are dropped. The renderer and the validator both read the routed pieces (ids "seam 7", "seam 7~1"...).
 */
export const routeAround = (L: BoardLayout, segs: LineSeg[], f: number, zoom: number): LineSeg[] => {
  const out: LineSeg[] = [];
  const z = Math.max(0.01, zoom);
  for (const sg of segs) {
    const own = new Set(sg.owner);
    const cuts: [number, number][] = [];
    for (const i of L.order) {
      if (own.has(i)) continue;
      const w = L.words.get(i)!;
      if (f < w.sf || f >= retireFrame(L.board, i)) continue;
      const q = inkWorld(L, i, f);
      if (!q) continue;
      const iv = segInside(sg.a, sg.b, q, sg.width / 2 + 4 / z);
      if (iv) cuts.push(iv);
    }
    if (!cuts.length) { out.push(sg); continue; }
    cuts.sort((x, y) => x[0] - y[0]);
    const len = Math.hypot(sg.b.x - sg.a.x, sg.b.y - sg.a.y) * z;
    let t = 0, k = 0;
    const piece = (u0: number, u1: number) => {
      if ((u1 - u0) * len < 6) return;
      const at = (u: number) => ({x: sg.a.x + (sg.b.x - sg.a.x) * u, y: sg.a.y + (sg.b.y - sg.a.y) * u});
      out.push({...sg, id: k ? `${sg.id}~${k}` : sg.id, a: at(u0), b: at(u1)}); k++;
    };
    for (const [c0, c1] of cuts) { if (c0 > t) piece(t, c0); t = Math.max(t, c1); }
    if (t < 1) piece(t, 1);
  }
  return out;
};

/** Words owning a board rule: its `owner` words and the words of its `owner` blocks. */
export const ruleOwners = (board: Board, owner: {words?: number[]; blocks?: number[]} | undefined): number[] => {
  if (!owner) return [];
  const out = [...(owner.words ?? [])];
  for (const k of owner.blocks ?? []) { const b = board.blocks[k]; if (b) for (let i = b.words[0]; i <= b.words[1]; i++) out.push(i); }
  return out;
};

/** Every line-type element on a board at frame f: board rules, the lines verbs draw (seam, extrude, hinge, skid) and
 *  the line graphics of board.graphics (as their declared boxes' long axis is not known, graphics are listed by
 *  graphicMarks instead). Board paths (board.paths) are a video's persistent lines and are not listed. */
export const lineMarks = (board: Board, f: number): LineSeg[] => {
  const out: LineSeg[] = [];
  for (const d of board.rules ?? []) {
    const s = ruleAt(board, d, f / FPS);
    if (!s || s.len < 0.5) continue;
    out.push({id: `rule ${d.id}`, a: s.a, b: s.b, width: s.width, opacity: s.opacity, owner: ruleOwners(board, d.owner), persistent: d.persistent, kind: 'rule'});
  }
  const L = layoutBoard(board);
  for (const cue of boardCues(board)) {
    const def = verbFor(board, cue.name);
    if (!def?.lines) continue;
    for (const s of def.lines(baseCtx(cue, L, f)) ?? []) out.push(s);
  }
  return out;
};

/** A DecorGraphic's life at song seconds t: null outside [from, until); `out` is its exit progress. */
export const graphicLife = (g: DecorGraphic, t: number): {age: number; left: number; out: number} | null => {
  if (!(t >= g.from && t < g.until)) return null;
  const exit = Math.max(GRAPHIC_EXIT_FRAMES, g.exit ?? GRAPHIC_EXIT_FRAMES);
  const left = (g.until - t) * FPS;
  return {age: (t - g.from) * FPS, left, out: clamp(1 - left / exit)};
};
/** Draws the graphics of one layer (TypeStage). The engine ends every graphic at `until`; 'fade' exits are faded here. */
export const drawGraphics = (board: Board, c: BoardCtx, layer: DecorGraphic['layer']): React.ReactNode => {
  const gs = (board.graphics ?? []).filter((g) => g.layer === layer);
  if (!gs.length) return null;
  return React.createElement('g', null, ...gs.map((g) => {
    const life = graphicLife(g, c.t);
    if (!life) return null;
    const op = g.exitBy === 'shape' ? 1 : 1 - life.out;
    return React.createElement('g', {key: g.id, opacity: op}, g.draw(c, life));
  }));
};

const segPoly = (a: Pt, b: Pt, w: number): Pt[] => {
  const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const n = {x: (-(b.y - a.y) / d) * (w / 2), y: ((b.x - a.x) / d) * (w / 2)};
  return [{x: a.x + n.x, y: a.y + n.y}, {x: b.x + n.x, y: b.y + n.y}, {x: b.x - n.x, y: b.y - n.y}, {x: a.x - n.x, y: a.y - n.y}];
};

/** Gold rays round words (entry 91's burst around THE MIRACLE'S NEAR): `count` short strokes start on the words' box
 *  grown by `gap` world px, grow outward one `stagger` frame apart over `grow` frames, and retract into their outer
 *  ends over 6 frames to nothing by `until` (Fable item 36: no ray outlives its moment). `until` is required.
 *  `skip` drops rays by index (keep them off ink the validator reports). Owner: the words (`line-linger`). */
export const rays = (o: {id?: string; around: number[]; from: number; until: number; count?: number; length?: number; gap?: number; width?: number; colour?: string; stagger?: number; grow?: number; skip?: number[]; layer?: 'under' | 'over'}): DecorGraphic => {
  const n = o.count ?? 12, LEN = o.length ?? 70, gap = o.gap ?? 24, W = o.width ?? 6, st = o.stagger ?? 1, grow = Math.max(6, o.grow ?? 8);
  const skip = new Set(o.skip ?? []);
  const geom = (L: BoardLayout, t: number): {p0: Pt; p1: Pt}[] => {
    const pts = o.around.filter((i) => L.words.has(i)).flatMap((i) => { const g = L.words.get(i)!; return wordCorners(L.blocks[g.block], g); });
    if (!pts.length) return [];
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const rx = Math.max(...pts.map((p) => Math.abs(p.x - cx))) + gap, ry = Math.max(...pts.map((p) => Math.abs(p.y - cy))) + gap;
    const age = (t - o.from) * FPS, left = (o.until - t) * FPS;
    const out = clamp(1 - left / GRAPHIC_EXIT_FRAMES); // retract: the inner end runs out to the outer end
    const res: {p0: Pt; p1: Pt}[] = [];
    for (let k = 0; k < n; k++) {
      if (skip.has(k)) continue;
      const u = clamp((age - k * st) / grow);
      if (u <= 0) continue;
      const th = (k / n) * 2 * Math.PI;
      const dir = {x: Math.cos(th), y: Math.sin(th)};
      // each ray starts where its direction leaves the words' box grown by the gap (ruling 198: an ellipse through the
      // box's half-extents cuts into the box's corners, so the diagonal rays used to start on the ink)
      const reach = Math.min(Math.abs(dir.x) > 1e-6 ? rx / Math.abs(dir.x) : Infinity, Math.abs(dir.y) > 1e-6 ? ry / Math.abs(dir.y) : Infinity);
      const base = {x: cx + dir.x * reach, y: cy + dir.y * reach};
      const tip = LEN * u;
      const tail = tip * out;
      if (tip - tail < 0.5) continue;
      res.push({p0: {x: base.x + dir.x * tail, y: base.y + dir.y * tail}, p1: {x: base.x + dir.x * tip, y: base.y + dir.y * tip}});
    }
    return res;
  };
  return {
    id: o.id ?? `rays ${o.around.join(',')}`, layer: o.layer ?? 'over', from: o.from, until: o.until, exitBy: 'shape', line: true,
    owner: {words: o.around},
    box: ({t, board}) => { if (!(t >= o.from && t < o.until)) return null; const g = geom(layoutBoard(board), t); return g.length ? g.map((r) => segPoly(r.p0, r.p1, W)) : null; },
    draw: (c) => React.createElement('g', null, ...geom(c.layout, c.t).map((r, k) => React.createElement('line', {key: k, x1: r.p0.x, y1: r.p0.y, x2: r.p1.x, y2: r.p1.y, stroke: o.colour ?? PALETTE.highlight, strokeWidth: W, strokeLinecap: 'round'}))),
  };
};
