// Which words of a board stand in a handoff picture (rule 81), and the handoff clear (kit pass for chunk blockers,
// 16 November 2026, KIT.md section 21):
//   handoffWordSet(board, L, side)  words whose text matches a word of the start or end handoff (the first video's rebus is not in the engine)
//   handoffPairsNested(board, L)    pairs of such words whose handoff boxes overlap by design (LOVE inside MOST's O)
//   handoffClearFrame(board, i)     frame from which a word NOT in the end handoff fades out, so that the board's last
//                                   frame shows only the handoff picture ("nothing else is literal", rule 81.7)
//   handoffGraceEnd(board, i)       rule 81.7: a word sung on the start boundary or within 9 frames after it is read from
//                                   10 frames after the boundary, as a word sung during a rig move is read when it ends
import {FPS, HANDOFFS} from './config';
import {layoutBoard} from './layout';
import type {Board, BoardLayout, HandoffElement, HandoffId} from './types';

/** Frames the handoff clear takes (MIN_TRANSITION_FRAMES): non-handoff words are gone on the board's last frame. */
export const HANDOFF_CLEAR_FRAMES = 6;
/** Rule 81.7: words sung from the boundary to this many frames after it are read from GRACE frames after it. */
export const HANDOFF_SUNG_WINDOW = 9;
export const HANDOFF_GRACE = 10;

export const handoffById = (id: HandoffId | undefined) =>
  id !== undefined && id !== 'open' && Object.hasOwn(HANDOFFS, id) ? HANDOFFS[id] : undefined;
const norm = (s: string) => s.toUpperCase().replace(/[^\p{L}\p{N}]/gu, '');
const memo = new WeakMap<Board, Map<string, Set<number>>>();

/** Words of the board that match a word (or the rebus) of its start or end handoff picture. Empty for 'open' or no
 *  handoff. */
export const handoffWordSet = (board: Board, L: BoardLayout, side: 'start' | 'end'): Set<number> => {
  let m = memo.get(board);
  if (!m) { m = new Map(); memo.set(board, m); }
  const hit = m.get(side);
  if (hit) return hit;
  const h = handoffById(board.handoff?.[side]);
  const out = new Set<number>();
  if (h) {
    const texts = new Set(h.elements.flatMap((e) => (e.kind === 'word' ? [norm(e.text)] : [])));
    for (const i of L.order) { const w = L.words.get(i)!; if (texts.has(norm(w.text))) out.add(i); }
  }
  m.set(side, out);
  return out;
};

const elBox = (e: HandoffElement) => (e.kind === 'word' ? {x: e.x, y: e.baseline - e.cap, w: e.w, h: e.cap, key: norm(e.text)} : null);
/** Pairs of handoff-matched words whose boxes overlap in the handoff picture itself (a nest: LOVE in MOST's O at H4).
 *  The validator exempts them from `overlap`: the picture is fixed by rule 81 and drawn the same on both boards. */
export const handoffPairsNested = (board: Board, L: BoardLayout): [number, number][] => {
  const out: [number, number][] = [];
  for (const side of ['start', 'end'] as const) {
    const h = handoffById(board.handoff?.[side]);
    if (!h) continue;
    const boxes = h.elements.map(elBox).filter((b): b is NonNullable<ReturnType<typeof elBox>> => !!b);
    const ws = [...handoffWordSet(board, L, side)];
    const keyOf = (i: number) => norm(L.words.get(i)!.text);
    for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
      const A = boxes[a], B = boxes[b];
      if (A.x >= B.x + B.w || B.x >= A.x + A.w || A.y >= B.y + B.h || B.y >= A.y + A.h) continue;
      for (const i of ws) for (const j of ws) if (i !== j && keyOf(i) === A.key && keyOf(j) === B.key) out.push([i, j]);
    }
  }
  return out;
};

/** Frame from which word i fades out for the end handoff (Infinity: it stays, or the board has no end handoff). The
 *  fade ends on the board's last frame (the handoff time minus one frame), where the word is at opacity 0. */
export const handoffClearFrame = (board: Board, i: number): number => {
  const h = handoffById(board.handoff?.end);
  if (!h) return Infinity;
  const L = layoutBoard(board);
  if (!L.words.has(i) || handoffWordSet(board, L, 'end').has(i)) return Infinity;
  return Math.round(h.t * FPS) - 1 - HANDOFF_CLEAR_FRAMES;
};

/** Rule 81.7: the first frame from which word i is checked for readability, when it is sung on the start boundary or
 *  within HANDOFF_SUNG_WINDOW frames after it (-Infinity otherwise). The rule asks it to be readable when its emergence
 *  ends, no later than HANDOFF_GRACE frames after the boundary; the validator checks it from that latest frame. */
export const handoffGraceEnd = (board: Board, i: number): number => {
  const h = handoffById(board.handoff?.start);
  if (!h) return -Infinity;
  const L = layoutBoard(board);
  const w = L.words.get(i);
  const b = Math.round(h.t * FPS);
  if (!w || w.sf < b || w.sf > b + HANDOFF_SUNG_WINDOW) return -Infinity;
  return b + HANDOFF_GRACE;
};
