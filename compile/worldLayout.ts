import type {EngineContext} from '../context';
import {bounds, corners, unitOf} from '../effects/geometry';
import type {Box} from '../effects/define';
import {CONNECTIVES, FONT_INFO} from '../engine/config';
import {layoutBlock} from '../engine/layout';
import {worldWordBox} from '../engine/worldGeometry';
import type {Block, Board, Pt, CanvasWord, WordGeom} from '../engine/types';
import {add, clamp, len, normDeg, rand, rot, sub} from '../engine/util';
import type {Ink, WorldAttachment, WorldOptions, WorldWordOverride} from '../score';
import {isUnit, key, type BoundBlock, type BoundLine, type Run} from './bind';

const shortWords = new Set([...CONNECTIVES, 'ON', 'HIS', 'HE', 'NOT', 'MORE'].map(key));
type Attachment = WorldAttachment['kind'];
const attachments: readonly Attachment[] = ['baseline', 'stack', 'edge', 'letter'];
const right = (b: Box) => b.x + b.width;
const bottom = (b: Box) => b.y + b.height;
export const centre = (b: Box): Pt => ({x: b.x + b.width / 2, y: b.y + b.height / 2});
export function boxUnion([first, ...rest]: readonly Box[]): Box {
  let {x, y} = first;
  let x1 = right(first), y1 = bottom(first);
  for (const box of rest) {
    x = Math.min(x, box.x);
    y = Math.min(y, box.y);
    x1 = Math.max(x1, right(box));
    y1 = Math.max(y1, bottom(box));
  }
  return {x, y, width: x1 - x, height: y1 - y};
}
const overlaps = (a: Box, b: Box) => Math.min(right(a), right(b)) - Math.max(a.x, b.x) > 1e-6
  && Math.min(bottom(a), bottom(b)) - Math.max(a.y, b.y) > 1e-6;

export interface WorldCue {
  item: BoundBlock;
  line: BoundLine;
  runs: Run[];
  onset: number;
  cap: number;
  small: boolean;
  override?: WorldWordOverride;
}
export interface PlacedCue extends WorldCue {
  index: number;
  local: Box;
  box: Box;
  at: Pt & {angle: number};
  words: WordGeom[];
  attachment: CanvasWord['attachment'];
  parent?: PlacedCue;
  joint?: Pt;
  glyph?: {word: number; index: number};
}


function collect(ctx: EngineContext, lines: readonly BoundLine[], options: WorldOptions): WorldCue[] {
  const cues: WorldCue[] = [];
  for (const line of lines) for (const item of line.blocks) {
    const entrance = item.card.enter;
    const cascade = isUnit(entrance) ? entrance.cascade : undefined;
    const gap = item.start === undefined ? 0 : cascade?.gap ?? Math.round(ctx.fps * 0.24);
    const blockCues = new Map<string, WorldCue>();
    let tick = 0;
    for (const [rowIndex, {runs, size}] of item.rows.entries()) for (const run of runs) {
      const {vocal} = run;
      const id = vocal?.token.id ?? String(run.i);
      const existing = blockCues.get(id);
      if (existing) {
        existing.runs.push(run);
        continue;
      }
      const override = vocal && Object.hasOwn(options.words ?? {}, id) ? options.words![id] : undefined;
      const small = !!vocal && shortWords.has(key(vocal.token.text));
      const seconds = vocal ? (vocal.end - vocal.onset) / ctx.fps : 0;
      const stress = vocal?.syllables?.some(({stress}) => stress === 1) ? 1.1 : 1;
      const base = typeof size === 'number' ? size : ctx.limits.capTiers[size];
      const cap = override?.cap ?? (vocal
        ? base * clamp(Math.sqrt(seconds / 0.36), 0.7, 1.5) * (small ? 0.58 : stress)
        : base);
      if (!Number.isFinite(cap) || cap <= 0) throw new Error(`${item.id}: invalid world cap for "${run.text}"`);
      const onset = vocal?.onset ?? (item.start !== undefined
        ? item.start + gap * (cascade?.by === 'row' ? rowIndex : tick)
        : (item.runs.slice(0, item.runs.indexOf(run)).reverse().find((prior) => prior.vocal) ?? item.runs.find((next) => next.vocal))!.vocal!.onset);
      blockCues.set(id, {item, line, runs: [run], onset, cap, small, override});
      tick++;
    }
    cues.push(...blockCues.values());
  }
  return cues.sort((a, b) => a.onset - b.onset || a.runs[0].i - b.runs[0].i);
}

