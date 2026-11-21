// Authoring helpers : small builders for the moves that need more than one declaration (a morph, a
// relight bind, a TIP with its rig tilt, a PORTAL with its wipe and dive, the STEP keys of a STACK). Each returns plain
// data to put on a board; nothing here keeps state.
import {FPS, PALETTE, RIG_CENTRE, SAFE_BOX, WORDS} from './config';
import {WIDE_LIMITS} from './format';
import type {AnchorRef, Board, Emergence, FrameEdge, GroundWipe, Pt, RigKey, RigTarget, SlideSource, VerbCue} from './types';
import {blockToWorld, layoutBoard} from './layout';

const sungAt = (i: number) => WORDS[i]?.start_s ?? 0;

/** MORPH: the emergence to put on the target block. `from` is the source word (or words), `keep` the letters shared
 *  (a string in order, e.g. 'UG', or [sourceLetter, targetLetter] pairs). `arc` sends the kept letters round a point. */
export const morph = (o: {from: number | number[]; keep: string | [number, number][]; at?: number; arc?: {about: Pt; dir?: 1 | -1}; collapse?: number; delay?: number; roll?: boolean; frames?: number;
  /** K7: 'end' matches a kept string from the ends of the words (a shared suffix); default 'start' (as before). */
  match?: 'start' | 'end';
  /** K7: the kept letters must hold still to within this many px (true: 1); validator `morph-pin` measures their drift. */
  pin?: boolean | number}): Emergence => {
  const src = Array.isArray(o.from) ? o.from : [o.from];
  const extra: Record<string, unknown> = {};
  if (o.match !== undefined) extra.match = o.match;
  if (o.pin !== undefined && o.pin !== false) extra.pin = o.pin === true ? 1 : o.pin;
  return {move: 'morph', from: {word: src[0]}, at: o.at, params: {fromWords: src, keep: o.keep, arc: o.arc, collapse: o.collapse, delay: o.delay, roll: o.roll, frames: o.frames, ...extra}};
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
  label: o.label ?? `FAN ${o.fan > 0 ? '+' : ''}${o.fan}`, name: 'FAN',
});

/** DRAWER (DOGE item 59, K7): the emergence of a block that slides out from behind an edge of a word (`host`, a word
 *  index) or of a prop (`rect`, a world box with an optional angle about its centre), clipped at that edge. Each word's
 *  slide ends on its own sung frame. */
type EdgeOpts = {frames?: number; linear?: {speed: number; settle: number}; at?: number};
/** slideFrom: each word slides from a frame edge or a board anchor, landing on its sung frame. */
export const slideFrom = (o: EdgeOpts & {from: FrameEdge | SlideSource; drop?: number; dropFrames?: number; earlyOk?: number}): Emergence =>
  ({move: 'slideFrom', from: typeof o.from === 'string' ? {edge: o.from} : o.from, at: o.at,
    params: {frames: o.frames, linear: o.linear, drop: o.drop, dropFrames: o.dropFrames, earlyOk: o.earlyOk}});
/** rise (Fable item 37): each word rises from behind a line just under its own landed box (or, with `dir`, from its
 *  own trailing side), clipped there. `from` names what it rises out of (a rule, a word), as every emergence does. */
export const rise = (o: EdgeOpts & {from: AnchorRef; dir?: 'up' | 'down' | 'left' | 'right'; gap?: number}): Emergence =>
  ({move: 'rise', from: o.from, at: o.at, params: {dir: o.dir, gap: o.gap, frames: o.frames, linear: o.linear}});
export const drawer = (o: {host?: number; rect?: {x: number; y: number; w: number; h: number; angle?: number}; edge: 'top' | 'bottom' | 'left' | 'right'; depth?: number; lead?: number}): Emergence => {
  if (o.host === undefined && !o.rect) throw new Error('drawer: give host (a word) or rect (a prop box)');
  const from: AnchorRef = o.host !== undefined ? {word: o.host} : {point: {x: o.rect!.x + o.rect!.w / 2, y: o.rect!.y + o.rect!.h / 2}};
  return {move: 'drawer', from, params: {edge: o.edge, rect: o.rect, depth: o.depth, lead: o.lead}};
};

/** QUARTER (DOGE item 64): the camera rolls `by` degrees (60 to 90 either way) about the Joint, so the old line becomes a
 *  tilted or vertical strip and the new line is upright; SmearStage blurs it as a transit. It needs a hole of 18 clear
 *  frames for 60 degrees and 27 for 90 between the old line's last landing and the new line's first (validator
 *  `quarter-clear`). Put it into board.rig. */
