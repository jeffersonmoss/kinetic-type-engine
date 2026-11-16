// Authoring helpers : small builders for the moves that need more than one declaration (a morph, a
// relight bind, a TIP with its rig tilt, a PORTAL with its wipe and dive, the STEP keys of a STACK). Each returns plain
// data to put on a board; nothing here keeps state.
import {FPS, PALETTE, WORDS} from './config';
import type {AnchorRef, Emergence, GroundWipe, Pt, RigKey, RigTarget, VerbCue} from './types';

const sungAt = (i: number) => WORDS[i]?.start_s ?? 0;

/** MORPH: the emergence to put on the target block. `from` is the source word (or words), `keep` the letters shared
 *  (a string in order, e.g. 'UG', or [sourceLetter, targetLetter] pairs). `arc` sends the kept letters round a point. */
export const morph = (o: {from: number | number[]; keep: string | [number, number][]; at?: number; arc?: {about: Pt; dir?: 1 | -1}; collapse?: number; delay?: number}): Emergence => {
  const src = Array.isArray(o.from) ? o.from : [o.from];
  return {move: 'morph', from: {word: src[0]}, at: o.at, params: {fromWords: src, keep: o.keep, arc: o.arc, collapse: o.collapse, delay: o.delay}};
};

/** The rig move that marks a morph as the event of its line (Fable items 7 and 35): a DIVE, by default 1.25 (the
 *  proof's 1.1 was too small to notice), timed to land as the new letters open. Put it into board.rig. */
export const MORPH_MARKER_DIVE = 1.25;
export const morphMarker = (o: {t: number; by?: number; frames?: number; about?: AnchorRef; to?: RigTarget}): RigKey => ({
  t: o.t, kind: 'dive', by: o.by ?? MORPH_MARKER_DIVE, frames: o.frames ?? 8, about: o.about, to: o.to, ease: 'cubic', label: `MORPH marker DIVE ${o.by ?? MORPH_MARKER_DIVE}`,
});

/** RELIGHT: binds the later sung word `sungWordIx` to the word already on the board `displayWordIx`. Put the cue on the
 *  block that holds the displayed word (block.verb). It lights and swells so that it is done when the word is sung. */
export const relight = (displayWordIx: number, sungWordIx: number, o: {colour?: string; frames?: number; swell?: number} = {}): VerbCue => {
  const frames = Math.max(8, o.frames ?? 8);
  return {name: 'relight', word: displayWordIx, params: {sung: sungWordIx, colour: o.colour, frames, swell: o.swell ?? 1.15}, allowEarly: true};
};

/** TIP: the rig tilts `by` degrees (default 15) in 8 frames at `t`, and every retired word slides off the slope. Put
 *  `cue` on any block of the board (block.verb) and `rig` into board.rig. */
export const tip = (o: {t: number; word: number; by?: number; pinned?: number[]; frames?: number; tiltFrames?: number}): {cue: VerbCue; rig: RigKey} => {
  const tiltFrames = Math.max(8, o.tiltFrames ?? 8);
  return {
    cue: {name: 'tip', word: o.word, at: o.t, params: {pinned: o.pinned ?? [], frames: o.frames ?? 20, tiltFrames}, allowEarly: true},
    rig: {t: o.t, kind: 'tilt', by: o.by ?? 15, frames: tiltFrames, label: 'TIP'},
  };
};

/** PORTAL: the counter of an O fills with `colour` by a board-space disc wipe from its centre (`wipeFrames`, at least
 *  8), and the rig dives through it (`diveFrames`, 10 to 14) until the colour is the whole ground. Put `ground` into
 *  board.ground and `rig` into board.rig; give the waiting block emerge {move: 'portal', from: counter, params: {wipe}}.
 *  `outline` is the counter's measured outline (resolveAnchor(layout, counter).outline): the disc is clipped to it, so
 *  `r1` should reach the counter's farthest point (half the diagonal of its box). The host letter stays bright until the
 *  dive has filled the frame (ruling 194.1). */
