// K7 (Sweet Distillation hub): how still the kept letters of a MORPH stay. A suffix morph between right-aligned blocks
// that share an anchor (DISTILLATION! to NATION to VACATION, the "ation" pinned) should leave the kept glyphs exactly
// where they were: the source's kept letters travel zero distance and the target's take over in the same place. This
// module measures it from the engine's own geometry: for each kept pair, the drawn cap box of the glyph (the source
// letter until the morph ends, the target letter from then), with every word and letter adjustment applied (verbs such
// as `wah`, the morph itself), through the board camera, against the source letter's landed box through the same
// camera. So the number is screen px relative to the board (a camera move is not drift), and it is the engine's model,
// not the browser's rendering (a word drawn whole uses the browser's own glyph advances scaled to the word's width).
// Validator `morph-pin` (opt-in with morph({pin})) and tools/morph-drift.mjs both use morphKeptDrift().
import {camForBlock, toScreen} from './camera';
import {blockToWorld, layoutBoard} from './layout';
import {letterBoxes} from './letters';
import {morphPairs, morphPlan} from './emergence/morph';
import type {Board, Pt, VerbCue} from './types';
import {rot} from './util';
import {type WordMod} from './verbRegistry';
import {boardCues, wordStateAt} from './wordState';

/** Screen quad (TL, TR, BR, BL) of letter k of word i as drawn at frame f (null when the letter is not drawn), and
 *  with `landed` the letter's box with no adjustment, through the same camera. */
export const letterScreenQuad = (board: Board, i: number, k: number, f: number, landed = false): Pt[] | null => {
  const L = layoutBoard(board);
  const g = L.words.get(i);
  if (!g) return null;
  const lb = letterBoxes(g)[k];
  if (!lb) return null;
  const b = L.blocks[g.block];
  const cam = camForBlock(board, g.block, f);
  const corners: Pt[] = [{x: lb.x, y: lb.y}, {x: lb.x + lb.w, y: lb.y}, {x: lb.x + lb.w, y: lb.y + lb.h}, {x: lb.x, y: lb.y + lb.h}];
  if (landed) return corners.map((p) => toScreen(cam, blockToWorld(b, p)));
  const m: WordMod = wordStateAt(board, i, f);
  const lm = m.letters?.[k];
  if (m.hidden || m.opacity <= 0.05 || (lm && lm.opacity <= 0.05)) return null;
  const cx = g.x + g.w / 2, cy = g.y + g.h / 2;
  const lx = lb.x + lb.w / 2, ly = cy;
  return corners.map((p0) => {
    let p = p0;
    if (lm) { const q = rot({x: (p.x - lx) * lm.s * (lm.sx ?? 1), y: (p.y - ly) * lm.s}, lm.rot); p = {x: q.x + lx + lm.dx, y: q.y + ly + lm.dy}; }
    const q = rot({x: (p.x - cx) * m.sx, y: (p.y - cy) * m.sy}, m.rot);
    return toScreen(cam, blockToWorld(b, {x: q.x + cx + m.dx, y: q.y + cy + m.dy}));
  });
};

export interface MorphDrift {
  /** Largest corner distance (screen px) of any kept glyph from its landed place, and where. */
  max: number; frame: number; letter: string;
  /** Frames measured: from the source's sung frame to `after` frames past the morph's end. */
  from: number; to: number;
  pairs: number;
}
/** Drift of the kept letters of a morph cue: each kept glyph (the source letter until the morph ends, then the target
 *  letter) against the source letter's landed box, from the source word's sung frame to `after` (20) frames after the
 *  morph ends. Only meaningful for a morph whose kept letters should not travel (a pinned suffix). */
export const morphKeptDrift = (board: Board, cue: VerbCue, after = 20): MorphDrift => {
  const L = layoutBoard(board);
  const pl = morphPlan(cue, L);
  const pairs = morphPairs(cue, L);
  const srcSf = Math.min(...pl.S.map((s) => L.words.get(s.word)!.sf));
  const from = Math.ceil(Math.min(srcSf, pl.start)), to = Math.ceil(pl.end + after);
  let max = 0, frame = from, letter = '';
  for (let f = from; f <= to; f++) for (const [a, bIx] of pairs) {
    const s = pl.S[a], t = pl.T[bIx];
    const ref = letterScreenQuad(board, s.word, s.k, f, true);
    const q = f < pl.end ? letterScreenQuad(board, s.word, s.k, f) : letterScreenQuad(board, t.word, t.k, f);
    if (!ref || !q) continue;
    const d = Math.max(...q.map((p, n) => Math.hypot(p.x - ref[n].x, p.y - ref[n].y)));
    if (d > max) { max = d; frame = f; letter = s.ch; }
  }
  return {max, frame, letter, from, to, pairs: pairs.length};
};
/** Every morph cue of a board with its kept-letter drift. */
export const boardMorphDrifts = (board: Board, after = 20): {cue: VerbCue; drift: MorphDrift}[] =>
  boardCues(board).filter((c) => c.name === 'morph').map((cue) => ({cue, drift: morphKeptDrift(board, cue, after)}));
