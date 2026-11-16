// Data shapes for the type engine. All word references are GLOBAL indices into the configured song's words
// (config.ts WORDS). Use wordIx(lineId, 'text') to find them.
import type {PanelDef} from './panel';
import type {ReactNode} from 'react';
import type {TrackedElement} from './motionCheck';
/** A font named in configureEngine({fonts}). */
export type FontKey = string;

export type Tier = 0 | 1 | 2 | 3;
export type Attach = 'R' | 'D' | 'CW' | 'CCW' | 'T+' | 'T-' | 'NEW' | 'FREE';
/** Board exits. 'none': the board is never wiped; it simply stops being drawn at `end` (use with a handoff). */
export type ExitStyle = 'cut' | 'fall' | 'fade' | 'leave' | 'none';
/** Built-in verb names; any name registered with registerVerb() is also accepted. */
export type VerbName =
  | 'explode' | 'vanish' | 'powerDown' | 'wipe' | 'overtake' | 'stretch' | 'sink' | 'burn' | 'smoke'
  | 'strike' | 'fling' | 'rush' | 'bite' | 'count' | 'brake' | 'custom' | (string & {});

export type Pt = {x: number; y: number};

/** A verb effect cue. `at` is absolute song seconds; default = the word's start + 10 frames. */
export interface VerbCue {
  name: VerbName;
  /** The word the verb belongs to (global index). */
  word: number;
  at?: number;
  /** Words the effect acts on (global indices). Default depends on the verb (usually [word]). */
  words?: number[];
  /** Duration in seconds where the verb has one. */
  dur?: number;
  /** Verb-specific parameters; see KIT.md. */
  params?: Record<string, unknown>;
  /** Silence the validator's "effect starts under 10 frames after its word" check (storyboard exceptions). */
  allowEarly?: boolean;
}

/** A letter replaced by a drawing (a hole, a ring, or anything a video draws with a function: its own characters). */
export interface LetterArt {
  /** Index of the letter inside the displayed word text. */
  index: number;
  art: 'hole' | 'ring' | 'blank' | ((box: LetterBox, ctx: ArtCtx) => ReactNode);
  /** Colour for ring/hole art. */
  colour?: string;
}
export interface LetterBox {x: number; y: number; w: number; h: number; cx: number; cy: number; size: number}
export interface ArtCtx {t: number; frame: number; /** Unit vector (block-local) from this letter toward the word being sung. */ look: Pt}

export interface WordOpts {
  colour?: string;
  font?: FontKey;
  tier?: Tier;
  /** Replace the displayed text (e.g. strip punctuation). */
  text?: string;
  /** Solid plate drawn behind the word (road sign, slab). pad in px of word size fraction (default 0.18). */
  plate?: {fill: string; pad?: number; shadow?: boolean};
  replace?: LetterArt[];
  /** Hard offset shadow in the palette's `shadow` (6, 6 screen px). Default on for E2/E3 on dark grounds. */
  shadow?: boolean;
  /** Extra uniform scale (applied after layout; rarely needed). */
  scale?: number;
  /** Static tilt in degrees about the word's centre. */
  tilt?: number;
}

