// Opt-in transit rules (KIT 90; Fable brief, vertical energy pass, items 10 and 11, as amended by Fable on 18 November
// 2026): `board.transitRules: 'energy'`.
// A word is IN TRANSIT on a frame where its own pose changes from the frame before or to the frame after (a slide, a
// rise, a swing, a fall: its offset, turn, scale, clip or rotation is moving), or where it is turning in 3D (KIT 89).
// Under 'energy' the validator lets such a word, for the first ENERGY_TRANSIT_FRAMES frames of each run of motion,
// cross other words, rotate past any stance, pass outside the type box and be out of reading order; it skips the
// per-word reading checks for those frames (as it does for words during a rig transit). From frame 13 of a run the
// normal checks apply again. Each word must also be read AT REST (not in transit, not in a rig transit, shown at
// reading opacity) for ENERGY_READ_FRAMES frames of its reading interval (`energy-read`). Type is not held to the
// speed cap at all under 'energy' (any flight, whip or turn; the cap stays on figures and other tracked graphics), and
// type in a 3D turn never is (with or without the flag: the turn is new, so no existing board changes). slide-early
// stays a fault and tightens: a slideFrom word may be more than half in frame at most ENERGY_SLIDE_EARLY (6) frames
// before it is sung. Pure; memoised per board.
import type {Board} from './types';
import type {WordMod} from './verbRegistry';
import {rigTransits} from './rig';
import {wordStateAt} from './wordState';

export const ENERGY_TRANSIT_FRAMES = 12;
export const ENERGY_READ_FRAMES = 8;
export const ENERGY_SLIDE_EARLY = 6;
export const energyRules = (board: Board) => board.transitRules === 'energy';

const poseMoved = (a: WordMod, b: WordMod) =>
  Math.abs(a.dx - b.dx) + Math.abs(a.dy - b.dy) > 0.25 || Math.abs(a.rot - b.rot) > 0.1 || Math.abs(a.sx - b.sx) > 0.002
  || Math.abs(a.sy - b.sy) > 0.002 || (a.clip ?? '') !== (b.clip ?? '') || Math.abs((a.skewY ?? 0) - (b.skewY ?? 0)) > 0.1;
const shownM = (m: WordMod) => !m.hidden && m.opacity > 0.05;

const movingMemo = new WeakMap<Board, Map<string, boolean>>();
/** Is word i moving on its own at frame f (its pose differs from f - 1 or f + 1, or it is turning in 3D)? */
export const wordMoving = (board: Board, i: number, f: number): boolean => {
  let memo = movingMemo.get(board);
  if (!memo) { memo = new Map(); movingMemo.set(board, memo); }
  const k = `${i}@${f}`;
  const hit = memo.get(k);
  if (hit !== undefined) return hit;
  const m = wordStateAt(board, i, f);
  let r = false;
  if (shownM(m)) {
    if (m.turn) r = true;
    else {
      const p = wordStateAt(board, i, f - 1), n = wordStateAt(board, i, f + 1);
      r = (shownM(p) && poseMoved(m, p)) || (shownM(n) && poseMoved(m, n));
    }
  }
  memo.set(k, r);
  return r;
};
/** Under 'energy': is word i in transit at frame f within the first ENERGY_TRANSIT_FRAMES frames of its run of motion? */
export const transitExempt = (board: Board, i: number, f: number): boolean => {
  if (!energyRules(board) || !wordMoving(board, i, f)) return false;
  let run = 1;
  for (let g = f - 1; run <= ENERGY_TRANSIT_FRAMES && wordMoving(board, i, g); g--) run++;
  return run <= ENERGY_TRANSIT_FRAMES;
};
/** Is frame f inside a rig whip? */
export const inWhip = (board: Board, f: number) => rigTransits(board).some((t) => t.kind === 'whip' && f >= t.start && f <= t.end);
