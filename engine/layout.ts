// Block and board layout: rows, word sizes and block placement. Pure; memoised per Board object.
import {DEFAULT_FONT, FONTS, WORD_RULE, WORDS, guardDisplay} from './config';
import {FONT_INFO, letterAdvances, type FontKey} from './metrics';
import {defaultTier} from './words';
import type {Block, BlockGeom, Board, BoardLayout, Pt, RowGeom, Tier, WordGeom, WordOpts} from './types';
import {add, rot, sfOf} from './util';
import {resolveAnchor, type AnchorEnv} from './letters';
import type {BlockAlign, LetterPart} from './types';

export const DEFAULT_W = 640;
export const BLOCK_GAP = 40;
export const ROW_MIN = 70;
export const ROW_MAX = 320;
const E0_SCALE = 0.5;
const STACK_SCALE = 0.46;
const TARGET: Record<Tier, number> = {0: 115, 1: 115, 2: 150, 3: 320};
/** Largest row size by the row's highest tier (rule 16: E1 about 90 to 140, E3 200 to 320). A row clamped
 *  below its fill size is left-aligned (or centred in centred boards), as rule 15 allows. */
const ROW_CAP: Record<Tier, number> = {0: 160, 1: 160, 2: 240, 3: ROW_MAX};
const hasDescender = (text: string) => /[gjpqy]/.test(text);

