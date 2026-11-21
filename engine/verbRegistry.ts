// The verb-effect registry. Each effect is a self-contained module that calls registerVerb(); the engine
// core (wordState, BoardView, validateBoard) only ever talks to effects through this interface, so a new
// effect (a morph, an emergence, a stacking repeat) is added by writing one file, never by editing the core.
import type {ReactNode} from 'react';
export type {VerbDef} from './types';
import type {BlockGeom, BoardLayout, CameraState, EffectTable, Pt, SlideSource, TurnSpec, VerbCue, VerbDef, WordGeom} from './types';

/** Per-letter adjustment (block-local px and degrees, about the letter's centre). */
export interface LetterMod {dx: number; dy: number; rot: number; s: number; opacity: number; /** extra horizontal scale (hinge) */ sx?: number; /** extra vertical scale */ sy?: number}

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
      return {dx: x.dx + y.dx, dy: x.dy + y.dy, rot: x.rot + y.rot, s: x.s * y.s, opacity: x.opacity * y.opacity, sx: (x.sx ?? 1) * (y.sx ?? 1),
        ...((x.sy !== undefined || y.sy !== undefined) ? {sy: (x.sy ?? 1) * (y.sy ?? 1)} : {})};
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
  /** Project this word using the same geometry as the legacy turn renderer. */
  projectTurn?: (spec: TurnSpec, progress: number) => Partial<WordMod> | null;
  /** Resolved source in this word's block coordinates, when the cue names an anchor. */
  source?: (anchor: SlideSource, frame: number) => Pt;
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

/** The board owns its lowered effects. Legacy boards fall back to the registered verbs. */
export const resolveVerb = (name: string, table?: EffectTable): VerbDef | undefined =>
  table && Object.hasOwn(table, name) ? table[name] : getVerb(name);
