import {camForBlock, toScreen} from './camera';
import {FPS, HEIGHT, PALETTE, SAFE_BOX, WIDTH} from './config';
import {groundAt} from './ground';
import {blockToWorld, layoutBoard} from './layout';
import {VISIBLE_THRESHOLD} from './motion';
import type {Board, Pt, WordGeom} from './types';
import {polysOverlap, rot} from './util';
import {boardActive, boardCues, verbFor, wordStateAt} from './wordState';

export interface ReadingGlyph {index: number; ch: string; opacity: number; cap: number; quad: Pt[]}
function quad(x: number, y: number, w: number, h: number): Pt[] {
  return [{x, y}, {x: x + w, y}, {x: x + w, y: y + h}, {x, y: y + h}];
}
function transform(p: Pt, pivot: Pt, dx: number, dy: number, angle: number, sx: number, sy: number): Pt {
  const q = rot({x: (p.x - pivot.x) * sx, y: (p.y - pivot.y) * sy}, angle);
  return {x: q.x + pivot.x + dx, y: q.y + pivot.y + dy};
}

export function readingGlyphs(board: Board, g: WordGeom, frame: number): ReadingGlyph[] {
  const m = wordStateAt(board, g.i, frame);
  const b = layoutBoard(board).blocks[g.block];
  const cam = camForBlock(board, g.block, frame);
  const pivot = {x: g.x + g.w / 2, y: g.y + g.h / 2};
  let x = g.x;
  return [...g.text].flatMap((ch, index) => {
    const width = g.adv[index];
    const gx = x;
    x += width;
    if (/\s/u.test(ch)) return [];
    const l = m.letters?.[index];
    const lp = {x: gx + width / 2, y: pivot.y};
    const poly = quad(gx, g.y, width, g.boxH).map((p) => {
      const q = l ? transform(p, lp, l.dx, l.dy, l.rot, l.s * (l.sx ?? 1), l.s * (l.sy ?? 1)) : p;
      return toScreen(cam, blockToWorld(b, transform(q, pivot, m.dx, m.dy, m.rot, m.sx, m.sy)));
    });
    return [{index, ch, quad: poly, cap: g.h * Math.abs(m.sy) * cam.zoom * Math.abs((l?.s ?? 1) * (l?.sy ?? 1)),
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

export interface ReadingProblem {rule: 'visible' | 'margin' | 'sung-cap' | 'contrast' | 'overlap'; detail: string}
export function readingSampler(board: Board, minCap: number) {
  const layout = layoutBoard(board);
  const exempt = new Set(boardCues(board).flatMap((cue) => verbFor(board, cue.name)?.overlapExempt?.(cue, layout) ?? [])
    .map(([a, b]) => a < b ? `${a}:${b}` : `${b}:${a}`));
  const frames = new Map<number, Map<number, ReadingGlyph[]>>();
  const glyphs = (word: number, frame: number) => {
    let cache = frames.get(frame);
    if (!cache) {cache = new Map(); frames.set(frame, cache);}
    let entry = cache.get(word);
    if (!entry) {entry = readingGlyphs(board, layout.words.get(word)!, frame); cache.set(word, entry);}
    return entry;
  };
  const level = (g: WordGeom) => layout.blocks[g.block].def.z ?? (layout.blocks[g.block].def.emerge?.move === 'door' ? -1 : 0);
  return {glyphs, issue(word: number, frame: number): ReadingProblem | undefined {
    const g = layout.words.get(word)!;
    const own = glyphs(word, frame);
    if (!boardActive(board, frame) || !own.length) return {rule: 'visible', detail: 'no readable ink on the active board'};
    const opacity = Math.min(...own.map((part) => part.opacity));
    if (opacity + 1e-9 < VISIBLE_THRESHOLD) return {rule: 'visible', detail: `opacity ${opacity.toFixed(3)} is below 0.5`};
    if (own.some((g) => !insideSafe(g))) return {rule: 'margin', detail: 'outside the safe box during protected reading'};
    const cap = Math.min(...own.map(({cap}) => cap));
    if (cap + 0.01 < minCap) return {rule: 'sung-cap', detail: `cap ${cap.toFixed(2)} px is below the ${minCap.toFixed(2)} px floor`};
    const state = wordStateAt(board, word, frame);
    const ground = groundAt(board, frame / FPS);
    const bg = ground.full;
    const colour = state.tint ?? state.colour ?? g.opts.colour ?? board.colour ??
      (PALETTE.light?.some((light) => light.toUpperCase() === bg.toUpperCase()) ? PALETTE.ground : PALETTE.paper);
    const ratio = contrast(colour, bg, opacity);
    if (ratio === undefined || ratio < 4.5) return {rule: 'contrast', detail: ratio === undefined
      ? `cannot measure contrast for ${colour} on ${bg}; use hex colours` : `contrast ${ratio.toFixed(2)}:1 is below 4.5:1`};
    for (const other of layout.order) {
      if (other === word || exempt.has(other < word ? `${other}:${word}` : `${word}:${other}`)) continue;
      const og = layout.words.get(other)!;
      const z = level(og) - level(g);
      if (z < 0 || (z === 0 && (og.block < g.block || (og.block === g.block && other < word)))) continue;
      if (glyphs(other, frame).some((ink) => ink.opacity > 0.05 && own.some((part) => polysOverlap(part.quad, ink.quad, 0.5)))) {
        return {rule: 'overlap', detail: `covered by "${og.text}" (run ${other})`};
      }
    }
  }};
}
