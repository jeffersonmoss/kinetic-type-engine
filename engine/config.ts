// The song and the look one engine instance draws. A video calls configureEngine() once, at set-up, in a module that
// its boards module imports first (example/song.ts is the pattern), before any board is laid out. Everything the engine
// knows about a song (timing, words, lines, beats), the frame size, the palette and the fonts comes from here; no song
// constant lives in engine/.
//
// Legacy entry points set the module bindings once. EngineScope and withEngine can install a context for a synchronous call.
import {WIDE, limitsFor, safeBox, type EngineLimits, type FrameFormat, type SafeBox} from './format';
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
  /** Optional format supplies frame dimensions and asymmetric safe insets. */
  format?: FrameFormat;
  words: SongWord[];
  lines: SongLine[];
  /** Beat times: the beat length sets the one-state-change-per-beat rule (default 19 frames without beats). */
  beats?: SongBeat[];
  /** Loudness 0 to 1 sampled at 10 Hz (optional; a few verbs scale with it). */
  energy?: number[];
  palette: Palette;
  /** Enable hard shadows behind text and plates unless overridden by a word style. */
  shadow?: boolean;
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

/** Legacy wide speed-cap ratio, retained for callers that derive their own caps. */
export const SPEED_CAP_FRACTION = 0.025;

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

const engineState = (c: EngineConfig, configured = true) => {
  const FPS = c.fps ?? 30;
  const baseFormat = c.format ?? WIDE;
  const WIDTH = c.width ?? baseFormat.width;
  const HEIGHT = c.height ?? baseFormat.height;
  const FORMAT = WIDTH === baseFormat.width && HEIGHT === baseFormat.height
    ? baseFormat : {...baseFormat, width: WIDTH, height: HEIGHT};
  const SAFE_BOX = Object.freeze(safeBox(FORMAT));
  if (!(SAFE_BOX.width > 0 && SAFE_BOX.height > 0)) throw new Error('configureEngine: safe box must have positive dimensions');
  const LIMITS = Object.freeze(limitsFor(SAFE_BOX));
  const RIG_CENTRE = Object.freeze({x: SAFE_BOX.x + SAFE_BOX.width / 2, y: SAFE_BOX.y + SAFE_BOX.height / 2});
  const WORDS = c.words;
  const LINES = c.lines;
  const BEATS = c.beats ?? [];
  const ENERGY = c.energy ?? [];
  const mix = (a: string, b: string, k: number) => {
    const h = (x: string) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16));
    const x = h(a), y = h(b);
    if (x.some(Number.isNaN) || y.some(Number.isNaN)) return a;
    return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join('');
  };
  const SHADOW = c.shadow ?? false;
  const PALETTE = !configured ? c.palette : {...c.palette, light: c.palette.light ?? [c.palette.paper, c.palette.highlight, c.palette.accent],
    body: c.palette.body ?? c.palette.shadow, detail: c.palette.detail ?? mix(c.palette.ground, c.palette.paper, 0.6),
    ground2: c.palette.ground2 ?? mix(c.palette.ground, c.palette.shadow, 0.6)};
  const FONTS = c.fonts;
  const MONO_FONT = c.mono ?? (c.fonts.mono ? {family: c.fonts.mono.family, weight: c.fonts.mono.weight ?? 700} : null);
  const keys = Object.keys(c.fonts);
  if (configured && !keys.length) throw new Error('configureEngine: at least one font is needed');
  const DEFAULT_FONT = c.defaultFont ?? keys[0] ?? '';
  const METRICS = c.metrics;
  const HANDOFFS = c.handoffs ?? {};
  const BANNED_DISPLAY = c.guard ?? [];
  const FIGURE_LOOK = c.figureLook ?? 'stroke';
  const CONNECTIVE_SET = new Set((c.wordRules?.connectives ?? CONNECTIVES).map((s) => s.toLowerCase()));
  const EMPHASIS = c.wordRules?.emphasis ?? ((i: number) => NUMBER_WORDS.test((WORDS[i]?.text ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '')));
  const WORD_RULE = c.wordRules?.rule ?? (() => undefined);

  const SPEED_CAP = LIMITS.speedCap;
  const d = BEATS.slice(1).map((b, k) => b.t - BEATS[k].t).sort((a, b) => a - b);
  const BEAT_FRAMES = d.length ? d[d.length >> 1] * FPS : 19;
  const HALF_DIAGONAL = Math.hypot(WIDTH, HEIGHT) / 2;
  const CULL_DISTANCE = Math.hypot(WIDTH, HEIGHT);
  const BOX_W = LIMITS.fillWidth;
  const BOX_H = LIMITS.fillHeight;
  const SCREEN_CAM = {...RIG_CENTRE, zoom: 1, rot: 0};

  const FONT_FAMILY: Record<FontKey, string> = {};
  const FONT_STYLE: Record<FontKey, FontStyle> = {};
  const FONT_INFO: Record<FontKey, FontInfo> = {};
  for (const k of keys) {
    const fd = c.fonts[k];
    const m = c.metrics.fonts[k];
    if (!m) throw new Error(`configureEngine: the metrics file has no font "${k}" (it has ${Object.keys(c.metrics.fonts).join(', ')})`);
    FONT_FAMILY[k] = fd.family;
    FONT_STYLE[k] = {fontStyle: fd.style ?? 'normal', fontWeight: fd.weight ?? 400};
    FONT_INFO[k] = {cap: m.cap, desc: m.desc, space: m.space, upper: !!fd.upper, table: m.adv, fallback: m.fallback, kern: m.kern ?? {}, asc: m.asc ?? m.cap, inkDesc: m.inkDesc ?? m.desc};
  }
  const METRICS_MEASURED = c.metrics.measured;
  const METRICS_SOURCE = c.metrics.source;

  const CONFIGURED = configured;
  return {
    FPS, FORMAT, WIDTH, HEIGHT, SAFE_BOX, LIMITS, RIG_CENTRE, WORDS, LINES, BEATS, ENERGY, PALETTE, SHADOW, FONTS, DEFAULT_FONT, METRICS, HANDOFFS,
    CONNECTIVE_SET, EMPHASIS, WORD_RULE, SPEED_CAP, BEAT_FRAMES, HALF_DIAGONAL, CULL_DISTANCE, BOX_W, BOX_H, SCREEN_CAM,
    FONT_FAMILY, FONT_STYLE, FONT_INFO, METRICS_MEASURED, METRICS_SOURCE, CONFIGURED, MONO_FONT, BANNED_DISPLAY, FIGURE_LOOK,
  };
};

