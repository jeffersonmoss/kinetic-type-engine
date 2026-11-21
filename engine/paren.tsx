// K1 Paren Pair (Sweet Distillation, the critic): "(" and ")" set in a type face at a block's left and right flanks,
// 1.25 times the block's height. Two board graphics, each with its own box (one per bracket, never one rectangle round
// the lyric). Their life, as Fable ruled it:
//   1. open: ONCE per phrase, from touching (at `pivot`, the block's centre by default) to the phrase's full final
//      width, over `openFrames` (10, lengthened to the speed cap), starting at `at` (default the block's first sung
//      word); they do not follow each landed word. Before `at` they rest touching.
//   2. hold still until the exit.
//   3. exit 'close' (back to touching, then the engine's 6-frame fade by `until`), 'slide' (apart and off both frame
//      edges, the left one off the left edge, the right one off the right edge), or 'none' (the 6-frame fade).
//   4. optional `reenter` (the last scene): after a slide the brackets come back in from the frame edges to close round a
//      world rect, and with `carry` they, the rect and the graphics named there travel off a frame edge together. Wrap
//      those graphics with pair.wrap(graphics) (or pair.carry(g)) so they move with the brackets.
// The words of the block are shown without "(" and ")" (layout.ts, DecorGraphic.parenBlock). The glyph ink box is an
// estimate from the font's ascender and descender (no outline of "(" is measured): `ink` overrides it.
//   const pp = parenPair({block: 3, until: 40.2, colour: INK});
//   board.graphics = [...pp.graphics]; board.track = [...pp.track(() => BOARD)];
// A landed word under a travelling bracket is `decor-ink` (error): with the default `at` the opening crosses the
// phrase's first word if it has landed, so either start the opening earlier (`at`, finishing as the first word lands)
// or let the words emerge after the brackets have passed.
import React from 'react';
import {FPS, HEIGHT, PALETTE, WIDTH, WORDS} from './config';
import {camForBlock, cameraAt, toScreen, toWorld} from './camera';
import {SINE_PEAK, capFrames} from './emergence/common';
import {blockToWorld, layoutBoard} from './layout';
import {FONT_FAMILY, FONT_INFO, FONT_STYLE, type FontKey} from './metrics';
import type {TrackedElement} from './motionCheck';
import type {Board, BoardLayout, DecorGraphic, Pt} from './types';
import {clamp, easeInOutSine, rot} from './util';

export interface ParenRect {x: number; y: number; w: number; h: number; /** degrees about the rect's centre */ angle?: number}
export interface ParenPairDef {
  /** Graphic id prefix (default `paren <block>`); the brackets are `<id> (` and `<id> )`. */
  id?: string;
  /** Index of the board block the pair brackets. */
  block: number;
  /** Song seconds the graphics exist from and until (before the opening starts they rest touching). */
  from: number;
  until: number;
  /** Bracket colour (default the board's type colour). */
  colour?: string;
  /** Font key of the brackets (default 'slab' when configured, else the block's font). */
  font?: FontKey;
  /** Bracket ink height as a multiple of the block's height (default 1.25). */
  scale?: number;
  /** Song seconds the opening starts (default the block's first sung word). */
  at?: number;
  /** Frames of the opening (default and minimum 10; lengthened so the moving bracket keeps the speed cap). */
  openFrames?: number;
  /** Where the brackets touch before they open: 'centre' of the block (default) or its 'left' flank (only ")" moves). */
  pivot?: 'centre' | 'left';
  /** World px between each bracket's ink and the block (default 12 percent of the block's height). */
  gap?: number;
  /** How the pair leaves (default 'close'). */
  exit?: 'close' | 'slide' | 'none';
  /** Song seconds the exit starts (default: so that a close ends 6 frames before `until`, a slide ends at `until`). */
  exitAt?: number;
  /** Frames of the exit move (default the opening's frames for a close, 12 for a slide; lengthened to the speed cap). */
  exitFrames?: number;
  /** After a slide: come back from the frame edges to close round `rect` (world px) at `at`, and optionally carry. */
  reenter?: {at: number; rect: ParenRect; frames?: number;
    carry?: {at: number; edge: 'left' | 'right' | 'top' | 'bottom'; frames?: number; graphics?: string[]}};
  /** 'over' the words (default) or 'under'. */
  layer?: 'under' | 'over';
  /** The glyph's ink above and below the baseline as fractions of the font size (default the font's ascender ink, and
   *  its descender ink, at least 0.15). */
  ink?: {top: number; bottom: number};
  /** The words the pair belongs to: with it the brackets are line graphics checked by line-linger (they must leave
   *  within 20 frames of their owners retiring). Default none (not checked); `persistent` with `reenter`. */
  owner?: DecorGraphic['owner'];
  persistent?: boolean;
}
/** One bracket at a moment: the centre of its ink box (world px), its font size and angle. */
export interface BracketState {c: Pt; size: number; angle: number}
export interface ParenPair {
  /** The two graphics: the left bracket "(" and the right bracket ")". */
  graphics: [DecorGraphic, DecorGraphic];
  /** Both brackets at song seconds t (null when not shown). */
  stateAt: (board: Board, t: number) => {left: BracketState; right: BracketState} | null;
  /** The two brackets as tracked elements (speed cap and the other motion checks): pass a thunk for the board. */
  track: (board: () => Board) => TrackedElement[];
  /** World offset of the carry (reenter.carry) at song seconds t, {0, 0} before it. */
  carryOffset: (board: Board, t: number) => Pt;
  /** A graphic moved with the carry. */
  carry: (g: DecorGraphic) => DecorGraphic;
  /** The graphics named in reenter.carry.graphics wrapped with carry(); the others unchanged. */
  wrap: (gs: DecorGraphic[]) => DecorGraphic[];
}

