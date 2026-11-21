import {camForBlock, toScreen} from './camera';
import {FORMAT, FPS, HEIGHT, PALETTE, SAFE_BOX, WIDTH} from './config';
import {groundAt} from './ground';
import {blockToWorld, layoutBoard} from './layout';
import {VISIBLE_THRESHOLD} from './motion';
import type {Board, BoardLayout, CameraState, Pt, WordGeom} from './types';
import {clipConvex, polyArea, polysOverlap, rot} from './util';
import {projectTurn} from './turn3d';
import type {WordMod} from './verbRegistry';
import {boardActive, boardCues, verbFor, wordStateAt} from './wordState';

export interface ReadingGlyph {index: number; ch: string; opacity: number; cap: number; quad: Pt[]}
function quad(x: number, y: number, w: number, h: number): Pt[] {
  return [{x, y}, {x: x + w, y}, {x: x + w, y: y + h}, {x, y: y + h}];
}
function transform(p: Pt, pivot: Pt, dx: number, dy: number, angle: number, sx: number, sy: number): Pt {
  const q = rot({x: (p.x - pivot.x) * sx, y: (p.y - pivot.y) * sy}, angle);
  return {x: q.x + pivot.x + dx, y: q.y + pivot.y + dy};
}

export function readingGlyphs(board: Board, g: WordGeom, frame: number, m = wordStateAt(board, g.i, frame),
  layout: BoardLayout = layoutBoard(board), cam: CameraState = camForBlock(board, g.block, frame)): ReadingGlyph[] {
  const b = layout.blocks[g.block];
  const pivot = {x: g.x + g.w / 2, y: g.y + g.h / 2};
  let x = g.x;
  const stand = board.motionStyle === 'crisp' ? m.turn?.stand : undefined;
  const wsx = stand && stand.sx !== 0 ? m.sx / stand.sx : m.sx;
  const wsy = stand && stand.sy !== 0 ? m.sy / stand.sy : m.sy;
  const wdx = m.dx - (stand?.dx ?? 0);
  const wdy = m.dy - (stand?.dy ?? 0);
  return [...g.text].flatMap((ch, index) => {
    const width = g.adv[index] ?? 0;
    const gx = x;
    x += width;
    if (/\s/u.test(ch)) return [];
    const l = m.letters?.[index];
    const lp = {x: gx + width / 2, y: pivot.y};
    const plane = m.turn?.letters?.[index] ?? m.turn?.plane;
    const poly = quad(gx, g.y, width, g.boxH).map((p) => {
      const q = l ? transform(p, lp, l.dx, l.dy, l.rot, l.s * (l.sx ?? 1), l.s * (l.sy ?? 1)) : p;
      const projected = stand && plane && plane !== 'hidden' ? projectTurn(plane, q) : q;
      return toScreen(cam, blockToWorld(b, transform(projected, pivot, wdx, wdy, m.rot, wsx, wsy)));
    });
    const cap = stand && plane && plane !== 'hidden' && g.boxH > 0
      ? g.h * Math.min(Math.hypot(poly[3].x - poly[0].x, poly[3].y - poly[0].y),
        Math.hypot(poly[2].x - poly[1].x, poly[2].y - poly[1].y)) / g.boxH
      : g.h * Math.abs(m.sy) * cam.zoom * Math.abs((l?.s ?? 1) * (l?.sy ?? 1));
    return [{index, ch, quad: poly, cap,
      opacity: m.hidden || m.turn?.plane === 'hidden' || m.turn?.letters?.[index] === 'hidden' ? 0 : m.opacity * (l?.opacity ?? 1)}];
  });
}