let active = engineState({
  words: [], lines: [], fonts: {},
  palette: {ground: '#000000', shadow: '#000000', paper: '#FFFFFF', accent: '#FF0000', accent2: '#00FF00', highlight: '#FFFF00'},
  metrics: {source: 'not configured', measured: false, fonts: {}},
}, false);

export let {
  FPS, FORMAT, WIDTH, HEIGHT, SAFE_BOX, LIMITS, RIG_CENTRE, WORDS, LINES, BEATS, ENERGY, PALETTE, SHADOW, FONTS, DEFAULT_FONT, METRICS, HANDOFFS,
  CONNECTIVE_SET, EMPHASIS, WORD_RULE, SPEED_CAP, BEAT_FRAMES, HALF_DIAGONAL, CULL_DISTANCE, BOX_W, BOX_H, SCREEN_CAM,
  FONT_FAMILY, FONT_STYLE, FONT_INFO, METRICS_MEASURED, METRICS_SOURCE, CONFIGURED, MONO_FONT, BANNED_DISPLAY, FIGURE_LOOK,
} = active;

const install = (state: typeof active) => {
  ({
    FPS, FORMAT, WIDTH, HEIGHT, SAFE_BOX, LIMITS, RIG_CENTRE, WORDS, LINES, BEATS, ENERGY, PALETTE, SHADOW, FONTS, DEFAULT_FONT, METRICS, HANDOFFS,
    CONNECTIVE_SET, EMPHASIS, WORD_RULE, SPEED_CAP, BEAT_FRAMES, HALF_DIAGONAL, CULL_DISTANCE, BOX_W, BOX_H, SCREEN_CAM,
    FONT_FAMILY, FONT_STYLE, FONT_INFO, METRICS_MEASURED, METRICS_SOURCE, CONFIGURED, MONO_FONT, BANNED_DISPLAY, FIGURE_LOOK,
  } = state);
  active = state;
};

interface FormatState {
  readonly format: FrameFormat;
  readonly safeBox: Readonly<SafeBox>;
  readonly limits: Readonly<EngineLimits>;
  readonly fps: number;
  readonly beatFrames: number;
}
const prepared = new WeakMap<EngineConfig, typeof active>();

/** Set the legacy configuration, or install a temporary configuration for one synchronous body. */
export function configureEngine(c: EngineConfig): void;
export function configureEngine<T>(c: EngineConfig, run: (format: FormatState) => T): T;
export function configureEngine<T>(c: EngineConfig, run?: (format: FormatState) => T): T | void {
  const cache = !!run && Object.isFrozen(c);
  let next = cache ? prepared.get(c) : undefined;
  if (!next) {
    next = engineState(c);
    if (cache) prepared.set(c, next);
  }
  const previous = active;
  install(next);
  if (!run) return;
  try {
    return run({format: next.FORMAT, safeBox: next.SAFE_BOX, limits: next.LIMITS, fps: next.FPS, beatFrames: next.BEAT_FRAMES});
  } finally {
    install(previous);
  }
}

/** Throws a clear error when the engine is used before configureEngine(). */
export const assertConfigured = () => {
  if (!CONFIGURED) throw new Error('kinetic type engine: configureEngine() has not been called; import the video\'s song module (which calls it) before its boards');
};