export const quarter = (o: {t: number; by: number; joint: number | AnchorRef; frames?: number; to?: RigTarget; label?: string}): RigKey => ({
  t: o.t, kind: 'roll', by: o.by, frames: o.frames ?? 12, to: o.to,
  about: typeof o.joint === 'number' ? {word: o.joint, letter: 'last', part: 'flankR'} : o.joint,
  label: o.label ?? `QUARTER ${o.by}`, name: 'QUARTER',
});
/** Clear frames a QUARTER of `deg` degrees needs (18 at 60, 27 at 90, linear between). */
export const quarterClearFrames = (deg: number) => Math.ceil(18 + (9 * (Math.min(90, Math.max(60, Math.abs(deg))) - 60)) / 30);

/** RUN (DOGE item 63): one row wider than the frame; the camera tracks along it at up to 22 px per frame so each word
 *  lands ahead of the camera, inside the safe frame. Give the block `rows: [n]` and a wide `width`. The key runs from
 *  `lead` frames (default 12; negative starts after it, so the first word keeps its 20 frames) before the first word is sung to the last word's sung frame, ending with the last word at
 *  `screen` (default 62 percent across, at the frame's mid height). Validator `run-speed` checks the 22 px cap. */
export const RUN_SPEED = WIDE_LIMITS.runSpeed;
export const runTrack = (o: {words: [number, number]; lead?: number; screen?: Pt; label?: string}): RigKey => {
  const lead = o.lead ?? 12;
  const f0 = Math.round(sungAt(o.words[0]) * FPS) - lead, f1 = Math.round(sungAt(o.words[1]) * FPS);
  return {t: f0 / FPS, kind: 'track', frames: Math.max(6, f1 - f0), ease: 'linear', to: {frame: {word: o.words[1]}, screen: o.screen ?? {x: SAFE_BOX.x + (745.6 / 1184) * SAFE_BOX.width, y: RIG_CENTRE.y}},
    label: o.label ?? 'RUN', name: 'RUN'};
};

/** BEHIND (DOGE item 60, K6): the emergence of the hidden block. `cover` the old line's words (one block; default the
 *  anchor word's block), `exit` how the plate leaves. Lay the hidden block out in the cover's box, with a lower z. */
export const behind = (o: {cover: number[]; exit?: 'hinge-down' | 'hinge-up' | 'slide-left' | 'slide-right' | 'slide-up'; frames?: number; pad?: number; colour?: string; at?: number}): Emergence =>
  ({move: 'behind', from: {word: o.cover[0]}, at: o.at, params: {cover: o.cover, exit: o.exit ?? 'slide-up', frames: o.frames, pad: o.pad, colour: o.colour}});

/** station() (Fable item 40, Huang `station`): a rig key that puts world point `pin.world` at screen point `pin.screen`
 *  with the camera at angle `rot` and zoom `zoom` (each kept from the pose before when left out), so a scene can be laid
 *  out station by station. Default a 12-frame step; `kind` 'roll', 'tilt', 'dive' or 'soar' when the move is one. */
export const station = (o: {t: number; pin: {world: Pt; screen: Pt}; rot?: number; zoom?: number; frames?: number; kind?: 'step' | 'roll' | 'tilt' | 'dive' | 'soar' | 'whip'; label?: string}): RigKey => ({
  t: o.t, kind: o.kind ?? 'step', frames: o.frames ?? 12, label: o.label ?? 'station',
  to: {frame: {point: o.pin.world}, screen: o.pin.screen, rot: o.rot, zoom: o.zoom},
});

/** cameraFollow() (Fable item 47, Huang camera.follow): a CRANE that follows the sung words, holding the word being sung
 *  (from its start) at screen point `screen`, damped: each hand-on from one word to the next eases over `lag` frames
 *  (default 12), so the camera glides along a line instead of stepping. `board` is a thunk for the board the key belongs
 *  to (its layout is read lazily). `to` may set the crane's zoom or angle (the crane honours to.zoom and to.rot). */
export const cameraFollow = (o: {t: number; frames: number; words: number[]; board: () => Board; screen?: Pt; lag?: number; to?: RigTarget; label?: string}): RigKey => {
  let pts: {s: number; p: Pt}[] | null = null;
  const points = () => {
    if (pts) return pts;
    const L = layoutBoard(o.board());
    pts = o.words.filter((i) => L.words.has(i)).map((i) => {
      const g = L.words.get(i)!;
      return {s: WORDS[i].start_s, p: blockToWorld(L.blocks[g.block], {x: g.x + g.w / 2, y: g.y + g.h / 2})};
    });
    return pts;
  };
  const lag = (o.lag ?? 12) / FPS;
  const screen = o.screen ?? RIG_CENTRE;
  const ease = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));
  return {
    t: o.t, kind: 'crane', frames: o.frames, to: o.to, label: o.label ?? 'follow',
    follow: (t: number) => {
      const P = points();
      if (!P.length) return {board: {x: 0, y: 0}, screen};
      let x = P[0].p.x, y = P[0].p.y;
      for (let k = 1; k < P.length; k++) { const e = ease((t - P[k].s) / lag); x += (P[k].p.x - P[k - 1].p.x) * e; y += (P[k].p.y - P[k - 1].p.y) * e; }
      return {board: {x, y}, screen};
    },
  };
};
