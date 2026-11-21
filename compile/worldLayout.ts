import type {EngineContext} from '../context';
import {bounds, corners, unitOf} from '../effects/geometry';
import type {Box} from '../effects/define';
import {CONNECTIVES, FONT_INFO} from '../engine/config';
import {blockToWorld, layoutBlock} from '../engine/layout';
import {hasCounter, letterBoxes, partOfBox} from '../engine/letters';
import {worldWordBox} from '../engine/worldGeometry';
import {WORLD_DEFAULTS, computeSongRate, isWorldAngle, type SongWordRate} from '../engine/worldSettings';
import type {Block, Board, CanvasWord, Pt, WordGeom} from '../engine/types';
import {add, clamp, len, normDeg, polysOverlap, rand, rot, sub} from '../engine/util';
import type {Ink, WorldAttachment, WorldOptions, WorldWordOverride} from '../score';
import {key, type BoundBlock, type BoundLine, type Run} from './bind';

const shortWords = new Set([...CONNECTIVES, 'ON', 'HIS', 'HE', 'NOT', 'MORE', 'THE', 'FOR', 'A', 'IN', 'TO', 'OF'].map(key));
type Attachment = WorldAttachment['kind'];
const defaultAttachments: readonly Attachment[] = ['baseline', 'stack', 'edge', 'letter', 'counter', 'anchor'];

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

export interface WorldCue {
  /** Stable identifier: song token ID for sung words, or `${interludeId}.echo-${k}` for echoes. */
  id: string;
  item: BoundBlock;
  line: BoundLine;
  runs: Run[];
  /** Number of runs per row when a hyphenated token is intentionally split across rows (e.g. TWENTY- / FOUR!). */
  rowCounts: number[];
  onset: number;
  cap: number;
  small: boolean;
  hero: boolean;
  phrase: number;
  override?: WorldWordOverride;
}

export interface PlacedCue extends WorldCue {
  index: number;
  local: Box;
  box: Box;
  /** Exact oriented 4-vertex polygon in world space (accurate for 45° and 135° angles). */
  quad: Pt[];
  at: Pt & {angle: number};
  words: WordGeom[];
  attachment: CanvasWord['attachment'];
  parent?: PlacedCue;
  joint?: Pt;
  glyph?: {word: number; index: number};
  counterHost?: {word: number; index: number; box: Box};
}

function collect(ctx: EngineContext, lines: readonly BoundLine[], options: WorldOptions): {cues: WorldCue[]; rate: SongWordRate} {
  const cues: WorldCue[] = [];
  for (const line of lines) for (const item of line.blocks) {
    const gap = item.start === undefined ? 0 : Math.round(ctx.fps * 0.62);
    const blockCues = new Map<string, WorldCue & {lastRow: number}>();
    let tick = 0;
    for (const [rowIndex, {runs, size}] of item.rows.entries()) for (const run of runs) {
      const {vocal} = run;
      const id = vocal?.token.id ?? `${item.id}.echo-${tick + 1}`;
      const existing = blockCues.get(id);
      if (existing) {
        existing.runs.push(run);
        if (existing.lastRow === rowIndex) existing.rowCounts[existing.rowCounts.length - 1]++;
        else {
          existing.rowCounts.push(1);
          existing.lastRow = rowIndex;
        }
        continue;
      }
      const override = Object.hasOwn(options.words ?? {}, id) ? options.words![id] : undefined;
      const text = vocal?.token.text ?? run.text;
      const small = shortWords.has(key(text));
      const seconds = vocal ? (vocal.end - vocal.onset) / ctx.fps : 0;
      const stress = vocal?.syllables?.some(({stress}) => stress === 1) ? 1.08 : 1;
      const base = typeof size === 'number' ? size : ctx.limits.capTiers[size];
      const hero = size === 'hero' || base >= 170;
      // Scale contrast: connectors default compact (3:1 against hero words per survey/craft) unless explicitly overridden.
      const defaultCap = vocal
        ? small
          ? Math.min(base * 0.56, 78)
          : base * clamp(Math.sqrt(seconds / 0.40), 0.78, 1.28) * stress
        : base;
      const cap = override?.cap ?? defaultCap;
      if (!Number.isFinite(cap) || cap <= 0) throw new Error(`${item.id}: [world-cap] invalid world cap for "${run.text}"`);
      const onset = vocal?.onset ?? (item.echoFrames?.[rowIndex] ?? (item.start !== undefined
        ? item.start + gap * tick
        : (item.runs.slice(0, item.runs.indexOf(run)).reverse().find((prior) => prior.vocal) ?? item.runs.find((next) => next.vocal))!.vocal!.onset));
      blockCues.set(id, {id, item, line, runs: [run], rowCounts: [1], lastRow: rowIndex, onset, cap, small, hero, phrase: 0, override});
      tick++;
    }
    for (const {lastRow: _, ...cue} of blockCues.values()) cues.push(cue);
  }
  cues.sort((a, b) => a.onset - b.onset || a.runs[0].i - b.runs[0].i);
  const sungTimings = cues.flatMap(({runs}) => runs[0].vocal ? [{onset: runs[0].vocal.onset, end: runs[0].vocal.end}] : []);
  const rate = computeSongRate(sungTimings, ctx.fps);
  const splitFrames = Math.round(rate.phraseThreshold_s * ctx.fps);
  let phrase = 0;
  let wordsInPhrase = 0;
  for (let i = 0; i < cues.length; i++) {
    if (i > 0) {
      const prev = cues[i - 1], cur = cues[i];
      const prevVocal = prev.runs[0].vocal, curVocal = cur.runs[0].vocal;
      const gapFrames = cur.onset - (prevVocal?.end ?? prev.onset);
      const voiceChanged = !!prevVocal !== !!curVocal || prev.item.reply !== cur.item.reply || prev.line !== cur.line;
      const clusterFull = wordsInPhrase >= 4;
      if (voiceChanged || gapFrames >= splitFrames || clusterFull) {
        phrase++;
        wordsInPhrase = 0;
      }
    }
    cues[i].phrase = phrase;
    wordsInPhrase++;
  }
  return {cues, rate};
}

