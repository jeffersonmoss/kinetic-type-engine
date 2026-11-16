// SEAM (rule 54): the new words slide out from behind a hairline, masked at the hairline, and stop flush against it.
// Default (order 'sung', sides 'L' and 'R'; ruling 194.9): the hairline stands at the block's right end and each row
// comes out of it one word at a time in sung order, each word pushing the earlier ones along, so the first word sung is
// the first seen; the hairline is as tall as the rows. order 'rigid' (and sides 'U', 'D') keeps the original behaviour: each
// row slides out whole, travelling its own width, rows 3 frames apart.
// params: side 'R' | 'L' | 'U' | 'D' (direction of travel in the block frame; default from the anchor part: flankL -> 'L',
// top -> 'U', foot -> 'D', else 'R'), stagger (3), frames (minimum, 8), draw (true: draw the seam hairline), gap (px
// between hairline and words, default 0), colour, width.
import {FPS, PALETTE, SPEED_CAP} from '../config';
import {rampEase} from '../rig';
import type {AnchorRef, BlockGeom, BoardLayout, VerbCue} from '../types';
import {easeInOutSine} from '../util';
import {getVerb, registerVerb} from '../verbRegistry';
import {drawLines, exitFade, ownersRetire} from '../lines';
import {BIG, P, PC, rectPath, toWorld, wordsOfCue, zoomOf} from './common';

type Side = 'R' | 'L' | 'U' | 'D';
const sideOf = (cue: VerbCue): Side => {
  const s = cue.params?.side as Side | undefined;
  if (s) return s;
  const a = cue.params?.from as AnchorRef | undefined;
  const part = a && 'word' in a ? a.part : undefined;
  return part === 'flankL' ? 'L' : part === 'top' ? 'U' : part === 'foot' ? 'D' : 'R';
};
const blockOfCue = (cue: VerbCue, L: BoardLayout): BlockGeom => L.blocks[(cue.params?.block as number | undefined) ?? L.words.get(cue.word)!.block];
const RAMP = 0.25; // ramp fraction of the trapezoid ease (peak speed 1 / (1 - 0.25) of the average)
/** Per row: [start frame, frames]. */
export const seamRows = (cue: VerbCue, L: BoardLayout): {start: number; dur: number; travel: number}[] => {
  const b = blockOfCue(cue, L);
  const side = sideOf(cue);
  const stagger = PC(cue, 'stagger', 3);
  const minF = PC(cue, 'frames', 8);
  const words = new Set(wordsOfCue(cue, L));
  const rows = b.rows.map((r, k) => ({r, k})).filter(({r}) => r.words.some((i) => words.has(i)));
  const land = Math.min(...rows.map(({r}) => Math.min(...r.words.map((i) => L.words.get(i)!.sf))));
  const z = zoomOf(L, cue.word, land);
  const out = rows.map(({r}) => {
    const travel = side === 'R' || side === 'L' ? r.width : r.h;
    // the style bible says width / 28 px per frame; with an eased start and stop that would peak above the cap, so the
    // the engine uses the trapezoid ease (peak 1.33 x average) and the cap: about width / 24 px per frame on screen
    const dur = Math.max(minF, Math.ceil((travel * z) / (SPEED_CAP * (1 - RAMP)) - 1e-9));
    return {dur, travel, rowSf: Math.min(...r.words.map((i) => L.words.get(i)!.sf))};
  });
  const at = cue.at !== undefined ? cue.at * FPS : (cue.params?.showFrom as number | undefined) !== undefined ? (cue.params!.showFrom as number) * FPS : land - out[0].dur;
  return out.map((o, k) => {
    const s = cue.at !== undefined || cue.params?.showFrom !== undefined ? at + stagger * k : Math.min(at + stagger * k, o.rowSf - o.dur);
    return {start: s, dur: o.dur, travel: o.travel};
  });
};
/** Sung order (the default, ruling 194.9): each row is a conveyor coming out of a seam at the block's right end. The
 *  first word sung comes out first and each later word pushes the earlier ones along, so the row is read left to right
 *  as it is sung; the row stops flush when its last word is out. Per row: the seam x (block frame), the row's start
 *  offset and, per word, [start frame, frames, stroke px]. */
