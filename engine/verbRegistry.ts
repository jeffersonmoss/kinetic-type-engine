// The verb-effect registry. Each effect is a self-contained module that calls registerVerb(); the engine
// core (wordState, BoardView, validateBoard) only ever talks to effects through this interface, so a new
// effect (a morph, an emergence, a stacking repeat) is added by writing one file, never by editing the core.
import type {ReactNode} from 'react';
import type {BlockGeom, BoardLayout, CameraState, Pt, VerbCue, WordGeom} from './types';

/** Per-letter adjustment (block-local px and degrees, about the letter's centre). */
export interface LetterMod {dx: number; dy: number; rot: number; s: number; opacity: number; /** extra horizontal scale (hinge) */ sx?: number}

/** A word's render adjustment. Translations are block-local px; rot/scale are about the word's centre. */
export interface WordMod {
  dx: number; dy: number; rot: number; sx: number; sy: number; opacity: number;
  /** One entry per letter. */
  letters?: LetterMod[];
  /** SVG path in block-local coordinates; the word is clipped to it (fill-rule evenodd). */
  clip?: string;
  colour?: string;
  /** A drawn colour that is not a state change (a DOOR darkening as it turns): drawn over `colour`, ignored by the
   *  validator's one-change-per-beat rule. */
  tint?: string;
  hidden?: boolean;
  /** Graphics in block-local coordinates drawn with the word (they inherit its transform and opacity). */
  marks?: ReactNode[];
  /** As marks, but drawn under the word's glyphs (BEHIND's opaque plate). */
  underlay?: ReactNode[];
  /** Vertical skew in degrees (hinge's fake perspective). */
  skewY?: number;
  /** Ignore line-based dimming and fading (shove: the shoved word stays until the board clears). */
  keepAlive?: boolean;
  /** Extra copies of the word (converge): offsets in block-local px and opacity. */
  ghosts?: {dx: number; dy: number; opacity: number}[];
  /** Paper Trail K2 (`spread`): block-local px the word's box reaches past its landed advance on the left and right
   *  (before the word's own scale), so every word box the validator builds grows with letters that move apart. */
  extend?: {l: number; r: number};
  /** KIT 89: a 3D turn in progress (turn3d.tsx): the plane(s) the renderer projects the word through, and the affine
   *  stand-in it added to dx, dy, sx and sy (the projected box, which the validator measures). */
  turn?: import('./turn3d').TurnDraw;
}
export const IDENTITY: WordMod = {dx: 0, dy: 0, rot: 0, sx: 1, sy: 1, opacity: 1};
export const letterIdentity = (): LetterMod => ({dx: 0, dy: 0, rot: 0, s: 1, opacity: 1});

/** Composes b onto a: offsets add, scales and opacities multiply, clip/colour/hidden from b win. */
export const composeMod = (a: WordMod, b: Partial<WordMod> | null | undefined, nLetters: number): WordMod => {
  if (!b) return a;
  const out: WordMod = {
    dx: a.dx + (b.dx ?? 0), dy: a.dy + (b.dy ?? 0), rot: a.rot + (b.rot ?? 0),
    sx: a.sx * (b.sx ?? 1), sy: a.sy * (b.sy ?? 1), opacity: a.opacity * (b.opacity ?? 1),
    clip: b.clip ?? a.clip, colour: b.colour ?? a.colour, tint: b.tint ?? a.tint, hidden: a.hidden || b.hidden,
    marks: b.marks ? [...(a.marks ?? []), ...b.marks] : a.marks,
    underlay: b.underlay ? [...(a.underlay ?? []), ...b.underlay] : a.underlay,
    skewY: (a.skewY ?? 0) + (b.skewY ?? 0) || undefined,
    keepAlive: a.keepAlive || b.keepAlive,
    ghosts: b.ghosts ? [...(a.ghosts ?? []), ...b.ghosts] : a.ghosts,
  };
  if (a.extend || b.extend) out.extend = {l: (a.extend?.l ?? 0) + (b.extend?.l ?? 0), r: (a.extend?.r ?? 0) + (b.extend?.r ?? 0)};
  // KIT 89: one turn draws a word at a time (the later one wins, as for clip); its stand-in is already in dx to sy
  if (a.turn || b.turn) out.turn = b.turn ?? a.turn;
  if (a.letters || b.letters) {
    out.letters = Array.from({length: nLetters}, (_, k) => {
      const x = a.letters?.[k] ?? letterIdentity(), y = b.letters?.[k] ?? letterIdentity();
      return {dx: x.dx + y.dx, dy: x.dy + y.dy, rot: x.rot + y.rot, s: x.s * y.s, opacity: x.opacity * y.opacity, sx: (x.sx ?? 1) * (y.sx ?? 1)};
    });
  }
  return out;
};