export interface Block {
  /** Inclusive global word range [first, last]. */
  words: [number, number];
  attach: Attach;
  /** FREE placement: world coords on the board; rel true = offset in the previous block's frame (angle relative);
   *  rel 'world' = world-axis offset from the previous block's origin (angle absolute). */
  at?: {x: number; y: number; angle: number; rel?: boolean | 'world'};
  /** With attach 'R': start a new column to the right of the whole D-stacked column, top-aligned with its head. */
  column?: boolean;
  /** Nudge in the previous block's local frame, applied after the attachment rule. */
  offset?: {x: number; y: number};
  /** Justified width W in world px (default 640). */
  width?: number;
  /** Gap to the previous block (default 40). */
  gap?: number;
  /** E3 hero words (CAPITALS in the script). */
  hero?: number[];
  /** Extra E2 words (names, numbers); line-final words are E2 automatically. */
  e2?: number[];
  font?: FontKey;
  colour?: Record<number, string>;
  verb?: VerbCue[];
  style?: Record<number, WordOpts>;
  /** Row alignment when a row is clamped narrower than W. */
  align?: 'left' | 'center';
  /** Manual row breaks: number of words in each row (overrides the automatic breaker). */
  rows?: number[];
  /** A vertical name tower: exempt from the stance check. */
  tower?: boolean;
  /** Repeats grow: blocks sharing a key are the same refrain; `word` (global index) grows to 1.0/1.25/1.5 by index. */
  repeat?: {key: string; index: 1 | 2 | 3; word: number};
  /** Placement against a named anchor of text already on the board (rule 167). Overrides `attach` placement.
   *  `angle` is the block's world angle in degrees (any value; default the anchor's direction for 'stroke', else 0);
   *  `align` names the point of this block that sits on the anchor; `gap` pushes it away along the anchor's outward
   *  direction; `offset` is a final nudge in this block's own frame. */
  anchor?: {to: AnchorRef; angle?: number | 'stroke'; align?: BlockAlign; gap?: number; offset?: Pt};
  /** the emergence move this block comes out of the previous arrangement by, and its anchor (rules 54 to 68, 181.5). */
  emerge?: Emergence;
  /** song seconds from which the block is set on the board and visible (the pre-set rule 47): its emergence runs then. */
  showFrom?: number;
  /** song seconds before which the block is not retired (rule 168; anchors, walls and morph sources a later line names). */
  keepUntil?: number;
  /** fixed cap height in world px for every row (no justification, no tier caps, connectives not halved). */
  cap?: number;
  /** STACK layout (rule 62): one word per row, every row justified to `measure` world px, leading 8 percent of cap
   *  height (or `leading` as a fraction), building upward or downward from the first word. */
  stack?: {measure: number; dir?: 'up' | 'down'; leading?: number};
  /** drawing order among blocks (default 0; lower is drawn first, so a DOOR's new word can sit under the old one). */
  z?: number;
  /** 'screen' pins the block to the screen (rule 177): its anchor or `at` is in screen px and the rig does not move it. */
  pin?: 'screen';
  /** the id of the board panel this block is printed on: its words take the panel's transform (open, fold, flip,
   *  slide, fall) and are hidden while the panel is, and the block is drawn with the panel, so a panel drawn above it
   *  (a higher panel z) covers it. */
  on?: string;
}
/** A panel on a board: a PanelDef in world space with an id (block.on names it) and a drawing order. */
export interface BoardPanel extends PanelDef {
  id: string;
  /** Drawing order among panels and free blocks (default 0; lower first). */
  z?: number;
  /** Frames after the sung frame of the last word printed on it before the panel may start to fold or fall (Fable
   *  item 28: 20; at least 16, which Fable allowed for NEAR in L04). Validator error `panel-fold-early`. */
  foldGap?: number;
}

/** A decor or overlay graphic on a board (ruling 198; Fable items 36 and 46). Every graphic has a finite life:
 *  `until` is required, the engine draws nothing outside [from, until), and the last `exit` frames are its exit (the engine
 *  fades it, or with `exitBy: 'shape'` the graphic retracts itself; either way at least 6 frames). `box` declares its
 *  ink for the validator: polygons in world px (screen px for layer 'screen'). Build rays with `rays()`. */
