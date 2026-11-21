// Board-level validator rules (rulings 195 and 198): faults a render showed that the per-word checks passed. Run by
// validateBoard on every board. Each check returns violations; nothing here keeps state.
//   ink-overlap      ink of two rows of one block touching, and an unretired word's ink crossing a board rule
//   counter-fit      NEST and PORTAL blocks against the measured counter (and counters that were not measured)
//   arrival-fade     a word whose arrival is only a change of opacity (TYPE and NEST letters excepted)
//   arrival-pop      a word that appears at full opacity with no motion, scale or mask
//   anchor-hidden    an emergence anchor that is off screen or not visible when its move starts
//   empty-frame      a frame of a rig move with no type in it
//   two-scales       two lines running without a rest at the giant level (rule 49)
//   variety          R at rest unchanged for three lines; after a ROLL the previous block out of frame (rule 48)
//   handoff-extra    anything on a handoff frame that the handoff picture does not have
// Ruling 198 (Fable review of ProofV3, items 36, 39 and 46, and the supervisor's stray-lines check):
//   arrival-fade     also: a STACK word below full opacity on any drawn frame (smear samples included), a panel-printed word below full
//                    opacity while uncovered, and any arrival whose fade moves the word less than a quarter of its cap
//   decor-life       a board graphic whose life is empty or that needs an owner it does not name
//   decor-ink        a board graphic, or a line a verb draws, crossing the ink of an unretired word
//   line-life        a board rule with no end: none of until, owner, persistent
//   line-linger      a line or line graphic in frame more than 20 frames after every owner retired or left frame
//   level-run        two lines in a row resting level (within 8 degrees) with no tilted or sideways retired text in frame
// Phase 2 (DOGE K10, Fable item 48):
//   joint-distance   a FAN block starting more than 213 screen px from the old line's end; fan-angle: the lines' screen
//                    angles at the new first word's sung frame differ from `fan` (error) or are not split -fan/2, +fan/2 (warning)
//   quarter-clear    a QUARTER key in a hole shorter than 18 to 27 frames; run-speed: a RUN key over 22 px per frame;
//   dive-rate        a key named 'DIVE' changing zoom by more than 6 percent per frame
//   behind           a BEHIND plate still over a hidden word on its sung frame
//   carry            a chunk carry whose board camera moves, whose type is not clear of the edge at B, or whose outgoing
//                    type is still in frame when the chunk unmounts
import {FPS, FORMAT, HEIGHT, LIMITS, LINES, SAFE_BOX, WIDTH, WORDS} from './config';
import {camForBlock, cameraAt, toScreen} from './camera';
import {WIDE_LIMITS} from './format';
import {blockToWorld} from './layout';
import {handoffById} from './handoffWords';
import {countersMeasured, resolveAnchor} from './letters';
import {FONT_INFO} from './metrics';
import {panelQuad} from './panel';
import {rigMoves, rigOwnAt, rigTransits} from './rig';
import {behindFailures} from './emergence/behind';
import {quarterClearFrames} from './authoring';
import {CARRY_TAIL, SLIDE_UP_IN_MIN_Y, SLIDE_UP_OUT_MAX_Y, carrySpan, carryStillSpan} from './carry';
import {drawnOpacityAt} from './smearSampling';
import {ruleAt} from './rules';
import {transitExempt} from './transitRules';
import type {Board, BoardLayout, Pt, WordGeom} from './types';
import {normDeg, polysOverlap, rot} from './util';
import type {WordMod} from './verbRegistry';
import {LINGER_FRAMES, graphicLife, lineMarks, ruleOwners, type LineSeg} from './lines';
import {panelGoneAt} from './panel';
import {verbFor, baseCtx, boardCues, emergeCue, inkOpacity, retireFrame, wordStateAt} from './wordState';
import {separatingPanel} from './panels';
import type {Violation} from './validate';

/** Screen-side giant level (rule 49): cap height at least this, spanning at least GIANT_SPAN (or the frame height in a
 *  quarter stance). */
export const GIANT_CAP = WIDE_LIMITS.giantCap;
export const GIANT_SPAN = WIDE_LIMITS.giantSpan;
/** Caption checks (kit pass 21): the same 48 px margin, 56 px cap and 15-frame floor as sung words (validate.ts SAFE,
 *  SUNG_MIN_CAP, motion.ts MIN_VISIBLE_FRAMES; repeated here because validate.ts imports this file). */

const CAPTION_MIN_FRAMES = 15;
/** FAN Joint distance cap in screen px (DOGE item 45: 320 world px at its 1920-wide world, two thirds of a screen px each). */
export const JOINT_MAX = WIDE_LIMITS.jointMax;

const local = (w: WordGeom, m: WordMod, x0In: number, y0: number, x1In: number, y1: number) => {
  const cx = w.x + w.w / 2, cy = w.y + w.h / 2;
  // Paper Trail K2: a spread word's box reaches past its advance (m.extend; undefined for every other word)
  const x0 = x0In - (m.extend?.l ?? 0), x1 = x1In + (m.extend?.r ?? 0);
  return [{x: x0, y: y0}, {x: x1, y: y0}, {x: x1, y: y1}, {x: x0, y: y1}].map((p) => {
    const q = rot({x: (p.x - cx) * m.sx, y: (p.y - cy) * m.sy}, m.rot);
    return {x: q.x + cx + m.dx, y: q.y + cy + m.dy};
  });
};
/** Screen quad of a word's ink: from its highest ascender to its lowest descender, across its advance. */
export const inkQuad = (board: Board, L: BoardLayout, w: WordGeom, m: WordMod, f: number): Pt[] => {
  const fi = FONT_INFO[w.font];
  const asc = /[bdfhklt'’]/.test(w.text) ? Math.max(0, fi.asc - fi.cap) * w.size : 0;
  const desc = /[gjpqy,;]/.test(w.text) ? fi.inkDesc * w.size : 0;
  const b = L.blocks[w.block];
  const cam = camForBlock(board, w.block, f);
  return local(w, m, w.x, w.y - asc, w.x + w.w, w.baseline + desc).map((p) => toScreen(cam, blockToWorld(b, p)));
};
const onScreen = (q: Pt[]) => Math.max(...q.map((p) => p.x)) > 0 && Math.min(...q.map((p) => p.x)) < WIDTH && Math.max(...q.map((p) => p.y)) > 0 && Math.min(...q.map((p) => p.y)) < HEIGHT;
const ptOnScreen = (p: Pt) => p.x >= 0 && p.x <= WIDTH && p.y >= 0 && p.y <= HEIGHT;
const segQuad = (a: Pt, b: Pt, w: number): Pt[] => {
  const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const n = {x: (-(b.y - a.y) / d) * (w / 2), y: ((b.x - a.x) / d) * (w / 2)};
  return [{x: a.x + n.x, y: a.y + n.y}, {x: b.x + n.x, y: b.y + n.y}, {x: b.x - n.x, y: b.y - n.y}, {x: a.x - n.x, y: a.y - n.y}];
};
const quadSize = (q: Pt[]) => ({w: Math.hypot(q[1].x - q[0].x, q[1].y - q[0].y), h: Math.hypot(q[3].x - q[0].x, q[3].y - q[0].y)});
/** Sutherland-Hodgman: `subject` clipped to the convex polygon `clip` (either winding). */
export const clipConvex = (subject: Pt[], clip: Pt[]): Pt[] => {
  if (subject.length < 3 || clip.length < 3) return [];
  const sign = polyArea(clip, true) >= 0 ? 1 : -1;
  let out = subject;
  for (let k = 0; k < clip.length && out.length; k++) {
    const a = clip[k], b = clip[(k + 1) % clip.length];
    const inside = (p: Pt) => sign * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) >= 0;
    const cut = (p: Pt, q: Pt): Pt => {
      const d1 = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x), d2 = (b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x);
      const u = d1 / (d1 - d2 || 1e-12);
      return {x: p.x + (q.x - p.x) * u, y: p.y + (q.y - p.y) * u};
    };
    const inp = out; out = [];
    for (let j = 0; j < inp.length; j++) {
      const p = inp[j], q = inp[(j + 1) % inp.length];
      if (inside(q)) { if (!inside(p)) out.push(cut(p, q)); out.push(q); } else if (inside(p)) out.push(cut(p, q));
    }
  }
  return out;
};
/** Polygon area (absolute, or signed with `signed`). */
export function polyArea(q: Pt[], signed = false): number {
  let a = 0;
  for (let k = 0; k < q.length; k++) { const p = q[k], r = q[(k + 1) % q.length]; a += p.x * r.y - r.x * p.y; }
  return signed ? a / 2 : Math.abs(a / 2);
}
/** A clip path made of one closed polygon of straight segments (M x y L x y ... Z) that is convex, as its points;
 *  null for anything else (several pieces, evenodd holes, curves). */
