import type {CameraCall, LegacyCall, PairCall, UnitCall} from '../effects';
import type {EngineContext} from '../context';
import type {Board, BoardLayout, LetterPart, RuleDef} from '../engine/types';

export type Size = 'hero' | 'body' | 'second' | number;
export type Placement = 'below' | 'above' | 'right' | 'left' | 'inside' | 'overlay' | 'turnCW' | 'turnCCW';
export type Landmark =
  | {kind: 'word'; line: string; text: string; nth?: number}
  | {kind: 'glyph'; line: string; text: string; glyph: string; nth?: number; part?: LetterPart}
  | {kind: 'row'; line: string; row: number}
  | {kind: 'rule'; id: string}
  | {kind: 'edge'; side: 'L' | 'R' | 'T' | 'B'}
  | {kind: 'opening'}
  | {kind: 'free'; point: {x: number; y: number}; reason: string};

export const word = (line: string, text: string, options: {nth?: number} = {}): Landmark => ({kind: 'word', line, text, ...options});
export const glyph = (line: string, text: string, glyph: string, options: {nth?: number; part?: LetterPart} = {}): Landmark =>
  ({kind: 'glyph', line, text, glyph, ...options});
export const row = (line: string, row: number): Landmark => ({kind: 'row', line, row});
export const rule = (id: string): Landmark => ({kind: 'rule', id});
export const edge = (side: 'L' | 'R' | 'T' | 'B'): Landmark => ({kind: 'edge', side});
export const opening = (): Landmark => ({kind: 'opening'});
export const free = (point: {x: number; y: number}, reason: string): Landmark => ({kind: 'free', point, reason});

export type Exit = UnitCall<any> | LegacyCall;
export type Entrance = UnitCall<any> | PairCall<any> | LegacyCall;
export type Fate = {kind: 'stay' | 'retract'} | {kind: 'dock'; to: 'margin' | 'spine'} | {kind: 'clear'; effect: Exit};
export const stay = (): Fate => ({kind: 'stay'});
export const retract = (): Fate => ({kind: 'retract'});
export const dock = (to: 'margin' | 'spine'): Fate => ({kind: 'dock', to});
export const clear = (effect: Exit): Fate => ({kind: 'clear', effect});

export interface Emphasis {font?: string; case?: 'mixed' | 'upper'; reason?: string}
export type Ink = 'call' | 'reply' | 'hit';
export interface WordStyle extends Emphasis {ink?: Ink}
export interface Echo {kind: 'echo'; text: string}
export const echo = (text: string): Echo => ({kind: 'echo', text});
export interface RowCard {text: string | readonly (string | Echo)[]; size?: Size; ink?: Ink}
export type Rows = 'auto' | readonly (string | Echo | RowCard)[];
export interface ReplyCard extends Emphasis {
  rows?: Rows;
  from?: Landmark;
  enter?: Entrance;
  place?: Placement;
  size?: Size;
  ink?: Ink;
  preset?: boolean | readonly string[];
  omit?: readonly string[];
  /** Keys are display text or stable sung token IDs. A token ID takes precedence. */
  words?: Readonly<Record<string, WordStyle>>;
  /** Explicit glyph groups with no inferred syllable timing. Keys are sung token IDs. */
  syllables?: Readonly<Record<string, readonly {text: string; offsetFrames?: number}[]>>;
}
export interface PartCard extends Omit<ReplyCard, 'rows' | 'omit'> {
  rows: Exclude<Rows, 'auto'>;
  camera?: CameraCall<any>;
}
export interface LineCard extends ReplyCard {
  old?: Fate;
  reply?: ReplyCard;
  /** Further lead phrases in lyric order. The primary phrase is authored in rows. */
  parts?: readonly [] | readonly [PartCard] | readonly [PartCard, PartCard];
  camera?: CameraCall<any>;
  accents?: readonly UnitCall<any>[];
  portrait?: Partial<Omit<LineCard, 'portrait'>>;
  repeat?: 'intended';
}
export interface Line {kind: 'line'; id: string; card: LineCard}
export const line = (id: string, card: LineCard): Line => ({kind: 'line', id, card});
export type InterludeStart = {beat: number; seconds?: never} | {seconds: number; beat?: never};
export type EchoRow = Echo | (Omit<RowCard, 'text'> & {text: Echo | readonly Echo[]});
export interface InterludeCard extends Pick<LineCard, 'from' | 'enter' | 'place' | 'size' | 'ink' | 'old' | 'camera' | 'accents'> {
  rows: readonly EchoRow[];
}
export interface Interlude {kind: 'interlude'; id: string; start: InterludeStart; card: InterludeCard}
/** Start the echo entrance on a song-clock second or a zero-based beat index from the song map. */
export const interlude = (id: string, timing: {start: InterludeStart}, card: InterludeCard): Interlude =>
  ({kind: 'interlude', id, start: timing.start, card});