export interface DecorGraphic {
  id: string;
  /** 'under' the words (with the rules), 'over' the words, or 'screen' (screen space, over everything). */
  layer: 'under' | 'over' | 'screen';
  /** Song seconds it exists from and until (gone at `until`). */
  from: number;
  until: number;
  /** Frames of exit before `until` (default and minimum 6). */
  exit?: number;
  /** 'fade' (default): the engine fades it over the exit; 'shape': draw() retracts it itself (life.out goes 0 to 1). */
  exitBy?: 'fade' | 'shape';
  /** What it belongs to: it must leave within 20 frames of every owner word retiring or leaving frame, and of the
   *  panel folding or falling (`line-linger`). */
  owner?: {words?: number[]; panel?: string};
  /** A line-type graphic (a tick, an underline, a bracket, a skid, a squiggle): checked by `line-linger` (an owner is
   *  then required unless `persistent`). */
  line?: boolean;
  /** The storyboard names it as persistent (a shelf, a rule); exempt from `line-linger`. */
  persistent?: boolean;
  /** Words may stand on it (a band, a road: a ground, like a panel), so it is exempt from `decor-ink`. */
  ground?: boolean;
  /** Its ink at song seconds t (polygons), or null when nothing is drawn. Keep it in the function draw() uses. */
  box: (c: {t: number; board: Board; layout: BoardLayout}) => Pt[][] | null;
  /** Draws it. `life.age` frames since `from`, `life.left` frames to `until`, `life.out` exit progress 0 to 1. */
  draw: (c: BoardCtx, life: {age: number; left: number; out: number}) => ReactNode;
}

// ------------------------------------------------------------------ anchors, emergence, rig, rules
/** Named parts of a letter (rule 169). Directions: flankL 180, flankR 0, top -90, foot 90 (block frame, then world). */
export type LetterPart = 'flankL' | 'flankR' | 'foot' | 'top' | 'stemTop' | 'tail' | 'terminal' | 'centreLine' | 'counter' | 'counter2' | 'centre';
/** A point on the board that a block, a rule, a rig move or an emergence verb hangs from. */
export type AnchorRef =
  /** A letter part of a laid-out word (letter index into its displayed text, 'first' or 'last'; default the whole word). */
  | {word: number; letter?: number | 'first' | 'last'; part?: LetterPart; offset?: Pt}
  /** A point on a board rule: s = 0 (its start) to 1 (its full length), default 0.5. */
  | {rule: string; s?: number; offset?: Pt}
  /** A point on a board path (board.paths, a video's own recurring line): arc length `s` (world px from its start), or
   *  its tip at song seconds `tipAt`. */
  | {path: string; s?: number; tipAt?: number; offset?: Pt}
  /** A corner or the centre of an earlier block's box. */
  | {block: number; corner?: 'tl' | 'tr' | 'br' | 'bl' | 'centre'; offset?: Pt}
  /** An explicit board point (world px; screen px for pinned blocks). Use sparingly: prefer text anchors. */
  | {point: Pt; angle?: number};
/** Which point of a block sits on its anchor: corners, edge midpoints, centre, or the ends of the first row's baseline. */
export type BlockAlign = 'tl' | 'tr' | 'bl' | 'br' | 'ml' | 'mr' | 'tc' | 'bc' | 'centre' | 'baselineL' | 'baselineR';
/** The fifteen emergence moves of the style bible (rules 54 to 68). */
export type EmergeMove = 'seam' | 'sprout' | 'nest' | 'door' | 'morph' | 'shove' | 'hinge' | 'fold' | 'stack' | 'shelf' | 'tip' | 'swell' | 'extrude' | 'type' | 'portal';
export interface Emergence {
  move: EmergeMove;
  /** The text (or rule, or Line) it comes out of. Required (rule 181.5). */
  from: AnchorRef;
  /** Song seconds when the move starts; default: so that it ends on the block's first sung frame (or at `showFrom`). */
  at?: number;
  /** Move parameters; see KIT.md. */
  params?: Record<string, unknown>;
}