export const convexClipPoly = (d: string): Pt[] | null => {
  const t = d.trim();
  if (!/^M[^MACQSTHVZ]*Z?$/i.test(t) || /[ACQSTHV]/i.test(t)) return null;
  const nums = (t.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
  if (nums.length < 6 || nums.length % 2) return null;
  const pts: Pt[] = [];
  for (let k = 0; k < nums.length; k += 2) pts.push({x: nums[k], y: nums[k + 1]});
  let sign = 0;
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k], q = pts[(k + 1) % pts.length], r = pts[(k + 2) % pts.length];
    const c = (q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x);
    if (Math.abs(c) < 1e-9) continue;
    if (sign === 0) sign = Math.sign(c); else if (Math.sign(c) !== sign) return null;
  }
  return sign === 0 ? null : pts;
};
const near = (a: Pt[], b: Pt[], tol: number) => a.every((p, k) => Math.hypot(p.x - b[k].x, p.y - b[k].y) <= tol);

export interface BoardRuleCtx {
  name: string;
  L: BoardLayout;
  /** Reading intervals [sung frame, retire or removal frame). */
  intervals: Map<number, [number, number]>;
  step: number;
  addPlan: (line: number, s: string) => void;
}

export const boardRuleChecks = (board: Board, c: BoardRuleCtx): Violation[] => {
  const {name, L, intervals, step} = c;
  const out: Violation[] = [];
  const startF = Math.ceil(board.start * FPS), endF = Math.floor(board.end * FPS) - 1;
  const transits = rigTransits(board);
  const inTransit = (f: number) => transits.some((x) => f >= x.start && f < x.end);
  const agg = new Map<string, {v: Violation; worst: number}>();
  const note = (key: string, v: Violation, f: number, worst = 0) => {
    const a = agg.get(key);
    if (!a) agg.set(key, {v: {...v, from: f, to: f, frames: 1}, worst});
    else { a.v.to = f; a.v.frames = (a.v.frames ?? 0) + 1; a.worst = Math.max(a.worst, worst); }
  };
  const cues = L.blocks.map((_, k) => emergeCue(board, k));
  const moveOf = (i: number) => cues[L.words.get(i)!.block]?.name;
  const anchorRules = (i: number): Set<string> => {
    const b = L.blocks[L.words.get(i)!.block].def;
    const s = new Set<string>();
    for (const a of [b.anchor?.to, b.emerge?.from]) if (a && 'rule' in a) s.add(a.rule);
    return s;
  };
  const stateMemo = new Map<string, WordMod>();
  const st = (i: number, f: number) => { const k = `${i}@${f}`; let m = stateMemo.get(k); if (!m) { m = wordStateAt(board, i, f); stateMemo.set(k, m); } return m; };
  const vis = (m: WordMod, min = 0.05) => !m.hidden && m.opacity > min;
  // KIT 83: the drawn ink (letter fades such as `vanish` included); used only by the ink-overlap pass
  const inkVis = (m: WordMod, min = 0.05) => vis(m, min) && inkOpacity(m) > min;

  // ---------------------------------------------------------------- per frame: ink overlap, empty rig frames, giant rests
  const moves = rigMoves(board).filter((m) => m.dur > 0);
  const typeGraphicInFrame = (f: number) => (board.graphics ?? []).some((g) => {
    if (!g.isType) return false;
    const life = graphicLife(g, f / FPS);
    if (!life || (g.exitBy !== 'shape' && life.out > 0.7)) return false;
    const polys = g.box({t: f / FPS, board, layout: L});
    if (!polys?.length) return false;
    const cam = cameraAt(board, f);
    return polys.some((q) => onScreen(g.layer === 'screen' ? q : q.map((p) => toScreen(cam, p))));
  });
  // entrance overlap (Fable gate DOGE B1 fix 11): a word still making its entrance (before its sung frame) must not draw
  // its ink more than 3 px into another unretired word, landed or entering (the 3 px of the main overlap rule). Each
  // word's visible ink is its ink box cut to its mask when the mask is one convex polygon (seam, drawer, shelf, rise); a
  // word under a mask of several pieces or curves (door, behind, portal) is not measured, nor is a word still scaled
  // below 98 percent (a sprout or swell growing out of its anchor's edge). Pairs a verb exempts (a SHOVE's incoming on outgoing) and pairs with a panel between their layers are skipped.
  const entryExempt: [number, number][] = [];
  for (const cue of boardCues(board)) { const def = verbFor(board, cue.name); if (def?.overlapExempt) entryExempt.push(...def.overlapExempt(cue, L)); }
  const entryPairOk = (a: number, b: number) => entryExempt.some(([x, y]) => (x === a && y === b) || (x === b && y === a))
    || !!separatingPanel(board, L, L.words.get(a)!.block, L.words.get(b)!.block);
  // a word growing out of a point (SPROUT, SWELL) starts on its anchor's edge by design and is checked once landed
  const growing = (m: WordMod) => Math.abs(m.sx) < 0.98 || Math.abs(m.sy) < 0.98;
  const visibleInk = (x: {i: number; w: WordGeom; m: WordMod}, ink: Pt[], f: number): Pt[] | null => {
    if (!x.m.clip) return ink;
    const poly = convexClipPoly(x.m.clip);
    if (!poly) return null;
    const cam = camForBlock(board, x.w.block, f), b = L.blocks[x.w.block];
    return clipConvex(ink, poly.map((p) => toScreen(cam, blockToWorld(b, p))));
  };
  const inMove = (f: number) => moves.some((m) => f >= m.start && f < m.start + m.dur);
  const giantAt = new Map<number, number>(); // line -> frames at rest with a giant word in frame
  const group = (w: WordGeom) => board.scoreStyleGroups ? board.scoreStyleGroups[w.block] ?? -1 : w.line;
  const styleWords = new Map<number, number[]>();
  for (const i of L.order) {
    const l = group(L.words.get(i)!);
    if (l < 0) continue;
    const words = styleWords.get(l) ?? [];
    words.push(i);
    styleWords.set(l, words);
  }
  const lineOfFrame = (f: number) => { let l = -1; for (const i of L.order) if (L.words.get(i)!.sf <= f) l = group(L.words.get(i)!); return l; };
  for (let f = startF; f <= endF; f += step) {
    const shown = L.order.map((i) => ({i, w: L.words.get(i)!, m: st(i, f)})).filter((x) => inkVis(x.m));
    const inks = new Map<number, Pt[]>();
    for (const x of shown) inks.set(x.i, inkQuad(board, L, x.w, x.m, f));
    // KIT 89 and 90: a word turning in 3D, or (transitRules 'energy') in its first 12 frames of motion, may cross
    const tx = (x: {i: number; m: WordMod}) => !!x.m.turn || transitExempt(board, x.i, f);
    // rows of one block never touch (ruling 194.11), checked for unretired words that have landed
    for (const a of shown) for (const b of shown) {
      if (a.i >= b.i || a.w.block !== b.w.block || a.w.row === b.w.row || tx(a) || tx(b)) continue;
      if (f < Math.max(a.w.sf, b.w.sf) || f >= Math.min(retireFrame(board, a.i), retireFrame(board, b.i))) continue;
      if (polysOverlap(inks.get(a.i)!, inks.get(b.i)!, 0.5)) note(`rows${a.i}-${b.i}`, {board: name, rule: 'ink-overlap', severity: 'error', word: a.i, text: a.w.text, line: a.w.line, detail: `ink touches word ${b.i} "${b.w.text}" in the next row of its block (rows must not touch)`}, f, 1);
    }
    const visMemo = new Map<number, Pt[] | null>();
    const visOf = (x: {i: number; w: WordGeom; m: WordMod}) => {
      if (!visMemo.has(x.i)) { const v = visibleInk(x, inks.get(x.i)!, f); visMemo.set(x.i, v && v.length >= 3 && polyArea(v) >= 1 ? v : null); }
      return visMemo.get(x.i)!;
    };
    for (const a of shown) {
      if (f >= a.w.sf || growing(a.m) || tx(a)) continue;
      for (const b of shown) {
        // b has landed, or is entering too (each such pair is checked once, from its later word)
        if (b.i === a.i || (f < b.w.sf && b.i > a.i) || f >= retireFrame(board, b.i) || entryPairOk(a.i, b.i) || tx(b)) continue;
        const va = visOf(a);
        if (!va) break;
        const vb = visOf(b);
        if (vb && polysOverlap(va, vb, 3)) note(`entry${a.i}-${b.i}`, {board: name, rule: 'ink-overlap', severity: 'error', word: a.i, text: a.w.text, line: a.w.line, detail: `while entering, its ink crosses word ${b.i} "${b.w.text}"${f < b.w.sf ? ', also entering' : ', which has landed'} (an entrance never passes over another word; Fable gate DOGE B1 fix 11)`}, f, 1);
      }
    }
    // an unretired word's ink does not cross a board rule, except the rule it stands on or comes out of
    const rules = (board.rules ?? []).map((d) => ({d, s: ruleAt(board, d, f / FPS)})).filter((r) => r.s && r.s.len > 1 && r.s.opacity > 0.1);
    if (rules.length) {
      const cam = cameraAt(board, f);
      for (const x of shown) {
        if (f < x.w.sf || f >= retireFrame(board, x.i) || L.blocks[x.w.block].def.pin === 'screen' || tx(x)) continue;
        const own = anchorRules(x.i);
        for (const r of rules) {
          if (own.has(r.d.id)) continue;
          const q = segQuad(toScreen(cam, r.s!.a), toScreen(cam, r.s!.b), Math.max(2, r.s!.width * cam.zoom));
          if (polysOverlap(inks.get(x.i)!, q, 1)) note(`rule${x.i}-${r.d.id}`, {board: name, rule: 'ink-overlap', severity: 'error', word: x.i, text: x.w.text, line: x.w.line, detail: `ink crosses board rule "${r.d.id}"`}, f, 1);
        }
      }
    }
    // no frame of a rig move is empty of type (kit pass 21: a graphic that draws type, a title or a caption, counts)
    if (inMove(f) && !shown.some((x) => x.m.opacity > 0.3 && onScreen(inks.get(x.i)!)) && !typeGraphicInFrame(f))
      note('empty', {board: name, rule: 'empty-frame', severity: 'error', detail: 'a frame of a rig move has no type in it (bare ground)'}, f, 1);
    // giant-level rests (rule 49): at rest (not in a transit), a word in frame at the format's giant cap and span (with a vertical span for quarter stances)
    if (!inTransit(f) && board.scaleStyle === 'lockup') {
      const bright = shown.filter(({i, w, m}) => m.opacity >= 0.8 && group(w) >= 0 && onScreen(inks.get(i)!));
      for (const l of new Set(bright.map(({w}) => group(w)))) {
        const own = bright.filter(({w}) => group(w) === l);
        const wide = own.flatMap(({i}) => inks.get(i)!);
        const width = Math.max(...wide.map(({x}) => x)) - Math.min(...wide.map(({x}) => x));
        const height = Math.max(...wide.map(({y}) => y)) - Math.min(...wide.map(({y}) => y));
        const hero = own.some(({w, m}) => {
          const row = L.blocks[w.block].rows[w.row];
          const cap = w.h * Math.abs(m.sy) * camForBlock(board, w.block, f).zoom;
          return cap >= HEIGHT * (row.words.length === 1 ? 0.30 : 0.22) - 0.5;
        });
        if (hero || width >= WIDTH * 0.75 || height >= HEIGHT * 0.65) giantAt.set(l, (giantAt.get(l) ?? 0) + step);
      }
    } else if (!inTransit(f)) {
      const l = lineOfFrame(f);
      if (l >= 0) for (const x of shown) {
        if (x.m.opacity < 0.3) continue;
        const q = inks.get(x.i)!;
        if (!onScreen(q)) continue;
        const sz = quadSize(local(x.w, x.m, x.w.x, x.w.y, x.w.x + x.w.w, x.w.baseline).map((p) => toScreen(camForBlock(board, x.w.block, f), blockToWorld(L.blocks[x.w.block], p))));
        const ang = Math.abs(normDeg(L.blocks[x.w.block].angle + x.m.rot + camForBlock(board, x.w.block, f).rot));
        const quarter = Math.abs(ang - 90) <= 5;
        if (sz.h >= LIMITS.giantCap - 0.5 && (sz.w >= LIMITS.giantSpan || (quarter && sz.w >= LIMITS.quarterGiantSpan))) { giantAt.set(l, (giantAt.get(l) ?? 0) + step); break; }
      }
    }
  }
  const lines = [...styleWords.keys()].sort((a, b) => a - b);
  for (const l of lines) c.addPlan(l, (giantAt.get(l) ?? 0) >= 10 ? `scale: rests at the giant level for ${giantAt.get(l)} frames` : 'scale: no rest at the giant level');
  for (let k = 1; k < lines.length; k++) {
    if ((giantAt.get(lines[k - 1]) ?? 0) < 10 && (giantAt.get(lines[k]) ?? 0) < 10)
      out.push({board: name, rule: 'two-scales', severity: 'error', line: lines[k], detail: board.scaleStyle === 'lockup' ? 'adjacent sung lines both lack a ten-frame hero or frame-filling lockup' : `lines L${lines[k - 1]} and L${lines[k]} both lack a rest of at least 10 frames with a word at the giant level (cap ${LIMITS.giantCap} px or more spanning ${LIMITS.giantSpan} px; rule 49)`});
  }

  // ---------------------------------------------------------------- arrivals (Fable item 39: no word arrives by opacity)
  // Opacities here are what is drawn, motion-blur samples included (smearSampling.ts; Fable round 2 item 30): a word
  // that exists in only some sub-frame samples of a transit frame is drawn at partial opacity.
  const subMemo = new Map<string, WordMod>();
  const stx = (i: number, f: number) => { if (Number.isInteger(f)) return st(i, f); const k = `${i}@${f}`; let m = subMemo.get(k); if (!m) { m = wordStateAt(board, i, f); subMemo.set(k, m); } return m; };
  const drawn = (i: number, f: number) => drawnOpacityAt([board], board, i, L.words.get(i)!.sf, f, (x) => stx(i, x));
  for (const i of L.order) {
    const w = L.words.get(i)!;
    const mv = moveOf(i);
    const typed = mv === 'type' || mv === 'nest';
    const onPanel = !!L.blocks[w.block].def.on;
    let f0 = -1;
    for (let f = startF; f <= Math.min(endF, w.sf + 2); f++) if (drawn(i, f) > 0.02) { f0 = f; break; }
    if (f0 < 0) continue;
    const ret = Math.min(retireFrame(board, i), endF + 1);
    // STACK words are at full opacity from their first drawn frame (Fable round 2 item 30); words printed on a panel are
    // at full opacity whenever they are uncovered (none fades up as a flip or a lift shows it)
    if (mv === 'stack' || onPanel) {
      let bad = -1, last = -1, n = 0, worst = 1;
      for (let f = f0; f < ret; f++) {
        const m = st(i, f);
        if (m.letters) continue;
        const op = drawn(i, f);
        if (op <= 0.02) continue;
        if (mv === 'stack' && !onPanel && f > w.sf + 12) break;
        if (op < 0.95) { if (bad < 0) bad = f; last = f; n++; worst = Math.min(worst, op); }
      }
      if (bad >= 0) out.push({board: name, rule: 'arrival-fade', severity: 'error', word: i, text: w.text, line: w.line, from: bad, to: last, frames: n,
        detail: `${mv === 'stack' && !onPanel ? 'a STACK word' : 'a word printed on a panel'} below full opacity (lowest ${worst.toFixed(2)}) ${mv === 'stack' && !onPanel ? 'as drawn (motion-blur samples included)' : 'while uncovered'}; it must drop in or be uncovered at full opacity`});
      if (onPanel || bad >= 0) continue;
    }
    const m0 = st(i, f0);
    // KIT 89: a TURN (or turnSwap) arrives edge-on and opens by geometry, not by opacity
    if (typed || m0.letters || mv === 'turn') continue;
    // reach full opacity
    let f1 = f0;
    while (f1 < f0 + 40 && drawn(i, f1) < 0.95) f1++;
    const cam = cameraAt(board, f1);
    const quadAt = (f: number) => { const m = st(i, f); return local(w, m, w.x, w.y, w.x + w.w, w.y + w.boxH).map((p) => toScreen(cam, blockToWorld(L.blocks[w.block], p))); };
    const masked = (f: number) => !!st(i, f).clip;
    // "little or no motion": the fade moves it less than a quarter of its cap height on screen
    const tol = Math.max(2, 0.25 * w.h * cam.zoom);
    if (f1 > f0 + 1 && near(quadAt(f0), quadAt(f1), tol) && !masked(f0))
      out.push({board: name, rule: 'arrival-fade', severity: 'error', word: i, text: w.text, line: w.line, from: f0, to: f1, detail: `arrives by a change of opacity (${f1 - f0} frames, moving under a quarter of its cap, no scale or mask); an emergence move must show where it comes from`});
    else if (f1 <= f0 + 1 && !masked(f0) && near(quadAt(f0), quadAt(Math.min(f0 + 3, endF)), 1))
      out.push({board: name, rule: 'arrival-pop', severity: 'error', word: i, text: w.text, line: w.line, from: f0, detail: 'appears at full opacity with no motion, scale or mask (a cut)'});
  }

  // ---------------------------------------------------------------- emergence anchors visible when the move starts
  const NEEDS_VISIBLE = new Set(['seam', 'sprout', 'type', 'nest', 'door', 'morph', 'extrude', 'swell', 'fold', 'hinge', 'shelf', 'stack', 'shove', 'portal', 'drawer']);
  L.blocks.forEach((b, k) => {
    const cue = cues[k];
    const e = b.def.emerge;
    if (!cue || !e || !NEEDS_VISIBLE.has(e.move)) return;
    const at = Math.round(baseCtx(cue, L, 0).at * FPS);
    if (at < startF) return; // the move starts before the board (a handoff seam)
    const first = b.words[0];
    const base = {board: name, rule: 'anchor-hidden', severity: 'error' as const, word: first?.i, text: first?.text, line: first?.line};
    let p: Pt | null = null;
    if ('edge' in e.from) return;
    try { p = resolveAnchor(L, e.from, at / FPS).p; } catch { return; }
    const cam = camForBlock(board, k, at);
    const s = toScreen(cam, p);
    // an incoming chunk carry (carry.ts) brings the anchor in from off frame with the whole sheet
    const carriedIn = (board.carry ?? []).some((cy) => cy.side === 'in' && at <= carrySpan(cy)[1]);
    if (!ptOnScreen(s) && !carriedIn) out.push({...base, from: at, detail: `${e.move.toUpperCase()} starts at frame ${at} from an anchor off screen at (${s.x.toFixed(0)}, ${s.y.toFixed(0)})`});
    const a = e.from;
    if ('word' in a && L.words.has(a.word)) {
      const m = st(a.word, at);
      if (!vis(m, 0.3)) out.push({...base, from: at, detail: `${e.move.toUpperCase()} starts at frame ${at} from word ${a.word} "${WORDS[a.word].text}", which is not visible then`});
    }
    if ('rule' in a) {
      const r = ruleAt(board, a.rule, at / FPS);
      if (!r || r.len < 1) out.push({...base, from: at, detail: `${e.move.toUpperCase()} starts at frame ${at} from rule "${a.rule}", which has not been drawn yet`});
    }
    // NEST and PORTAL: against the measured counter
    if ((e.move === 'nest' || e.move === 'portal') && 'word' in a && L.words.has(a.word)) {
      const host = L.words.get(a.word)!;
      const r = resolveAnchor(L, a, at / FPS);
      if (!countersMeasured(host.font) || r.estimated) out.push({...base, rule: 'counter-fit', detail: `${e.move.toUpperCase()} into a counter that was not measured from the glyph outline`});
      else if (r.w !== undefined && r.h !== undefined) {
        if (b.w > 0.8 * r.w + 0.5) out.push({...base, rule: 'counter-fit', detail: `block ${k} is ${b.w.toFixed(0)} px wide; the measured counter is ${r.w.toFixed(0)} px (at most 80 percent: ${(0.8 * r.w).toFixed(0)})`});
        if (b.h > 0.8 * r.h + 0.5) out.push({...base, rule: 'counter-fit', detail: `block ${k} is ${b.h.toFixed(0)} px tall; the measured counter is ${r.h.toFixed(0)} px (at most 80 percent: ${(0.8 * r.h).toFixed(0)})`});
      }
    }
    // SHOVE: the push must touch the old block (ruling 194.5)
    if (e.move === 'shove') {
      const def = verbFor(board, 'shove');
      const affected = def?.affects?.(cue, L) ?? [];
      const mine = new Set(b.words.map((w) => w.i));
      const targets = affected.filter((i) => !mine.has(i));
      const late = Math.round(baseCtx(cue, L, 0).at * FPS) + 60;
      const moved = targets.some((i) => { const m0 = st(i, at), m1 = st(i, late); return Math.hypot(m1.dx - m0.dx, m1.dy - m0.dy) > 4; });
      if (!moved) out.push({...base, rule: 'shove-contact', detail: 'the new words never touch the old block, so nothing is pushed (set dir toward it, or place the blocks in line)'});
    }
  });

  // ---------------------------------------------------------------- variety (rule 48)
  const lineFirst = (l: number) => Math.min(...styleWords.get(l)!.map((i) => L.words.get(i)!.sf));
  const restR = (l: number) => {
    let f = lineFirst(l);
    for (const tr of transits) if (f >= tr.start && f < tr.end) f = tr.end;
    return Math.round(cameraAt(board, f).rot);
  };
  for (let k = 2; k < lines.length; k++) {
    const r0 = restR(lines[k - 2]), r1 = restR(lines[k - 1]), r2 = restR(lines[k]);
    if (Math.abs(r1 - r0) < 2 && Math.abs(r2 - r1) < 2) out.push({board: name, rule: 'variety', severity: 'error', line: lines[k], detail: `R at rest is ${r2} for three lines running (L${lines[k - 2]} to L${lines[k]}); in a verse R changes on at least every second line`});
  }
  for (const m of moves) {
    if (m.kind !== 'roll') continue;
    const before = L.order.filter((i) => L.words.get(i)!.sf < m.start);
    if (!before.length) continue;
    const prevBlock = L.words.get(before[before.length - 1])!.block;
    const fEnd = Math.min(endF, Math.ceil(m.start + m.dur) + 2);
    const inFrame = L.blocks[prevBlock].words.some((w) => { const s = st(w.i, fEnd); return vis(s) && onScreen(inkQuad(board, L, w, s, fEnd)); });
    if (!inFrame) out.push({board: name, rule: 'variety', severity: 'error', line: L.blocks[prevBlock].words[0].line, from: m.start, detail: `after the ROLL at frame ${m.start.toFixed(0)} no word of the previous block (${prevBlock}) is in frame; it must stay, sideways or cropped (rule 48)`});
  }

  // ---------------------------------------------------------------- graphics and lines with a finite life (ruling 198)
  for (const g of board.graphics ?? []) {
    if (!(g.until > g.from)) out.push({board: name, rule: 'decor-life', severity: 'error', detail: `graphic "${g.id}" has an empty life (from ${g.from}, until ${g.until})`});
    if (g.line && !g.persistent && !g.owner) out.push({board: name, rule: 'decor-life', severity: 'error', detail: `line graphic "${g.id}" names no owner (the words or panel it belongs to) and is not marked persistent`});
  }
  for (const d of board.rules ?? []) if (d.until === undefined && !d.owner && !d.persistent)
    out.push({board: name, rule: 'line-life', severity: 'error', detail: `board rule "${d.id}" has no end: give it \`until\`, an \`owner\` (it retires with those words) or \`persistent: true\` if the storyboard names it as a lasting rule or shelf (ruling 198)`});
  {
    const screenBox = [{x: 0, y: 0}, {x: WIDTH, y: 0}, {x: WIDTH, y: HEIGHT}, {x: 0, y: HEIGHT}];
    const firstSung = (ws: number[]) => Math.min(...ws.filter((i) => L.words.has(i)).map((i) => L.words.get(i)!.sf));
    const wordPresent = (i: number, f: number) => {
      if (!L.words.has(i) || f >= retireFrame(board, i)) return false;
      const m = st(i, f);
      return vis(m) && onScreen(inkQuad(board, L, L.words.get(i)!, m, f));
    };
    const panelPresent = (id: string, f: number) => {
      const p = board.panels?.find((x) => x.id === id);
      if (!p) return false;
      const gone = panelGoneAt(p);
      if (gone !== null && f >= gone * FPS) return false;
      const q = panelQuad(p, f / FPS);
      return !!q && onScreen(q.map((x) => toScreen(cameraAt(board, f), x)));
    };
    const runs = new Map<string, number>();
    const linger = (key: string, label: string, present: boolean, shown: boolean, f: number) => {
      const r = shown && !present ? (runs.get(key) ?? 0) + step : 0;
      runs.set(key, r);
      if (r > LINGER_FRAMES) note(`linger ${key}`, {board: name, rule: 'line-linger', severity: 'error', detail: `${label} is in frame more than ${LINGER_FRAMES} frames after its owner retired or left frame (ruling 198: it retires with its word, panel or line)`}, f, r);
    };
    // kit pass 21: non-lyric captions (caption.tsx) are read like sung words: in the 48 px margin and at least 56 px cap on
    // screen while at opacity 0.5 or more, readable so for at least 15 frames, and crossed by no rule, line or graphic
    const capRead = new Map<string, number>();
    const captionFrame = (g: NonNullable<Board['graphics']>[number], sp: Pt[][], f: number, zoom: number) => {
      const life = graphicLife(g, f / FPS)!;
      const op = g.exitBy === 'shape' ? 1 : 1 - life.out;
      if (op < 0.5) return;
      const cap = g.caption!.cap * (g.layer === 'screen' ? 1 : zoom);
      const xs = sp.flat().map((p) => p.x), ys = sp.flat().map((p) => p.y);
      const over = Math.max(SAFE_BOX.x - Math.min(...xs), Math.max(...xs) - ((SAFE_BOX.x + SAFE_BOX.width)), SAFE_BOX.y - Math.min(...ys), Math.max(...ys) - ((SAFE_BOX.y + SAFE_BOX.height)));
      const base = {board: name, rule: 'caption', severity: 'error' as const, text: g.caption!.text};
      if (over > 0.5) note(`capm ${g.id}`, {...base, detail: `caption "${g.id}" is outside the ${FORMAT.id === 'wide' ? '48 px safe margin' : 'format safe box'}`}, f, over);
      if (cap < LIMITS.legacySungMinCap - 0.25) note(`capc ${g.id}`, {...base, detail: `caption "${g.id}" cap height below ${LIMITS.legacySungMinCap} px on screen`}, f, LIMITS.legacySungMinCap - cap);
      if (over <= 0.5 && cap >= LIMITS.legacySungMinCap - 0.25) capRead.set(g.id, (capRead.get(g.id) ?? 0) + step);
      const cam = cameraAt(board, f);
      for (const sg of lineMarks(board, f) as LineSeg[]) {
        if (sg.opacity < 0.05) continue;
        const q = segQuad(toScreen(cam, sg.a), toScreen(cam, sg.b), Math.max(2, sg.width * cam.zoom));
        if (sp.some((c) => polysOverlap(c, q, 1))) note(`capl ${g.id}-${sg.id}`, {...base, detail: `the ${sg.kind} line "${sg.id}" crosses caption "${g.id}"`}, f, 1);
      }
      for (const o of board.graphics ?? []) {
        if (o === g || o.ground || !graphicLife(o, f / FPS)) continue;
        const op2 = o.box({t: f / FPS, board, layout: L});
        if (!op2?.length) continue;
        const sp2 = o.layer === 'screen' ? op2 : op2.map((q) => q.map((p) => toScreen(cam, p)));
        if (sp.some((c) => sp2.some((d) => polysOverlap(c, d, 1)))) note(`capg ${g.id}-${o.id}`, {...base, detail: `graphic "${o.id}" crosses caption "${g.id}"`}, f, 1);
      }
    };
    for (let f = startF; f <= endF; f += step) {
      const t = f / FPS;
      const cam = cameraAt(board, f);
      const ink = L.order.filter((i) => f >= L.words.get(i)!.sf - 0 && f < retireFrame(board, i)).map((i) => ({i, m: st(i, f)})).filter((x) => vis(x.m, 0.3)).map((x) => ({i: x.i, q: inkQuad(board, L, L.words.get(x.i)!, x.m, f)}));
      for (const g of board.graphics ?? []) {
        if (!graphicLife(g, t)) { runs.set(`g ${g.id}`, 0); continue; }
        const polys = g.box({t, board, layout: L});
        if (!polys || !polys.length) { runs.set(`g ${g.id}`, 0); continue; }
        const sp = g.layer === 'screen' ? polys : polys.map((q) => q.map((p) => toScreen(cam, p)));
        const shown = sp.some((q) => onScreen(q));
        if (g.caption) captionFrame(g, sp, f, cam.zoom);
        if (!g.ground) for (const x of ink) if (sp.some((q) => polysOverlap(q, x.q, 1)))
          note(`gink ${g.id}-${x.i}`, {board: name, rule: 'decor-ink', severity: 'error', word: x.i, text: WORDS[x.i].text, line: L.words.get(x.i)!.line, detail: `graphic "${g.id}" crosses the ink of an unretired word`}, f, 1);
        if (!g.persistent && g.owner) {
          const ws = g.owner.words ?? [];
          if (ws.length && f < firstSung(ws)) continue;
          const present = ws.some((i) => wordPresent(i, f)) || (!!g.owner.panel && panelPresent(g.owner.panel, f));
          linger(`g ${g.id}`, `graphic "${g.id}"`, present, shown, f);
        }
      }
      for (const sg of lineMarks(board, f) as LineSeg[]) {
        if (sg.opacity < 0.05) { runs.set(`l ${sg.id}`, 0); continue; }
        const q = segQuad(toScreen(cam, sg.a), toScreen(cam, sg.b), Math.max(2, sg.width * cam.zoom));
        const shown = onScreen(q) && clipConvex(q, screenBox).length > 0;
        if (sg.kind !== 'rule') {
          const own = new Set(sg.owner);
          for (const x of ink) if (!own.has(x.i) && polysOverlap(q, x.q, 1))
            note(`link ${sg.id}-${x.i}`, {board: name, rule: 'decor-ink', severity: 'error', word: x.i, text: WORDS[x.i].text, line: L.words.get(x.i)!.line, detail: `the ${sg.kind} line "${sg.id}" crosses the ink of an unretired word it does not belong to`}, f, 1);
        }
        if (sg.persistent || !sg.owner.length) continue;
        if (f < firstSung(sg.owner)) continue;
        linger(`l ${sg.id}`, `the ${sg.kind} line "${sg.id}"`, sg.owner.some((i) => wordPresent(i, f)), shown, f);
      }
    }
    for (const g of board.graphics ?? []) if (g.caption) {
      const need = g.caption.minFrames ?? CAPTION_MIN_FRAMES, got = capRead.get(g.id) ?? 0;
      if (got < need) out.push({board: name, rule: 'caption', severity: 'error', text: g.caption.text, detail: `caption "${g.id}" is readable (opacity 0.5 or more, in the margin, cap 56 px or more) for ${got} frames on this board (needs ${need})`});
    }
  }
  void ruleOwners;

  // ---------------------------------------------------------------- level runs (Fable item 46)
  // A line "rests level" when, on at least half of its frames at rest while it is sung, every word of it being read is
  // within 8 degrees of level on screen and no retired word in frame is tilted or sideways. Two such lines in a row are
  // an error: the rest of the frame must show the turn the reader has come through.
  {
    const angOf = (i: number, f: number) => { const w = L.words.get(i)!; return Math.abs(normDeg(L.blocks[w.block].angle + st(i, f).rot + camForBlock(board, w.block, f).rot)); };
    const flat = new Map<number, boolean>();
    for (const l of lines) {
      const ws = styleWords.get(l)!;
      const f0 = Math.min(...ws.map((i) => L.words.get(i)!.sf));
      const lw = LINES[l]?.words ?? [];
      const f1 = Math.min(endF, board.scoreStyleGroups ? Math.round(Math.max(...ws.map((i) => L.words.get(i)!.end)) * FPS)
        : lw.length ? Math.round(WORDS[lw[lw.length - 1]].end_s * FPS) : f0);
      let rest = 0, level = 0;
      for (let f = f0; f <= f1; f += step) {
        if (inTransit(f)) continue;
        const read = ws.filter((i) => f >= L.words.get(i)!.sf && f < retireFrame(board, i) && vis(st(i, f), 0.3));
        if (!read.length) continue;
        rest++;
        if (read.some((i) => angOf(i, f) > 8)) continue;
        const relief = L.order.some((i) => {
          if (f < retireFrame(board, i)) return false;
          const m = st(i, f);
          if (!vis(m)) return false;
          if (!onScreen(inkQuad(board, L, L.words.get(i)!, m, f))) return false;
          return angOf(i, f) > 8;
        });
        if (!relief) level++;
      }
      flat.set(l, rest > 0 && level >= 0.5 * rest);
      if (rest > 0) c.addPlan(l, `stance: level without tilted or sideways retired text on ${level} of ${rest} rest frames`);
    }
    for (let k = 1; k < lines.length; k++) if (flat.get(lines[k - 1]) && flat.get(lines[k]))
      out.push({board: name, rule: 'level-run', severity: 'error', line: lines[k], detail: `L${lines[k - 1]} and L${lines[k]} both rest level (within 8 degrees) with no tilted or sideways retired text in frame (Fable item 46)`});
  }

  // ---------------------------------------------------------------- handoff frames show nothing extra
  for (const side of ['start', 'end'] as const) {
    const id = board.handoff?.[side];
    if (!id || id === 'open') continue;
    const h = handoffById(id);
    if (!h) continue;
    const f = side === 'start' ? Math.round(board.start * FPS) : Math.round(board.end * FPS) - 1;
    const allowed = new Set(h.elements.flatMap((e) => (e.kind === 'word' ? [e.text.toUpperCase().replace(/[^A-Z0-9]/g, '')] : [])));
    for (const i of L.order) {
      const m = st(i, f);
      if (!vis(m, 0.02)) continue;
      const w = L.words.get(i)!;
      const q = inkQuad(board, L, w, m, f);
      const sz = quadSize(q);
      if (!onScreen(q) || sz.w < 2 || sz.h < 2) continue;
      if (!allowed.has(w.text.toUpperCase().replace(/[^A-Z0-9]/g, ''))) out.push({board: name, rule: 'handoff-extra', severity: 'error', word: i, text: w.text, from: f, detail: `${id} (${side}) shows only its picture, but word ${i} "${w.text}" is visible on that frame`});
    }
    const cam = cameraAt(board, f);
    for (const d of board.rules ?? []) {
      const r = ruleAt(board, d, f / FPS);
      if (r && r.len > 1 && r.opacity > 0.02 && onScreen([r.a, r.b, r.b, r.a].map((p) => toScreen(cam, p)))) out.push({board: name, rule: 'handoff-extra', severity: 'error', from: f, detail: `${id} (${side}): board rule "${d.id}" is visible on that frame`});
    }
    for (const p of board.panels ?? []) {
      const q = panelQuad(p, f / FPS);
      if (q && onScreen(q.map((x) => toScreen(cam, x))) && quadSize(q.map((x) => toScreen(cam, x))).w > 2 && quadSize(q.map((x) => toScreen(cam, x))).h > 2) out.push({board: name, rule: 'handoff-extra', severity: 'error', from: f, detail: `${id} (${side}): panel "${p.id}" is visible on that frame`});
    }
    for (const path of board.paths ?? []) if (!h.elements.some((e) => e.kind === 'mark' && e.path === path.id)) out.push({board: name, rule: 'handoff-extra', severity: 'warn', from: f, detail: `${id} (${side}): the board has ${path.label ?? 'path ' + path.id} and the handoff picture does not (check it is off frame)`});
  }

  // ---------------------------------------------------------------- DOGE moves: FAN, QUARTER, RUN, BEHIND (phase 2)
  const sfs = L.order.map((i) => L.words.get(i)!.sf).sort((a, b) => a - b);
  L.blocks.forEach((b, k) => {
    if (b.def.attach !== 'FAN' || k === 0) return;
    const p = L.blocks[k - 1];
    const r = p.rows[p.rows.length - 1];
    const oldEnd = blockToWorld(p, {x: r.width, y: r.baseline}), newStart = blockToWorld(b, {x: 0, y: b.rows[0].baseline});
    const first = b.words.reduce((a, w) => (w.sf < a.sf ? w : a), b.words[0]);
    const oldLast = p.words.reduce((a, w) => (w.i > a.i ? w : a), p.words[0]);
    const cam = camForBlock(board, k, first.sf);
    const dist = Math.hypot(newStart.x - oldEnd.x, newStart.y - oldEnd.y) * cam.zoom;
    const base = {board: name, word: first.i, text: first.text, line: first.line, from: first.sf};
    if (dist > LIMITS.jointMax + 0.5) out.push({...base, rule: 'joint-distance', severity: 'error', detail: `FAN: the old line's end and the new line's start are ${dist.toFixed(0)} screen px apart at the Joint (at most ${LIMITS.jointMax}, DOGE item 45: 320 of its world px)`});
    const fan = b.def.fan ?? 18;
    const oldA = normDeg(p.angle + cam.rot), newA = normDeg(b.angle + cam.rot);
    const diff = normDeg(newA - oldA);
    if (Math.abs(diff - fan) > 3) out.push({...base, rule: 'fan-angle', severity: 'error', detail: `FAN: old and new lines are ${diff.toFixed(1)} degrees apart on screen; the block says ${fan}`});
    else if (Math.abs(oldA + fan / 2) > 4 || Math.abs(newA - fan / 2) > 4) out.push({...base, rule: 'fan-angle', severity: 'warn', detail: `FAN: at the new first word's sung frame the lines read at ${oldA.toFixed(1)} and ${newA.toFixed(1)} degrees; DOGE item 56 reads the old last word "${oldLast.text}" at ${(-fan / 2).toFixed(0)} and the new first at ${(fan / 2).toFixed(0)} (time fanTurn so it is half done there)`});
  });
  for (const m of rigMoves(board)) {
    if (m.key.name === 'QUARTER') {
      const deg = Math.abs(m.target.rot - m.from.rot);
      const before = sfs.filter((x) => x <= m.start).pop(), after = sfs.find((x) => x > m.start);
      const need = quarterClearFrames(deg);
      if (deg < 55 || deg > 95) out.push({board: name, rule: 'quarter-clear', severity: 'warn', from: m.start, detail: `QUARTER turns ${deg.toFixed(0)} degrees (DOGE item 64: 60 to 90)`});
      if (before !== undefined && after !== undefined && after - before < need) out.push({board: name, rule: 'quarter-clear', severity: 'error', from: before, to: after, detail: `QUARTER of ${deg.toFixed(0)} degrees in a hole of ${after - before} frames between landings (needs ${need})`});
    }
    if (m.key.name === 'DIVE') {
      // DOGE K9: a DIVE changes zoom by at most 6 percent per frame
      let worst = 0;
      for (let f = Math.ceil(m.start) + 1; f <= m.start + m.dur; f++) worst = Math.max(worst, Math.abs(Math.log(cameraAt(board, f).zoom / cameraAt(board, f - 1).zoom)));
      if (worst > Math.log(1.06) + 1e-3) out.push({board: name, rule: 'dive-rate', severity: 'error', from: m.start, to: m.start + m.dur, detail: `DIVE changes zoom by up to ${((Math.exp(worst) - 1) * 100).toFixed(1)} percent per frame (DOGE K9: 6); give it more frames`});
    }
    if (m.key.name === 'RUN') {
      let worst = 0;
      for (let f = Math.ceil(m.start) + 1; f <= m.start + m.dur; f++) {
        const c0 = cameraAt(board, f - 1), c1 = cameraAt(board, f);
        worst = Math.max(worst, Math.hypot(c1.x - c0.x, c1.y - c0.y) * c1.zoom);
      }
      if (worst > LIMITS.runSpeed + 0.5) out.push({board: name, rule: 'run-speed', severity: 'error', from: m.start, to: m.start + m.dur, detail: `RUN camera travels up to ${worst.toFixed(1)} px per frame (DOGE item 63: ${LIMITS.runSpeed}); start it earlier or shorten the row`});
    }
  }
  L.blocks.forEach((b, k) => {
    const cue = cues[k];
    if (!cue || b.def.emerge?.move !== 'behind') return;
    for (const h of behindFailures(cue, L)) out.push({board: name, rule: 'behind', severity: 'error', word: h, text: WORDS[h].text, from: L.words.get(h)!.sf, detail: 'the BEHIND plate still overlaps this hidden word on its sung frame (DOGE K6 build failure); start the move earlier or use DRAWER from the same edge'});
  });

  // ---------------------------------------------------------------- chunk carries (DOGE K10, item 75; carry.ts)
  for (const cy of board.carry ?? []) {
    if (cy.kind === 'quarterCW' && cy.side === 'in' && cy.firstWord !== undefined && L.order.length) {
      const f0 = Math.min(...L.order.map((i) => L.words.get(i)!.sf));
      if (Math.abs(f0 - cy.firstWord) > 0.5) out.push({board: name, rule: 'carry', severity: 'error', detail: `quarterCW (in) at frame ${cy.B}: firstWord is ${cy.firstWord} but the board's first word is sung on ${f0}`});
    }
    const what = `${cy.kind} (${cy.side}) at frame ${cy.B}`;
    let span: [number, number];
    try { span = carrySpan(cy); } catch (e) { out.push({board: name, rule: 'carry', severity: 'error', detail: `${what}: ${(e as Error).message}`}); continue; }
    const inks = (f: number) => L.order.map((i) => ({i, w: L.words.get(i)!, m: st(i, f)})).filter((x) => vis(x.m)).map((x) => ({...x, q: inkQuad(board, L, x.w, x.m, f)}));
    // the board's own camera holds across the carry (item 75: rotation 0 and zoom 1.0 in DOGE's units): use a still hold
    // (from the earlier of B and the motion's start: a quarterCW whose B is the turn's last frame turns before B)
    const [holdFrom, holdTo] = carryStillSpan(cy);
    const c0 = rigOwnAt(board, Math.max(startF, holdFrom));
    for (let f = Math.max(startF, holdFrom); f <= Math.min(endF, holdTo); f++) {
      const c1 = rigOwnAt(board, f);
      const dr = Math.abs(c1.rot - c0.rot), dz = Math.abs(Math.log(c1.zoom / c0.zoom)), dm = Math.hypot(c1.x - c0.x, c1.y - c0.y) * c1.zoom;
      if (dr > 0.5 || dz > 0.01 || dm > 2) { out.push({board: name, rule: 'carry', severity: 'error', from: f, detail: `${what}: the board's own camera moves during the carry (turn ${dr.toFixed(1)} deg, zoom ${(dz * 100).toFixed(1)} percent, travel ${dm.toFixed(0)} px); give it a hold with still: true from frame ${holdFrom}`}); break; }
    }
    if (cy.side === 'in') {
      if (board.start * FPS > Math.min(cy.B, span[0]) + 0.5) out.push({board: name, rule: 'carry', severity: 'error', detail: `${what}: the incoming board starts after B or after the carry's motion starts`});
      if (cy.kind === 'slideUp') for (const x of inks(cy.B)) {
        const top = Math.min(...x.q.map((p) => p.y));
        if (top < SLIDE_UP_IN_MIN_Y - 0.5) out.push({board: name, rule: 'carry', severity: 'error', word: x.i, text: x.w.text, from: cy.B, detail: `${what}: incoming type at y ${top.toFixed(0)} on frame B (it must sit below ${SLIDE_UP_IN_MIN_Y})`});
      }
    } else {
      const unmount = cy.B + CARRY_TAIL;
      if (board.end * FPS < span[1] + 1) out.push({board: name, rule: 'carry', severity: 'error', detail: `${what}: the outgoing board ends at frame ${(board.end * FPS).toFixed(0)}, before its carry finishes at ${span[1]}`});
      if (cy.kind === 'slideUp') for (const x of inks(cy.B)) {
        const bot = Math.max(...x.q.map((p) => p.y));
        if (bot > SLIDE_UP_OUT_MAX_Y + 0.5 && onScreen(x.q)) out.push({board: name, rule: 'carry', severity: 'error', word: x.i, text: x.w.text, from: cy.B, detail: `${what}: outgoing type reaches y ${bot.toFixed(0)} on frame B (it must sit above ${SLIDE_UP_OUT_MAX_Y} to clear the top)`});
      }
      const fu = Math.min(endF, unmount - 1);
      for (const x of inks(fu)) if (onScreen(x.q)) out.push({board: name, rule: 'carry', severity: 'error', word: x.i, text: x.w.text, from: fu, detail: `${what}: still in frame when the outgoing chunk unmounts at ${unmount}`});
    }
  }

  for (const {v, worst} of agg.values()) out.push({...v, detail: worst > 1 ? `${v.detail} (worst ${worst.toFixed(1)})` : v.detail});
  for (const v of out) if (v.from !== undefined && v.to === undefined) { v.to = v.from; v.frames = 1; }
  void LINES; void intervals;
  return out;
};