type Conv = {seamX: number; rows: Map<number, {offset: number; strokes: {i: number; start: number; dur: number; len: number}[]}>};
const convMemo = new WeakMap<VerbCue, Conv>();
export const isSungOrder = (cue: VerbCue) => (cue.params?.order ?? 'sung') === 'sung' && (sideOf(cue) === 'L' || sideOf(cue) === 'R');
export const seamConveyor = (cue: VerbCue, L: BoardLayout): Conv => {
  const hit = convMemo.get(cue);
  if (hit) return hit;
  const b = blockOfCue(cue, L);
  const words = new Set(wordsOfCue(cue, L));
  const gap = PC(cue, 'gap', 0);
  const seamX = Math.max(...b.rows.filter((r) => r.words.some((i) => words.has(i))).map((r) => { const g = L.words.get(r.words[r.words.length - 1])!; return g.x + g.w; })) + gap;
  const rows = new Map<number, {offset: number; strokes: {i: number; start: number; dur: number; len: number}[]}>();
  let next = Infinity;
  const rowList = b.rows.map((r, k) => ({r, k})).filter(({r}) => r.words.some((i) => words.has(i)));
  // scheduled backward from the last word: each word is fully out by its sung frame and after the word before it
  for (let rr = rowList.length - 1; rr >= 0; rr--) {
    const {r, k} = rowList[rr];
    const gs = r.words.filter((i) => words.has(i)).map((i) => L.words.get(i)!);
    const lens = gs.map((g, j) => (j + 1 < gs.length ? gs[j + 1].x - g.x : seamX - g.x));
    const strokes: {i: number; start: number; dur: number; len: number}[] = [];
    for (let j = gs.length - 1; j >= 0; j--) {
      const z = zoomOf(L, gs[j].i, gs[j].sf);
      const dur = Math.max(PC(cue, 'frames', 6), Math.ceil((lens[j] * z * (Math.PI / 2)) / SPEED_CAP - 1e-9));
      const end = Math.min(gs[j].sf, next);
      strokes.unshift({i: gs[j].i, start: end - dur, dur, len: lens[j]});
      next = end - dur;
    }
    rows.set(k, {offset: seamX - gs[0].x, strokes});
  }
  const out = {seamX, rows};
  convMemo.set(cue, out);
  return out;
};
const rowIndex = (b: BlockGeom, cue: VerbCue, L: BoardLayout, row: number) => {
  const words = new Set(wordsOfCue(cue, L));
  return b.rows.map((r, k) => ({r, k})).filter(({r}) => r.words.some((i) => words.has(i))).findIndex(({k}) => k === row);
};

