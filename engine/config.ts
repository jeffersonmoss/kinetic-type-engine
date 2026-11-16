// The song and the look one engine instance draws. A video calls configureEngine() once, at set-up, in a module that
// its boards module imports first (example/song.ts is the pattern), before any board is laid out. Everything the engine
// knows about a song (timing, words, lines, beats), the frame size, the palette and the fonts comes from here; no song
// constant lives in engine/.
//
// One configuration per bundle: the values are module-level bindings, so a Remotion entry point (and a validator run)
// holds one song. Give each video, the example and each fixture its own entry point (see KIT.md, section 1).
import type {FontKey, Handoff, Tier, WordOpts} from './types';

/** One sung word from the lyric alignment. `line` is the index of its line in `lines`. */
export interface SongWord {text: string; start_s: number; end_s: number; line: number}
/** One lyric line: `words` are global indices into `words`, in order. */
export interface SongLine {id: number; text: string; start_s: number; end_s: number; words: number[]}
/** A beat time in song seconds (extra fields, such as a bar number, are ignored). */
export interface SongBeat {t: number}

/** A display font. `upper`: words set in it are shown in capitals. `connectives`: the font that connective (E0) words
 *  of a block in this font are set in (Anton blocks set "the", "of" in Barlow); they keep this font's case. */
export interface FontDef {family: string; style?: 'normal' | 'italic'; weight?: number; upper?: boolean; connectives?: FontKey}

/** Colour roles the engine draws with when a board or block names no colour. */
export interface Palette {
  /** The default ground (board `bg`) and the shade a swinging panel or door darkens to. */
  ground: string;
  /** Hard shadows under emphasis words, panel ink, the vignette. */
  shadow: string;
  /** Type on dark grounds, rules, seam and hinge lines, panels. */
  paper: string;
  /** Strikes, burns, bites. */
  accent: string;
  /** Second accent (explode particles). */
  accent2: string;
  /** Rays, coins, burst particles. */
  highlight: string;
  /** Grounds on which the default type colour is `ground` instead of `paper`. Default: `paper`, `highlight`, `accent`. */
  light?: string[];
  /** Prop roles (phase 2, for props/): prop bodies, plates and cases (default `shadow`); grey detail lines and metal
   *  (default `ground` mixed 60 percent toward `paper`); a second dark ground for screens and pages (default `ground`
   *  mixed 60 percent toward `shadow`). The engine itself does not draw with them. */
  body?: string;
  detail?: string;
  ground2?: string;
}
/** A monospaced face for props that print figures (receipts, dialogs, browsers). Not laid out by the engine, so it
 *  needs no metrics entry. */
export interface MonoFont {family: string; weight?: number}

type FontJson = {cap: number; desc: number; space: number; fallback: number; adv: Record<string, number>; kern?: Record<string, number>; asc?: number; inkDesc?: number};
/** The font metrics file written by tools/measure-fonts.mjs and tools/measure-outlines.mjs (fonts/*.metrics.json). */
export interface FontMetricsFile {source: string; measured: boolean; fonts: Record<string, FontJson>; anchors?: Record<string, unknown>}

/** Per-song word rules (optional). */
export interface WordRules {
  /** Connective (E0) words, set at half size (default: the English list in CONNECTIVES). */
  connectives?: string[];
  /** Extra emphasis (E2) words besides line-final words and a block's `e2` list (default: number words). */
  emphasis?: (i: number) => boolean;
  /** A house rule for word i, applied before everything else: a tier and word options (font, colour, displayed text). */
  rule?: (i: number) => {tier?: Tier; opts?: WordOpts} | undefined;
}

export interface EngineConfig {
  /** Frames per second (default 30) and frame size in px (default 1280 x 720). */
  fps?: number; width?: number; height?: number;
  words: SongWord[];
  lines: SongLine[];
  /** Beat times: the beat length sets the one-state-change-per-beat rule (default 19 frames without beats). */
  beats?: SongBeat[];
  /** Loudness 0 to 1 sampled at 10 Hz (optional; a few verbs scale with it). */
  energy?: number[];
  palette: Palette;
  fonts: Record<FontKey, FontDef>;
  /** Font of a block when neither the block nor its board names one (default: the first font). */
  defaultFont?: FontKey;
  metrics: FontMetricsFile;
  wordRules?: WordRules;
  /** Handoff frames boards may start or end on (board.handoff); see types.ts Handoff. */
  handoffs?: Record<string, Handoff>;
  /** The mono font role (props). Default: the font keyed `mono` if there is one, else none. */
  mono?: MonoFont;
  /** Display guard (Fable item 44, DOGE K15): spellings that must never be displayed (the sung spellings of names the
   *  screen spells otherwise). Every displayed word, and every string passed through guardDisplay(), is checked. */
  guard?: RegExp[];
  /** The look every Figure prop draws in when its own `look` is not given: 'stroke' (default, the stick body) or
   *  'pictogram' (the filled restroom-sign figure). A film sets it once here to switch all its Figures. */
  figureLook?: FigureLook;
}
/** How the Figure prop is drawn (see props/Figure.tsx). */
export type FigureLook = 'stroke' | 'pictogram';

