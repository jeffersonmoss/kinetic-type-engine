// Letter anchors (rule 169) and anchor resolution. Every laid-out word has per-letter boxes; this module
// names points on them (flankL, flankR, foot, top, stemTop, tail, terminal, centreLine, counter) in board space, and
// resolves any AnchorRef (a letter part, a rule, a board path, a block corner, a point) to a world point, a direction
// and, where it has one, a box. SEAM, SPROUT, NEST, DOOR, MORPH, EXTRUDE and PORTAL all take these anchors.
import {METRICS} from './config';
import type {FontKey} from './metrics';
import type {AnchorRef, BlockGeom, Board, LetterPart, Pt, RuleDef, WordGeom} from './types';
import {add, rot} from './util';

type Anat = {counters: Record<string, number[]>; counter2?: Record<string, number[]>; counterOutline?: Record<string, string>; counter2Outline?: Record<string, string>; countersMeasured?: string; stem: Record<string, number>; tail: Record<string, number[]>; terminal: Record<string, number[]>};
// read at call time: the metrics file is configured after this module loads
const anat = (font: FontKey): Anat => (METRICS.anchors as Record<FontKey, Anat> | undefined)?.[font] ?? {counters: {}, stem: {}, tail: {}, terminal: {}};
/** Letters with a counter (or bowl) in the table, per font. */
export const hasCounter = (font: FontKey, ch: string) => !!anat(font).counters[ch];
/** True when the font's counters were measured from its glyph outlines (tools/measure-outlines.mjs), not estimated. */
export const countersMeasured = (font: FontKey) => !!anat(font).countersMeasured;
/** The measured outline of a letter's counter (counter2: the lower hole of B, 8, g) in letter-box units (x across the
 *  advance, y down from the cap line as a fraction of the cap height), or null. */
export const counterOutline = (font: FontKey, ch: string, which: 'counter' | 'counter2' = 'counter'): Pt[] | null => {
  const s = (which === 'counter' ? anat(font).counterOutline : anat(font).counter2Outline)?.[ch];
  return s ? s.split(' ').map((q) => { const [x, y] = q.split(',').map(Number); return {x, y}; }) : null;
};

/** Enough of a layout to resolve anchors while blocks are still being placed. */
export interface AnchorEnv {board: Board; blocks: BlockGeom[]; words: Map<number, WordGeom>}

/** One letter's box in its block's frame (x right along the reading direction, y down; h is the cap height). */
export interface LetterBox {k: number; ch: string; x: number; y: number; w: number; h: number}
export const letterBoxes = (g: WordGeom): LetterBox[] => {
  const chars = [...g.text];
  let x = g.x;
  return g.adv.map((a, k) => { const b = {k, ch: chars[k] ?? '', x, y: g.y, w: a, h: g.h}; x += a; return b; });
};
/** Letter index from a number, 'first' or 'last' (non-letters at the ends are skipped). */
export const letterIndex = (g: WordGeom, letter: number | 'first' | 'last'): number => {
  const chars = [...g.text];
  if (typeof letter === 'number') return Math.max(0, Math.min(chars.length - 1, letter));
  const isL = (c: string) => /[\p{L}\p{N}]/u.test(c);
  if (letter === 'first') { const k = chars.findIndex(isL); return k < 0 ? 0 : k; }
  for (let k = chars.length - 1; k >= 0; k--) if (isL(chars[k])) return k;
  return chars.length - 1;
};

