// TURN (KIT 89; Fable brief, vertical energy pass, item 5): the 3D turn, with real perspective (geometry and drawing in
// ../turn3d.tsx). One verb, 'turn', derived by wordState from:
//   block.emerge = {move: 'turn', from, turn}            mode 'in': the block turns in from edge-on to face the viewer;
//   block.turnSwap = {from: {word} | {block}, spec}       mode 'swap': `from` turns away to edge-on while this block turns
//                                                         in from edge-on on the same pivot (a revolving sign);
//   block.exit = {style: 'turn', at, turn, words?}        mode 'out': the words turn away to edge-on and are gone;
// and board.exit = 'turn' with board.turn uses the same geometry (boardTurnExitMod), from board.end.
// Direction: with dir 1 the element's right side (axis y) or bottom side (axis x) is the FAR side while it turns, in
// or out; dir -1 makes it the near side. So with pivot 'left' and dir 1 the free right edge swings in from behind (it
// starts small and grows), and with pivot 'right' and dir 1 the free left edge swings in from in front (it starts large).
// Angles (theta, degrees; positive puts the right or bottom side away): in dir*deg -> 0; out 0 -> dir*deg; swap one
// continuous 0 -> 180 in the sense of dir, the outgoing face shown while it is under 90 and the incoming face (its
// angle 180 less, so it comes round from the near side like the back of a revolving sign) after: the two are never
// both flat, and both are edge-on together at the midpoint.
// What turns as one plane: `unit` 'block' (default: the words of the turn that share a block), 'row', or 'word'. With
// `stagger` every letter turns as its own plane about its own pivot, `stagger` frames after the letter before it
// (counted through the turn's words in reading order): a split-flap.
// Timing: an 'in' or 'swap' with no `at` ends on the block's first sung frame (or at its showFrom); an 'out' starts at
// `at`. The turn is gradual (it opens by geometry at full opacity) and replaces the entrance of the words it brings in.
// The validator treats any frame of a turn as transit (no reading checks, crossing allowed, no speed cap), and a word
// that turns out stops being read when its turn starts (removesAt). Each turn writes its projected box into the
// word's dx, dy, sx, sy (the stand-in the validator measures) and its planes into WordMod.turn (what the renderer draws).
import {FPS} from '../config';
import type {Board, BoardLayout, TurnSpec, VerbCue, WordGeom} from '../types';
import {clamp} from '../util';
import {registerVerb, type WordMod} from '../verbRegistry';
import {planeFor, projectedBox, resolveTurn, standFor, edgeOn, type Rect, type ResolvedTurn, type TurnDraw, type TurnPlane} from '../turn3d';
import {layoutBoard} from '../layout';
import {zoomOf} from './common';

type Mode = 'in' | 'out' | 'swap';
type Role = 'in' | 'out' | 'swapIn' | 'swapOut';
const modeOf = (cue: VerbCue): Mode => (cue.params?.mode as Mode | undefined) ?? 'in';
/** The outgoing words of a swap (mode 'swap'): the word, or every word of the block, named by swapFrom. */
export const turnSwapOutgoing = (cue: VerbCue, L: BoardLayout): number[] => {
  const r = cue.params?.swapFrom as {word: number} | {block: number} | undefined;
  if (!r) return [];
  if ('word' in r) return L.words.has(r.word) ? [r.word] : [];
  return L.blocks[r.block]?.words.map((w) => w.i) ?? [];
};
const incoming = (cue: VerbCue, L: BoardLayout) => (cue.words ?? [cue.word]).filter((i) => L.words.has(i)).sort((a, b) => a - b);
export const turnSpecOf = (cue: VerbCue): TurnSpec => (cue.params?.spec as TurnSpec | undefined) ?? {};