/** Displayed text of a word whose case follows font `font` (an `upper` font shows capitals; double quotes are dropped). */
export const displayText = (i: number, font: FontKey, opts?: WordOpts) => {
  if (opts?.text !== undefined) return guardDisplay(opts.text);
  const raw = WORDS[i].text.replace(/["“”]/g, '');
  return guardDisplay(FONTS[font]?.upper ? raw.toUpperCase() : raw);
};

/** K1: a word's text without round brackets (left as it is if nothing else would be left). */
export const stripParens = (s: string) => { const t = s.replace(/[()]/g, ''); return t.length ? t : s; };

type Item = {i: number; tier: Tier; font: FontKey; text: string; unitW: number; opts: WordOpts};

/** Width per unit of row size of a word as set in its block. */
const unitWidth = (text: string, font: FontKey, tier: Tier) => {
  const k = tier === 0 ? E0_SCALE : 1;
  return letterAdvances(text, font, 1).reduce((a, b) => a + b, 0) * k;
};

/** Splits a row's items into slots: single words, or two adjacent E0 words stacked two high. */
const slotsOf = (items: Item[]) => {
  const slots: Item[][] = [];
  for (let k = 0; k < items.length; k++) {
    if (items[k].tier === 0 && items[k + 1]?.tier === 0) { slots.push([items[k], items[k + 1]]); k++; }
    else slots.push([items[k]]);
  }
  return slots;
};
const rowUnitWidth = (items: Item[], blockFont: FontKey) => {
  const sp = FONT_INFO[blockFont].space;
  const slots = slotsOf(items);
  const w = slots.reduce((a, s) => a + (s.length === 2 ? Math.max(s[0].unitW, s[1].unitW) * (STACK_SCALE / E0_SCALE) : s[0].unitW), 0);
  return w + sp * (slots.length - 1);
};

const rowFeasible = (items: Item[], allE0Block: boolean) => {
  const content = items.filter((x) => x.tier > 0);
  if (!content.length && !allE0Block) return false;
  if (content.some((x) => x.tier === 3) && content.length > 1) return false;
  if (content.some((x) => x.tier === 2) && content.length > 2) return false;
  return content.length <= 3;
};

/** Chooses row breaks by dynamic programming over the tier rules of rule 15, aiming E1 rows at about 115 px. */
const breakRows = (items: Item[], W: number, blockFont: FontKey, manual?: number[]): Item[][] => {
  if (manual) {
    const rows: Item[][] = []; let k = 0;
    for (const n of manual) { rows.push(items.slice(k, k + n)); k += n; }
    if (k < items.length) rows.push(items.slice(k));
    return rows.filter((r) => r.length);
  }
  const n = items.length;
  const allE0 = items.every((x) => x.tier === 0);
  const best: {cost: number; prev: number}[] = Array.from({length: n + 1}, () => ({cost: Infinity, prev: -1}));
  best[0].cost = 0;
  for (let b = 1; b <= n; b++) {
    for (let a = 0; a < b; a++) {
      if (!isFinite(best[a].cost)) continue;
      const row = items.slice(a, b);
      if (!rowFeasible(row, allE0)) continue;
      const s = W / rowUnitWidth(row, blockFont);
      const single = row.filter((x) => x.tier > 0).length <= 1;
      if (s < ROW_MIN && !single) continue;
      const maxTier = Math.max(...row.map((x) => x.tier)) as Tier;
      const target = TARGET[maxTier];
      const sc = Math.min(s, ROW_CAP[Math.max(...row.map((x) => x.tier)) as Tier]);
      const cost = maxTier === 3 ? 0 : Math.pow((sc - target) / target, 2);
      const c = best[a].cost + cost + 0.08 + (s < ROW_MIN ? 50 : 0);
      if (c < best[b].cost) best[b] = {cost: c, prev: a};
    }
  }
  if (!isFinite(best[n].cost)) return items.map((x) => [x]); // nothing legal: one word per row (validator will complain if too small)
  const rows: Item[][] = [];
  for (let b = n; b > 0; b = best[b].prev) rows.unshift(items.slice(best[b].prev, b));
  return rows;
};

/** Lays out one block in its own frame (x right along the reading direction, y down). */
export const layoutBlock = (def: Block, index: number, board: Board): BlockGeom => {
  const blockFont: FontKey = def.font ?? board.font ?? DEFAULT_FONT;
  const W = def.width ?? board.width ?? DEFAULT_W;
  const upper = !!FONTS[blockFont]?.upper;
  const connFont: FontKey = FONTS[blockFont]?.connectives ?? blockFont;
  const align = def.align ?? board.align ?? 'left';
  // K1: a block a parenPair() brackets shows its words without "(" and ")" (the pair is the only bracket on screen)
  const parened = (board.graphics ?? []).some((g) => g.parenBlock === index);
  const items: Item[] = [];
  for (let i = def.words[0]; i <= def.words[1]; i++) {
    const opts: WordOpts = {...(WORD_RULE(i)?.opts ?? {}), ...(def.style?.[i] ?? {})};
    if (def.colour?.[i]) opts.colour = def.colour[i];
    const tier = opts.tier ?? defaultTier(i, def.hero, def.e2);
    const font: FontKey = opts.font ?? (tier === 0 ? connFont : blockFont);
    // A connective set in the block's connectives font keeps the block font's case.
    const caseFont: FontKey = upper && (font === blockFont || font === connFont) ? blockFont : font;
    const shown = displayText(i, caseFont, opts);
    const text = parened ? stripParens(shown) : shown;
    items.push({i, tier, font, text, opts, unitW: unitWidth(text, font, tier)});
  }
  if (def.cap !== undefined || def.stack) return layoutFixed(def, index, items, blockFont, W, align);
  const rowsItems = breakRows(items, W, blockFont, def.rows);
  const info = FONT_INFO[blockFont];
  const rows: RowGeom[] = [];
  const words: WordGeom[] = [];
  let y = 0;
  let prevSize = 0;
  rowsItems.forEach((row, r) => {
    const unit = rowUnitWidth(row, blockFont);
    const rowCap = ROW_CAP[Math.max(...row.map((x) => x.tier)) as Tier];
    const size = Math.max(ROW_MIN, Math.min(rowCap, W / unit));
    const width = unit * size;
    if (r > 0) y += 0.08 * Math.max(prevSize, size);
    const capH = info.cap * size;
    const boxH = capH + (row.some((it) => hasDescender(it.text)) ? info.desc * size : 0);
    const baseline = y + capH;
    let x = align === 'center' ? Math.max(0, (W - width) / 2) : 0;
    const rowWordIdx: number[] = [];
    for (const slot of slotsOf(row)) {
      const slotW = slot.length === 2 ? Math.max(...slot.map((s) => s.unitW)) * (STACK_SCALE / E0_SCALE) * size : slot[0].unitW * size;
      slot.forEach((it, k) => {
        const wsz = it.tier === 0 ? size * (slot.length === 2 ? STACK_SCALE : E0_SCALE) : size * (it.opts.scale ?? 1);
        const fi = FONT_INFO[it.font];
        const wcap = fi.cap * wsz;
        const bl = slot.length === 2 && k === 0 ? baseline - fi.cap * wsz - 0.05 * size : baseline;
        const adv = letterAdvances(it.text, it.font, wsz);
        const w = slot.length === 2 ? it.unitW * (STACK_SCALE / E0_SCALE) * size : it.unitW * size * (it.opts.scale ?? 1);
        const sum = adv.reduce((a, b) => a + b, 0) || 1;
        const wd = WORDS[it.i];
        words.push({
          i: it.i, text: it.text, font: it.font, tier: it.tier, size: wsz,
          x, y: bl - wcap, w, h: wcap, boxH: wcap + (hasDescender(it.text) ? fi.desc * wsz : 0), baseline: bl,
          row: r, block: index, line: wd.line, start: wd.start_s, end: wd.end_s, sf: sfOf(wd.start_s),
          adv: adv.map((a) => (a * w) / sum), opts: it.opts,
        });
        rowWordIdx.push(it.i);
      });
      x += slotW + info.space * size;
    }
    rows.push({y, h: boxH, size, baseline, width, words: rowWordIdx});
    y += boxH;
    prevSize = size;
  });
  const w = Math.max(...rows.map((r) => r.width), align === 'center' ? W : 0);
  return {
    index, def, w, h: y, rows, words, ox: 0, oy: 0, angle: 0, font: blockFont,
    firstSf: words[0].sf, lastSf: words[words.length - 1].sf,
  };
};

/** Layouts with explicit sizes: `cap` (every word at one cap height) and `stack` (one word per row, each row
 *  justified to the measure, so the short word is the giant one; rule 62 and rule 74). */
const layoutFixed = (def: Block, index: number, items: Item[], blockFont: FontKey, W: number, align: 'left' | 'center'): BlockGeom => {
  const info = FONT_INFO[blockFont];
  const natural = (it: Item, wsz: number) => letterAdvances(it.text, it.font, wsz).reduce((a, b) => a + b, 0);
  // rows of items
  let rowsItems: Item[][];
  if (def.stack) rowsItems = items.map((it) => [it]);
  else if (def.rows) { rowsItems = []; let k = 0; for (const n of def.rows) { rowsItems.push(items.slice(k, k + n)); k += n; } if (k < items.length) rowsItems.push(items.slice(k)); rowsItems = rowsItems.filter((r) => r.length); }
  else if (def.width !== undefined) {
    // greedy wrap at the width
    rowsItems = [[]];
    let x = 0;
    const capSize = def.cap! / info.cap;
    for (const it of items) {
      const fi = FONT_INFO[it.font];
      const w = natural(it, (def.cap! / fi.cap) * (it.opts.scale ?? 1));
      const row = rowsItems[rowsItems.length - 1];
      if (row.length && x + info.space * capSize + w > W) { rowsItems.push([it]); x = w; } else { x += (row.length ? info.space * capSize : 0) + w; row.push(it); }
    }
  } else rowsItems = [items];
  const rows: RowGeom[] = [];
  const words: WordGeom[] = [];
  let y = 0, prevCap = 0;
  rowsItems.forEach((row, r) => {
    // word sizes for this row
    const sizes = row.map((it) => {
      const fi = FONT_INFO[it.font];
      if (def.stack) { const n1 = natural(it, 1) || 1; return def.stack.measure / n1; }
      return (def.cap! / fi.cap) * (it.opts.scale ?? 1);
    });
    const caps = row.map((it, k) => FONT_INFO[it.font].cap * sizes[k]);
    const capH = Math.max(...caps);
    // leading between the rows' ink (ruling 194.11): the row above's box already holds its descenders, and this row's
    // ascenders and apostrophes above the cap line are added, so rows never touch. STACK keeps 8 percent of the cap
    // height (rule 62); other wrapped fixed-size blocks 20 percent.
    const lead = def.stack ? (def.stack.leading ?? 0.08) : 0.2;
    const ascExtra = Math.max(0, ...row.map((it, k) => (/[bdfhklt'’]/.test(it.text) || FONT_INFO[it.font].upper ? Math.max(0, FONT_INFO[it.font].asc - FONT_INFO[it.font].cap) * sizes[k] : 0)));
    if (r > 0) y += lead * Math.max(prevCap, capH) + ascExtra;
    const baseline = y + capH;
    const sizeRef = capH / info.cap;
    const widths = row.map((it, k) => natural(it, sizes[k]));
    const rowW = widths.reduce((a, b) => a + b, 0) + info.space * sizeRef * (row.length - 1);
    let x = align === 'center' && !def.stack ? Math.max(0, (W - rowW) / 2) : 0;
    let boxH = capH;
    const rowWordIdx: number[] = [];
    row.forEach((it, k) => {
      const fi = FONT_INFO[it.font];
      const wsz = sizes[k];
      const wcap = caps[k];
      const adv = letterAdvances(it.text, it.font, wsz);
      const w = widths[k];
      const sum = adv.reduce((a, b) => a + b, 0) || 1;
      const desc = /[gjpqy,;]/.test(it.text) ? fi.inkDesc * wsz : 0;
      boxH = Math.max(boxH, wcap + desc);
      const wd = WORDS[it.i];
      words.push({
        i: it.i, text: it.text, font: it.font, tier: it.tier, size: wsz,
        x, y: baseline - wcap, w, h: wcap, boxH: wcap + desc, baseline,
        row: r, block: index, line: wd.line, start: wd.start_s, end: wd.end_s, sf: sfOf(wd.start_s),
        adv: adv.map((a) => (a * w) / sum), opts: it.opts,
      });
      rowWordIdx.push(it.i);
      x += w + info.space * sizeRef;
    });
    rows.push({y, h: boxH, size: sizeRef, baseline, width: rowW, words: rowWordIdx});
    y += boxH;
    prevCap = capH;
  });
  if (def.stack?.dir === 'up') {
    // the first word is the bottom row; every later word lands one row above the last
    const H = y;
    for (const row of rows) {
      const ny = H - (row.y + row.h);
      const dy = ny - row.y;
      row.y = ny; row.baseline += dy;
      for (const w of words) if (w.row === rows.indexOf(row)) { w.y += dy; w.baseline += dy; }
    }
  }
  const w = Math.max(...rows.map((r) => r.width), align === 'center' && !def.stack ? W : 0);
  return {index, def, w, h: y, rows, words, ox: 0, oy: 0, angle: 0, font: blockFont, firstSf: Math.min(...words.map((x) => x.sf)), lastSf: Math.max(...words.map((x) => x.sf))};
};

/** Point of a block (its own frame) named by an alignment code. */
export const alignPoint = (b: BlockGeom, a: BlockAlign): Pt => {
  const r0 = b.rows[0];
  switch (a) {
    case 'tl': return {x: 0, y: 0};
    case 'tr': return {x: b.w, y: 0};
    case 'bl': return {x: 0, y: b.h};
    case 'br': return {x: b.w, y: b.h};
    case 'ml': return {x: 0, y: b.h / 2};
    case 'mr': return {x: b.w, y: b.h / 2};
    case 'tc': return {x: b.w / 2, y: 0};
    case 'bc': return {x: b.w / 2, y: b.h};
    case 'baselineL': return {x: 0, y: r0?.baseline ?? b.h};
    case 'baselineR': return {x: r0?.width ?? b.w, y: r0?.baseline ?? b.h};
    case 'centre': default: return {x: b.w / 2, y: b.h / 2};
  }
};
const defaultAlign = (ref: NonNullable<Block['anchor']>['to']): BlockAlign => {
  if ('rule' in ref || 'path' in ref) return 'baselineL';
  if ('block' in ref) return 'tl';
  if ('point' in ref) return 'tl';
  const part: LetterPart = ref.part ?? 'centre';
  return ({flankR: 'ml', flankL: 'mr', foot: 'tc', top: 'bc', stemTop: 'bc', tail: 'tl', terminal: 'ml', centreLine: 'centre', counter: 'centre', centre: 'centre'} as Record<LetterPart, BlockAlign>)[part];
};
/** K7 hanging punctuation: the width of the trailing punctuation of the block's last word (the run of non-letters after
 *  its last letter or digit), in block px. It also moves the kern between that last letter and the punctuation onto the
 *  punctuation (the word's width is unchanged), so the letters before it are spaced exactly as in the same word
 *  without punctuation. Mutates the word's advances: call it once, at placement (placeAtAnchor, with anchor.hang). */
export const hangPunctuation = (b: BlockGeom): number => {
  const g = b.words[b.words.length - 1];
  if (!g) return 0;
  const chars = [...g.text];
  let k0 = chars.length;
  while (k0 > 0 && !/[\p{L}\p{N}]/u.test(chars[k0 - 1])) k0--;
  if (k0 === 0 || k0 === chars.length) return 0;
  const raw = letterAdvances(g.text, g.font, g.size);
  const scale = g.w / (raw.reduce((a, x) => a + x, 0) || 1);
  const kern = (FONT_INFO[g.font]?.kern[chars[k0 - 1] + chars[k0]] ?? 0) * g.size * scale;
  if (kern) { g.adv[k0 - 1] -= kern; g.adv[k0] += kern; }
  return g.adv.slice(k0).reduce((a, x) => a + x, 0);
};

/** Placement against an anchor (rule 167). */
const placeAtAnchor = (b: BlockGeom, env: AnchorEnv) => {
  const A = b.def.anchor!;
  const r = resolveAnchor(env, A.to, b.def.showFrom ?? WORDS[b.def.words[0]].start_s);
  const angle = A.angle === 'stroke' ? r.dir : A.angle ?? 0;
  const gap = A.gap ?? 0;
  const P = {x: r.p.x + Math.cos((r.dir * Math.PI) / 180) * gap, y: r.p.y + Math.sin((r.dir * Math.PI) / 180) * gap};
  const align = A.align ?? defaultAlign(A.to);
  const local = alignPoint(b, align);
  // K7 hanging punctuation (opt-in): right-side aligns are measured from the end of the last letter
  if (A.hang && (align === 'tr' || align === 'mr' || align === 'br' || align === 'baselineR')) local.x -= hangPunctuation(b);
  const al = rot(local, angle);
  const off = A.offset ? rot(A.offset, angle) : {x: 0, y: 0};
  b.ox = P.x - al.x + off.x; b.oy = P.y - al.y + off.y; b.angle = angle;
};

const base90 = (a: number) => Math.round(a / 90) * 90;

/** Places block b relative to the previous block p according to its attachment code (rule 17). */
const place = (b: BlockGeom, p: BlockGeom | null, board: Board, blocksSoFar: BlockGeom[]) => {
  const def = b.def;
  const gap = def.gap ?? BLOCK_GAP;
  const toWorld = (q: Pt) => (p ? add({x: p.ox, y: p.oy}, rot(q, p.angle)) : q);
  let local: Pt = {x: 0, y: 0};
  let angle = p ? p.angle : 0;
  const centre = (def.align ?? board.align) === 'center';
  switch (p ? def.attach : 'NEW') {
    case 'NEW':
      if (def.at) { b.ox = def.at.x; b.oy = def.at.y; b.angle = def.at.angle; } else { b.ox = 0; b.oy = 0; b.angle = 0; }
      return;
    case 'R': {
      if (def.column) {
        // New column: right of every block in the D-stack ending at p, top-aligned with the stack's head.
        const all = board.blocks;
        let k = p!.index;
        while (k > 0 && all[k].attach === 'D') k--;
        const stack = blocksSoFar.slice(k, p!.index + 1);
        const head = stack[0];
        const right = Math.max(...stack.map((s) => worldToBlock(p!, blockToWorld(s, {x: s.w, y: 0})).x));
        const top = worldToBlock(p!, blockToWorld(head, {x: 0, y: 0})).y;
        local = {x: right + gap, y: top};
        break;
      }
      const lastBase = p!.rows[p!.rows.length - 1].baseline;
      local = {x: p!.w + gap, y: lastBase - b.rows[0].baseline};
      break;
    }
    case 'D':
      local = {x: centre ? (p!.w - b.w) / 2 : 0, y: p!.h + gap};
      break;
    case 'CW':
      // Hung from the previous block's right edge, starting level with its bottom, so blocks attached D after
      // the turn (which stack toward world-left) pass under the previous block instead of through it.
      local = {x: p!.w + gap + b.h, y: p!.h + gap};
      angle = p!.angle + 90;
      break;
    case 'CCW':
      local = {x: p!.w + gap, y: p!.h};
      angle = p!.angle - 90;
      break;
    case 'T+':
    case 'T-':
      local = {x: 0, y: p!.h + gap};
      angle = base90(p!.angle) + (def.attach === 'T+' ? 12 : -12);
      break;
    case 'FAN': {
      // DOGE item 56 (its sheet layout, case 'F'): start at the Joint, the end of the previous block's last baseline,
      // turned by `fan`; one space on, plus the cap corner the turn swings toward the other block, so the two never touch
      const r = p!.rows[p!.rows.length - 1];
      const end = toWorld({x: r.width, y: r.baseline});
      const fan = def.fan ?? 18;
      const ang = p!.angle + fan;
      const g0 = b.words[0];
      const sinA = Math.abs(Math.sin((fan * Math.PI) / 180));
      const extra = fan > 0 ? b.rows[0].h * sinA : r.h * sinA;
      const s = add(end, rot({x: FONT_INFO[g0.font].space * g0.size + extra, y: 0}, ang));
      const o = add(s, rot({x: 0, y: -b.rows[0].baseline}, ang));
      const off = def.offset ? rot(def.offset, ang) : {x: 0, y: 0};
      b.ox = o.x + off.x; b.oy = o.y + off.y; b.angle = ang;
      return;
    }
    case 'FREE':
      if (!def.at) { local = {x: 0, y: p!.h + gap}; break; }
      if (def.at.rel === 'world') { b.ox = p!.ox + def.at.x; b.oy = p!.oy + def.at.y; b.angle = def.at.angle; return; }
      if (def.at.rel) { local = {x: def.at.x, y: def.at.y}; angle = p!.angle + def.at.angle; break; }
      b.ox = def.at.x; b.oy = def.at.y; b.angle = def.at.angle;
      return;
  }
  if (def.offset) local = add(local, def.offset);
  const o = toWorld(local);
  b.ox = o.x; b.oy = o.y; b.angle = angle;
};

const cache = new WeakMap<Board, BoardLayout>();

/** Lays out a whole board: every block in its frame, then placed in world space by attachment codes. Memoised. */
export const layoutBoard = (board: Board): BoardLayout => {
  const hit = cache.get(board);
  if (hit) return hit;
  const blocks = board.blocks.map((def, k) => layoutBlock(def, k, board));
  const words = new Map<number, WordGeom>();
  const order: number[] = [];
  const placed: BlockGeom[] = [];
  blocks.forEach((b, k) => {
    if (b.def.anchor) placeAtAnchor(b, {board, blocks: placed, words});
    else place(b, k ? blocks[k - 1] : null, board, blocks);
    placed.push(b);
    for (const w of b.words) { words.set(w.i, w); order.push(w.i); }
  });
  order.sort((a, b) => a - b);
  const out = {board, blocks, words, order};
  cache.set(board, out);
  return out;
};

/** World point of a block-local point. */
export const blockToWorld = (b: BlockGeom, p: Pt): Pt => add({x: b.ox, y: b.oy}, rot(p, b.angle));
/** Block-local point of a world point. */
export const worldToBlock = (b: BlockGeom, p: Pt): Pt => rot({x: p.x - b.ox, y: p.y - b.oy}, -b.angle);
/** World corners (TL, TR, BR, BL) of a word's landed box (descenders included). */
export const wordCorners = (b: BlockGeom, w: WordGeom): Pt[] =>
  [{x: w.x, y: w.y}, {x: w.x + w.w, y: w.y}, {x: w.x + w.w, y: w.y + w.boxH}, {x: w.x, y: w.y + w.boxH}].map((p) => blockToWorld(b, p));