export interface StageBlock {
  readonly id: string;
  readonly index: number;
  readonly start?: number;
  readonly words: readonly {index: number; onset: number; end: number; sung: boolean}[];
}
export interface StageCue {
  start: number;
  frames: number;
  effect: UnitCall<any>;
}
export interface StagePlan {
  /** Per-word entrance overrides for unit entrances, in absolute frames. */
  enter?: ReadonlyMap<number, StageCue>;
  /** Explicit in-place or travelling motion after a word's entrance. */
  accents?: ReadonlyMap<number, readonly StageCue[]>;
  /** First frame of a staged retirement. Omit a word to leave it under its entrance or transform. */
  retire?: ReadonlyMap<number, Omit<StageCue, 'effect'> & {effect?: StageCue['effect']}>;
}
export type Stage = (board: Board, layout: BoardLayout, blocks: readonly StageBlock[], context: EngineContext) => StagePlan | void;

export interface WorldAttachment {
  kind: 'baseline' | 'stack' | 'edge' | 'letter';
  /** Earlier song token ID. With no target, the solver chooses one. */
  to?: string;
  /** Right/left edge for a turn, or below/above for a stack or letter. */
  side?: 'right' | 'left' | 'below' | 'above';
  /** Zero-based glyph index on the host for a letter attachment. */
  letter?: number;
}
export interface WorldWordOverride {
  attachment?: WorldAttachment;
  /** Cap height in world pixels. */
  cap?: number;
  /** Deliberately tumble the word's letters after its vocal ends. Delay is in seconds. */
  burst?: {after?: number};
  camera?: {
    /** Target fraction of frame width, subject to the height limit. */
    width?: number;
    /** Horizontal scan distance as a fraction of frame width. */
    pan?: number;
    /** Requested duration of the incoming move in frames, fitted to available time. */
    frames?: number;
    /** Request or suppress a reveal after this token, time permitting. */
    pullBack?: boolean;
  };
}
export interface WorldOptions {
  seed?: string | number;
  /** Keys are stable song token IDs. */
  words?: Readonly<Record<string, WorldWordOverride>>;
}

export interface Scene {
  kind: 'scene'; id: string; ground?: string; lines: readonly (Line | Interlude)[];
  exit?: Exit; rules?: readonly RuleDef[];
  /** Set each word once on a continuous canvas and generate the camera path. */
  world?: true | WorldOptions;
  /** Upper bound on a row's measured width in logical pixels. */
  rowWidth?: number;
  /** Motion style for the compiled board (e.g. 'crisp' for exact holds and discrete moves). */
  motionStyle?: Board['motionStyle'];
  /** Scale style for the compiled board (e.g. 'lockup' for frame-filling hero lockups). */
  scaleStyle?: Board['scaleStyle'];
  /** Timed ground-only fade to black in output seconds. */
  fadeToBlack?: Board['fadeToBlack'];
  /** Explicit layout, rig and retirement for choreography beyond the automatic scene staging. */
  stage?: Stage;
}
export const scene = (id: string, card: Omit<Scene, 'kind' | 'id'>): Scene => ({kind: 'scene', id, ...card});
export interface Raw {kind: 'raw'; id: string; build: (ctx: EngineContext) => Board[]}
export const raw = (id: string, build: Raw['build']): Raw => ({kind: 'raw', id, build});

export type Format = 'wide' | 'portrait';
export interface Edit {start: number; end: number}
export interface Film {
  song?: string;
  look?: {palette?: Partial<EngineContext['look']['palette']>; shadow?: boolean; ink?: Partial<Record<Ink, string>>};
  formats?: readonly Format[];
  scenes: readonly (Scene | Raw)[];
}
export const film = (card: Film): Film => ({formats: ['wide', 'portrait'], ...card});

function mergeCard(base: LineCard, override?: Partial<LineCard>): LineCard {
  return {...base, ...override, reply: override?.reply ? {...base.reply, ...override.reply} : base.reply,
    portrait: override?.portrait ? mergeCard(base.portrait ?? {}, override.portrait) : base.portrait};
}
export const portraitCard = (card: LineCard): LineCard => mergeCard(card, card.portrait);

export function motif(name: string, {lines}: {lines: Readonly<Record<string, Line>>},
  {occurrences}: {occurrences: Readonly<Record<number, Readonly<Record<string, Partial<LineCard>>>>>}) {
  const prefix = name + '.';
  return {occurrence(n: number): Line[] {
    if (!Number.isSafeInteger(n) || n < 1) throw new Error(`Invalid occurrence of motif ${name}: ${n}`);
    const id = (value: string) => value.startsWith(prefix) ? `${name}${n}.${value.slice(prefix.length)}` : value;
    const landmark = (from?: Landmark): Landmark | undefined => from && ('line' in from ? {...from, line: id(from.line)} : from);
    const rewritePart = (part: PartCard): PartCard => ({...part, from: landmark(part.from)});
    const rewriteParts = (parts: LineCard['parts']): LineCard['parts'] => {
      if (parts?.length === 2) return [rewritePart(parts[0]), rewritePart(parts[1])];
      if (parts?.length === 1) return [rewritePart(parts[0])];
      return parts;
    };
    const rewrite = <T extends LineCard>(card: T): T => ({...card,
      from: landmark(card.from),
      reply: card.reply && {...card.reply, from: landmark(card.reply.from)},
      parts: rewriteParts(card.parts),
      portrait: card.portrait && rewrite(card.portrait),
    });
    return Object.entries(lines).map(([key, entry]) => line(id(entry.id), rewrite(mergeCard(entry.card, occurrences[n]?.[key]))));
  }};
}