/** The default connectives (amendment K2 of the first video: personal pronouns are not connectives). */
export const CONNECTIVES = ['the', 'a', 'an', 'of', 'to', 'and', 'in', 'on', 'it', 'is', 'that', 'this', 'so', 'or', 'at', 'for'];
const NUMBER_WORDS = /^(\d.*|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|trillion)$/;

// ------------------------------------------------------------------ the configured values (live bindings)
export let FPS = 30;
export let WIDTH = 1280;
export let HEIGHT = 720;
export let WORDS: SongWord[] = [];
export let LINES: SongLine[] = [];
export let BEATS: SongBeat[] = [];
export let ENERGY: number[] = [];
export let PALETTE: Palette = {ground: '#000000', shadow: '#000000', paper: '#FFFFFF', accent: '#FF0000', accent2: '#00FF00', highlight: '#FFFF00'};
export let FONTS: Record<FontKey, FontDef> = {};
export let DEFAULT_FONT: FontKey = '';
export let METRICS: FontMetricsFile = {source: 'not configured', measured: false, fonts: {}};
export let HANDOFFS: Record<string, Handoff> = {};
export let CONNECTIVE_SET = new Set(CONNECTIVES);
export let EMPHASIS: (i: number) => boolean = () => false;
export let WORD_RULE: NonNullable<WordRules['rule']> = () => undefined;

// ------------------------------------------------------------------ values derived from them
/** Speed cap fraction of the frame width per frame (motion.ts explains the number). */
export const SPEED_CAP_FRACTION = 0.025;
/** Speed cap in screen px per frame at the configured width (32 at 1280). */
export let SPEED_CAP = SPEED_CAP_FRACTION * WIDTH;
/** One beat in frames (median beat interval): an element changes state at most once per beat. */
export let BEAT_FRAMES = 19;
/** Half the frame diagonal: a counter of this radius on screen covers the whole frame. */
export let HALF_DIAGONAL = Math.hypot(WIDTH, HEIGHT) / 2;
/** A retired word is culled once its box is farther than one frame diagonal from the frame centre. */
export let CULL_DISTANCE = Math.hypot(WIDTH, HEIGHT);
/** The framing box a rig `fill` target fits into (1,040 x 560 at 1280 x 720). */
export let BOX_W = WIDTH - 240;
export let BOX_H = HEIGHT - 160;
/** The camera of a screen-pinned block: screen px are world px. */
export let SCREEN_CAM = {x: WIDTH / 2, y: HEIGHT / 2, zoom: 1, rot: 0};

export type FontStyle = {fontStyle: 'normal' | 'italic'; fontWeight: number};
export type FontInfo = {
  /** Cap height as a fraction of font size. */
  cap: number;
  /** Descender depth below the baseline as a fraction of font size (0 for caps-only faces). */
  desc: number;
  /** Space between words as a fraction of font size. */
  space: number;
  /** Whether display text is forced to upper case. */
  upper: boolean;
  table: Record<string, number>;
  fallback: number;
  /** Kerning adjustments in em for character pairs ("AV": -0.05). */
  kern: Record<string, number>;
  /** Highest ink of the ascenders and apostrophes, and lowest ink of the descenders, as fractions of the font size,
   *  measured from the glyph outlines (tools/measure-outlines.mjs). */
  asc: number;
  inkDesc: number;
};
export let FONT_FAMILY: Record<FontKey, string> = {};
export let FONT_STYLE: Record<FontKey, FontStyle> = {};
export let FONT_INFO: Record<FontKey, FontInfo> = {};
/** True when the metrics file holds widths measured from the real fonts (false: hand estimates). */
export let METRICS_MEASURED = false;
export let METRICS_SOURCE = 'not configured';

