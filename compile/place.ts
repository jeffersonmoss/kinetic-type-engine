import type {EngineContext} from '../context';
import {bounds, corners, pivotOf, rotate, unitOf} from '../effects/geometry';
import {FONT_INFO} from '../engine/config';
import {blockToWorld, layoutBlock, layoutBoard} from '../engine/layout';
import {resolveAnchor} from '../engine/letters';
import {textWidth} from '../engine/metrics';
import type {Block, Board, FrameEdge, Pt, SlideSource} from '../engine/types';
import type {Landmark} from '../score';
import {isPair, key, type BoundBlock, type BoundRow, type Run} from './bind';

export interface Located {board: Board; index: number; item: BoundBlock}
export interface Source {
  anchor: SlideSource; origin?: Located; runs?: Run[]; box?: ReturnType<typeof bounds>; baseline?: number;
  point?: Pt; angle?: number; counter?: {width: number; height: number};
}
const sides: Record<string, FrameEdge> = {L: 'left', R: 'right', T: 'top', B: 'bottom'};
const capWidth = (run: Run, cap: number) => textWidth(run.text, run.font, cap / FONT_INFO[run.font].cap);
const space = (cap: number) => FONT_INFO.anton.space * cap / FONT_INFO.anton.cap;
const rowWidth = (runs: Run[], cap: number) => runs.reduce((sum, run) => sum + capWidth(run, cap), 0) + space(cap) * (runs.length - 1);

function wrap(row: BoundRow, cap: number, max: number): BoundRow[] {
  const lines: BoundRow[] = [];
  for (let start = 0; start < row.runs.length;) {
    let end = start + 1;
    while (end < row.runs.length && rowWidth(row.runs.slice(start, end + 1), cap) <= max) end++;
    if (end < row.runs.length && end - start >= 3 && !/[.!?,;:]$/u.test(row.runs[end - 1].text)) {
      for (let i = end - 1; i > start + 1; i--) {
        if (/[.!?,;:]$/u.test(row.runs[i - 1].text)) {end = i; break;}
      }
    }
    lines.push({size: row.size, runs: row.runs.slice(start, end)});
    start = end;
  }
  return lines;
}

export function measureBlock(ctx: EngineContext, board: Board, item: BoundBlock, counter?: Source['counter']): Block {
  const floor = ctx.limits.sungMinCap;
  const max = counter ? counter.width * 0.8 : ctx.safeBox.width;
  for (const run of item.runs) {
    if (!FONT_INFO[run.font]) throw new Error(`${item.id}: unknown font "${run.font}"`);
    const missing = [...run.text].find((ch) => !/\s/u.test(ch) && !Object.hasOwn(FONT_INFO[run.font].table, ch));
    if (missing) throw new Error(`${item.id}: font ${run.font} has no measured glyph "${missing}" in "${run.text}"`);
  }
  const rows = item.auto && !counter ? item.rows.flatMap((row) => wrap(row, ctx.limits.capTiers[row.size], max)) : item.rows;
  const def: Block = {words: [item.runs[0].i, item.runs.at(-1)!.i], attach: 'FREE', cap: floor,
    rowGap: 0.04, align: 'left', rows: rows.map(({runs}) => runs.length), style: {}};
  for (const row of rows) {
    const tier = ctx.limits.capTiers[row.size];
    if (!tier) throw new Error(`${item.id}: unknown size tier "${row.size}"`);
    const required = rowWidth(row.runs, floor);
    if (required > max + 0.001) {
      const label = counter ? '80% of the measured counter' : `${ctx.format.id} safe width`;
      throw new Error(`${item.id}: row "${row.runs.map(({text}) => text).join(' ')}" needs ${required.toFixed(2)} px at the ${floor.toFixed(2)} px cap floor; ${label} allows ${max.toFixed(2)} px (shortfall ${(required - max).toFixed(2)} px)`);
    }
    const cap = Math.min(tier, floor * max / required);
    for (const run of row.runs) {
      def.style![run.i] = {text: run.text, preserveCase: true, font: run.font, scale: cap / floor,
        tier: row.size === 'hero' ? 3 : row.size === 'body' ? 1 : 2};
    }
  }
  const shape = layoutBlock(def, board.blocks.length, board);
  if (shape.h > (counter?.height ?? ctx.safeBox.height) + 0.001) {
    const allowed = counter?.height ?? ctx.safeBox.height;
    throw new Error(`${item.id}: rows need ${shape.h.toFixed(2)} px height; available ${allowed.toFixed(2)} px (shortfall ${(shape.h - allowed).toFixed(2)} px)`);
  }
  return def;
}