/** A part of a box in its block frame: point, outward or stroke direction (degrees, block frame) and, for counters, a box. */
export interface LocalAnchor {p: Pt; dir: number; box?: {x: number; y: number; w: number; h: number}; estimated?: boolean; /** counters: the measured hole as a polygon (block frame) */ outline?: Pt[]}
export const partOfBox = (b: {x: number; y: number; w: number; h: number}, part: LetterPart, ch: string, font: FontKey): LocalAnchor => {
  const A = anat(font);
  const at = (fx: number, fy: number): Pt => ({x: b.x + fx * b.w, y: b.y + fy * b.h});
  switch (part) {
    case 'flankL': return {p: at(0, 0.5), dir: 180};
    case 'flankR': return {p: at(1, 0.5), dir: 0};
    case 'top': return {p: at(0.5, 0), dir: -90};
    case 'foot': return {p: at(0.5, 1), dir: 90};
    case 'stemTop': return {p: at(A.stem[ch] ?? 0.5, 0), dir: -90};
    case 'tail': {
      const t = A.tail[ch] ?? [0.5, 1];
      const dir = ch === 'L' ? 0 : 'QRKXA'.includes(ch) ? 45 : 90;
      return {p: at(t[0], t[1]), dir};
    }
    case 'terminal': { const t = A.terminal[ch] ?? [1, 0]; return {p: at(t[0], t[1]), dir: 0}; }
    case 'centreLine': return {p: at(0.5, 0.5), dir: -90, box: {x: b.x + b.w / 2, y: b.y, w: 0, h: b.h}};
    case 'counter':
    case 'counter2': {
      const c = part === 'counter' ? A.counters[ch] : A.counter2?.[ch];
      const r = c ?? [0.3, 0.3, 0.7, 0.7];
      const box = {x: b.x + r[0] * b.w, y: b.y + r[1] * b.h, w: (r[2] - r[0]) * b.w, h: (r[3] - r[1]) * b.h};
      const ol = counterOutline(font, ch, part);
      return {p: {x: box.x + box.w / 2, y: box.y + box.h / 2}, dir: 0, box, estimated: !c || !A.countersMeasured, outline: ol?.map((q) => ({x: b.x + q.x * b.w, y: b.y + q.y * b.h}))};
    }
    case 'centre':
    default: return {p: at(0.5, 0.5), dir: 0};
  }
};

/** World geometry of a resolved anchor. `quad` is the world outline of its box (TL, TR, BR, BL) when it has one. */
export interface ResolvedAnchor {
  p: Pt;
  /** World direction in degrees (outward for flanks, the stroke's heading for tails and the Line). */
  dir: number;
  /** World angle of the frame the anchor belongs to (its block, its rule, the Line's heading). */
  frameAngle: number;
  quad?: Pt[];
  /** Size of the box in its own frame. */
  w?: number; h?: number;
  /** The block it belongs to (word and block anchors). */
  block?: number;
  /** True when the counter was not in the table (a central box was guessed) or the table was not measured. */
  estimated?: boolean;
  /** Counters: the measured hole as a world polygon. */
  outline?: Pt[];
}
const b2w = (b: BlockGeom, p: Pt): Pt => add({x: b.ox, y: b.oy}, rot(p, b.angle));

/** Start point and direction of a rule (before growth and motion). */
export const ruleBase = (env: AnchorEnv, def: RuleDef, t = 0): {a: Pt; dir: Pt} => {
  const a = 'x' in def.from && 'y' in def.from && !('word' in def.from) ? (def.from as Pt) : resolveAnchor(env, def.from as AnchorRef, t).p;
  const r = (def.angle * Math.PI) / 180;
  return {a, dir: {x: Math.cos(r), y: Math.sin(r)}};
};
export const findRule = (board: Board, id: string) => board.rules?.find((r) => r.id === id);