/** Rig move kinds (rule 166.2). */
export type RigKind = 'roll' | 'tilt' | 'whip' | 'step' | 'dive' | 'soar' | 'track' | 'crane' | 'hold';
/** What a rig move frames: a word, words, a block, an anchor or a point. */
export type RigFrameRef = {word: number} | {words: number[]} | {block: number} | {blocks: number[]} | {anchor: AnchorRef} | {point: Pt};
/** Target pose of a rig move: absolute fields, or a framed target (with a cap height or fill) placed at a screen point. */
export interface RigTarget {
  x?: number; y?: number; zoom?: number;
  /** Absolute rig angle R in degrees (rolls and tilts usually give `by` instead). */
  rot?: number;
  frame?: RigFrameRef;
  /** Zoom so that the framed word's cap height is this many screen px. */
  cap?: number;
  /** Zoom so that the framed box fills this fraction of the 1,040 x 560 box (default: keep zoom unless cap given). */
  fill?: number;
  /** Zoom so that the framed anchor's counter (or box) covers the whole frame (PORTAL dives). */
  cover?: boolean;
  /** Screen point the framed target's centre ends at (default the frame centre). */
  screen?: Pt;
}
export interface RigKey {
  /** Song seconds the move starts. */
  t: number;
  kind: RigKind;
  /** Duration in frames (defaults per kind; quarter turns are stretched to at least 8 frames, rule 166.4). */
  frames?: number;
  /** roll / tilt: change of R in degrees (from the last authored R, so DRIFT never accumulates into it);
   *  dive / soar: zoom factor (dive by 3 = three times closer; soar by 3 = three times farther). */
  by?: number;
  to?: RigTarget;
  /** The board point that moves in a straight line on screen during the move (default: the framed target's centre, else
   *  the frame centre). A roll about the hub of a chorus keeps the hub still on screen. */
  about?: AnchorRef;
  /** Ease (every key is eased): rolls cubic, whips quartic, dives cubic on log zoom, tracks linear with 6-frame ramps. */
  ease?: 'cubic' | 'quart' | 'sine' | 'linear';
  /** whip: directional smear in screen px (at most 40), only on the middle frames, never on a word 3 frames after it is sung. */
  smear?: number;
  /** hold: no DRIFT from this key until the next (the two stills of the film, and handoffs). */
  still?: boolean;
  /** crane: the board point to hold at a screen point, as a function of song seconds. */
  follow?: (t: number) => {board: Pt; screen: Pt};
  /** track: steady speed in screen px per frame, along screen direction `dir` (degrees; 0 = the board moves left so the
   *  camera travels right). Alternative to `to`. */
  speed?: number; dir?: number;
  /** Free text shown in the validator's per-line motion plan. */
  label?: string;
}

/** A Paper hairline with a job (rule 52, rule 173). */
export interface RuleDef {
  id: string;
  job: 'seam' | 'hinge' | 'shelf' | 'edge';
  /** Where it starts: a board point or an anchor (EXTRUDE: a letter part such as the foot of an I). */
  from: Pt | AnchorRef;
  /** World angle in degrees of its direction from `from`. */
  angle: number;
  /** Full length in world px. */
  length: number;
  /** Song seconds it starts growing from `from` (default: already there when the board starts). */
  t0?: number;
  /** Growth speed in world px per frame (default: as fast as the 32 px per frame cap allows at the zoom of t0, at least 6 frames). */
  speed?: number;
  /** Song seconds it fades out (10 frames). */
  until?: number;
  colour?: string;
  /** Default 0.7. */
  opacity?: number;
  /** World px (default 3); never under 2 px on screen. */
  width?: number;
  /** Rigid motion of the rule at song seconds t (the wiper of L02): offset and rotation about its start. */
  move?: (t: number) => {dx?: number; dy?: number; rot?: number};
  /** Job as a function of time, when the camera turns a seam into a shelf (informational, shown in the report). */
  jobAt?: (t: number) => RuleDef['job'];
  /** Ruling 198 (no lingering lines): the words or blocks this rule belongs to. Without `until` the rule fades (10
   *  frames) when the last of them retires; the validator errors when it is in frame more than 20 frames after every
   *  owner has retired or left frame (`line-linger`). */
  owner?: {words?: number[]; blocks?: number[]};
  /** Ruling 198: the storyboard names this rule as a persistent shelf or rule (it stays doing that job). A rule with
   *  none of `until`, `owner` and `persistent` is an error (`line-life`). Say in a comment which storyboard entry. */
  persistent?: boolean;
}