export const portal = (o: {counter: AnchorRef; centre: Pt; r1: number; colour?: string; t0: number; wipeFrames?: number; diveFrames?: number; clears?: boolean; outline?: Pt[]}): {ground: GroundWipe; rig: RigKey; wipe: GroundWipe; emerge: (extra?: Record<string, unknown>) => Emergence} => {
  const wf = Math.max(8, o.wipeFrames ?? 8);
  const df = Math.min(14, Math.max(10, o.diveFrames ?? 12));
  const diveT = o.t0 + wf / FPS;
  const fullAt = diveT + df / FPS;
  const wipe: GroundWipe = {colour: o.colour ?? PALETTE.ground, shape: 'disc', t0: o.t0, frames: wf, space: 'board', from: o.centre, r0: 0, r1: o.r1, fullAt, clears: o.clears ?? true, clip: o.outline};
  const to: RigTarget = {frame: {anchor: o.counter}, cover: true};
  const rig: RigKey = {t: diveT, kind: 'dive', frames: df, to, about: o.counter, ease: 'cubic', label: 'PORTAL dive'};
  return {ground: wipe, wipe, rig, emerge: (extra = {}) => ({move: 'portal', from: o.counter, params: {wipe, ...extra}})};
};

/** STACK: one rig STEP per word after the first, each framing the new row (at `screen`, default the frame centre) and
 *  ending on that word's sung frame. Zoom and R are kept. */
export const stackSteps = (words: number[], o: {frames?: number; screen?: Pt} = {}): RigKey[] => {
  const frames = Math.max(6, o.frames ?? 8);
  return words.slice(1).map((w, k) => ({t: sungAt(w) - frames / FPS, kind: 'step' as const, frames, to: {frame: {word: w}, screen: o.screen}, label: `STACK row ${k + 2}`}));
};

/** A DIVE that ends with the framed word at `cap` screen px (or covering the frame through an anchor's counter). */
export const rigDiveInto = (o: {t: number; frame: RigTarget['frame']; cap?: number; cover?: boolean; frames?: number; about?: AnchorRef; screen?: Pt}): RigKey => ({
  t: o.t, kind: 'dive', frames: o.frames ?? 12, to: {frame: o.frame, cap: o.cap, cover: o.cover, screen: o.screen}, about: o.about, ease: 'cubic', label: 'dive',
});

/** FAN (DOGE item 56): the rig turn through a FAN seam. The camera tilts by -fan about the Joint (default the last
 *  letter's right flank of the old line's last word), so the old last word reads at -fan/2 and the new first word at
 *  +fan/2 mid-turn, and the new line ends level where the old one was. Start it about half its frames before the new
 *  line's first sung frame. `to` may also frame the new line (the Joint then travels straight on screen). Put it into board.rig; the new block is attach 'FAN' with the same `fan`. */
export const fanTurn = (o: {t: number; fan: number; joint: number | AnchorRef; frames?: number; to?: RigTarget; label?: string}): RigKey => ({
  t: o.t, kind: 'tilt', by: -o.fan, frames: o.frames ?? 10, to: o.to,
  about: typeof o.joint === 'number' ? {word: o.joint, letter: 'last', part: 'flankR'} : o.joint,
  label: o.label ?? `FAN ${o.fan > 0 ? '+' : ''}${o.fan}`,
});

/** DRAWER (DOGE item 59, K7): the emergence of a block that slides out from behind an edge of a word (`host`, a word
 *  index) or of a prop (`rect`, a world box with an optional angle about its centre), clipped at that edge. Each word's
 *  slide ends on its own sung frame. */
export const drawer = (o: {host?: number; rect?: {x: number; y: number; w: number; h: number; angle?: number}; edge: 'top' | 'bottom' | 'left' | 'right'; depth?: number; lead?: number}): Emergence => {
  if (o.host === undefined && !o.rect) throw new Error('drawer: give host (a word) or rect (a prop box)');
  const from: AnchorRef = o.host !== undefined ? {word: o.host} : {point: {x: o.rect!.x + o.rect!.w / 2, y: o.rect!.y + o.rect!.h / 2}};
  return {move: 'drawer', from, params: {edge: o.edge, rect: o.rect, depth: o.depth, lead: o.lead}};
};