const letterCount = (L: BoardLayout, ws: number[]) => ws.reduce((n, i) => n + (L.words.get(i)?.adv.length ?? 0), 0);
/** Frames from a turn's start until its last letter has turned (frames, plus the stagger across its letters). */
const spanFrames = (t: ResolvedTurn, nLetters: number) => t.frames + (t.stagger > 0 ? t.stagger * Math.max(0, nLetters - 1) : 0);
const firstShown = (cue: VerbCue, L: BoardLayout) => {
  const ws = incoming(cue, L);
  const sf = Math.min(...ws.map((i) => L.words.get(i)!.sf));
  const show = cue.params?.showFrom as number | undefined;
  return show !== undefined ? show * FPS : sf;
};
/** Start frame and total frames of a turn cue. */
export const turnTiming = (cue: VerbCue, L: BoardLayout): {start: number; total: number} => {
  const t = resolveTurn(turnSpecOf(cue));
  const m = modeOf(cue);
  const n = Math.max(letterCount(L, incoming(cue, L)), m === 'swap' ? letterCount(L, turnSwapOutgoing(cue, L)) : 0);
  const total = spanFrames(t, n);
  if (cue.at !== undefined) return {start: cue.at * FPS, total};
  if (m === 'out') return {start: (L.words.get(cue.word)?.sf ?? 0) + 10, total};
  return {start: firstShown(cue, L) - total, total};
};

/** Block-local box of word g (its advance, and its box height). */
const wordRect = (g: WordGeom): Rect => ({x0: g.x, y0: g.y, x1: g.x + g.w, y1: g.y + g.boxH});
const union = (rs: Rect[]): Rect => ({x0: Math.min(...rs.map((r) => r.x0)), y0: Math.min(...rs.map((r) => r.y0)), x1: Math.max(...rs.map((r) => r.x1)), y1: Math.max(...rs.map((r) => r.y1))});
/** The plane rect word i turns on: the union of the group's words that share its block (and its row, for unit 'row'). */
const unitRect = (L: BoardLayout, group: number[], i: number, t: ResolvedTurn): Rect => {
  const g = L.words.get(i)!;
  if (t.unit === 'word') return wordRect(g);
  const mates = group.map((j) => L.words.get(j)).filter((x): x is WordGeom => !!x && x.block === g.block && (t.unit !== 'row' || x.row === g.row));
  return union(mates.map(wordRect));
};
/** Index of word i's first letter among the group's letters (reading order). */
const letterOffset = (L: BoardLayout, group: number[], i: number) => {
  let n = 0;
  for (const j of group) { if (j === i) return n; n += L.words.get(j)?.adv.length ?? 0; }
  return 0;
};

/** theta (degrees) of a role at eased progress, or 'before' (not turned in yet / not started) or 'after' (gone or at rest). */
const angleOf = (role: Role, t: ResolvedTurn, df: number): number | 'before' | 'after' => {
  const p = df / t.frames;
  if (role === 'in') { if (p < 0) return 'before'; if (p >= 1) return 'after'; return t.dir * t.deg * (1 - t.ease(p)); }
  if (role === 'out') { if (p < 0) return 'before'; if (p >= 1) return 'after'; return t.dir * t.deg * t.ease(p); }
  const c = 180 * t.ease(clamp(p));
  if (role === 'swapOut') { if (p < 0) return 'before'; if (p >= 1 || c >= 90) return 'after'; return t.dir * c; }
  if (p < 0 || c <= 90) return 'before';
  if (p >= 1) return 'after';
  return t.dir * (c - 180);
};
const entering = (role: Role) => role === 'in' || role === 'swapIn';