/** Resolves any anchor to world geometry. `t` (song seconds) only matters for {path, tipAt} and moving rules. */
export const resolveAnchor = (env: AnchorEnv, ref: AnchorRef, t = 0): ResolvedAnchor => {
  const off = (ref as {offset?: Pt}).offset;
  if ('word' in ref) {
    const g = env.words.get(ref.word);
    if (!g) throw new Error(`anchor: word ${ref.word} is not laid out on this board (or not before this block)`);
    const b = env.blocks[g.block];
    const part = ref.part ?? 'centre';
    let box: {x: number; y: number; w: number; h: number}, ch = '';
    if (ref.letter !== undefined) { const lb = letterBoxes(g)[letterIndex(g, ref.letter)]; box = lb; ch = lb.ch; }
    else { box = {x: g.x, y: g.y, w: g.w, h: g.h}; ch = g.text.length === 1 ? g.text : ''; }
    const la = partOfBox(box, part, ch, g.font);
    const local = off ? add(la.p, off) : la.p;
    const qb = la.box ?? box;
    const quad = [{x: qb.x, y: qb.y}, {x: qb.x + qb.w, y: qb.y}, {x: qb.x + qb.w, y: qb.y + qb.h}, {x: qb.x, y: qb.y + qb.h}].map((p) => b2w(b, p));
    return {p: b2w(b, local), dir: b.angle + la.dir, frameAngle: b.angle, quad, w: qb.w, h: qb.h, block: b.index, estimated: la.estimated, outline: la.outline?.map((q) => b2w(b, q))};
  }
  if ('rule' in ref) {
    const def = findRule(env.board, ref.rule);
    if (!def) throw new Error(`anchor: no rule "${ref.rule}" on this board`);
    const {a, dir} = ruleBase(env, def, t);
    const s = (ref.s ?? 0.5) * def.length;
    const mv = def.move?.(t) ?? {};
    const local = {x: dir.x * s, y: dir.y * s};
    const turned = rot(local, mv.rot ?? 0);
    const p = {x: a.x + turned.x + (mv.dx ?? 0) + (off?.x ?? 0), y: a.y + turned.y + (mv.dy ?? 0) + (off?.y ?? 0)};
    return {p, dir: def.angle + (mv.rot ?? 0), frameAngle: def.angle + (mv.rot ?? 0)};
  }
  if ('path' in ref) {
    const m = env.board.paths?.find((q) => q.id === ref.path);
    if (!m) throw new Error(`anchor: this board has no path "${ref.path}"`);
    if (ref.tipAt !== undefined && !m.tipAt) throw new Error(`anchor: path "${ref.path}" has no tipAt`);
    const at = ref.tipAt !== undefined ? m.tipAt!(ref.tipAt) : m.pointAt(ref.s ?? 0);
    return {p: off ? add(at.p, off) : at.p, dir: at.heading, frameAngle: at.heading};
  }
  if ('block' in ref) {
    const b = env.blocks[ref.block];
    if (!b) throw new Error(`anchor: block ${ref.block} is not placed yet`);
    const c = ref.corner ?? 'centre';
    const loc = c === 'tl' ? {x: 0, y: 0} : c === 'tr' ? {x: b.w, y: 0} : c === 'br' ? {x: b.w, y: b.h} : c === 'bl' ? {x: 0, y: b.h} : {x: b.w / 2, y: b.h / 2};
    const quad = [{x: 0, y: 0}, {x: b.w, y: 0}, {x: b.w, y: b.h}, {x: 0, y: b.h}].map((p) => b2w(b, p));
    return {p: b2w(b, off ? add(loc, off) : loc), dir: b.angle, frameAngle: b.angle, quad, w: b.w, h: b.h, block: b.index};
  }
  return {p: off ? add(ref.point, off) : ref.point, dir: ref.angle ?? 0, frameAngle: ref.angle ?? 0};
};

/** Short text for reports ("O of MOST counter", "rule seamY 0.5", "Mint Line at 120px"). */
export const describeAnchor = (env: AnchorEnv, ref: AnchorRef): string => {
  if ('word' in ref) {
    const g = env.words.get(ref.word);
    const txt = g?.text ?? `word ${ref.word}`;
    const letter = ref.letter !== undefined && g ? `${[...g.text][letterIndex(g, ref.letter)]} of ` : '';
    return `${letter}${txt}${ref.part && ref.part !== 'centre' ? ' ' + ref.part : ''}`;
  }
  if ('rule' in ref) return `rule ${ref.rule}${ref.s !== undefined ? ' at ' + ref.s : ''}`;
  if ('path' in ref) {
    const name = env.board.paths?.find((q) => q.id === ref.path)?.label ?? `path ${ref.path}`;
    return ref.tipAt !== undefined ? `${name} tip at ${ref.tipAt}s` : `${name} at ${ref.s ?? 0}px`;
  }
  if ('block' in ref) return `block ${ref.block} ${ref.corner ?? 'centre'}`;
  return `point (${ref.point.x.toFixed(0)}, ${ref.point.y.toFixed(0)})`;
};