const EDGE_PAD = 8;
// the moves keep 8 percent under the speed cap (the camera's drift adds a little, as for SHOVE push)
/** K1: a pair of round brackets round a block (see the file header). */
export const parenPair = (o: ParenPairDef): ParenPair => {
  const id = o.id ?? `paren ${o.block}`;
  const scale = o.scale ?? 1.25;
  const fontOf = (L: BoardLayout): FontKey => o.font ?? (FONT_INFO.slab ? 'slab' : L.blocks[o.block].font);
  const inkOf = (font: FontKey) => o.ink ?? {top: FONT_INFO[font].asc, bottom: Math.max(0.15, FONT_INFO[font].inkDesc)};
  const advOf = (font: FontKey, ch: '(' | ')') => FONT_INFO[font].table[ch] ?? FONT_INFO[font].fallback;
  const memo = new WeakMap<Board, ReturnType<typeof plan>>();
  const plan = (board: Board) => {
    const L = layoutBoard(board);
    const b = L.blocks[o.block];
    if (!b) throw new Error(`parenPair: board has no block ${o.block}`);
    const font = fontOf(L);
    const ink = inkOf(font);
    const size = (scale * b.h) / (ink.top + ink.bottom);
    const aL = advOf(font, '(') * size, aR = advOf(font, ')') * size;
    const emL = advOf(font, '('), emR = advOf(font, ')');
    const gap = o.gap ?? 0.12 * b.h;
    const finL = -gap, finR = b.w + gap; // left bracket's right ink edge, right bracket's left ink edge (block px)
    const P = (o.pivot ?? 'centre') === 'left' ? finL : b.w / 2;
    const openStart = (o.at ?? WORDS[b.def.words[0]].start_s) * FPS;
    const zoom = camForBlock(board, o.block, openStart).zoom;
    const openLen = capFrames(1.09 * Math.max(Math.abs(finL - P), Math.abs(finR - P)), zoom, Math.max(10, o.openFrames ?? 10), SINE_PEAK);
    const exit = o.exit ?? 'close';
    const closeLen = exit === 'close' ? capFrames(1.09 * Math.max(Math.abs(finL - P), Math.abs(finR - P)), zoom, o.exitFrames ?? openLen, SINE_PEAK) : 0;
    const local = (lx: number, rx: number): {left: BracketState; right: BracketState} => ({
      left: {c: blockToWorld(b, {x: lx - aL / 2, y: b.h / 2}), size, angle: b.angle},
      right: {c: blockToWorld(b, {x: rx + aR / 2, y: b.h / 2}), size, angle: b.angle},
    });
    const atU = (u: number) => local(P + (finL - P) * u, P + (finR - P) * u);
    const full = atU(1);
    // the slide off both frame edges, measured at its start
    let slide: {start: number; len: number; dL: Pt; dR: Pt} | null = null;
    if (exit === 'slide') {
      const guess = Math.max(12, o.exitFrames ?? 12);
      const start0 = o.exitAt !== undefined ? o.exitAt * FPS : (o.reenter ? Infinity : o.until * FPS - guess);
      if (start0 < Infinity) {
        const cam = cameraAt(board, start0);
        const sq = (st: BracketState, em: number) => quadOf(st, em, ink).map((p) => toScreen(cam, p));
        const qL = sq(full.left, emL), qR = sq(full.right, emR);
        const dxL = -(Math.max(...qL.map((p) => p.x)) + EDGE_PAD), dxR = WIDTH - Math.min(...qR.map((p) => p.x)) + EDGE_PAD;
        const toW = (dx: number) => rot({x: dx / cam.zoom, y: 0}, -cam.rot);
        const dL = toW(dxL), dR = toW(dxR);
        const len = Math.max(guess, Math.ceil((Math.max(Math.abs(dxL), Math.abs(dxR)) * SINE_PEAK) / (0.92 * 0.025 * WIDTH) - 1e-9));
        slide = {start: o.exitAt !== undefined ? start0 : o.until * FPS - len, len, dL, dR};
      }
    }
    const closeStart = exit === 'close' ? (o.exitAt !== undefined ? o.exitAt * FPS : o.until * FPS - closeLen - 6) : Infinity;
    // re-entry round a rect, and the carry
    let re: null | {start: number; len: number; from: {left: Pt; right: Pt}; to: {left: BracketState; right: BracketState}; carry: null | {start: number; len: number; d: Pt}} = null;
    if (o.reenter) {
      const r = o.reenter.rect;
      const rs = (scale * r.h) / (ink.top + ink.bottom);
      const raL = advOf(font, '(') * rs, raR = advOf(font, ')') * rs;
      const rg = o.gap ?? 0.12 * r.h;
      const ang = r.angle ?? 0;
      const rc = {x: r.x + r.w / 2, y: r.y + r.h / 2};
      const inRect = (p: Pt) => { const q = rot({x: p.x - r.w / 2, y: p.y - r.h / 2}, ang); return {x: rc.x + q.x, y: rc.y + q.y}; };
      const to = {left: {c: inRect({x: -rg - raL / 2, y: r.h / 2}), size: rs, angle: ang}, right: {c: inRect({x: r.w + rg + raR / 2, y: r.h / 2}), size: rs, angle: ang}};
      const start = o.reenter.at * FPS;
      const cam = cameraAt(board, start);
      const sqL = quadOf(to.left, emL, ink).map((p) => toScreen(cam, p)), sqR = quadOf(to.right, emR, ink).map((p) => toScreen(cam, p));
      const offL = Math.max(...sqL.map((p) => p.x)) + EDGE_PAD, offR = WIDTH - Math.min(...sqR.map((p) => p.x)) + EDGE_PAD;
      const shift = (c: Pt, dx: number) => { const s = toScreen(cam, c); return toWorld(cam, {x: s.x + dx, y: s.y}); };
      const from = {left: shift(to.left.c, -offL), right: shift(to.right.c, offR)};
      const len = Math.max(o.reenter.frames ?? 12, Math.ceil((Math.max(offL, offR) * SINE_PEAK) / (0.92 * 0.025 * WIDTH) - 1e-9));
      let carry = null as null | {start: number; len: number; d: Pt};
      const cd = o.reenter.carry;
      if (cd) {
        const c0 = cd.at * FPS;
        const cc = cameraAt(board, c0);
        const rectQ = [{x: 0, y: 0}, {x: r.w, y: 0}, {x: r.w, y: r.h}, {x: 0, y: r.h}].map(inRect);
        const pts = [...quadOf(to.left, emL, ink), ...quadOf(to.right, emR, ink), ...rectQ].map((p) => toScreen(cc, p));
        const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
        const ds = cd.edge === 'left' ? {x: -(Math.max(...xs) + EDGE_PAD), y: 0} : cd.edge === 'right' ? {x: WIDTH - Math.min(...xs) + EDGE_PAD, y: 0}
          : cd.edge === 'top' ? {x: 0, y: -(Math.max(...ys) + EDGE_PAD)} : {x: 0, y: HEIGHT - Math.min(...ys) + EDGE_PAD};
        const d = rot({x: ds.x / cc.zoom, y: ds.y / cc.zoom}, -cc.rot);
        const clen = Math.max(cd.frames ?? 16, Math.ceil((Math.hypot(ds.x, ds.y) * SINE_PEAK) / (0.92 * 0.025 * WIDTH) - 1e-9));
        carry = {start: c0, len: clen, d};
      }
      re = {start, len, from, to, carry};
    }
    return {font, ink, emL, emR, openStart, openLen, closeStart, closeLen, atU, slide, re};
  };
  const planOf = (board: Board) => { let p = memo.get(board); if (!p) { p = plan(board); memo.set(board, p); } return p; };

  const carryOffset = (board: Board, t: number): Pt => {
    const c = planOf(board).re?.carry;
    if (!c) return {x: 0, y: 0};
    const u = easeInOutSine(clamp((t * FPS - c.start) / c.len));
    return {x: c.d.x * u, y: c.d.y * u};
  };
  const stateAt = (board: Board, t: number) => {
    if (!(t >= (o.from ?? -Infinity) && t < o.until)) return null;
    const p = planOf(board);
    const f = t * FPS;
    if (p.re && f >= p.re.start) {
      const u = easeInOutSine(clamp((f - p.re.start) / p.re.len));
      const d = carryOffset(board, t);
      const mv = (a: Pt, b: Pt): Pt => ({x: a.x + (b.x - a.x) * u + d.x, y: a.y + (b.y - a.y) * u + d.y});
      return {left: {...p.re.to.left, c: mv(p.re.from.left, p.re.to.left.c)}, right: {...p.re.to.right, c: mv(p.re.from.right, p.re.to.right.c)}};
    }
    if (p.slide && f >= p.slide.start) {
      if (f >= p.slide.start + p.slide.len) return null;
      const u = easeInOutSine(clamp((f - p.slide.start) / p.slide.len));
      const s = p.atU(1);
      return {left: {...s.left, c: {x: s.left.c.x + p.slide.dL.x * u, y: s.left.c.y + p.slide.dL.y * u}}, right: {...s.right, c: {x: s.right.c.x + p.slide.dR.x * u, y: s.right.c.y + p.slide.dR.y * u}}};
    }
    let u = easeInOutSine(clamp((f - p.openStart) / p.openLen));
    if (f >= p.closeStart) u *= 1 - easeInOutSine(clamp((f - p.closeStart) / p.closeLen));
    return p.atU(u);
  };
  const graphic = (side: 'left' | 'right'): DecorGraphic => {
    const ch = side === 'left' ? '(' : ')';
    const persistent = o.persistent ?? (o.reenter ? true : undefined);
    return {
      id: `${id} ${ch}`, layer: o.layer ?? 'over', parenBlock: o.block, from: o.from, until: o.until,
      line: o.owner || persistent ? true : undefined, owner: o.owner, persistent,
      box: ({t, board}) => {
        const s = stateAt(board, t);
        if (!s) return null;
        const p = planOf(board);
        return [quadOf(s[side], side === 'left' ? p.emL : p.emR, p.ink)];
      },
      draw: (c) => {
        const s = stateAt(c.board, c.t);
        if (!s) return null;
        const p = planOf(c.board);
        const st = s[side];
        const inkH = (p.ink.top + p.ink.bottom) * st.size;
        const adv = (side === 'left' ? p.emL : p.emR) * st.size;
        const fs = FONT_STYLE[p.font];
        return (
          <g transform={`translate(${st.c.x} ${st.c.y}) rotate(${st.angle})`}>
            <text x={-adv / 2} y={-inkH / 2 + p.ink.top * st.size} fontFamily={FONT_FAMILY[p.font]} fontStyle={fs.fontStyle} fontWeight={fs.fontWeight}
              fontSize={st.size} fill={o.colour ?? defaultColour(c.board.bg)} textLength={adv} lengthAdjust="spacingAndGlyphs">{ch}</text>
          </g>
        );
      },
    };
  };
  const pairGraphics: [DecorGraphic, DecorGraphic] = [graphic('left'), graphic('right')];
  const carry = (g: DecorGraphic): DecorGraphic => ({
    ...g,
    box: (c) => { const ps = g.box(c); if (!ps) return null; const d = carryOffset(c.board, c.t); return ps.map((q) => q.map((p) => ({x: p.x + d.x, y: p.y + d.y}))); },
    draw: (c, life) => { const d = carryOffset(c.board, c.t); return <g transform={`translate(${d.x} ${d.y})`}>{g.draw(c, life)}</g>; },
  });
  return {
    graphics: pairGraphics,
    stateAt,
    carryOffset,
    carry,
    wrap: (gs) => gs.map((g) => (o.reenter?.carry?.graphics?.includes(g.id) ? carry(g) : g)),
    track: (board) => (['left', 'right'] as const).map((side): TrackedElement => ({
      id: `${id} ${side === 'left' ? '(' : ')'}`, exempt: ['abrupt'],
      sample: (t) => {
        const B = board();
        const s = stateAt(B, t);
        if (!s) return null;
        const p = planOf(B);
        return {opacity: 1, quad: quadOf(s[side], side === 'left' ? p.emL : p.emR, p.ink)};
      },
    })),
  };
};
/** World quad of a bracket's ink box: its advance (`em` of the font size) wide, its estimated ink tall, centred on the
 *  state's point and turned with it. */
const quadOf = (s: BracketState, em: number, ink: {top: number; bottom: number}): Pt[] => {
  const w = em * s.size, h = (ink.top + ink.bottom) * s.size;
  return [{x: -w / 2, y: -h / 2}, {x: w / 2, y: -h / 2}, {x: w / 2, y: h / 2}, {x: -w / 2, y: h / 2}].map((p) => { const q = rot(p, s.angle); return {x: s.c.x + q.x, y: s.c.y + q.y}; });
};
const defaultColour = (bg: string) => ((PALETTE.light ?? []).some((c) => c.toUpperCase() === bg.toUpperCase()) ? PALETTE.ground : PALETTE.paper);