export let CONFIGURED = false;
/** The mono font role (EngineConfig.mono), or null. */
export let MONO_FONT: MonoFont | null = null;
export let BANNED_DISPLAY: RegExp[] = [];
/** The engine-wide default look of the Figure prop (EngineConfig.figureLook). */
export let FIGURE_LOOK: FigureLook = 'stroke';
/** The banned spelling found in a string, or null. */
export const bannedIn = (s: string): string | null => {
  for (const re of BANNED_DISPLAY) { const m = s.match(re); if (m) return m[0]; }
  return null;
};
/** Returns `s` unchanged, or throws (failing the render and the validator) if it holds a banned spelling. The engine
 *  passes every displayed word through it; props and graphics that print text should call it too. */
export const guardDisplay = (s: string): string => {
  const b = bannedIn(s);
  if (b) throw new Error(`display guard: "${s}" contains the banned spelling "${b}"`);
  return s;
};

/** Sets the song, frame, palette and fonts. Call once at set-up, before any board is laid out. */
export const configureEngine = (c: EngineConfig): void => {
  FPS = c.fps ?? 30;
  WIDTH = c.width ?? 1280;
  HEIGHT = c.height ?? 720;
  WORDS = c.words;
  LINES = c.lines;
  BEATS = c.beats ?? [];
  ENERGY = c.energy ?? [];
  const mix = (a: string, b: string, k: number) => {
    const h = (x: string) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16));
    const x = h(a), y = h(b);
    if (x.some(Number.isNaN) || y.some(Number.isNaN)) return a;
    return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join('');
  };
  PALETTE = {...c.palette, light: c.palette.light ?? [c.palette.paper, c.palette.highlight, c.palette.accent],
    body: c.palette.body ?? c.palette.shadow, detail: c.palette.detail ?? mix(c.palette.ground, c.palette.paper, 0.6),
    ground2: c.palette.ground2 ?? mix(c.palette.ground, c.palette.shadow, 0.6)};
  FONTS = c.fonts;
  MONO_FONT = c.mono ?? (c.fonts.mono ? {family: c.fonts.mono.family, weight: c.fonts.mono.weight ?? 700} : null);
  const keys = Object.keys(c.fonts);
  if (!keys.length) throw new Error('configureEngine: at least one font is needed');
  DEFAULT_FONT = c.defaultFont ?? keys[0];
  METRICS = c.metrics;
  HANDOFFS = c.handoffs ?? {};
  BANNED_DISPLAY = c.guard ?? [];
  FIGURE_LOOK = c.figureLook ?? 'stroke';
  CONNECTIVE_SET = new Set((c.wordRules?.connectives ?? CONNECTIVES).map((s) => s.toLowerCase()));
  EMPHASIS = c.wordRules?.emphasis ?? ((i) => NUMBER_WORDS.test((WORDS[i]?.text ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '')));
  WORD_RULE = c.wordRules?.rule ?? (() => undefined);

  SPEED_CAP = SPEED_CAP_FRACTION * WIDTH;
  const d = BEATS.slice(1).map((b, k) => b.t - BEATS[k].t).sort((a, b) => a - b);
  BEAT_FRAMES = d.length ? d[d.length >> 1] * FPS : 19;
  HALF_DIAGONAL = Math.hypot(WIDTH, HEIGHT) / 2;
  CULL_DISTANCE = Math.hypot(WIDTH, HEIGHT);
  BOX_W = WIDTH - 240;
  BOX_H = HEIGHT - 160;
  SCREEN_CAM = {x: WIDTH / 2, y: HEIGHT / 2, zoom: 1, rot: 0};

  FONT_FAMILY = {}; FONT_STYLE = {}; FONT_INFO = {};
  for (const k of keys) {
    const fd = c.fonts[k];
    const m = c.metrics.fonts[k];
    if (!m) throw new Error(`configureEngine: the metrics file has no font "${k}" (it has ${Object.keys(c.metrics.fonts).join(', ')})`);
    FONT_FAMILY[k] = fd.family;
    FONT_STYLE[k] = {fontStyle: fd.style ?? 'normal', fontWeight: fd.weight ?? 400};
    FONT_INFO[k] = {cap: m.cap, desc: m.desc, space: m.space, upper: !!fd.upper, table: m.adv, fallback: m.fallback, kern: m.kern ?? {}, asc: m.asc ?? m.cap, inkDesc: m.inkDesc ?? m.desc};
  }
  METRICS_MEASURED = c.metrics.measured;
  METRICS_SOURCE = c.metrics.source;
  CONFIGURED = true;
};

/** Throws a clear error when the engine is used before configureEngine(). */
export const assertConfigured = () => {
  if (!CONFIGURED) throw new Error('kinetic type engine: configureEngine() has not been called; import the video\'s song module (which calls it) before its boards');
};
