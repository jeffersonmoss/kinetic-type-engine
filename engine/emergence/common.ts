// Shared helpers for the emergence verbs (rules 54 to 68). Every emergence verb is a
// registered verb named after its move; a block's `emerge` declaration becomes a cue on that verb (wordState.emergeCue)
// with params {from, block, showFrom, emerged, ...the declaration's params}. All motion is a pure function of the frame
// and each verb lengthens itself so that no point of a word moves faster than the 32 px per frame cap relative to the
// board (the rig is exempt, rule 42).
import {FPS} from '../config';
import {camForBlock} from '../camera';
import {blockToWorld, worldToBlock} from '../layout';
import {resolveAnchor, type ResolvedAnchor} from '../letters';
import {SPEED_CAP} from '../motion';
import type {AnchorRef, BlockGeom, BoardLayout, Pt, VerbCue, WordGeom} from '../types';
import {clamp, easeInOutSine} from '../util';
import type {VerbCtxBase, VerbWordCtx} from '../verbRegistry';

/** A param's value type widened from its default's literal type ('swing' -> string, true -> boolean). */
type Wide<T> = T extends string ? string : T extends boolean ? boolean : T extends number ? number : T;
export const P = <T,>(c: {cue: VerbCue}, key: string, dflt: T): Wide<T> => ((c.cue.params?.[key] as Wide<T> | undefined) ?? (dflt as Wide<T>));
export const PC = <T,>(cue: VerbCue, key: string, dflt: T): Wide<T> => ((cue.params?.[key] as Wide<T> | undefined) ?? (dflt as Wide<T>));
/** Peak speed over average speed of easeInOutSine. */
export const SINE_PEAK = Math.PI / 2;
/** Frames a move of `distLocal` world px needs at `zoom` so its peak speed stays within the cap (at least `min`). */
export const capFrames = (distLocal: number, zoom: number, min: number, peak = SINE_PEAK) =>
  Math.max(min, Math.ceil((Math.abs(distLocal) * Math.max(0.01, zoom) * peak) / SPEED_CAP - 1e-9));
/** Zoom at which a word is drawn at a frame (1 for screen-pinned blocks). */
export const zoomOf = (L: BoardLayout, i: number, f: number) => camForBlock(L.board, L.words.get(i)?.block ?? 0, f).zoom;

export const blockOf = (L: BoardLayout, i: number): BlockGeom => L.blocks[L.words.get(i)!.block];
export const wordsOfCue = (cue: VerbCue, L: BoardLayout) => (cue.words ?? [cue.word]).filter((i) => L.words.has(i));
export const firstSf = (cue: VerbCue, L: BoardLayout) => Math.min(...wordsOfCue(cue, L).map((i) => L.words.get(i)!.sf));
export const anchorOf = (cue: VerbCue, L: BoardLayout, t = 0): ResolvedAnchor | null => {
  const a = cue.params?.from as AnchorRef | undefined;
  if (!a) return null;
  try { return resolveAnchor(L, a, t); } catch { return null; }
};
/** Words named by a param (a word index, an array, or the anchor's word by default). */
export const wordsParam = (cue: VerbCue, L: BoardLayout, key: string): number[] => {
  const v = cue.params?.[key] as number | number[] | undefined;
  if (Array.isArray(v)) return v.filter((i) => L.words.has(i));
  if (typeof v === 'number') return L.words.has(v) ? [v] : [];
  const a = cue.params?.from as AnchorRef | undefined;
  if (a && 'word' in a && L.words.has(a.word)) return [a.word];
  return [];
};
/** All words of the block the anchor's word belongs to. */
export const anchorBlockWords = (cue: VerbCue, L: BoardLayout): number[] => {
  const a = cue.params?.from as AnchorRef | undefined;
  if (a && 'word' in a && L.words.has(a.word)) return blockOf(L, a.word).words.map((w) => w.i);
  if (a && 'block' in a && L.blocks[a.block]) return L.blocks[a.block].words.map((w) => w.i);
  return [];
};
export const centreOf = (g: WordGeom): Pt => ({x: g.x + g.w / 2, y: g.y + g.h / 2});
export const toLocal = (b: BlockGeom, p: Pt) => worldToBlock(b, p);
export const toWorld = (b: BlockGeom, p: Pt) => blockToWorld(b, p);
/** Rectangle path (block-local) for a clip region. */
export const rectPath = (x0: number, y0: number, x1: number, y1: number) => `M${x0} ${y0}L${x1} ${y0}L${x1} ${y1}L${x0} ${y1}Z`;
export const circlePath = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
export const BIG = 1e5;
/** Scale about a point: the dx, dy that keep point `p` fixed while a word centred at `c` scales by s. */
export const scaleAbout = (c: Pt, p: Pt, sx: number, sy = sx): {dx: number; dy: number} => ({dx: (p.x - c.x) * (1 - sx), dy: (p.y - c.y) * (1 - sy)});
export const eased = (p: number) => easeInOutSine(clamp(p));
/** Cue start frame of a verb context. */
export const startF = (c: VerbCtxBase) => c.at * FPS;
export type {VerbWordCtx};
