// Data shapes for the type engine. All word references are GLOBAL indices into the configured song's words
// (config.ts WORDS). Use wordIx(lineId, 'text') to find them.
import type {PanelDef} from './panel';
import type {ReactNode} from 'react';
import type {TrackedElement} from './motionCheck';
import type {VerbCtxBase, VerbWordCtx, WordMod} from './verbRegistry';
/** A font named in configureEngine({fonts}). */
export type FontKey = string;

export type Tier = 0 | 1 | 2 | 3;
export type Attach = 'R' | 'D' | 'CW' | 'CCW' | 'T+' | 'T-' | 'NEW' | 'FREE' | 'FAN';
/** Board exits. 'none': the board is never wiped; it simply stops being drawn at `end` (use with a handoff). */
export type ExitStyle = 'cut' | 'fall' | 'fade' | 'leave' | 'none' | 'turn';
/** The 3D turn (Fable brief, vertical energy pass, item 5; KIT 89). The axis the element turns about. */
export type TurnAxis = 'y' | 'x';
/** The edge (or the centre line) the element turns about. */
export type TurnPivot = 'left' | 'right' | 'top' | 'bottom' | 'centre';
/** A 3D turn with real perspective: emergence move 'turn', board exit 'turn', Block.exit, Block.turnSwap. */
export interface TurnSpec {
  /** 'y' (default): about a vertical line; 'x': about a horizontal line. */
  axis?: TurnAxis;
  /** default 'centre'. */
  pivot?: TurnPivot;
  /** Which way it swings; default 1. */
  dir?: 1 | -1;
  /** Degrees; default 90; 180 = full flip. */
  deg?: number;
  /** Frames of the turn; default 10. */
  frames?: number;
  /** Engine ease name. */
  ease?: string;
  /** Frames between letters; 0 = whole word. */
  stagger?: number;
  /** Logical units; default 900. */
  perspective?: number;
  /** What turns as one rigid plane: the whole 'block' (default), each 'row', or each 'word'. */
  unit?: 'block' | 'row' | 'word';
}
interface BlockExitTiming {
  /** Song seconds when the exit starts. */
  at: number;
  /** Legacy inclusive global word range. */
  words?: [number, number];
  /** Explicit targets, for fates that leave some words in place. */
  targets?: readonly number[];
}
/** A block-local exit, lowered to a verb cue. The original turn spelling remains supported. */
export type BlockExit = BlockExitTiming & (
  | {style: 'turn'; turn?: TurnSpec}
  | {style: Exclude<ExitStyle, 'turn' | 'none'>}
  | {style: 'effect'; name: VerbName; params?: Record<string, unknown>}
);
/** turnSwap (on the incoming block): `from` turns away to edge-on while this block turns in from edge-on on the same pivot. */
export interface TurnSwap {
  /** The outgoing element: a word or a whole block (block index on this board). */
  from: {word: number} | {block: number};
  spec?: TurnSpec;
}
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