function buildBlockDef(cue: WorldCue, cap: number, ink: Readonly<Record<Ink, string>>): Block {
  const {runs, override, rowCounts} = cue;
  return {
    words: [runs[0].i, runs.at(-1)!.i],
    attach: 'NEW',
    cap,
    ...(rowCounts.length > 1 ? {rows: rowCounts, rowGap: 0.06} : {}),
    style: Object.fromEntries(runs.map(({i, text, font, ink: role}) => {
      const chosenFont = override?.font ?? font;
      const chosenInk = override?.ink ?? role;
      const chosenText = override?.case === 'mixed' ? text : override?.case === 'upper' ? text.toUpperCase() : text;
      return [i, {text: chosenText, font: chosenFont, colour: ink[chosenInk], preserveCase: true, tier: 2}];
    })),
  };
}

interface Candidate {
  at: Pt & {angle: number};
  box: Box;
  quad: Pt[];
  attachment: CanvasWord['attachment'];
  joint?: Pt;
  glyph?: {word: number; index: number};
  counterHost?: {word: number; index: number; box: Box};
  adjustedCap?: number;
  adjustedLocal?: Box;
  adjustedWords?: WordGeom[];
  adjustedDef?: Block;
}

function quadsCollide(a: Pt[], b: Pt[], minGap = 0): boolean {
  return polysOverlap(a, b, -minGap);
}