const gamut = (s: string) => {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/iu.exec(s);
  if (!match) return undefined;
  const rgb = match[1].length === 3 ? [...match[1]].map((v) => v + v) : match[1].match(/../gu)!;
  return rgb.map((v) => Number.parseInt(v, 16) / 255);
};
function contrast(foreground: string, background: string, opacity: number) {
  const fg = gamut(foreground), bg = gamut(background);
  if (!fg || !bg) return undefined;
  const luminance = (rgb: number[]) => rgb.reduce((sum, v, i) =>
    sum + [0.2126, 0.7152, 0.0722][i] * (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4), 0);
  const a = luminance(fg.map((v, i) => opacity * v + (1 - opacity) * bg[i]));
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function crossesFrame(glyph: ReadingGlyph) {
  const frame = quad(0, 0, WIDTH, HEIGHT);
  return glyph.quad.some(({x, y}) => x < 0 || y < 0 || x > WIDTH || y > HEIGHT)
    && polysOverlap(glyph.quad, frame);
}
export function insideSafe(glyph: ReadingGlyph) {
  const {x, y, width, height} = SAFE_BOX;
  return glyph.quad.every((p) => p.x >= x - 0.01 && p.y >= y - 0.01 && p.x <= x + width + 0.01 && p.y <= y + height + 0.01);
}

export const MIN_READING_COVERAGE = 0.85;
export function frameArea(points: Pt[], box = quad(0, 0, WIDTH, HEIGHT)) {
  return polyArea(clipConvex(points, box));
}

export function wordCoverage(glyphs: readonly ReadingGlyph[], box = quad(0, 0, WIDTH, HEIGHT)): number {
  let area = 0, inside = 0;
  for (const {quad: points} of glyphs) {
    area += polyArea(points);
    inside += frameArea(points, box);
  }
  return area > 0 ? inside / area : 0;
}

interface GlyphBox {minX: number; maxX: number; minY: number; maxY: number}
interface CachedGlyphs {glyphs: ReadingGlyph[]; box: GlyphBox | null}
function glyphBounds(glyphs: readonly ReadingGlyph[]): GlyphBox | null {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const g of glyphs) {
    if (g.opacity <= 0.05) continue;
    for (const p of g.quad) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  return minX <= maxX ? {minX, maxX, minY, maxY} : null;
}

export interface ReadingProblem {rule: 'visible' | 'margin' | 'sung-cap' | 'contrast' | 'overlap'; detail: string}
export function readingSampler(board: Board, minCap: number) {
  const layout = layoutBoard(board);
  const exempt = new Set(boardCues(board).flatMap((cue) => verbFor(board, cue.name)?.overlapExempt?.(cue, layout) ?? [])
    .map(([a, b]) => a < b ? `${a}:${b}` : `${b}:${a}`));
  const stateFrames = new Map<number, Map<number, WordMod>>();
  const glyphFrames = new Map<number, Map<number, CachedGlyphs>>();
  const groundFrames = new Map<number, string>();
  const camFrames = new Map<number, {board?: CameraState; screen?: CameraState}>();
  const hasOverlayZones = FORMAT.overlayZones.length > 0;
  const coverageBox = hasOverlayZones
    ? quad(SAFE_BOX.x, SAFE_BOX.y, SAFE_BOX.width, SAFE_BOX.height)
    : quad(0, 0, WIDTH, HEIGHT);
  const camFor = (block: number, frame: number) => {
    let entry = camFrames.get(frame);
    if (!entry) {entry = {}; camFrames.set(frame, entry);}
    if (board.blocks[block]?.pin === 'screen') return entry.screen ??= camForBlock(board, block, frame);
    return entry.board ??= camForBlock(board, block, frame);
  };
  const stateOf = (word: number, frame: number) => {
    let cache = stateFrames.get(frame);
    if (!cache) {cache = new Map(); stateFrames.set(frame, cache);}
    let entry = cache.get(word);
    if (!entry) {entry = wordStateAt(board, word, frame); cache.set(word, entry);}
    return entry;
  };
  const cachedGlyphs = (word: number, frame: number) => {
    let cache = glyphFrames.get(frame);
    if (!cache) {cache = new Map(); glyphFrames.set(frame, cache);}
    let entry = cache.get(word);
    if (!entry) {
      const g = layout.words.get(word)!;
      const list = readingGlyphs(board, g, frame, stateOf(word, frame), layout, camFor(g.block, frame));
      entry = {glyphs: list, box: glyphBounds(list)};
      cache.set(word, entry);
    }
    return entry;
  };
  const glyphs = (word: number, frame: number) => cachedGlyphs(word, frame).glyphs;
  const level = (g: WordGeom) => layout.blocks[g.block].def.z ?? (layout.blocks[g.block].def.emerge?.move === 'door' ? -1 : 0);
  return {glyphs, issue(word: number, frame: number): ReadingProblem | undefined {
    const g = layout.words.get(word)!;
    const state = stateOf(word, frame);
    const ownEntry = cachedGlyphs(word, frame);
    const own = ownEntry.glyphs;
    if (!boardActive(board, frame) || !own.length) return {rule: 'visible', detail: 'no readable ink on the active board'};
    const opacity = Math.min(...own.map((part) => part.opacity));
    if (opacity + 1e-9 < VISIBLE_THRESHOLD) return {rule: 'visible', detail: `opacity ${opacity.toFixed(3)} is below 0.5`};
    if (board.motionStyle === 'crisp') {
      const coverage = wordCoverage(own, coverageBox);
      if (coverage + 1e-9 < MIN_READING_COVERAGE) return {rule: 'margin',
        detail: `${(coverage * 100).toFixed(1)}% of the word box is ${hasOverlayZones ? 'inside the safe area' : 'on screen'} (needs 85%)`};
    } else if (own.some((part) => !insideSafe(part))) return {rule: 'margin', detail: 'outside the safe box during protected reading'};
    const cap = Math.min(...own.map(({cap}) => cap));
    if (cap + 0.01 < minCap) return {rule: 'sung-cap', detail: `cap ${cap.toFixed(2)} px is below the ${minCap.toFixed(2)} px floor`};
    if (board.motionStyle === 'crisp' && state.turn && state.turn.plane && state.turn.plane !== 'hidden'
      && Math.abs(state.turn.plane.theta) > 1) return {rule: 'visible', detail: 'still turning into or out of reading position'};
    let bg = groundFrames.get(frame);
    if (bg === undefined) {bg = groundAt(board, frame / FPS).full; groundFrames.set(frame, bg);}
    const colour = state.tint ?? state.colour ?? g.opts.colour ?? board.colour ??
      (PALETTE.light?.some((light) => light.toUpperCase() === bg.toUpperCase()) ? PALETTE.ground : PALETTE.paper);
    const ratio = contrast(colour, bg, opacity);
    if (ratio === undefined || ratio < 4.5) return {rule: 'contrast', detail: ratio === undefined
      ? `cannot measure contrast for ${colour} on ${bg}; use hex colours` : `contrast ${ratio.toFixed(2)}:1 is below 4.5:1`};
    const ownBox = ownEntry.box;
    for (const other of layout.order) {
      if (other === word || exempt.has(other < word ? `${other}:${word}` : `${word}:${other}`)) continue;
      const og = layout.words.get(other)!;
      const z = level(og) - level(g);
      if (board.motionStyle !== 'crisp' && (z < 0 || (z === 0 && (og.block < g.block || (og.block === g.block && other < word))))) continue;
      const os = stateOf(other, frame);
      if (os.hidden || os.opacity <= 0.05 || os.turn?.plane === 'hidden') continue;
      const otherEntry = cachedGlyphs(other, frame);
      const otherBox = otherEntry.box;
      if (ownBox && otherBox && (ownBox.maxX <= otherBox.minX || otherBox.maxX <= ownBox.minX ||
        ownBox.maxY <= otherBox.minY || otherBox.maxY <= ownBox.minY)) continue;
      if (otherEntry.glyphs.some((ink) => ink.opacity > 0.05 && (board.motionStyle !== 'crisp' || polyArea(ink.quad) >= 1) && own.some((part) => polysOverlap(part.quad, ink.quad, 0.5)))) {
        return {rule: 'overlap', detail: `covered by "${og.text}" (run ${other})`};
      }
    }
  }};
}