export interface VerbDef {
  /** Definition name before the compiler assigns a board-local cue name. */
  effectName?: string;
  /** Conservative ink bounds in block coordinates, if declared by the effect. */
  ink?: (c: VerbWordCtx) => {x: number; y: number; width: number; height: number};
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

/** Immutable, board-local runtime definitions compiled from effect calls. */
export type EffectTable = Readonly<Partial<Record<string, Readonly<VerbDef>>>>;

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
  /** Use explicitly authored case even when the font role normally uppercases. */
  preserveCase?: boolean;
  /** Solid plate drawn behind the word (road sign, slab). Pad is a fraction of word size (default 0.18). Shadow follows the look unless set here. */
  plate?: {fill: string; pad?: number; shadow?: boolean};
  replace?: LetterArt[];
  /** Hard offset shadow in the palette's `shadow` (6, 6 screen px). Off by default. A look may enable it for E2/E3 on dark grounds. */
  shadow?: boolean;
  /** Extra uniform scale (applied after layout; rarely needed). */
  scale?: number;
  /** Static tilt in degrees about the word's centre. */
  tilt?: number;
  /** K2 picture word (Sweet Distillation): the id of a board graphic that draws this sung word instead of type. The word
   *  is laid out as usual (its box holds its place in the row) but never drawn; the validator skips `visible`,
   *  `sung-cap` and `margin` for it and checks the graphic instead (`picture`: wholly in frame, at least 180 px on its
   *  longer side, at full opacity, from the sung frame for 15 frames). */
  picture?: string;
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
  /** attach 'FAN' (DOGE item 56): degrees the new block turns from the previous one at the Joint, 12 to 24 either way
   *  (positive clockwise). The block starts on the previous block's last baseline, at its end, one space on. */
  fan?: number;
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
  anchor?: {to: AnchorRef; angle?: number | 'stroke'; align?: BlockAlign; gap?: number; offset?: Pt;
    /** K7 hanging punctuation (opt-in): a right-side `align` ('tr', 'mr', 'br', 'baselineR') is measured from the end of
     *  the block's last letter, so trailing punctuation of the last word ('!', '.') hangs outside the anchor, and the
     *  kern between that letter and the punctuation is moved onto the punctuation. Meant for one-row blocks (the hub
     *  words of a suffix morph); with several rows the last row must be the widest. */
    hang?: boolean};
  /** the emergence move this block comes out of the previous arrangement by, and its anchor (rules 54 to 68, 181.5). */
  emerge?: Emergence;
  /** Exit cue for this block or a subset of its words. */
  exit?: BlockExit;
  /** KIT 89: this block turns in while `from` turns away on the same pivot (a revolving sign). Counts as its emergence
   *  when `emerge` is not given. */
  turnSwap?: TurnSwap;
  /** song seconds from which the block is set on the board and visible (the pre-set rule 47): its emergence runs then. */
  showFrom?: number;
  /** song seconds before which the block is not retired (rule 168; anchors, walls and morph sources a later line names). */
  keepUntil?: number;
  /** fixed cap height in world px for every row (no justification, no tier caps, connectives not halved). */
  cap?: number;
  /** Gap between rows as a fraction of the larger adjacent cap. */
  rowGap?: number;
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
  /** It draws type (a title, a caption, an end card): a frame with it in view is not empty of type (`empty-frame`).
   *  Kit pass 21. Set automatically by caption(). */
  isType?: boolean;
  /** A non-lyric caption (caption.tsx): the validator checks it like a sung word, in the safe margin, at least 56 px cap
   *  on screen, at full opacity for at least 15 frames, and crossed by no line, rule or other graphic (`caption`). */
  caption?: {text: string; cap: number; minFrames?: number};
  /** K1 (Sweet Distillation): this graphic is one bracket of a parenPair() round block `parenBlock`; the words of that
   *  block are displayed without "(" and ")" (the pair is the only bracket on screen). Set by parenPair(). */
  parenBlock?: number;
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
export type EmergeMove = 'seam' | 'sprout' | 'nest' | 'door' | 'morph' | 'shove' | 'hinge' | 'fold' | 'stack' | 'shelf' | 'tip' | 'swell' | 'extrude' | 'type' | 'portal' | 'drawer' | 'behind' | 'slideFrom' | 'rise' | 'turn';
export type FrameEdge = 'left' | 'right' | 'top' | 'bottom';
export type SlideSource = Exclude<AnchorRef, {point: Pt}> | {edge: FrameEdge} | {point: Pt; angle?: number; reason: string};
export type Emergence = EmergenceOptions & (
  | {move: 'slideFrom'; from: SlideSource}
  | {move: Exclude<EmergeMove, 'slideFrom'>; from: AnchorRef}
  | {move: 'effect'; name: VerbName; from: SlideSource}
);
interface EmergenceOptions {
  /** Song seconds when the move starts; default: so that it ends on the block's first sung frame (or at `showFrom`). */
  at?: number;
  /** Move parameters; see KIT.md. */
  params?: Record<string, unknown>;
  /** move 'turn' (KIT 89): the turn's spec. */
  turn?: TurnSpec;
  /** KIT 91: false keeps the move at its nominal frames instead of stretching it to hold every corner under the speed
   *  cap (sprout, swell, door, fold, drawer, shelf, relight, morph travel, shove's corner turn), and the validator does
   *  not hold the block's words to the speed cap before their sung frame. Default: capped, as before. */
  speedCap?: false;
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
  /** Ease (every key is eased): rolls cubic, whips quartic, dives cubic on log zoom, tracks linear with 6-frame ramps.
   *  'out' (added 18 November 2026, Paper Trail vertical pull-back): cubic ease-out, so the speed only falls from the
   *  first frame to rest. Opt-in only; no key gets it by default. */
  ease?: 'cubic' | 'quart' | 'sine' | 'linear' | 'out';
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
  /** The named move this key belongs to (set by fanTurn, quarter, runTrack); the validator checks it by its rules. */
  name?: 'FAN' | 'QUARTER' | 'RUN' | 'DIVE';
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
  /** PORTAL: culls every retired word when the colour becomes the whole ground. With `keep` (below) it means the K4
   *  travelling retirement edge instead. */
  clears?: boolean;
  /** K4 travelling retirement edge (opt-in; Sweet Distillation): with `clears: true` on a `disc`, every word of the
   *  board NOT listed here is retired by the disc's edge acting as a mask: it is clipped progressively as the edge
   *  crosses it, hidden once the disc covers it, and its reading ends the frame the edge first touches it (validator
   *  `ground-clear`: an error when that is under 15 frames after its sung frame). Listed words are untouched. Without
   *  `keep`, `clears` keeps its PORTAL meaning (cull retired words when the colour is the whole ground). */
  keep?: number[];
  /** Board discs: a world polygon the disc is clipped to until it is the whole ground (PORTAL: the counter's measured
   *  outline, so the wipe never spills over the letter; ruling 194.1). */
  clip?: Pt[];
}

/** Handoff frame ids: keys of configureEngine({handoffs}). A declared id must be configured; omit it when there is no handoff. */
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

/** Inclusive absolute frame bounds supplied by the compiler. */
export interface ReadingInterval {readonly start: number; readonly end: number}

export interface Board {
  /** Optional label for validator output. */
  id?: string;
  /** Motion blur for this board's type during rig transits (default true). false: every word is drawn once, sharp, at
   *  the frame's own time, so no word is ever shown twice; grounds and graphics keep their blur (smearSampling.ts,
   *  smearWordPass; Fable gate, vertical B motion 3). */
  smearType?: boolean;
  /** KIT 90 (Fable brief, vertical energy pass, items 10 and 11), opt-in: 'energy' loosens the validator for words in
   *  transit (moving or turning): for up to 12 frames of a run of motion they may cross words, rotate, leave the type
   *  box; each word must still read at rest for 8 frames from its sung frame (`energy-read`); type in a whip or a
   *  turn is exempt from the speed cap; slide-early allows 12 frames. Without it the board validates as before. */
  transitRules?: 'energy';
  /** Absolute song seconds when the board appears (it snaps the camera to its first block). */
  start: number;
  /** Absolute song seconds when the board's exit begins. */
  end: number;
  bg: string;
  /** Ground-only fade. Score staging times the type's retirement independently. */
  fadeToBlack?: {from: number; to: number};
  /** Alternative measured giant rest for frame-filling score lockups. */
  scaleStyle?: 'lockup';
  /** Blocks belonging to the same sung line share a style group. Echoes have no group. */
  scoreStyleGroups?: Readonly<Partial<Record<number, number>>>;
  blocks: Block[];
  /** Protected reading bounds by word index. Split runs use the same bounds for their sung token. */
  readingIntervals?: Readonly<Partial<Record<number, ReadingInterval>>>;
  /** Score-authored life replaces legacy implicit retirement. */
  scoreLife?: boolean;
  /** Length of a score-authored scene exit that continues drawing after the cut. */
  scoreExitFrames?: number;
  /** Words whose ownership passes to the next board at its first frame. */
  screenHandoffOut?: {frame: number; glyphs: readonly {word: number; index: number}[]};
  readonly effects?: EffectTable;
  exit: ExitStyle;
  /** exit 'turn' (KIT 89): the turn every block leaves by at `end`. */
  turn?: TurnSpec;
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
  /** Carry-out (Fable item 34, Huang sheetExit): a word whose box a transit leaves partly out of frame (at the move's end
   *  or the end of the hold after it) fades out over that move instead of resting half cropped. Opt-in. */
  carryOut?: boolean;
  /** With carryOut: a word also fades over the Nth transit after the one that brought in its line (Huang residueLife). */
  residueLife?: number;
  /** The sheet-camera rules of the Huang and DOGE videos (Fable items 33, 35, 36, 45), opt-in per board: `fast-move`,
   *  `still-camera`, `entrance-in-move` and `camera-rest`, `framing`, and the timeline `empty` warning. Off, the first
   *  video's camera style applies (6-frame steps, deliberate stills, a word sung during a transit read when it ends). */
  sheetRules?: boolean;
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
  /** Chunk carries (DOGE K10, Fable item 48): the board moves as one sheet with the neighbouring chunk across a
   *  boundary, applied as an outer screen transform to everything it draws and checks (engine/carry.ts). */
  carry?: Carry[];
  /** Style rules this board waives, each with its reason (for example `two-scales` on a short test board, or a house
   *  rule of another video's style bible). Their errors are reported as warnings carrying the reason. A waiver with
   *  `words` or `block` applies only to violations reported on those words (KIT 83). */
  waive?: Waiver[];
}
/** A board waiver (KIT 83). Without `words` or `block` it waives the rule for the whole board, as before. With
 *  `words: [first, last]` (global word indices, inclusive) it waives only violations reported on a word in that range;
 *  with `block` (the block's index in `blocks`) only those reported on a word of that block. With both, a violation
 *  must satisfy both. A violation that names no word is never matched by a scoped waiver. */
export interface Waiver {
  rule: string;
  why: string;
  words?: [number, number];
  block?: number;
}
/** A chunk carry: `slideUp` (520 px up over frames B+2 to B+31) or `quarterCW` (90 degrees clockwise about the frame
 *  centre over 27 frames ending 8 before `firstWord`). `side` 'out' for the outgoing chunk (its tail runs to B+45),
 *  'in' for the incoming chunk authored in its final place. `B` and `firstWord` are absolute song frames. */
export interface Carry {
  kind: 'slideUp' | 'quarterCW'; B: number; side: 'in' | 'out'; firstWord?: number;
  /** Outgoing side only: clear the board's type with the carry. Every word fades out (sine) over `frames` (12)
   *  starting `after` frames (0) after the frame following the motion's end, and is hidden from then; its reading
   *  interval ends when the fade starts (a quarterCW ends it earlier, at the turn's start, with or without `clear`).
   *  DOGE's hook `hookClear` with `fadeAfter: B + 1 - turnStart, frames: 12` is `clear: true` on a quarterCW whose B is
   *  the turn's last frame. */
  clear?: boolean | {after?: number; frames?: number};
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