function candidates(
  host: PlacedCue,
  cue: WorldCue,
  def: Block,
  geometry: ReturnType<typeof layoutBlock>,
  shape: Box,
  cap: number,
  kind: Attachment,
  spec: WorldAttachment | undefined,
  envelope: Box,
  board: Board,
  index: number,
  ink: Readonly<Record<Ink, string>>,
): Candidate[] {
  const p = host.local;
  const gap = clamp(Math.min(cap, host.cap) * 0.075, 2, 14);
  const wordSpace = clamp(Math.min(cap, host.cap) * 0.14, 4, 22);
  const baseline = geometry.words[0].baseline;
  const result: Candidate[] = [];

  const put = (
    x: number,
    y: number,
    turn: number,
    joint: Pt,
    attachment: CanvasWord['attachment'],
    extra?: Partial<Pick<Candidate, 'glyph' | 'counterHost' | 'adjustedCap' | 'adjustedLocal' | 'adjustedWords' | 'adjustedDef'>>,
  ) => {
    if (!isWorldAngle(turn)) return;
    const useShape = extra?.adjustedLocal ?? shape;
    const rotated = bounds(corners(useShape).map((q) => rot(q, turn)));
    const origin = add(host.at, rot({x: x - rotated.x, y: y - rotated.y}, host.at.angle));
    const angle = normDeg(host.at.angle + turn);
    const at = {...origin, angle};
    const quad = corners(useShape).map((q) => add(at, rot(q, angle)));
    result.push({
      at,
      quad,
      box: bounds(quad),
      attachment,
      joint: add(host.at, rot(joint, host.at.angle)),
      ...extra,
    });
  };

  if (kind === 'baseline') {
    // Strictly forward (to the right along reading baseline), preventing backwards reading order.
    const y = host.words[0].baseline;
    put(right(p) + wordSpace, y + shape.y - baseline, 0, {x: right(p), y}, 'baseline');
  }

  if (kind === 'stack') {
    const stackSpec = spec?.kind === 'stack' ? spec : undefined;
    const sides: ('below' | 'above')[] = stackSpec?.side ? [stackSpec.side] : ['below', 'above'];
    const aligns: ('left' | 'right' | 'center')[] = stackSpec?.align ? [stackSpec.align] : ['left', 'center', 'right'];
    for (const side of sides) {
      const y = side === 'below' ? bottom(p) + gap : p.y - shape.height - gap;
      const jy = side === 'below' ? bottom(p) : p.y;
      for (const align of aligns) {
        const x = align === 'left' ? p.x : align === 'right' ? right(p) - shape.width : p.x + (p.width - shape.width) / 2;
        put(x, y, 0, {x: clamp(x + shape.width / 2, p.x, right(p)), y: jy}, 'stack');
      }
    }
  }

  if (kind === 'edge') {
    const edgeSpec = spec?.kind === 'edge' ? spec : undefined;
    const sides: ('right' | 'left' | 'top' | 'bottom')[] = edgeSpec?.side
      ? [edgeSpec.side]
      : ['right', 'bottom', 'top', 'left'];
    // Survey + Jefferson: 90° most common, 45° allowed and expressive; 135°/180° only if explicitly authored or needed.
    const turns = edgeSpec?.turn !== undefined ? [edgeSpec.turn] : [90, -90, 45, -45];
    for (const side of sides) {
      for (const turn of turns) {
        const rotBox = bounds(corners(shape).map((q) => rot(q, turn)));
        if (side === 'right' || side === 'left') {
          const edgeX = side === 'right' ? right(p) : p.x;
          const x = side === 'right' ? edgeX + gap : edgeX - gap - rotBox.width;
          for (const y of [p.y, bottom(p) - rotBox.height, p.y + (p.height - rotBox.height) / 2]) {
            put(x, y, turn, {x: edgeX, y: clamp(y + rotBox.height / 2, p.y, bottom(p))}, 'edge');
          }
        } else {
          const edgeY = side === 'bottom' ? bottom(p) : p.y;
          const y = side === 'bottom' ? edgeY + gap : edgeY - gap - rotBox.height;
          for (const x of [p.x, right(p) - rotBox.width, p.x + (p.width - rotBox.width) / 2]) {
            put(x, y, turn, {x: clamp(x + rotBox.width / 2, p.x, right(p)), y: edgeY}, 'edge');
          }
        }
      }
    }
  }

  if (kind === 'letter') {
    const letterSpec = spec?.kind === 'letter' ? spec : undefined;
    const glyphs = host.words.flatMap((word) => unitOf(word).glyphs);
    for (const [gi, glyph] of glyphs.entries()) {
      if (!/[\p{L}\p{N}]/u.test(glyph.text) || (letterSpec?.letter !== undefined && letterSpec.letter !== gi)) continue;
      if (!letterSpec && (cap > host.cap * 0.78 || shape.width > glyph.box.width * 2.2)) continue;
      const x = centre(glyph.box).x;
      const mark = {word: glyph.word, index: glyph.index};
      if (!letterSpec?.side || letterSpec.side === 'below') put(x - shape.width / 2, bottom(p) + gap, 0, {x, y: bottom(p)}, 'letter', {glyph: mark});
      if (!letterSpec?.side || letterSpec.side === 'above') put(x - shape.width / 2, p.y - shape.height - gap, 0, {x, y: p.y}, 'letter', {glyph: mark});
    }
  }

  if (kind === 'counter') {
    const counterSpec = spec?.kind === 'counter' ? spec : undefined;
    let globalLetter = 0;
    for (const word of host.words) {
      const boxes = letterBoxes(word);
      for (const lb of boxes) {
        const idx = globalLetter++;
        if (counterSpec?.letter !== undefined && counterSpec.letter !== idx) continue;
        if (!hasCounter(word.font, lb.ch)) continue;
        const la = partOfBox(lb, 'counter', lb.ch, word.font);
        if (la.estimated || !la.box) continue;
        const maxW = la.box.w * 0.80;
        const maxH = la.box.h * 0.80;
        if (maxW < 4 || maxH < 4) continue;
        let useCap = cap;
        let useDef = def;
        let useGeom = geometry;
        let useShape = shape;
        const scaleFit = Math.min(maxW / shape.width, maxH / shape.height);
        if (scaleFit < 1) {
          if (cue.override?.cap !== undefined) {
            if (counterSpec) {
              throw new Error(`${cue.item.id}: [world-counter-fit] "${cue.runs[0].text}" cap ${cap}px is too large for counter "${lb.ch}" in "${word.text}" (needs <= ${(cap * scaleFit).toFixed(1)}px)`);
            }
            continue;
          }
          useCap = cap * scaleFit * 0.94;
          if (useCap < 6) continue;
          useDef = buildBlockDef(cue, useCap, ink);
          useGeom = layoutBlock(useDef, index, board);
          useShape = boxUnion(useGeom.words.map(worldWordBox));
        }
        const cx = la.box.x + la.box.w / 2;
        const cy = la.box.y + la.box.h / 2;
        const x = cx - useShape.width / 2;
        const y = cy - useShape.height / 2;
        const counterBox: Box = {x: la.box.x, y: la.box.y, width: la.box.w, height: la.box.h};
        put(x, y, 0, {x: cx, y: cy}, 'counter', {
          glyph: {word: word.i, index: lb.k},
          counterHost: {word: word.i, index: lb.k, box: counterBox},
          adjustedCap: useCap,
          adjustedLocal: useShape,
          adjustedWords: useGeom.words,
          adjustedDef: useDef,
        });
      }
    }
  }

  if (kind === 'anchor') {
    const anchorSpec = spec?.kind === 'anchor' ? spec : undefined;
    const dirs: ('right' | 'below' | 'above' | 'diagonal')[] = anchorSpec?.direction
      ? [anchorSpec.direction]
      : ['right', 'below', 'above', 'diagonal'];
    const turns = anchorSpec?.turn !== undefined ? [anchorSpec.turn] : [0, -90, 90, 45];
    const pad = Math.max(48, cap * 0.55);
    const ec = centre(envelope);
    for (const dir of dirs) {
      for (const turn of turns) {
        if (!isWorldAngle(turn)) continue;
        const rotBox = bounds(corners(shape).map((q) => rot(q, turn)));
        let wx = ec.x, wy = ec.y;
        if (dir === 'right') { wx = right(envelope) + pad; wy = ec.y - rotBox.height / 2; }
        else if (dir === 'below') { wx = ec.x - rotBox.width / 2; wy = bottom(envelope) + pad; }
        else if (dir === 'above') { wx = ec.x - rotBox.width / 2; wy = envelope.y - pad - rotBox.height; }
        else { wx = right(envelope) + pad * 0.7; wy = bottom(envelope) + pad * 0.7; }
        const at = {x: wx - rotBox.x, y: wy - rotBox.y, angle: normDeg(turn)};
        const quad = corners(shape).map((q) => add(at, rot(q, at.angle)));
        result.push({at, quad, box: bounds(quad), attachment: 'anchor', joint: {x: wx, y: wy}});
      }
    }
  }

  return result;
}