export function sourceOf(board: Board, from: Landmark, byId: ReadonlyMap<string, Located>): Source {
  if (from.kind === 'opening') return {anchor: {point: {x: 0, y: 0}, reason: 'scene opening'}};
  if (from.kind === 'free') {
    if (![from.point?.x, from.point?.y].every(Number.isFinite) || !from.reason?.trim()) throw new Error('free() needs a finite point and a reason');
    return {anchor: {point: from.point, reason: from.reason}, point: from.point};
  }
  if (from.kind === 'edge') {
    if (!Object.hasOwn(sides, from.side)) throw new Error(`Unknown frame edge "${from.side}"`);
    return {anchor: {edge: sides[from.side]}};
  }
  if (from.kind === 'rule') {
    const anchor = {rule: from.id};
    const layout = layoutBoard({...board});
    const {p, frameAngle} = resolveAnchor(layout, anchor, board.start);
    const def = board.rules!.find(({id}) => id === from.id)!;
    const q = rotate({x: def.length / 2, y: 0}, frameAngle);
    return {anchor, point: p, box: bounds([{x: p.x - q.x, y: p.y - q.y}, {x: p.x + q.x, y: p.y + q.y}]), baseline: p.y, angle: frameAngle};
  }
  const origin = byId.get(from.line);
  if (!origin) throw new Error(`unknown or forward landmark line "${from.line}"`);
  const layout = layoutBoard({...origin.board});
  const block = layout.blocks[origin.index];
  const world = (p: Pt) => blockToWorld(block, p);
  if (from.kind === 'row') {
    const row = block.rows[from.row === -1 ? block.rows.length - 1 : from.row - 1];
    if (!row) throw new Error(`${from.line}: unknown row ${from.row}`);
    const runs = origin.item.runs.filter(({i}) => row.words.includes(i));
    const box = bounds(corners({x: 0, y: row.y, width: row.width, height: row.h}).map(world));
    const point = world({x: 0, y: row.baseline});
    const g = layout.words.get(row.words[0])!;
    return {origin, runs, anchor: {word: g.i, offset: {x: -(g.x + g.w / 2), y: row.baseline - g.y - g.h / 2}},
      box, baseline: point.y, point, angle: block.angle};
  }
  const grouped = new Map<string, Run[]>();
  for (const run of origin.item.runs) {
    const id = run.vocal?.token.id ?? String(run.i);
    if (key(run.vocal?.token.text ?? run.text) !== key(from.text)) continue;
    const group = grouped.get(id) ?? [];
    group.push(run);
    grouped.set(id, group);
  }
  const candidates = [...grouped];
  const selected = from.nth === undefined ? candidates.length === 1 ? candidates[0] : undefined : candidates[from.nth - 1];
  if (!selected) {
    throw new Error(`${from.line}: landmark "${from.text}" ${candidates.length > 1 ? 'is ambiguous or nth is out of range' : 'does not resolve'}; candidates: ${candidates.map(([id], i) => `nth ${i + 1} = ${id}`).join(', ') || 'none'}`);
  }
  const [, runs] = selected;
  let anchor: SlideSource = {word: runs[0].i};
  if (from.kind === 'glyph') {
    const hits = runs.flatMap(({i, text}) => [...text].flatMap((ch, letter) => ch.toUpperCase() === from.glyph.toUpperCase() ? [{word: i, letter}] : []));
    if (hits.length !== 1) throw new Error(`${from.line}: glyph "${from.glyph}" in "${from.text}" has ${hits.length} matches`);
    anchor = {...hits[0], part: from.part};
  }
  const resolved = resolveAnchor(layout, anchor);
  if (from.kind === 'glyph' && (from.part === 'counter' || from.part === 'counter2') && resolved.estimated) {
    throw new Error(`${from.line}: "${from.glyph}" has no measured ${from.part}`);
  }
  const quad = from.kind === 'glyph' ? resolved.quad! : runs.flatMap(({i}) => {
    const g = layout.words.get(i)!;
    return corners({x: g.x, y: g.y, width: g.w, height: g.h}).map(world);
  });
  const g = layout.words.get(anchor.word)!;
  const counter = from.kind === 'glyph' && /^counter/u.test(from.part ?? '') ? {width: resolved.w!, height: resolved.h!} : undefined;
  return {origin, runs, anchor, point: resolved.p, box: bounds(quad), baseline: world({x: g.x, y: g.baseline}).y,
    angle: block.angle, counter};
}