type Candidate = Pick<PlacedCue, 'at' | 'attachment' | 'joint' | 'glyph' | 'box'>;
function candidates(host: PlacedCue, shape: Box, baseline: number, cap: number, kind: Attachment, spec?: WorldAttachment): Candidate[] {
  const p = host.local;
  const gap = clamp(Math.min(cap, host.cap) * 0.085, 2, 16);
  // Build in the parent's reading axes. A rotated rectangle is aligned by its bounds.
  const result: Candidate[] = [];
  const put = (x: number, y: number, turn: number, joint: Pt, glyph?: Candidate['glyph']) => {
    const rotated = bounds(corners(shape).map((q) => rot(q, turn)));
    const origin = add(host.at, rot({x: x - rotated.x, y: y - rotated.y}, host.at.angle));
    const angle = normDeg(host.at.angle + turn);
    const at = {...origin, angle};
    result.push({at, box: bounds(corners(shape).map((q) => add(at, rot(q, angle)))),
      attachment: kind, joint: add(host.at, rot(joint, host.at.angle)), glyph});
  };
  if (kind === 'baseline') {
    const y = host.words[0].baseline;
    put(right(p) + gap, y + shape.y - baseline, 0, {x: right(p), y});
  }
  if (kind === 'stack') {
    if (!spec?.side || spec.side === 'below') put(p.x, bottom(p) + gap, 0, {x: p.x, y: bottom(p)});
    if (!spec?.side || spec.side === 'above') put(p.x, p.y - shape.height - gap, 0, {x: p.x, y: p.y});
  }
  if (kind === 'edge') {
    for (const side of ['right', 'left'] as const) {
      if (spec?.side && side !== spec.side) continue;
      const x = side === 'right' ? right(p) : p.x;
      for (const turn of [90, -90]) for (const y of [p.y, bottom(p) - shape.width]) {
        put(x + (side === 'right' ? gap : -gap - shape.height), y, turn, {x, y: clamp(y, p.y, bottom(p))});
      }
    }
  }
  if (kind === 'letter') {
    const glyphs = host.words.flatMap((word) => unitOf(word).glyphs);
    for (const [index, glyph] of glyphs.entries()) {
      if (!/[\p{L}\p{N}]/u.test(glyph.text) || (spec?.letter !== undefined && spec.letter !== index)) continue;
      if (!spec && (cap > host.cap * 0.72 || shape.width > glyph.box.width * 1.55)) continue;
      const x = centre(glyph.box).x;
      const mark = {word: glyph.word, index: glyph.index};
      if (!spec?.side || spec.side === 'below') put(x - shape.width / 2, bottom(p) + gap, 0, {x, y: bottom(p)}, mark);
      if (!spec?.side || spec.side === 'above') put(x - shape.width / 2, p.y - shape.height - gap, 0, {x, y: p.y}, mark);
    }
  }
  return result;
}