export function layoutWorld(
  ctx: EngineContext,
  board: Board,
  lines: readonly BoundLine[],
  ink: Readonly<Record<Ink, string>>,
  options: WorldOptions,
): {placed: PlacedCue[]; rate: SongWordRate} {
  const {cues, rate} = collect(ctx, lines, options);
  const placed: PlacedCue[] = [];
  const ids = new Map<string, PlacedCue>();
  const activeIds = new Set(cues.map(({id}) => id));
  const targetTurnRate = options.mode === 'climax'
    ? WORLD_DEFAULTS.turnRates.climaxPerWord
    : WORLD_DEFAULTS.turnRates.normalPerWord;
  const targetAspect = ctx.format.width / ctx.format.height;
  let envelope: Box | undefined;
  let turnsSoFar = 0;
  let sungSoFar = 0;

  for (const [index, cue] of cues.entries()) {
    const {runs, cap, override, line} = cue;
    for (const {font, text} of runs) {
      const f = override?.font ?? font;
      if (!FONT_INFO[f]) throw new Error(`${cue.item.id}: unknown font "${f}"`);
      const missing = [...text].find((ch) => !/\s/u.test(ch) && !Object.hasOwn(FONT_INFO[f].table, ch));
      if (missing) throw new Error(`${cue.item.id}: font ${f} has no measured glyph "${missing}" in "${text}"`);
    }
    if (runs.at(-1)!.i - runs[0].i + 1 !== runs.length) {
      throw new Error(`${cue.item.id}: split world token "${runs[0].vocal?.token.text}" must have contiguous display words`);
    }
    let def = buildBlockDef(cue, cap, ink);
    let geometry = layoutBlock(def, index, board);
    let local = boxUnion(geometry.words.map(worldWordBox));
    const previous = placed.at(-1);
    const authoredAttachment = override?.attachment;
    const spec = authoredAttachment && 'to' in authoredAttachment && authoredAttachment.to && !activeIds.has(authoredAttachment.to)
      ? undefined
      : authoredAttachment;

    let chosen: Candidate = {
      at: {x: 0, y: 0, angle: 0},
      box: local,
      quad: corners(local),
      attachment: 'root',
    };
    let parent: PlacedCue | undefined;

    if (previous) {
      const newPhrase = cue.phrase !== previous.phrase;
      const simultaneous = cue.onset === previous.onset && !!previous.runs[0].vocal && !!runs[0].vocal;
      // Tempo-scaled turn cadence: trigger a solver turn only at phrase boundaries when actual turn density trails the survey rate.
      const expectedTurns = (sungSoFar + 1) * targetTurnRate;
      const prevWasTurn = placed.length >= 2 && placed.at(-1)!.at.angle !== placed.at(-2)!.at.angle;
      const wantTurn = !spec && !simultaneous && newPhrase && !prevWasTurn && turnsSoFar + 0.35 < expectedTurns;
      const targetId = spec && 'to' in spec ? spec.to : undefined;
      const target = targetId ? ids.get(targetId) : undefined;
      if (targetId && !target && activeIds.has(targetId)) {
        throw new Error(`${line.id}: [world-attachment] world attachment must name an earlier word (${targetId})`);
      }

      const kinds: readonly Attachment[] = spec ? [spec.kind] : defaultAttachments;
      const isAnchor = spec?.kind === 'anchor';
      // Adjacency routing: prefer immediate predecessor (or recent phrase words) to avoid camera collision jumps.
      const parentPool = target
        ? [target]
        : isAnchor
          ? [previous]
          : placed.slice(Math.max(0, placed.length - 6)).reverse();
      const worldCentre = centre(envelope!);
      const scale = Math.max(90, previous.cap, cap);
      const sameRow = cue.item === previous.item && cue.item.rows.some(({runs: row}) =>
        row.includes(runs[0]) && row.includes(previous.runs[0]));
      const samePhrase = cue.phrase === previous.phrase;
      const prior = placed.at(-2);
      const repeatedKind = prior?.attachment === previous.attachment ? previous.attachment : undefined;

      const evaluatePool = (pool: readonly PlacedCue[], allowRepeat: boolean) => {
        let best = Infinity;
        let bestCand: Candidate | undefined;
        let bestHost: PlacedCue | undefined;
        for (const host of pool) for (const kind of kinds) {
          if (!spec && !allowRepeat && kind === repeatedKind && kind !== 'stack' && kind !== 'baseline') continue;
          // Survey weights bias solver choices cleanly: baseline ~41%, stack ~43%, edge ~8%, anchor ~7%, letter/counter ~2%.
          if (!spec && kind === 'anchor' && !newPhrase) continue;
          if (!spec && kind === 'counter' && !cue.small) continue;
          for (const candidate of candidates(host, cue, def, geometry, local, cap, kind, spec, envelope!, board, index, ink)) {
            const deltaAngle = Math.abs(normDeg(candidate.at.angle - previous.at.angle));
            const isTurn = deltaAngle > 1e-6;
            if (!spec && simultaneous && isTurn) continue;
            // Exact oriented polygon collision check (exempting only host when nested inside a measured counter).
            const pad = Math.min(2, gapFor(cap, host.cap) * 0.25);
            const collides = placed.some((other) => {
              if (candidate.counterHost && other === host) return false;
              return quadsCollide(other.quad, candidate.quad, pad);
            });
            if (collides) continue;

            const combined = boxUnion([envelope!, candidate.box]);
            const area = Math.sqrt(combined.width * combined.height);
            const aspectPenalty = Math.abs(Math.log((combined.width / Math.max(1, combined.height)) / targetAspect)) * 1.15;
            const travel = len(sub(centre(candidate.box), centre(previous.box)));
            const distance = len(sub(centre(candidate.box), worldCentre));

            // Survey-proportional attachment priors
            let kindBias = 0;
            if (!spec) {
              if (kind === 'baseline') kindBias = sameRow ? -1.85 : samePhrase ? -0.95 : -0.35;
              else if (kind === 'stack') kindBias = samePhrase ? -1.05 : -0.65;
              else if (kind === 'edge') kindBias = wantTurn ? -1.4 : 1.8;
              else if (kind === 'letter') kindBias = cue.small ? -0.7 : 0.8;
              else if (kind === 'counter') kindBias = cue.small ? -0.5 : 3.0;
              else if (kind === 'anchor') kindBias = newPhrase ? 0.5 : 3.0;
            }
            // Turn preference: 90° most common, 45° secondary, 135°/180° rare unless authored.
            // Within the same phrase, strongly preserve reading orientation so phrase lockups stay coherent.
            let turnBias = 0;
            if (!spec) {
              if (wantTurn) {
                turnBias = !isTurn ? 2.4 : Math.abs(deltaAngle - 90) < 1 ? -0.8 : Math.abs(deltaAngle - 45) < 1 ? -0.2 : 1.6;
              } else {
                turnBias = isTurn ? (samePhrase ? 5.5 : 2.2) : 0;
              }
            }
            const hostBias = host === previous ? -1.85 : host.phrase === cue.phrase ? -0.85 : 0.7;
            const score = (area + 0.28 * Math.max(combined.width, combined.height) + 0.16 * distance + 0.46 * travel) / scale
              + aspectPenalty
              + kindBias
              + turnBias
              + hostBias
              + 0.14 * rand(options.seed ?? board.id!, index, host.index, kind, Math.round(candidate.at.x), Math.round(candidate.at.y));
            if (score < best) {
              best = score;
              bestCand = candidate;
              bestHost = host;
            }
          }
        }
        return bestCand && bestHost ? {bestCand, bestHost} : undefined;
      };

      const found = evaluatePool(parentPool, false)
        ?? (!target ? evaluatePool([...placed].reverse(), true) : undefined);
      if (!found) {
        throw new Error(`${line.id}: [world-layout] no collision-free ${spec?.kind ?? 'world'} attachment for "${runs[0].text}"`);
      }
      chosen = found.bestCand;
      parent = found.bestHost;
      if (chosen.adjustedDef && chosen.adjustedLocal && chosen.adjustedWords) {
        def = chosen.adjustedDef;
        local = chosen.adjustedLocal;
        geometry = {...geometry, words: chosen.adjustedWords};
      }
      if (Math.abs(normDeg(chosen.at.angle - previous.at.angle)) > 1e-6) turnsSoFar++;
    } else if (spec && spec.kind !== 'anchor') {
      throw new Error(`${line.id}: [world-attachment] the first world word has no earlier attachment host`);
    } else if (spec?.kind === 'anchor' && spec.turn) {
      const angle = normDeg(spec.turn);
      const quad = corners(local).map((q) => rot(q, angle));
      chosen = {at: {x: 0, y: 0, angle}, box: bounds(quad), quad, attachment: 'root'};
    }

    if (!isWorldAngle(chosen.at.angle)) {
      throw new Error(`${line.id}: [world-angle] "${runs[0].text}" resolved to illegal angle ${chosen.at.angle}°`);
    }

    def.at = chosen.at;
    const placedCue: PlacedCue = {
      ...cue,
      cap: chosen.adjustedCap ?? cap,
      at: chosen.at,
      box: chosen.box,
      quad: chosen.quad,
      attachment: chosen.attachment,
      joint: chosen.joint,
      glyph: chosen.glyph,
      counterHost: chosen.counterHost,
      index,
      local,
      words: geometry.words,
      parent,
    };
    placed.push(placedCue);
    envelope = envelope ? boxUnion([envelope, placedCue.box]) : placedCue.box;
    ids.set(cue.id, placedCue);
    if (runs[0].vocal) sungSoFar++;
    board.blocks.push(def);
  }
  return {placed, rate};
}

function gapFor(a: number, b: number) {
  return clamp(Math.min(a, b) * 0.075, 2, 14);
}