export function placeBlock(ctx: EngineContext, board: Board, item: BoundBlock, source: Source): Block {
  const entrance = item.card.enter;
  const transformOverlay = isPair(entrance) && ['matchCut', 'slotRoll'].includes(entrance.name);
  const place = item.card.place ?? (transformOverlay ? 'overlay' : 'below');
  if (place === 'inside' && !source.counter) throw new Error(`${item.id}: inside requires a measured glyph counter`);
  if (!['below', 'above', 'right', 'left', 'inside', 'overlay', 'turnCW', 'turnCCW'].includes(place)) {
    throw new Error(`${item.id}: unknown placement "${place}"`);
  }
  const block = measureBlock(ctx, board, item, place === 'inside' ? source.counter : undefined);
  const shape = layoutBlock(block, board.blocks.length, board);
  const b = source.box;
  const gap = ctx.limits.sungMinCap * 0.16;
  const p = source.point ?? {x: 0, y: 0};
  const base = (source.baseline ?? p.y) - shape.rows[0].baseline;
  let at = {x: p.x, y: p.y, angle: 0};
  if (b) {
    if (place === 'below') at = {x: b.x, y: b.y + b.height + gap, angle: 0};
    if (place === 'above') at = {x: b.x, y: b.y - shape.h - gap, angle: 0};
    if (place === 'right') at = {x: b.x + b.width + gap, y: base, angle: 0};
    if (place === 'left') at = {x: b.x - shape.w - gap, y: base, angle: 0};
    if (place === 'overlay') {
      at = {x: b.x, y: base, angle: 0};
      if (transformOverlay && source.origin && typeof entrance.params.keep === 'string') {
        const prior = layoutBoard({...source.origin.board}).blocks[source.origin.index];
        const kept = (words: typeof shape.words) => {
          const glyphs = words.flatMap((word) => unitOf(word).glyphs).filter(({text}) => !/^\s$/u.test(text));
          const needle = entrance.params.keep.replace(/\s+/gu, '');
          const matches = glyphs.filter((_, i) => glyphs.slice(i, i + [...needle].length).map(({text}) => text).join('') === needle);
          return matches.length === 1 ? pivotOf(matches[0]) : undefined;
        };
        const selected = source.runs && prior.words.filter((word) => source.runs!.some(({i}) => i === word.i));
        const old = kept(selected?.length ? selected : prior.words) ?? kept(prior.words);
        const next = kept(shape.words);
        if (old && next) {
          const point = blockToWorld(prior, old);
          const offset = rotate(next, prior.angle);
          at = {x: point.x - offset.x, y: point.y - offset.y, angle: prior.angle};
        }
      }
    }
    if (place === 'inside') {
      const angle = source.angle ?? 0;
      const centre = rotate({x: shape.w / 2, y: shape.h / 2}, angle);
      at = {x: p.x - centre.x, y: p.y - centre.y, angle};
    }
  }
  if (place === 'turnCW' || place === 'turnCCW') at = {...p, angle: (source.angle ?? 0) + (place === 'turnCW' ? 90 : -90)};
  block.at = at;
  return block;
}