/** The mod of word i under a turn: its planes and its affine stand-in, or null when it is at rest. */
export const turnWordMod = (L: BoardLayout, i: number, f: number, role: Role, start: number, t: ResolvedTurn, group: number[]): Partial<WordMod> | null => {
  const g = L.words.get(i);
  if (!g) return null;
  const persp = t.perspective / Math.max(0.01, zoomOf(L, i, start));
  const box = wordRect(g);
  const cx = g.x + g.w / 2, cy = g.y + g.h / 2;
  const hiddenMod = {hidden: true, opacity: 0};
  if (t.stagger <= 0) {
    const a = angleOf(role, t, f - start);
    if (a === 'before') return entering(role) ? hiddenMod : null;
    if (a === 'after') return entering(role) ? null : hiddenMod;
    const plane = planeFor(unitRect(L, group, i, t), t, a, persp);
    const pb = projectedBox(plane, box);
    const stand = standFor(cx, cy, box, edgeOn(plane) ? {x0: (pb.x0 + pb.x1) / 2, x1: (pb.x0 + pb.x1) / 2, y0: pb.y0, y1: pb.y1} : pb);
    const draw: TurnDraw = {plane: edgeOn(plane) ? 'hidden' : plane, stand};
    return {...stand, turn: draw};
  }
  // split-flap: every letter its own plane
  const off = letterOffset(L, group, i);
  let x = g.x;
  const letters: (TurnPlane | 'hidden' | null)[] = [];
  const boxes: Rect[] = [];
  let anyMoving = false, allBefore = true, allAfter = true;
  g.adv.forEach((adv, k) => {
    const r: Rect = {x0: x, y0: g.y, x1: x + adv, y1: g.y + g.boxH};
    x += adv;
    const a = angleOf(role, t, f - start - (off + k) * t.stagger);
    if (a !== 'before') allBefore = false;
    if (a !== 'after') allAfter = false;
    if (a === 'before' || a === 'after') {
      const shown = entering(role) ? a === 'after' : a === 'before';
      letters.push(shown ? null : 'hidden');
      if (shown) boxes.push(r);
      return;
    }
    anyMoving = true;
    const plane = planeFor(r, t, a, persp);
    letters.push(edgeOn(plane) ? 'hidden' : plane);
    if (!edgeOn(plane)) boxes.push(projectedBox(plane, r));
  });
  if (allBefore) return entering(role) ? hiddenMod : null;
  if (allAfter) return entering(role) ? null : hiddenMod;
  if (!anyMoving && letters.every((l) => l === null)) return null;
  const pb = boxes.length ? union(boxes) : {x0: cx, x1: cx, y0: g.y, y1: g.y + g.boxH};
  const stand = standFor(cx, cy, box, pb);
  return {...stand, turn: {letters, stand}};
};

// ---------------------------------------------------------------- board exit 'turn' (board.turn, from board.end)
const blockGroup = (L: BoardLayout, i: number) => L.blocks[L.words.get(i)!.block].words.map((w) => w.i);
/** Frames of a board's exit 'turn': its frames plus the stagger across the longest block's letters. */
export const boardTurnExitFrames = (board: Board) => {
  const t = resolveTurn(board.turn);
  if (t.stagger <= 0) return t.frames;
  const n = Math.max(1, ...layoutBoard(board).blocks.map((b) => b.words.reduce((s, w) => s + w.adv.length, 0)));
  return spanFrames(t, n);
};
/** Word i's adjustment during its board's exit 'turn'. */
export const boardTurnExitMod = (board: Board, L: BoardLayout, w: WordGeom, f: number): Partial<WordMod> | null => {
  const start = board.end * FPS;
  if (f < start) return null;
  return turnWordMod(L, w.i, f, 'out', start, resolveTurn(board.turn), blockGroup(L, w.i));
};

registerVerb('turn', {
  early: true,
  gradual: true,
  replacesEnter: (cue, L) => (modeOf(cue) === 'out' ? [] : incoming(cue, L)),
  affects: (cue, L) => (modeOf(cue) === 'swap' ? [...incoming(cue, L), ...turnSwapOutgoing(cue, L)] : incoming(cue, L)),
  defaultAt: (cue, L) => turnTiming(cue, L).start / FPS,
  removesAt: (c) => {
    const m = modeOf(c.cue);
    if (m === 'out') return turnTiming(c.cue, c.L).start;
    if (m === 'swap' && turnSwapOutgoing(c.cue, c.L).includes(c.i) && !incoming(c.cue, c.L).includes(c.i)) return turnTiming(c.cue, c.L).start;
    return null;
  },
  overlapExempt: (cue, L) => (modeOf(cue) === 'swap' ? incoming(cue, L).flatMap((a) => turnSwapOutgoing(cue, L).map((b) => [a, b] as [number, number])) : []),
  modify: (c) => {
    const m = modeOf(c.cue);
    const t = resolveTurn(turnSpecOf(c.cue));
    const {start} = turnTiming(c.cue, c.L);
    const inc = incoming(c.cue, c.L);
    if (m === 'swap') {
      const out = turnSwapOutgoing(c.cue, c.L);
      if (inc.includes(c.i)) return turnWordMod(c.L, c.i, c.f, 'swapIn', start, t, inc);
      return turnWordMod(c.L, c.i, c.f, 'swapOut', start, t, out);
    }
    return turnWordMod(c.L, c.i, c.f, m === 'out' ? 'out' : 'in', start, t, inc);
  },
});
