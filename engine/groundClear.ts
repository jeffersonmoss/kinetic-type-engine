// K4 travelling retirement edge (Sweet Distillation): a ground `disc` with `clears: true` and a `keep` list retires every
// other word of its board by its travelling edge, used as a mask: the word is clipped to the outside of the disc as the
// edge crosses it (never popped whole), hidden once the disc covers it, and its reading ends on the frame the edge first
// touches its box. Words in `keep` are untouched. Pure; used by wordState (the clip and the cull), the stage (through
// the clip) and the validator (`ground-clear`). A wipe without `keep` keeps its old meaning (ground.tsx, PORTAL).
import {FPS, HEIGHT, WIDTH} from './config';
import {camForBlock, toScreen, toWorld} from './camera';
import {wipeFrames, wipeFullAt} from './ground';
import {layoutBoard, wordCorners, worldToBlock} from './layout';
import type {Board, GroundWipe, Pt} from './types';
import {clamp, easeInOutSine} from './util';

/** Does this wipe retire words by its edge (a disc with `clears` and a `keep` list)? */
export const isClearingDisc = (w: GroundWipe) => w.shape === 'disc' && !!w.clears && w.keep !== undefined;
const farCorner = (p: Pt) => Math.max(...[[0, 0], [WIDTH, 0], [0, HEIGHT], [WIDTH, HEIGHT]].map(([x, y]) => Math.hypot(x - p.x, y - p.y))) + 4;

/** The disc of a wipe at frame f: centre and radius in its own space (screen px, or world px for a board disc), and
 *  whether its colour is already the whole ground. Null before it starts. The same numbers Ground draws. */
export const discAt = (board: Board, w: GroundWipe, f: number): {space: 'screen' | 'board'; c: Pt; r: number; full: boolean} | null => {
  const t = f / FPS;
  if (t < w.t0) return null;
  const space = w.space ?? 'screen';
  const full = t >= wipeFullAt(board, w);
  const p = easeInOutSine(((t - w.t0) * FPS) / wipeFrames(board, w));
  if (space === 'screen') {
    const c = w.from ?? {x: WIDTH / 2, y: HEIGHT / 2};
    return {space, c, r: full ? Infinity : Math.max(0, p * farCorner(c)), full};
  }
  const c = w.from ?? {x: 0, y: 0};
  return {space, c, r: full ? Infinity : Math.max(0, (w.r0 ?? 0) + ((w.r1 ?? 100) - (w.r0 ?? 0)) * clamp(p)), full};
};

/** Distance from p to a convex polygon (0 inside). */
const distToPoly = (p: Pt, q: Pt[]): number => {
  let inside = true, best = Infinity;
  for (let k = 0; k < q.length; k++) {
    const a = q[k], b = q[(k + 1) % q.length];
    const cr = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (cr < 0) inside = false;
    const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1;
    const u = clamp(((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / L2);
    best = Math.min(best, Math.hypot(p.x - (a.x + u * (b.x - a.x)), p.y - (a.y + u * (b.y - a.y))));
  }
  // corners are in either winding: inside when every cross product has the same sign
  if (!inside) { inside = true; for (let k = 0; k < q.length; k++) { const a = q[k], b = q[(k + 1) % q.length]; if ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) > 0) inside = false; } }
  return inside ? 0 : best;
};

export interface GroundClearSpan {
  /** First frame the edge touches the word's landed box (its reading ends here). */
  touch: number;
  /** First frame the disc covers the whole box (the word is hidden from here). */
  cover: number;
  /** The wipe that clears it first. */
  wipe: GroundWipe;
}
const memo = new WeakMap<Board, Map<number, GroundClearSpan | null>>();
/** When the clearing discs of a board reach word i (null when none clears it: no such disc, or i is kept). Judged on
 *  the word's landed box (with descenders) through its block's camera, frame by frame from the wipe's start. */
export const groundClearSpan = (board: Board, i: number): GroundClearSpan | null => {
  let m = memo.get(board);
  if (!m) { m = new Map(); memo.set(board, m); }
  if (m.has(i)) return m.get(i)!;
  let out: GroundClearSpan | null = null;
  const L = layoutBoard(board);
  const g = L.words.get(i);
  if (g) {
    const b = L.blocks[g.block];
    const corners = wordCorners(b, {...g, h: g.boxH});
    for (const w of board.ground ?? []) {
      if (!isClearingDisc(w) || w.keep!.includes(i)) continue;
      const f0 = Math.ceil(w.t0 * FPS);
      // the disc stops growing when it is the whole ground (screen) or reaches r1 (board): nothing changes after that
      const fEnd = Math.ceil(Math.min(wipeFullAt(board, w), w.t0 + wipeFrames(board, w) / FPS) * FPS) + 1;
      let touch = Infinity, cover = Infinity;
      for (let f = f0; f <= fEnd; f++) {
        const d = discAt(board, w, f);
        if (!d) continue;
        if (d.full) { touch = Math.min(touch, f); cover = f; break; }
        const cam = camForBlock(board, g.block, f);
        const q = d.space === 'screen' ? corners.map((p) => toScreen(cam, p)) : corners;
        if (touch === Infinity && distToPoly(d.c, q) <= d.r) touch = f;
        if (Math.max(...q.map((p) => Math.hypot(p.x - d.c.x, p.y - d.c.y))) <= d.r) { cover = f; break; }
      }
      if (touch < Infinity && (!out || touch < out.touch)) out = {touch, cover: Math.max(touch, cover), wipe: w};
    }
  }
  m.set(i, out);
  return out;
};

const circlePath = (c: Pt, r: number) => `M${(c.x - r).toFixed(2)} ${c.y.toFixed(2)}a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(2 * r).toFixed(2)} 0a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(-2 * r).toFixed(2)} 0Z`;
/** The mask of word i at frame f while an edge crosses it: a block-local path (evenodd) that keeps what lies outside
 *  the disc, or null when no edge is on it. Hiding once covered is the cull (cullFrame). */
export const groundClearClip = (board: Board, i: number, f: number): string | null => {
  const s = groundClearSpan(board, i);
  if (!s || f < s.touch || f >= s.cover) return null;
  const d = discAt(board, s.wipe, f);
  if (!d || !Number.isFinite(d.r)) return null;
  const L = layoutBoard(board);
  const g = L.words.get(i)!;
  const b = L.blocks[g.block];
  const cam = camForBlock(board, g.block, f);
  const cw = d.space === 'screen' ? toWorld(cam, d.c) : d.c;
  const rw = d.space === 'screen' ? d.r / Math.max(1e-6, cam.zoom) : d.r;
  const c = worldToBlock(b, cw);
  const B = 1e5;
  return `M${-B} ${-B}L${B} ${-B}L${B} ${B}L${-B} ${B}Z${circlePath(c, rw)}`;
};