registerVerb('seam', {
  early: true, replacesEnter: true, gradual: true,
  affects: (cue, L) => wordsOfCue(cue, L),
  defaultAt: (cue, L) => (isSungOrder(cue)
    ? Math.min(...[...seamConveyor(cue, L).rows.values()].map((r) => r.strokes[0].start)) / FPS
    : Math.min(...seamRows(cue, L).map((r) => r.start)) / FPS),
  modify: (c) => {
    if (isSungOrder(c.cue)) {
      const cv = seamConveyor(c.cue, c.L);
      const row = cv.rows.get(c.geom.row);
      if (!row) return null;
      if (c.f < row.strokes[0].start) return {hidden: true, opacity: 0};
      const last = row.strokes[row.strokes.length - 1];
      if (c.f >= last.start + last.dur) return null;
      const out = row.strokes.reduce((a, st) => a + st.len * easeInOutSine((c.f - st.start) / st.dur), 0);
      return {dx: row.offset - out, clip: rectPath(-BIG, -BIG, cv.seamX, BIG)};
    }
    const b = c.block;
    const rows = seamRows(c.cue, c.L);
    const k = rowIndex(b, c.cue, c.L, c.geom.row);
    const R = rows[Math.max(0, k)];
    const f = c.f;
    const p = (f - R.start) / R.dur;
    if (p >= 1) return null;
    const side = sideOf(c.cue);
    const gap = P(c, 'gap', 0);
    // the mask edge: the block's leading edge on the side the words come from
    const clip = side === 'R' ? rectPath(-gap, -BIG, BIG, BIG) : side === 'L' ? rectPath(-BIG, -BIG, b.w + gap, BIG)
      : side === 'U' ? rectPath(-BIG, -BIG, BIG, b.h + gap) : rectPath(-BIG, -gap, BIG, BIG);
    if (p <= 0) return {hidden: true, opacity: 0};
    const d = R.travel * (1 - rampEase(R.dur, R.dur * RAMP)(p));
    const off = side === 'R' ? {dx: -d} : side === 'L' ? {dx: d} : side === 'U' ? {dy: d} : {dy: -d};
    return {...off, clip};
  },
  // the seam hairline (ruling 198): it draws itself in 6 frames before the first row comes out, and once the last row
  // is out its job is done: it fades over 6 frames from 10 frames after that (or when the block retires, if sooner)
  lines: (c) => {
    if (P(c, 'draw', true) === false) return null;
    const b = c.L.blocks[(c.cue.params?.block as number | undefined) ?? c.L.words.get(c.cue.word)!.block];
    const z = c.camAt(c.f).zoom;
    let a, e, grow, done;
    if (isSungOrder(c.cue)) {
      // the seam: a hairline at the block's right end, at least as tall as the rows it serves (ruling 194.9)
      const cv = seamConveyor(c.cue, c.L);
      const rs = [...cv.rows.values()];
      const first = Math.min(...rs.map((r) => r.strokes[0].start));
      if (c.f < first - 6) return null;
      done = Math.max(...rs.map((r) => { const l = r.strokes[r.strokes.length - 1]; return l.start + l.dur; }));
      const ks = [...cv.rows.keys()];
      const y0 = Math.min(...ks.map((k) => b.rows[k].y)), y1 = Math.max(...ks.map((k) => b.rows[k].y + b.rows[k].h));
      const pad = 0.15 * (y1 - y0);
      [a, e] = [{x: cv.seamX, y: y0 - pad}, {x: cv.seamX, y: y1 + pad}].map((q) => toWorld(b, q));
      grow = Math.min(1, Math.max(0, (c.f - first + 6) / 6));
    } else {
      const rows = seamRows(c.cue, c.L);
      if (c.f < rows[0].start - 6) return null;
      done = Math.max(...rows.map((r) => r.start + r.dur));
      const side = sideOf(c.cue);
      const gap = P(c, 'gap', 0);
      const pad = 0.1 * b.h;
      const ends = side === 'R' ? [{x: -gap, y: -pad}, {x: -gap, y: b.h + pad}] : side === 'L' ? [{x: b.w + gap, y: -pad}, {x: b.w + gap, y: b.h + pad}]
        : side === 'U' ? [{x: -pad, y: b.h + gap}, {x: b.w + pad, y: b.h + gap}] : [{x: -pad, y: -gap}, {x: b.w + pad, y: -gap}];
      [a, e] = ends.map((q) => toWorld(b, q));
      grow = Math.min(1, Math.max(0, (c.f - rows[0].start + 6) / 6)); // the hairline draws itself in 6 frames
    }
    const owner = c.affected;
    const op = 0.7 * exitFade(c.f, Math.min(done + 10, ownersRetire(c.L.board, owner)));
    if (op <= 0.001 || grow <= 0) return null;
    return [{id: `seam ${b.index}`, kind: 'seam', a, b: {x: a.x + (e.x - a.x) * grow, y: a.y + (e.y - a.y) * grow}, width: Math.max(P(c, 'width', 3), 2 / Math.max(0.01, z)), opacity: op, colour: P(c, 'colour', PALETTE.paper), owner}];
  },
  overlay: (c) => drawLines(getVerb('seam')?.lines?.(c), c.camAt(c.f).zoom),
});
