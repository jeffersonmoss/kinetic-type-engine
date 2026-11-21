import type {Pt, WordGeom} from '../engine/types';
import type {Box, Glyph, GlyphRef, Pose, Space, Unit} from './define';

export const clamp = (u: number) => Math.max(0, Math.min(1, u));
export const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
export const easeOut = (u: number) => 1 - (1 - clamp(u)) ** 3;
export const easeSine = (u: number) => (1 - Math.cos(Math.PI * clamp(u))) / 2;
export const rotate = ({x, y}: Pt, deg: number): Pt => {
  const a = deg * Math.PI / 180;
  return {x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a)};
};
export const pivotOf = ({box, cap}: Unit | Glyph): Pt => ({x: box.x + box.width / 2, y: box.y + cap / 2});
export const mapPoint = (space: Space, p: Pt): Pt => {
  const q = rotate({x: p.x * space.scale, y: p.y * space.scale}, space.angle);
  return {x: q.x + space.origin.x, y: q.y + space.origin.y};
};
export const unmapPoint = (space: Space, p: Pt): Pt => {
  return rotate({x: (p.x - space.origin.x) / space.scale, y: (p.y - space.origin.y) / space.scale}, -space.angle);
};
export const bounds = (points: readonly Pt[]): Box => {
  if (!points.length) return {x: 0, y: 0, width: 0, height: 0};
  const xs = points.map(({x}) => x), ys = points.map(({y}) => y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return {x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y};
};
export const corners = ({x, y, width, height}: Box): Pt[] =>
  [{x, y}, {x: x + width, y}, {x: x + width, y: y + height}, {x, y: y + height}];
export function unitOf(g: WordGeom): Unit {
  let x = g.x;
  const glyphs = [...g.text].map((text, index): Glyph => {
    const width = g.adv[index];
    const box = {x, y: g.y, width, height: g.h};
    x += width;
    return {word: g.i, index, text, box, cap: g.h, inkBox: {...box, height: g.boxH}};
  });
  return {word: g.i, text: g.text, box: {x: g.x, y: g.y, width: g.w, height: g.boxH}, cap: g.h, glyphs};
}

/** Conservative advance box of every visible glyph, in block coordinates. */
export function poseInk(unit: Unit, pose: Pose): Box {
  if (pose.hidden || pose.turn?.plane === 'hidden' || (pose.opacity ?? 1) <= 0) return bounds([]);
  const apply = (point: Pt, pivot: Pt, p: Pose): Pt => {
    const q = rotate({x: (point.x - pivot.x) * (p.sx ?? 1), y: (point.y - pivot.y) * (p.sy ?? 1)}, p.rot ?? 0);
    return {x: q.x + pivot.x + (p.dx ?? 0), y: q.y + pivot.y + (p.dy ?? 0)};
  };
  const pivot = pivotOf(unit);
  if (!pose.letters) return bounds(corners(unit.box).map((p) => apply(p, pivot, pose)));
  return bounds(unit.glyphs.flatMap((glyph) => {
    const letter = pose.letters?.[glyph.index];
    if (/^\s$/u.test(glyph.text) || (letter?.opacity ?? 1) <= 0) return [];
    return corners(glyph.inkBox ?? glyph.box).map((point) => {
      const moved = letter ? apply(point, pivotOf(glyph), {
        ...letter, sx: letter.s * (letter.sx ?? 1), sy: letter.s * (letter.sy ?? 1),
      }) : point;
      return apply(moved, pivot, pose);
    });
  }));
}

export const glyphKey = ({word, index}: GlyphRef): string => `${word}:${index}`;

/** Express a word pose in per-letter transforms when some glyphs are excluded from its fate. */
export function maskFate(unit: Unit, pose: Pose, mask: ReadonlySet<string>): Pose {
  if (pose.turn || pose.clip || pose.skewY || pose.marks || pose.underlay || pose.ghosts) {
    throw new Error('A partial kept-glyph fate cannot project, clip, skew or draw a word as a whole');
  }
  const centre = pivotOf(unit);
  return {keepAlive: pose.keepAlive, letters: unit.glyphs.map((glyph) => {
    const original = pose.letters?.[glyph.index];
    if (mask.has(glyphKey(glyph))) return {dx: 0, dy: 0, rot: 0, s: 1, opacity: 1};
    const point = pivotOf(glyph);
    const sx = pose.sx ?? 1;
    const sy = pose.sy ?? 1;
    const offset = rotate({x: (point.x - centre.x + (original?.dx ?? 0)) * sx,
      y: (point.y - centre.y + (original?.dy ?? 0)) * sy}, pose.rot ?? 0);
    return {
      dx: centre.x + offset.x + (pose.dx ?? 0) - point.x, dy: centre.y + offset.y + (pose.dy ?? 0) - point.y,
      rot: (pose.rot ?? 0) + (original?.rot ?? 0), s: original?.s ?? 1,
      sx: sx * (original?.sx ?? 1), sy: sy * (original?.sy ?? 1),
      opacity: pose.hidden ? 0 : (pose.opacity ?? 1) * (original?.opacity ?? 1),
    };
  })};
}