export interface VerbCtxBase {
  cue: VerbCue;
  /** Cue start in absolute seconds (resolved default). */
  at: number;
  /** Current frame (absolute, fractional allowed) and seconds. */
  f: number; t: number;
  /** Frames since the cue start (negative before it). */
  df: number;
  L: BoardLayout;
  /** Words this cue acts on, in reading order. */
  affected: number[];
  /** Camera at any frame (for screen-space effects such as rush). */
  camAt: (f: number) => CameraState;
}
export interface VerbWordCtx extends VerbCtxBase {
  i: number;
  /** Position of this word in `affected`. */
  k: number;
  geom: WordGeom;
  block: BlockGeom;
  /** Unit vector, in this word's block frame, pointing screen-down at the cue start (gravity). */
  down: Pt;
}
export interface VerbDef {
  /** Words the cue acts on. Default: cue.words ?? [cue.word]. */
  affects?: (cue: VerbCue, L: BoardLayout) => number[];
  /** Default start (seconds) when the cue has no `at`. Default: word start + 10 frames. */
  defaultAt?: (cue: VerbCue, L: BoardLayout) => number;
  /** Frames before `at` from which modify() is already called (default 0). */
  lead?: number;
  /** The verb starts at or before its word's start by design (validator does not flag it). */
  early?: boolean;
  /** Minimum frames after the word's start before the verb may start (default 10; carry 8). */
  minDelay?: number;
  /** Pairs of words whose overlap the validator ignores while this cue is active (shove: incoming on outgoing). */
  overlapExempt?: (cue: VerbCue, L: BoardLayout) => [number, number][];
  /** The verb replaces the word's normal entrance (e.g. rush): true for every word it affects, or a function naming the
   *  words whose entrance it replaces (SHOVE push: its new words, not the old block it pushes). */
  replacesEnter?: boolean | ((cue: VerbCue, L: BoardLayout) => number[]);
  /** Words of the cue that are hidden before it starts (like replacesEnter, for some of its words only: SHOVE push hides
   *  its new words until they set off, and leaves the old block it pushes alone). */
  hiddenBefore?: (cue: VerbCue, L: BoardLayout) => number[];
  /** Frame (absolute) from which the word is gone for good, if the verb removes it; used by the validator. */
  removesAt?: (c: VerbCtxBase & {i: number}) => number | null;
  /** Per-word adjustment while active. Return null for no change. */
  modify?: (c: VerbWordCtx) => Partial<WordMod> | null;
  /** Room the camera frame must keep for the effect: the largest scale the affected words reach, about their
   *  centres (stretch: {sx: amount}). Idea from kinetic-type-engine's "motion overhead" in getSafeZoom. */
  reserve?: (cue: VerbCue, L: BoardLayout) => {sx?: number; sy?: number} | null;
  /** World-space graphics drawn over the board's words while active (bursts, arms, strokes). */
  overlay?: (c: VerbCtxBase) => ReactNode;
  // ---------------------------------------------------------------- board hooks
  /** The verb reveals or hides its words geometrically (a mask, a scale from a point, letters opening) at full
   *  opacity, so the validator's 'abrupt' rule does not apply to them. */
  gradual?: boolean;
  /** Words this cue keeps on the board, unretired, until an absolute frame (a morph source until the morph is done). */
  holds?: (cue: VerbCue, L: BoardLayout) => {word: number; until: number}[];
  /** Later sung words this cue binds to a word already on the board (relight): the validator checks `display` for
   *  readability while `sung` is sung, and `display` is not retired before `sung` is. */
  binds?: (cue: VerbCue, L: BoardLayout) => {display: number; sung: number}[];
  /** First frame a word counts as displayed (a morph's target: when its last new letter is fully open). */
  displayFrom?: (cue: VerbCue, L: BoardLayout, i: number) => number | null;
  /** Line-type marks this verb draws at the context's frame (seam hairlines, extrude strokes, hinge rules, skids), in
   *  world px with their owners (ruling 198). The validator checks them for lingering and for crossing ink; draw them
   *  from the same function (lines.ts drawLines) so the check and the render cannot drift apart. */
  lines?: (c: VerbCtxBase) => import('./lines').LineSeg[] | null;
}

const REGISTRY = new Map<string, VerbDef>();
/** Register a new verb effect at module top level in the effect's own file. */
export const registerVerb = (name: string, def: VerbDef) => {
  if (REGISTRY.has(name)) throw new Error(`Verb "${name}" is already registered; use extendVerb to override it`);
  REGISTRY.set(name, def);
};

/** Override selected hooks of an existing verb. A factory can delegate to the previous hooks. */
export const extendVerb = (name: string, patch: Partial<VerbDef> | ((base: VerbDef) => Partial<VerbDef>)) => {
  const base = REGISTRY.get(name);
  if (!base) throw new Error(`Cannot extend unregistered verb "${name}"`);
  REGISTRY.set(name, {...base, ...(typeof patch === 'function' ? patch(base) : patch)});
};
export const getVerb = (name: string) => REGISTRY.get(name);
export const verbNames = () => [...REGISTRY.keys()];