/** A persistent path on a board that anchors can name ({path: id, s} or {path: id, tipAt}): a video's own recurring
 *  line, which only it defines (the first video's Mint Line is one, kept in that video's repo and in fixtures/ipo-proof).
 *  The engine resolves anchors on it, draws it in world space with the board rules (under the words), and checks the
 *  motion of its tip when `tipAt` is given. */
export interface BoardPath {
  id: string;
  /** Name in validator reports (default "path <id>"). */
  label?: string;
  /** Point and heading (world degrees) at arc length s (world px from its start). */
  pointAt: (s: number) => {p: Pt; heading: number};
  /** Its tip at song seconds t (for {path, tipAt} anchors and the motion check of the tip). */
  tipAt?: (t: number) => {p: Pt; heading: number};
  /** Draws it in world space (under the words, after the board rules). */
  draw: (c: BoardCtx) => ReactNode;
}

/** A ground change by a travelling edge (rule 176). */
export interface GroundWipe {
  colour: string;
  shape: 'disc' | 'flame';
  /** Song seconds the edge starts travelling. */
  t0: number;
  /** Frames the edge takes (stretched to the 32 px per frame cap for screen-space edges). */
  frames?: number;
  /** 'screen' (default) or 'board' (a disc in world space, as inside a counter for PORTAL). */
  space?: 'screen' | 'board';
  /** Disc centre (screen or world px; default the frame centre). Flame: ignored (it rises from the bottom edge). */
  from?: Pt;
  /** Board discs: start and end radius in world px. */
  r0?: number; r1?: number;
  /** Song seconds from which this colour is the whole ground (PORTAL: when the dive has filled the frame). */
  fullAt?: number;
  /** PORTAL: culls every retired word when the colour becomes the whole ground. */
  clears?: boolean;
  /** Board discs: a world polygon the disc is clipped to until it is the whole ground (PORTAL: the counter's measured
   *  outline, so the wipe never spills over the letter; ruling 194.1). */
  clip?: Pt[];
}

/** Handoff frame ids: keys of configureEngine({handoffs}). An id with no handoff (such as 'FILM_START') matches nothing. */
export type HandoffId = string;
/** A word at a fixed screen place on a handoff frame: displayed text, its cap box (screen px). */
export interface HandoffWord {kind: 'word'; text: string; x: number; baseline: number; cap: number; w: number}
/** Something on a handoff frame the validator does not measure (listed as a warning): a path, a ring, a drawing.
 *  `path` names the board path it is, so a board path without a mark is reported (`handoff-extra`). */
export interface HandoffMark {kind: 'mark'; label: string; path?: string}
export type HandoffElement = HandoffWord | HandoffMark;
/** A handoff frame (the fixed picture at a boundary between two chunks of a video, which both chunks must match). */
export interface Handoff {id: HandoffId; t: number; bg: string; elements: HandoffElement[]}

export interface CameraState {x: number; y: number; zoom: number; rot: number}