export function layoutWorld(ctx: EngineContext, board: Board, lines: readonly BoundLine[], ink: Readonly<Record<Ink, string>>,
  options: WorldOptions): PlacedCue[] {
  const cues = collect(ctx, lines, options);
  const placed: PlacedCue[] = [];
  const ids = new Map<string, PlacedCue>();
  const activeTokens = new Set(cues.flatMap(({runs}) => runs[0].vocal ? [runs[0].vocal.token.id] : []));
  // An edit may omit a token with an override. The caller validates keys against the full song.
  const lineAngles = new Map<BoundLine, Set<number>>();
  let envelope: Box | undefined;
  for (const [index, cue] of cues.entries()) {
    const {runs, cap, override, line} = cue;
    for (const {font, text} of runs) {
      if (!FONT_INFO[font]) throw new Error(`${cue.item.id}: unknown font "${font}"`);
      const missing = [...text].find((ch) => !/\s/u.test(ch) && !Object.hasOwn(FONT_INFO[font].table, ch));
      if (missing) throw new Error(`${cue.item.id}: font ${font} has no measured glyph "${missing}" in "${text}"`);
    }
    const def: Block = {words: [runs[0].i, runs.at(-1)!.i], attach: 'NEW', cap,
      style: Object.fromEntries(runs.map(({i, text, font, ink: role}) => [i,
        {text, font, colour: ink[role], preserveCase: true, tier: 2}]))};
    if (def.words[1] - def.words[0] + 1 !== runs.length) {
      throw new Error(`${cue.item.id}: split world token "${runs[0].vocal?.token.text}" must have contiguous display words`);
    }
    const geometry = layoutBlock(def, index, board);
    const local = boxUnion(geometry.words.map(worldWordBox));
    const previous = placed.at(-1);
    const authoredAttachment = override?.attachment;
    const spec = authoredAttachment?.to && !activeTokens.has(authoredAttachment.to) ? undefined : authoredAttachment;
    let chosen: Candidate = {at: {x: 0, y: 0, angle: 0}, box: local, attachment: 'root'};
    let parent: PlacedCue | undefined;
    if (previous) {
      const oldVocal = previous.runs[0].vocal;
      const newVocal = runs[0].vocal;
      const angles = lineAngles.get(line);
      const firstOfLine = !!newVocal && !angles;
      const lastInLine = !!newVocal && !cues.slice(index + 1).some((next) => next.line === line && next.runs[0].vocal);
      const simultaneous = cue.onset === previous.onset && !!oldVocal && !!newVocal;
      const forceTurn = !spec && !simultaneous && (firstOfLine || (lastInLine && angles?.size === 1));
      const phraseTurn = !!newVocal && cue.item !== previous.item
        && cue.onset - (oldVocal?.end ?? previous.onset) >= Math.round(ctx.fps * 0.17);
      const nest = cue.small && previous.cap >= cap * 1.6 && rand(options.seed ?? board.id!, index, 'nest') < 0.8;
      const preferTurn = phraseTurn || nest;
      const prior = placed.at(-2);
      const repeat = prior?.attachment === previous.attachment ? previous.attachment : undefined;
      const target = spec?.to ? ids.get(spec.to) : undefined;
      if (spec?.to && !target && activeTokens.has(spec.to)) throw new Error(`${line.id}: world attachment must name an earlier token (${spec.to})`);
      let best = Infinity;
      const worldCentre = centre(envelope!);
      const parentPool = target ? [target] : placed;
      const scale = Math.max(90, previous.cap, cap);
      const sameRow = cue.item === previous.item && cue.item.rows.some(({runs: row}) =>
        row.includes(runs[0]) && row.includes(previous.runs[0]));
      for (const host of parentPool) for (const kind of spec ? [spec.kind] : attachments) {
        if (!spec && kind === repeat) continue;
        for (const candidate of candidates(host, local, geometry.words[0].baseline, cap, kind, spec)) {
          const turn = candidate.at.angle !== previous.at.angle;
          if (forceTurn && (!turn || angles?.has(candidate.at.angle))) continue;
          if (!spec && simultaneous && turn) continue;
          const combined = boxUnion([envelope!, candidate.box]);
          const area = Math.sqrt(combined.width * combined.height);
          const travel = len(sub(centre(candidate.box), centre(previous.box)));
          const distance = len(sub(centre(candidate.box), worldCentre));
          const score = (area + 0.32 * Math.max(combined.width, combined.height) + 0.18 * distance + 0.43 * travel) / scale
            + (preferTurn ? (turn ? 0 : 2.5) : (turn ? 2.4 : 0))
            + (cue.small && kind === 'letter' ? -0.9 : 0)
            + (host === previous ? -1.15 : 0)
            + (sameRow && kind === 'baseline' && host === previous ? -1.7 : 0)
            + 0.19 * rand(options.seed ?? board.id!, index, host.index, kind, candidate.at.x, candidate.at.y);
          if (score < best && !placed.some(({box}) => overlaps(box, candidate.box))) {
            best = score;
            chosen = candidate;
            parent = host;
          }
        }
      }
      if (!parent) throw new Error(`${line.id}: no collision-free ${spec?.kind ?? 'world'} attachment for "${runs[0].text}"`);
    } else if (spec) {
      throw new Error(`${line.id}: the first world word has no earlier attachment host`);
    }
    def.at = chosen.at;
    const item: PlacedCue = {...cue, ...chosen, index, local, words: geometry.words, parent};
    placed.push(item);
    envelope = envelope ? boxUnion([envelope, item.box]) : item.box;
    if (runs[0].vocal) {
      ids.set(runs[0].vocal.token.id, item);
      const angles = lineAngles.get(line) ?? new Set<number>();
      angles.add(item.at.angle);
      lineAngles.set(line, angles);
    }
    board.blocks.push(def);
  }
  return placed;
}