export interface Board {
  /** Optional label for validator output. */
  id?: string;
  /** Absolute song seconds when the board appears (it snaps the camera to its first block). */
  start: number;
  /** Absolute song seconds when the board's exit begins. */
  end: number;
  bg: string;
  blocks: Block[];
  exit: ExitStyle;
  /** Default block width (640). */
  width?: number;
  /** 'center' centres D-attached blocks under each other. */
  align?: 'left' | 'center';
  /** Default font for blocks without one. */
  font?: FontKey;
  /** Default type colour (the palette's paper on dark grounds). */
  colour?: string;
  /** World-space polygons that graphics occupy at song time t; the validator checks no word overlaps them. */
  keepClear?: (t: number) => Pt[][];
  /** The board's graphics, each with a finite life and a declared box (ruling 198). There is no free-form decor: a
   *  graphic the engine cannot end is not allowed. */
  graphics?: DecorGraphic[];
  /** Decor graphics to check for motion legibility (speed cap, minimum visible life, state changes per beat, no
   *  flashing): samples in world coordinates, checked through this board's camera (KIT.md, motion legibility). */
  track?: TrackedElement[];
  /** The rig camera (rule 166), the board's one camera. Omitted or [], the rig only drifts from `rigStart`. */
  rig?: RigKey[];
  /** Panels (rule 40, rule 175): grounds that words stand on, in world space, drawn under the words that ride them
   *  (block.on) and moved by their ops (open on an edge, fold shut, flip, slide, fall). Words on a panel take its
   *  transform, so a page that swings open, flips up or falls takes its words with it. */
  panels?: BoardPanel[];
  /** Rig pose when the board starts (default: the first block framed at R = 0). */
  rigStart?: RigTarget;
  /** Hairlines with jobs (rule 52), drawn under the words. */
  rules?: RuleDef[];
  /** The video's own persistent paths (BoardPath), drawn under the words; anchors name them by id. */
  paths?: BoardPath[];
  /** Ground changes by a travelling edge (rule 176). */
  ground?: GroundWipe[];
  /** The warm vignette (rule 73); default on. */
  vignette?: boolean;
  /** Handoff frames this board starts and ends on (rule 81); checked by the validator. */
  /** 'open' as the end: a proof or test clip that stops mid-chunk on purpose (no handoff to match there). */
  handoff?: {start?: HandoffId; end?: HandoffId | 'open'};
}

/** Geometry of one laid-out word. Local = block frame (x right along reading, y down). */
export interface WordGeom {
  i: number;
  text: string;
  font: FontKey;
  tier: Tier;
  size: number;
  /** Box in block-local px: x, y = top-left of the cap box; w; h = cap height; boxH includes descenders. */
  x: number; y: number; w: number; h: number; boxH: number; baseline: number;
  row: number;
  block: number;
  line: number;
  start: number; end: number;
  /** Start frame (round(start_s * FPS)). */
  sf: number;
  /** Letter advances (px), summing to w. */
  adv: number[];
  opts: WordOpts;
}
export interface RowGeom {y: number; h: number; size: number; baseline: number; width: number; words: number[]}
export interface BlockGeom {
  index: number;
  def: Block;
  w: number; h: number;
  rows: RowGeom[];
  words: WordGeom[];
  /** World placement: origin (top-left of block) and angle in degrees. */
  ox: number; oy: number; angle: number;
  firstSf: number; lastSf: number;
  font: FontKey;
}
export interface BoardLayout {
  board: Board;
  blocks: BlockGeom[];
  /** Global word index -> geometry. */
  words: Map<number, WordGeom>;
  /** Global word indices in reading order. */
  order: number[];
}

/** Everything a decor/overlay/screen render prop receives. */
export interface BoardCtx {
  t: number;
  frame: number;
  board: Board;
  layout: BoardLayout;
  cam: CameraState;
  /** World-space geometry of a word: centre, corners, angle, size. */
  word: (i: number) => WorldWord;
  /** World -> screen. */
  toScreen: (p: Pt) => Pt;
  /** Index of the word being sung (global), -1 if none on this board yet. */
  current: number;
  /** World point of a block-local point. */
  blockToWorld: (block: number, p: Pt) => Pt;
}
export interface WorldWord {
  geom: WordGeom;
  cx: number; cy: number;
  /** Corners TL, TR, BR, BL in world coords. */
  corners: Pt[];
  angle: number;
  /** Current render state offsets are not included; this is the landed position. */
  w: number; h: number;
}
