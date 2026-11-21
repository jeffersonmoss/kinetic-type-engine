// validateBoard (rule 181): checks every frame of every word's reading interval. Pure; runs in node through
// tools/validate-boards.mjs. Words are read from their display frame to their retire frame (retired text is exempt from
// readability); rig transits are exempt and the words sung during one are checked when it ends; speed is the smaller
// of screen and board-relative speed (the rig is exempt from the cap); every block must declare its emergence from a
// resolvable anchor; stances, handoffs and rig keys are checked.
import {FPS, FORMAT, HANDOFFS, HEIGHT, LINES, WIDTH, WORDS, bannedIn} from './config';
import {camForBlock, cameraAt, toScreen} from './camera';
import {groundAt} from './ground';
import {slideSource} from './emergence/slide';
import {blockToWorld, layoutBoard} from './layout';
import {describeAnchor, resolveAnchor} from './letters';
import {MIN_TRANSITION_FRAMES, rectQuad} from './motion';
import {clipConvex, polyArea} from './validateRules';
import {RIG_FRAME_RANGE, SLOW_SOAR_MAX, SLOW_SOAR_MIN, isSlowSoar, rigMoves, rigTransits} from './rig';
import {handoffById, handoffGraceEnd, handoffPairsNested, handoffWordSet} from './handoffWords';
import {MIN_VISIBLE_FRAMES, VISIBLE_THRESHOLD} from './motion';
import {carryReadEnd} from './carry';
import {ruleTracks} from './rules';
import type {Board, CameraState, HandoffId, Pt, Waiver, WordGeom} from './types';
import {normDeg, polysOverlap, rot} from './util';
import {getVerb, type WordMod} from './verbRegistry';
import {checkTrack, type TrackedElement} from './motionCheck';
import {ENERGY_READ_FRAMES, energyRules, transitExempt, wordMoving} from './transitRules';
import {panelTracks, separatingPanel} from './panels';
import {panelGoneAt, panelQuad, panelSwingExempt, panelSwinging} from './panel';
import {boardRuleChecks} from './validateRules';
import {emptyTimeline, motionRuleChecks} from './validateMotion';
import {groundClearSpan} from './groundClear';
import {graphicLife} from './lines';
import {morphKeptDrift} from './morphPin';
import {EXIT_FRAMES, RETIRE_AFTER, handoffClearAt, baseCtx, boardActive, boardCues, cueAffects, cueAt, retireFrame, wordStateAt, inkOpacity, GONE_OPACITY, blockEmergence, exitFramesOf} from './wordState';

export const SAFE = 48;
export type Severity = 'error' | 'warn';
export interface Violation {
  board: string;
  rule: string;
  severity: Severity;
  word?: number;
  text?: string;
  line?: number;
  /** First and last frame the problem was seen, and how many frames. */
  from?: number; to?: number; frames?: number;
  detail: string;
}
/** Frames after its sung frame that a panel-printed word may still be covered by a page folding off it (Fable item 38a). */
export const PANEL_REVEAL_GRACE = 8;
export interface LineReport {line: number; transits: number; peakBright: number; peakVisible: number; /** Emergence moves, anchors and rig moves on this line. */ plan?: string[]}
export interface BoardReport {board: string; violations: Violation[]; lines: LineReport[]}


/** Stances (rule 181.1): level within 8 degrees; tilted 12 or 25 (plus or minus 4); a quarter turn, -90 within 5
 *  (reads bottom to top) or +90 within 5; inverted is anything from 100 to 260 degrees. */
export type Stance = 'level' | 'tilt' | 'quarter-' | 'quarter+' | 'between' | 'inverted';
export const stanceOf = (deg: number): Stance => {
  const x = normDeg(deg), a = Math.abs(x);
  if (a <= 8) return 'level';
  if (Math.abs(a - 12) <= 4 || Math.abs(a - 25) <= 4) return 'tilt';
  if (Math.abs(x + 90) <= 5) return 'quarter-';
  if (Math.abs(x - 90) <= 5) return 'quarter+';
  if (a >= 100) return 'inverted';
  return 'between';
};
/** Frames a quarter turn must be held while sung, and the cap height it needs. */
export const QUARTER_HOLD = 20;
export const QUARTER_MIN_CAP = 90;
/** Fable item 46: a sung word's cap height on screen while it is read. */
export const SUNG_MIN_CAP = 56;
/** Fable item 29: frames a word stays whole inside the margin after its sung frame (cap 200 px or more: 12). */
export const MARGIN_WHOLE = 20;
export const MARGIN_WHOLE_BIG = 12;
export const MARGIN_BIG_CAP = 200;
/** Tolerance (screen px) for matching a handoff frame. */
export const HANDOFF_TOL = 3;

/** Screen quad (TL, TR, BR, BL) of a word under its render state (through `cam`, default the block's camera at f). */
const screenQuad = (board: Board, w: WordGeom, m: WordMod, f: number, camIn?: CameraState): Pt[] => {
  const L = layoutBoard(board);
  const b = L.blocks[w.block];
  const cam = camIn ?? camForBlock(board, w.block, f);
  const cx = w.x + w.w / 2, cy = w.y + w.h / 2;
  // Paper Trail K2: a spread word's box reaches past its advance (m.extend; undefined for every other word)
  const x0 = w.x - (m.extend?.l ?? 0), x1 = w.x + w.w + (m.extend?.r ?? 0);
  const local = [{x: x0, y: w.y}, {x: x1, y: w.y}, {x: x1, y: w.y + w.boxH}, {x: x0, y: w.y + w.boxH}].map((p) => {
    const q = rot({x: (p.x - cx) * m.sx, y: (p.y - cy) * m.sy}, m.rot);
    return {x: q.x + cx + m.dx, y: q.y + cy + m.dy};
  });
  return local.map((p) => toScreen(cam, blockToWorld(b, p)));
};

type Agg = {v: Violation; worst: number};

/** K2 picture words: the graphic that draws the word is wholly in frame, at least PICTURE_MIN_SIDE screen px on its
 *  longer side and at full opacity (0.9) from the sung frame for PICTURE_FRAMES frames. */
export const PICTURE_MIN_SIDE = 180;
export const PICTURE_FRAMES = 15;
/** Checks one board. `opts.step` samples every n-th frame (default 1: every frame). */
/** Fable item 38 (Huang item 37): a word in its first 15 frames stays this far from a keep-clear prop. */
export const PROP_CLEAR = 24;
export const PROP_CLEAR_FRAMES = 15;
export const validateBoard = (board: Board, opts: {step?: number} = {}): BoardReport => {
  const step = board.readingIntervals ? 1 : opts.step ?? 1;
  const name = board.id ?? `board@${board.start.toFixed(2)}`;
  const L = layoutBoard(board);
  const out: Violation[] = [];
  // Check slide sources before the validator evaluates cues or their word states.
  for (const cue of boardCues(board)) {
    if (cue.name !== 'slideFrom') continue;
    try {
      slideSource(cue, L, cue.at ?? L.words.get(cue.word)?.start ?? board.start);
    } catch (error) {
      out.push({board: name, rule: 'emerge-anchor', severity: 'error', word: cue.word,
        detail: (error as Error).message});
    }
  }
  if (out.length) return {board: name, violations: out, lines: []};
  const agg = new Map<string, Agg>();
  // KIT 90: opt-in transit rules (transitRules.ts); restFrames counts each word's frames read at rest
  const energy = energyRules(board);
  const restFrames = new Map<number, number>();
  const note = (key: string, v: Violation, f: number, worst: number) => {
    const a = agg.get(key);
    if (!a) agg.set(key, {v: {...v, from: f, to: f, frames: 1}, worst});
    else { a.v.to = f; a.v.frames = (a.v.frames ?? 0) + 1; a.worst = Math.max(a.worst, worst); }
  };
  const startF = Math.ceil(board.start * FPS), endF = board.end * FPS;
  if (endF <= startF) out.push({board: name, rule: 'board-time', severity: 'error', detail: `end ${board.end} is not after start ${board.start}`});

  // Verb checks and removal frames
  const cues = boardCues(board);
  const removal = new Map<number, number>();
  const exempt: [number, number][] = [];
  for (const cue of cues) {
    const def = getVerb(cue.name);
    if (!def) { out.push({board: name, rule: 'unknown-verb', severity: 'error', word: cue.word, detail: `no verb named "${cue.name}" is registered`}); continue; }
    if (!L.words.has(cue.word)) out.push({board: name, rule: 'verb-word', severity: 'error', word: cue.word, detail: `${cue.name}: word ${cue.word} is not on this board`});
    const at = cueAt(cue, L, def);
    const w = L.words.get(cue.word);
    const minDelay = def.minDelay ?? 10;
    if (w && !def.early && !cue.allowEarly && !cue.params?.emerged && at * FPS < w.sf + minDelay - 0.5)
      out.push({board: name, rule: 'verb-early', severity: 'warn', word: cue.word, text: WORDS[cue.word].text, detail: `${cue.name} starts ${(at * FPS - w.sf).toFixed(1)} frames after its word (minimum ${minDelay}); set allowEarly if intended`});
    if (def.overlapExempt) exempt.push(...def.overlapExempt(cue, L));
    if (def.removesAt) for (const i of cueAffects(cue, L, def)) {
      const r = def.removesAt({...baseCtx(cue, L, at * FPS), i});
      if (r !== null && r !== undefined) removal.set(i, Math.min(removal.get(i) ?? Infinity, r));
    }
  }
  // a word printed on a board panel is removed when the panel folds away or falls (the page turned, the page lost)
  for (const i of L.order) {
    const id = L.blocks[L.words.get(i)!.block].def.on;
    const p = id ? board.panels?.find((x) => x.id === id) : undefined;
    const g = p ? panelGoneAt(p) : null;
    if (g !== null) removal.set(i, Math.min(removal.get(i) ?? Infinity, g * FPS));
  }
  // Fable item 28 (KIT 79.2 confirmed with a condition): a panel may not start to fold or fall until 20 frames after the
  // sung frame of its last printed word (16 at least, by `foldGap`, as for NEAR)
  for (const p of board.panels ?? []) {
    const g = panelGoneAt(p);
    if (g === null) continue;
    const mine = L.order.filter((i) => L.blocks[L.words.get(i)!.block].def.on === p.id);
    if (!mine.length) continue;
    const last = Math.max(...mine.map((i) => L.words.get(i)!.sf));
    const gap = Math.max(16, p.foldGap ?? 20);
    if (g * FPS < last + gap - 0.5) out.push({board: name, rule: 'panel-fold-early', severity: 'error', word: mine[mine.length - 1], text: WORDS[mine[mine.length - 1]].text, from: Math.round(g * FPS), detail: `panel "${p.id}" starts to fold or fall ${(g * FPS - last).toFixed(0)} frames after its last printed word is sung (at least ${gap}; Fable item 28)`});
  }
  // chunk carries (carry.ts): an outgoing quarterCW ends the reading interval of every word on the board at the turn's
  // first frame, and an outgoing `clear` at the latest when its fade starts; a word cut there must have been readable
  // for MIN_VISIBLE_FRAMES first (Jefferson's floor)
  const carryEnd = Math.min(...(board.carry ?? []).map((c) => { try { return carryReadEnd(c) ?? Infinity; } catch { return Infinity; } }));
  if (carryEnd < Infinity) for (const i of L.order) {
    const w = L.words.get(i)!;
    const natural = Math.min(retireFrame(board, i), removal.get(i) ?? Infinity, endF);
    if (natural <= carryEnd) continue;
    if (carryEnd - w.sf < MIN_VISIBLE_FRAMES && w.sf < endF) out.push({board: name, rule: 'carry', severity: 'error', word: i, text: w.text, line: w.line, from: Math.round(carryEnd), to: Math.round(carryEnd), frames: 1, detail: `sung on frame ${w.sf.toFixed(0)}, ${(carryEnd - w.sf).toFixed(0)} frames before the outgoing carry ends its reading at ${carryEnd} (the quarterCW turn's start, or the clear's): it cannot be read for ${MIN_VISIBLE_FRAMES} frames. Sing it earlier on this board, or move it to the next chunk`});
    removal.set(i, Math.min(removal.get(i) ?? Infinity, carryEnd));
  }
  // K4: a clearing disc's travelling edge ends a word's reading on the frame it first touches the word; that must be at
  // least MIN_VISIBLE_FRAMES after its sung frame
  for (const i of L.order) {
    const gc = groundClearSpan(board, i);
    if (!gc) continue;
    const w = L.words.get(i)!;
    if (gc.touch - w.sf < MIN_VISIBLE_FRAMES && w.sf < endF) out.push({board: name, rule: 'ground-clear', severity: 'error', word: i, text: w.text, line: w.line, from: gc.touch, to: gc.touch, frames: 1, detail: `the clearing disc's edge reaches it on frame ${gc.touch}, ${gc.touch - w.sf} frames after it is sung (needs ${MIN_VISIBLE_FRAMES}): start the disc later, or put the word in its keep list`});
    removal.set(i, Math.min(removal.get(i) ?? Infinity, gc.touch));
  }
  // kit pass 21: the end handoff's clear removes every word that is not in its picture; a nest drawn by the handoff
  // picture itself (LOVE in MOST's O) is not an overlap
  const clearAt = new Map<number, number>();
  for (const i of L.order) { const c = handoffClearAt(board, i); if (c < Infinity) clearAt.set(i, c); }
  exempt.push(...handoffPairsNested(board, L));
  const isExempt = (a: number, b: number) => exempt.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  const gradualFor = (i: number) => cues.some((c) => getVerb(c.name)?.gradual && cueAffects(c, L, getVerb(c.name)).includes(i));
  // display frames (morph targets), relight binds
  const displayFrom = new Map<number, number>();
  const binds: {display: number; sung: number}[] = [];
  for (const cue of cues) {
    const def = getVerb(cue.name);
    if (!def) continue;
    if (def.displayFrom) for (const i of cueAffects(cue, L, def)) { const d = def.displayFrom(cue, L, i); if (d !== null && d !== undefined) displayFrom.set(i, Math.max(displayFrom.get(i) ?? -Infinity, d)); }
    if (def.binds) binds.push(...def.binds(cue, L));
  }
  const transits = rigTransits(board);
  const inTransit = (f: number) => transits.some((x) => f >= x.start && f < x.end);
  const plan = new Map<number, string[]>();
  const addPlan = (line: number, s: string) => { const a = plan.get(line) ?? []; a.push(s); plan.set(line, a); };

  // emergence declarations (rule 181.5)
  {
    for (const b of L.blocks) {
      const e = blockEmergence(b.def);
      const first = b.words[0]?.i;
      if (!e) { out.push({board: name, rule: 'emerge', severity: 'error', word: first, text: first !== undefined ? WORDS[first].text : undefined, detail: `block ${b.index} declares no emergence (every block comes out of text, a rule, a panel or a path)`}); continue; }
      let ok = true, desc = '';
      if ('edge' in e.from) {
        if (first !== undefined) addPlan(L.words.get(first)!.line, `block ${b.index} "${b.words.map((w) => w.text).join(' ')}": SLIDEFROM from frame ${e.from.edge} edge`);
        continue;
      }
      try { const r = resolveAnchor(L, e.from, (e.at ?? (first !== undefined ? L.words.get(first)!.sf / FPS : board.start))); desc = describeAnchor(L, e.from); if (r.estimated) out.push({board: name, rule: 'anchor-estimated', severity: 'warn', word: first, detail: `block ${b.index}: ${desc} has no counter in the font table; a central box was guessed`});
        if (e.move === 'nest' && r.w !== undefined && b.w > 0.8 * r.w + 0.5) out.push({board: name, rule: 'nest-width', severity: 'error', word: first, detail: `block ${b.index} is ${b.w.toFixed(0)} px wide, more than 80 percent of the counter it nests in (${r.w.toFixed(0)} px)`});
      } catch (err) { ok = false; out.push({board: name, rule: 'emerge-anchor', severity: 'error', word: first, detail: `block ${b.index} (${e.move}): ${(err as Error).message}`}); }
      if (ok && first !== undefined) addPlan(L.words.get(first)!.line, `block ${b.index} "${b.words.map((w) => w.text).join(' ')}": ${e.move.toUpperCase()} from ${desc}`);
    }
  }

  // K7: a morph with `pin` must leave its kept letters still to within `pin` px (morphPin.ts)
  for (const cue of cues) {
    if (cue.name !== 'morph' || cue.params?.pin === undefined || cue.params.pin === false) continue;
    const tol = cue.params.pin === true ? 1 : Number(cue.params.pin);
    const d = morphKeptDrift(board, cue);
    const tw = L.words.get(cue.word);
    if (tw) addPlan(tw.line, `morph pin: ${d.pairs} kept letters drift at most ${d.max.toFixed(3)} px (frames ${d.from}-${d.to})`);
    if (!d.pairs) out.push({board: name, rule: 'morph-pin', severity: 'error', word: cue.word, text: WORDS[cue.word]?.text, detail: 'a pinned morph keeps no letters (check keep and match)'});
    else if (d.max > tol) out.push({board: name, rule: 'morph-pin', severity: 'error', word: cue.word, text: WORDS[cue.word]?.text, from: d.frame, to: d.frame, frames: 1, detail: `kept letter ${d.letter} drifts ${d.max.toFixed(2)} px from its landed place (pinned to ${tol} px): align the blocks on one anchor with hang, a fixed cap and match 'end'`});
  }

  // Block angles (a FAN seam sets its own angle, DOGE item 56; blocks at a FAN block's angle pass too)
  const fanAngles = L.blocks.filter((b) => b.def.attach === 'FAN').map((b) => normDeg(b.angle));
  for (const b of L.blocks) {
    const a = normDeg(b.angle), r = a - Math.round(a / 90) * 90;
    if (fanAngles.some((x) => Math.abs(normDeg(a - x)) < 0.01)) continue;
    if (![0, 12, -12, 25, -25].some((x) => Math.abs(r - x) < 0.01)) out.push({board: name, rule: 'angle', severity: 'warn', detail: `block ${b.index} angle ${b.angle} is not 0, +-90 or +-12 or +-25 off a right angle`});
  }

  // Reading intervals
  const intervals = new Map<number, [number, number]>();
  // kit pass 21 (IPO 53ca50b): a word of the start handoff's picture sung before the board starts was sung on the
  // earlier board; here it is read from the board's first frame
  const carried = new Set([...handoffWordSet(board, L, 'start')].filter((i) => L.words.get(i)!.sf < startF));
  for (const i of L.order) {
    const w = L.words.get(i)!;
    const reading = board.readingIntervals?.[i];
    if (reading) {
      if (!Number.isSafeInteger(reading.start) || !Number.isSafeInteger(reading.end) || reading.end - reading.start + 1 < MIN_VISIBLE_FRAMES) {
        out.push({board: name, rule: 'reading-interval', severity: 'error', word: i, text: w.text, line: w.line,
          detail: `invalid protected frames [${reading.start}, ${reading.end}]: expected at least ${MIN_VISIBLE_FRAMES} integer frames`});
        intervals.set(i, [Infinity, -Infinity]);
      } else {
        intervals.set(i, [reading.start, reading.end]);
      }
      continue;
    }
    const req = retireFrame(board, i);
    const rem0 = removal.get(i) ?? Infinity;
    const clear = clearAt.get(i) ?? Infinity;
    const rem = Math.min(rem0, clear);
    // Jefferson's floor: a word cut short by the handoff clear must still have been readable for MIN_VISIBLE_FRAMES
    const shownAtClear = () => { const m = wordStateAt(board, i, clear); return !m.hidden && m.opacity > 0.05; };
    if (clear < Math.min(req, rem0) && clear - w.sf < MIN_VISIBLE_FRAMES && shownAtClear())
      out.push({board: name, rule: 'handoff-clear', severity: 'error', word: i, text: w.text, line: w.line, from: Math.round(clear), to: Math.round(clear), frames: 1, detail: `still shown when the end handoff's clear starts (frame ${clear}), only ${clear - w.sf} frames after it is sung: it cannot be read for ${MIN_VISIBLE_FRAMES} frames before the handoff picture (rule 81.7; Jefferson's floor). Sing it earlier on this board, or make it part of the handoff picture`});
    // the reading interval is half-open, [sung frame, retire or removal frame): from that frame the word is retired
    // (dimmed, exempt) or gone
    const end = Math.min(req, rem, endF) - 1e-6;
    const d = displayFrom.get(i);
    if (d !== undefined && d > w.sf + 0.5) out.push({board: name, rule: 'display-late', severity: 'error', word: i, text: w.text, line: w.line, detail: `its emergence finishes ${(d - w.sf).toFixed(1)} frames after the word is sung (a morph must be done by the sung frame)`});
    intervals.set(i, [carried.has(i) ? startF : w.sf, end]);
    if (endF < Math.min(req, rem) - 0.5)
      out.push({board: name, rule: 'min-life', severity: 'warn', word: i, text: w.text, line: w.line, detail: `board exits at frame ${endF.toFixed(0)}, ${(Math.min(req, rem) - endF).toFixed(0)} frames before the word's required life ends (${req})`});
    if (w.sf < startF && !carried.has(i)) out.push({board: name, rule: 'board-start', severity: 'error', word: i, text: w.text, detail: `word starts at frame ${w.sf}, before the board appears (${startF})`});
  }

  // Relight binds: the displayed word is read while the bound word is sung
  for (const bd of binds) {
    const sw = WORDS[bd.sung];
    if (!sw || !L.words.has(bd.display)) { out.push({board: name, rule: 'relight', severity: 'error', word: bd.display, detail: `relight binds word ${bd.sung} to word ${bd.display}, which is not on this board (or the sung word does not exist)`}); continue; }
    const s0 = Math.round(sw.start_s * FPS), s1 = Math.round(sw.end_s * FPS);
    const iv = intervals.get(bd.display)!;
    if (!board.readingIntervals?.[bd.display] && iv[1] < s1 - 0.5) out.push({board: name, rule: 'relight', severity: 'error', word: bd.display, text: WORDS[bd.display].text, detail: `retires at frame ${iv[1].toFixed(0)}, before the bound word "${sw.text}" finishes (frame ${s1})`});
    if (!board.readingIntervals?.[bd.display]) intervals.set(bd.display, [iv[0], Math.max(iv[1], Math.min(s1, endF))]);
    addPlan(sw.line, `relight: "${sw.text}" (${bd.sung}) sung on "${WORDS[bd.display].text}" (${bd.display}) from frame ${s0}`);
  }
  // Rule 81.7: a word sung on the start boundary or within 9 frames after it is read from 10 frames after the boundary,
  // and must stay readable for 10 frames from then (as rule 41 asks of a word sung during a rig move)
  const grace = new Map<number, number>();
  for (const i of L.order) {
    if (board.readingIntervals?.[i]) continue;
    const g = handoffGraceEnd(board, i);
    if (g === -Infinity) continue;
    grace.set(i, g);
    const iv = intervals.get(i)!;
    if (iv[1] < Math.min(g + 10, endF) - 0.5) out.push({board: name, rule: 'handoff-read', severity: 'error', word: i, text: L.words.get(i)!.text, line: L.words.get(i)!.line, detail: `sung within 9 frames of the start handoff but its reading interval ends at ${iv[1].toFixed(0)}, before 10 frames after its readable frame (${g}; rule 81.7)`});
  }
  // Words sung during a rig transit must still be read at its end plus 10 frames (rule 181.2)
  for (const tr of transits) for (const i of L.order) {
    if (board.readingIntervals?.[i]) continue;
    const w = L.words.get(i)!, iv = intervals.get(i)!;
    const sungEnd = Math.round(WORDS[i].end_s * FPS);
    if (w.sf < tr.end && sungEnd > tr.start && iv[1] < Math.min(tr.end + 10, endF) - 0.5)
      out.push({board: name, rule: 'transit-read', severity: 'error', word: i, text: w.text, line: w.line, detail: `sung during a ${tr.kind} (frames ${tr.start.toFixed(0)}-${tr.end.toFixed(0)}) but its reading interval ends at ${iv[1].toFixed(0)}, before the move ends plus 10 frames`});
  }

  // rule 58: a word held for a later morph is exempt from the readability rules while it waits, from when it
  // would have retired to the first frame of its morph (the rig may crop it or dive past it)
  const morphWait = new Map<number, [number, number]>();
  for (const cue of cues) {
    if (cue.name !== 'morph') continue;
    const def = getVerb(cue.name);
    const start = cueAt(cue, L, def!) * FPS;
    for (const h of def?.holds?.(cue, L) ?? []) {
      const lw = L.words.get(h.word);
      if (!lw) continue;
      const lineWords = LINES[lw.line]?.words ?? [];
      const natural = Math.round(WORDS[lineWords[lineWords.length - 1]].end_s * FPS) + RETIRE_AFTER;
      if (start > natural) morphWait.set(h.word, [natural, start]);
    }
  }
  const waiting = (i: number, f: number) => { const m = morphWait.get(i); return !!m && f >= m[0] && f < m[1]; };
  const capMemo = new Map<number, number>();
  const capAtSung = (i: number) => {
    let c = capMemo.get(i);
    if (c === undefined) { const w = L.words.get(i)!; const f0 = Math.max(w.sf, startF); const m = wordStateAt(board, i, f0); c = w.h * Math.abs(m.sy) * camForBlock(board, w.block, f0).zoom; capMemo.set(i, c); }
    return c;
  };
  const lineSungEnd = (l: number) => { const ws = LINES[l]?.words ?? []; return ws.length ? Math.round(WORDS[ws[ws.length - 1]].end_s * FPS) : -Infinity; };
  /** Fraction of a word's height (along its own up axis) inside the frame. */
  const heightInFrame = (q: Pt[]) => {
    const inFrame = clipConvex(q, [{x: 0, y: 0}, {x: WIDTH, y: 0}, {x: WIDTH, y: HEIGHT}, {x: 0, y: HEIGHT}]);
    const H = Math.hypot(q[3].x - q[0].x, q[3].y - q[0].y);
    if (!inFrame.length || H < 1e-6) return 0;
    const u = {x: (q[3].x - q[0].x) / H, y: (q[3].y - q[0].y) / H};
    const ps = inFrame.map((p) => (p.x - q[0].x) * u.x + (p.y - q[0].y) * u.y);
    return (Math.max(...ps) - Math.min(...ps)) / H;
  };
  // Per-frame pass
  const lineStats = new Map<number, LineReport>();
  const fStart = Math.min(...[...intervals.values()].map((x) => x[0]));
  const fEndReading = Math.max(...[...intervals.values()].map((x) => x[1]));
  const fEnd = fEndReading;
  const quarterRun = new Map<number, {start: number; len: number; worst: number}>();
  const quarterDone: {i: number; start: number; len: number}[] = [];
  for (let f = fStart; f <= fEnd; f += step) {
    const cam = cameraAt(board, f);
    const moving = inTransit(f);
    // vis: the ink the render draws (KIT 83; overlap, bright count). shown: the word's own opacity, which the
    // `visible` and margin checks keep using: a word whose letters a verb fades on its way out (slideAlong, closeAway)
    // is judged by its own opacity and removal frame as before, not by its ink.
    const states = new Map<number, {m: WordMod; quad: Pt[]; vis: boolean; shown: boolean}>();
    for (const i of L.order) {
      const w = L.words.get(i)!;
      const m = wordStateAt(board, i, f);
      // KIT 83: judged on the ink the render draws (letter fades included), so a vanished word leaves the overlap pass
      const shown = !m.hidden && m.opacity > GONE_OPACITY;
      const vis = shown && inkOpacity(m) > GONE_OPACITY;
      states.set(i, {m, quad: shown ? screenQuad(board, w, m, f) : [], vis, shown});
    }
    const clear = board.keepClear?.(f / FPS) ?? [];
    // tracked props flagged `clear` are keep-clear shapes too (Fable item 38)
    for (const el of board.track ?? []) { if (!el.clear) continue; const s = el.sample(f / FPS); if (s && s.opacity > 0.05) clear.push(s.quad); }
    const clearScreen = clear.map((poly) => poly.map((p) => toScreen(cam, p)));
    const overlapPass = (i: number, w: WordGeom, s: {m: WordMod; quad: Pt[]; vis: boolean}, f: number, base: Violation) => {
      for (const j of L.order) {
        if (j === i) continue;
        const o = states.get(j)!;
        if (!o.vis || isExempt(i, j)) continue;
        if (f < w.sf || f < L.words.get(j)!.sf) continue; // a word still making its entrance may pass over a neighbour
        // KIT 89 and 90: a word turning in 3D, or (transitRules 'energy') in its first 12 frames of motion, may cross
        if (o.m.turn || transitExempt(board, j, f)) continue;
        if (!polysOverlap(s.quad, o.quad, 3)) continue;
        // Fable item 31 (KIT 79.5 narrowed): with a panel between their layers the overlap is skipped only where the
        // panel covers it; ink already uncovered while it opens or folds is checked
        const sep = separatingPanel(board, L, w.block, L.words.get(j)!.block);
        if (sep) {
          const pq = panelQuad(sep.panel, f / FPS);
          const both = clipConvex(s.quad, o.quad);
          if (polyArea(both) < 9) continue;
          if (pq && clipConvex(both, pq.map((p) => toScreen(cam, p))).length && polyArea(clipConvex(both, pq.map((p) => toScreen(cam, p)))) >= polyArea(both) - 9) continue;
        }
        note(`ov${i}-${j}`, {...base, rule: 'overlap', detail: `overlaps word ${j} "${WORDS[j].text}"${waiting(i, f) || waiting(j, f) ? ' (a held morph source: nothing may touch its ink)' : ''}`}, f, 1);
      }
    };
    for (const i of L.order) {
      const iv = intervals.get(i)!;
      if (f < iv[0] || f > iv[1]) {
        const q = quarterRun.get(i);
        if (q) { quarterDone.push({i, start: q.start, len: q.len}); quarterRun.delete(i); }
        continue;
      }
      const w = L.words.get(i)!;
      if (w.opts.picture !== undefined) continue; // K2: its graphic is checked instead (picture)
      const b = L.blocks[w.block];
      const s = states.get(i)!;
      const bcam = camForBlock(board, w.block, f);
      const protectedReading = !!board.readingIntervals?.[i];
      const base: Violation = {board: name, rule: '', severity: 'error', word: i, text: WORDS[i].text, line: w.line, detail: ''};
      if (protectedReading) {
        const glyphOpacity = [...w.text].reduce((least, ch, k) => {
          if (/\s/u.test(ch)) return least;
          if (s.m.turn?.letters?.[k] === 'hidden') return 0;
          return Math.min(least, s.m.letters?.[k]?.opacity ?? 1);
        }, 1);
        const opacity = boardActive(board, f) && !s.m.hidden ? s.m.opacity * glyphOpacity : 0;
        if (opacity < VISIBLE_THRESHOLD) {
          note(`vis${i}`, {...base, rule: 'visible', detail: `opacity ${opacity.toFixed(2)} (needs ${VISIBLE_THRESHOLD})`}, f, 1 - opacity);
          continue;
        }
      }
      if (moving && b.def.pin !== 'screen') continue; // rule 181.2: checked when the transit ends
      // KIT 89: a word turning in 3D is in transit (edge-on is not a wipe); KIT 90: so is, under transitRules 'energy',
      // a word in its first 12 frames of motion. Both are checked again once they are still.
      if (s.m.turn || transitExempt(board, i, f)) continue;
      if (f < (grace.get(i) ?? -Infinity)) continue; // rule 81.7: checked from 10 frames after the start handoff
      // rule 58: a held morph source waits exempt from the readability rules, but nothing may touch its ink (Fable
      // item 30 overruled the overlap exemption of KIT 79.4)
      if (waiting(i, f)) { if (s.vis) overlapPass(i, w, s, f, base); continue; }
      // Fable item 38a: a word printed on a page that a page above uncovers by folding (a DOOR flip) may complete up to
      // PANEL_REVEAL_GRACE frames after its sung frame; after that, and for anything else, the visibility check applies
      if (!s.shown && b.def.on && f < w.sf + PANEL_REVEAL_GRACE && (board.panels ?? []).some((p) => p.id !== b.def.on && panelSwinging(p, f / FPS))) continue;
      if (!protectedReading && (!s.shown || s.m.opacity < VISIBLE_THRESHOLD)) { note(`vis${i}`, {...base, rule: 'visible', detail: `opacity ${s.m.opacity.toFixed(2)} (needs ${VISIBLE_THRESHOLD})`}, f, 1 - s.m.opacity); continue; }
      // KIT 90: frames read at rest (shown, still, outside any rig transit), for `energy-read`
      if (energy && !wordMoving(board, i, f)) restFrames.set(i, (restFrames.get(i) ?? 0) + step);
      const xs = s.quad.map((p) => p.x), ys = s.quad.map((p) => p.y);
      const over = Math.max(FORMAT.safeInsets.left - Math.min(...xs), Math.max(...xs) - (WIDTH - FORMAT.safeInsets.right), FORMAT.safeInsets.top - Math.min(...ys), Math.max(...ys) - (HEIGHT - FORMAT.safeInsets.bottom));
      const capPx = w.h * Math.abs(s.m.sy) * bcam.zoom;
      // Fable item 29: a word stays whole inside the margin for 12 frames after its sung frame
      // if its cap is 200 px or more on screen (20 frames otherwise); after that it may be cropped, but never to less
      // than half its height in frame while its own line is still being sung (`crop-half`)
      const wholeFor = capAtSung(i) >= MARGIN_BIG_CAP ? MARGIN_WHOLE_BIG : MARGIN_WHOLE;
      if (over > 0.5 && f < w.sf + wholeFor) note(`margin${i}`, {...base, rule: 'margin', detail: `outside the ${FORMAT.id === 'wide' ? '48 px safe margin' : 'format safe box'} within ${wholeFor} frames of its sung frame`}, f, over);
      if (f >= w.sf + wholeFor && f < lineSungEnd(w.line)) {
        // a word wholly out of frame (the rig has moved on down a stack) is not cropped; a sliver of it is
        const kept = heightInFrame(s.quad);
        if (kept > 0.001 && kept < 0.5) note(`crop${i}`, {...base, rule: 'crop-half', detail: 'cropped by the frame edge to less than half its height while its line is still sung'}, f, 100 * (1 - kept));
      }
      // Fable item 46: a sung word is at least 56 px cap on screen while it is read
      const minCap = SUNG_MIN_CAP;
      if (capPx < minCap - 0.25) note(`cap${i}`, {...base, rule: 'sung-cap', detail: `cap height below ${minCap} px on screen`}, f, minCap - capPx);
      const ang = normDeg(b.angle + s.m.rot + bcam.rot);
      const st = stanceOf(ang);
      if (!b.def.tower) {
        if (st === 'inverted') note(`inv${i}`, {...base, rule: 'stance', detail: 'turned 100 degrees or more from level while sung (upside down)'}, f, Math.abs(ang));
        else if (st === 'between') note(`st${i}`, {...base, rule: 'stance', detail: 'between stances while sung (level 8, tilt 12 or 25 plus or minus 4, quarter 90 plus or minus 5)'}, f, Math.abs(ang));
        else if (st === 'quarter-' || st === 'quarter+') {
          const rowWords = Math.max(...b.rows.map((r) => r.words.length));
          if (st === 'quarter+' && !(b.words.length === 1 && [...w.text].filter((c) => /\p{L}/u.test(c)).length <= 6))
            note(`qp${i}`, {...base, rule: 'stance', detail: '+90 (reading top to bottom) is only for a single word of at most 6 letters'}, f, Math.abs(ang));
          if (st === 'quarter-' && rowWords > 3) note(`qw${i}`, {...base, rule: 'stance', detail: `a quarter turn carries at most 3 words per line (this block has ${rowWords})`}, f, rowWords);
          if (capPx < QUARTER_MIN_CAP - 0.25) note(`qc${i}`, {...base, rule: 'stance', detail: `a quarter-turned word needs a cap height of at least ${QUARTER_MIN_CAP} px`}, f, QUARTER_MIN_CAP - capPx);
          const q = quarterRun.get(i);
          if (q) q.len += step; else quarterRun.set(i, {start: f, len: step, worst: 0});
        }
        if (st !== 'quarter-' && st !== 'quarter+') { const q = quarterRun.get(i); if (q) { quarterDone.push({i, start: q.start, len: q.len}); quarterRun.delete(i); } }
      }
      overlapPass(i, w, s, f, base);
      clearScreen.forEach((poly, k) => {
        if (polysOverlap(s.quad, poly, 3)) note(`gr${i}-${k}`, {...base, rule: 'overlap', detail: `overlaps keepClear graphic ${k}`}, f, 1);
        else if (f >= w.sf && f < w.sf + PROP_CLEAR_FRAMES && polysOverlap(s.quad, poly, -PROP_CLEAR)) note(`pc${i}-${k}`, {...base, rule: 'prop-clear', detail: `within ${PROP_CLEAR} px of keepClear shape ${k} in its first ${PROP_CLEAR_FRAMES} frames (Fable item 38)`}, f, 1);
      });
    }
    // Reading load per line
    if (f > fEndReading) continue;
    const started = L.order.filter((i) => L.words.get(i)!.sf <= f);
    const curLine = WORDS[started.length ? started[started.length - 1] : L.order[0]].line;
    let bright = 0, visible = 0;
    for (const i of L.order) {
      const s = states.get(i)!;
      if (!s.shown) continue;
      const c = s.quad.reduce((a, p) => ({x: a.x + p.x / 4, y: a.y + p.y / 4}), {x: 0, y: 0});
      if (c.x < 0 || c.x > WIDTH || c.y < 0 || c.y > HEIGHT) continue;
      visible++;
      if (s.m.opacity > 0.75) bright++;
    }
    const st = lineStats.get(curLine) ?? {line: curLine, transits: 0, peakBright: 0, peakVisible: 0};
    st.peakBright = Math.max(st.peakBright, bright); st.peakVisible = Math.max(st.peakVisible, visible);
    lineStats.set(curLine, st);
  }
  // K2 picture words: the graphic stands in for the word from its sung frame for PICTURE_FRAMES frames
  for (const i of L.order) {
    const w = L.words.get(i)!;
    const id = w.opts.picture;
    if (id === undefined) continue;
    const g = board.graphics?.find((x) => x.id === id);
    const base: Violation = {board: name, rule: 'picture', severity: 'error', word: i, text: w.text, line: w.line, detail: ''};
    if (!g) { out.push({...base, detail: `its picture graphic "${id}" is not on this board`}); continue; }
    for (let f = w.sf; f < w.sf + PICTURE_FRAMES; f++) {
      const life = graphicLife(g, f / FPS);
      const op = life ? (g.exitBy === 'shape' ? 1 : 1 - life.out) : 0;
      const polys = life ? g.box({t: f / FPS, board, layout: L}) : null;
      if (!life || op < 0.9 || !polys?.length) { note(`pic${i}`, {...base, detail: `picture graphic "${id}" is not shown at full opacity`}, f, 1 - op); continue; }
      const cam = cameraAt(board, f);
      const pts = (g.layer === 'screen' ? polys : polys.map((q) => q.map((p) => toScreen(cam, p)))).flat();
      const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
      const over = Math.max(-Math.min(...xs), Math.max(...xs) - WIDTH, -Math.min(...ys), Math.max(...ys) - HEIGHT);
      if (over > 0.5) note(`picf${i}`, {...base, detail: `picture graphic "${id}" is not wholly in frame`}, f, over);
      const side = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      if (side < PICTURE_MIN_SIDE - 0.25) note(`pics${i}`, {...base, detail: `picture graphic "${id}" is under ${PICTURE_MIN_SIDE} px on its longer side`}, f, PICTURE_MIN_SIDE - side);
    }
  }
  // KIT 90 (brief item 10.3): under transitRules 'energy' every word reads at rest for 8 frames of its reading interval
  if (energy) for (const i of L.order) {
    const w = L.words.get(i)!;
    if (w.opts.picture !== undefined) continue;
    const got = restFrames.get(i) ?? 0;
    if (got < ENERGY_READ_FRAMES) out.push({board: name, rule: 'energy-read', severity: 'error', word: i, text: w.text, line: w.line, detail: `read at rest (shown, still, outside rig transits) for ${got} frames of its reading interval (needs ${ENERGY_READ_FRAMES}; transitRules 'energy')`});
  }
  for (const [i, q] of quarterRun) quarterDone.push({i, start: q.start, len: q.len});
  for (const q of quarterDone) if (q.len < QUARTER_HOLD) {
    const w = L.words.get(q.i)!;
    out.push({board: name, rule: 'stance', severity: 'error', word: q.i, text: w.text, line: w.line, from: q.start, to: q.start + q.len - 1, frames: q.len, detail: `quarter turn held for ${q.len} frames while sung (needs ${QUARTER_HOLD})`});
  }
  for (const {v, worst} of agg.values()) {
    const unit = v.rule === 'stance' ? ' deg' : v.rule === 'crop-half' ? ' percent of its height cut' : v.rule === 'visible' ? '' : ' px';
    out.push({...v, detail: `${v.detail}${v.rule === 'overlap' ? '' : ` (worst ${worst.toFixed(1)}${unit})`}`});
  }
  // Camera moves per line (the rig moves, with their kind, length and R, go into the line's plan)
  // (undefined on a board with no words, such as a title board of graphics only: its rig moves are checked, not planned)
  const lineAtFrame = (f: number): number | undefined => {
    if (!L.order.length) return undefined;
    const started = L.order.filter((i) => L.words.get(i)!.sf <= f + 4);
    return WORDS[started.length ? started[started.length - 1] : L.order[0]].line;
  };
  for (const m of rigMoves(board)) {
    const dRot = m.target.rot - m.from.rot;
    const l = lineAtFrame(m.start);
    if (l !== undefined) addPlan(l, `rig ${m.kind}${m.key.label ? ' (' + m.key.label + ')' : ''} at frame ${m.start.toFixed(0)} for ${m.dur} frames: R ${m.target.rot.toFixed(1)}, zoom ${m.target.zoom.toFixed(2)}`);
    if (m.stretchedFrom !== undefined) out.push({board: name, rule: 'rig-stretched', severity: 'warn', line: l, detail: `${m.kind} at frame ${m.start.toFixed(0)} asked for ${m.stretchedFrom} frames; lengthened to ${m.dur}`});
    const rg = RIG_FRAME_RANGE[m.kind];
    const slowRoll = m.kind === 'roll' && m.dur >= 24 && m.dur <= 36;
    const slowSoar = isSlowSoar(m);
    if (m.kind === 'soar' && m.dur > SLOW_SOAR_MAX) out.push({board: name, rule: 'rig-frames', severity: 'warn', line: l, detail: `soar at frame ${m.start.toFixed(0)} takes ${m.dur} frames (a slow soar takes ${SLOW_SOAR_MIN} to ${SLOW_SOAR_MAX})`});
    if (rg && !slowRoll && !slowSoar && !(m.kind === 'soar' && m.dur > SLOW_SOAR_MAX) && (m.dur < rg[0] || m.dur > rg[1])) out.push({board: name, rule: 'rig-frames', severity: 'warn', line: l, detail: `${m.kind} at frame ${m.start.toFixed(0)} takes ${m.dur} frames (style bible: ${rg[0]} to ${rg[1]}${m.kind === 'roll' ? ', or a slow roll of 24 to 36' : ''})`});
    if (Math.abs(dRot) >= 80 && m.dur < 8) out.push({board: name, rule: 'rig-turn', severity: 'error', line: l, detail: `${m.kind} turns ${dRot.toFixed(0)} degrees in ${m.dur} frames (a quarter turn takes at least 8)`});
    const changes = Math.abs(dRot) > 0.01 || Math.abs(m.target.zoom / Math.max(1e-6, m.from.zoom) - 1) > 0.001 || Math.hypot(m.target.x - m.from.x, m.target.y - m.from.y) > 0.5;
    if (changes && m.dur > 0 && m.dur < 6) out.push({board: name, rule: 'rig-frames', severity: 'error', line: l, detail: `${m.kind} at frame ${m.start.toFixed(0)} changes the camera in ${m.dur} frames (transitions take at least 6)`});
  }
  // Motion legibility (brief 12.1 to 12.3): every word, and every tracked element, over the board's whole life.
  const lifeEnd = endF + exitFramesOf(board) - 1;
  for (const i of L.order) {
    const w = L.words.get(i)!;
    let prevM: WordMod | null = null;
    const viol = checkTrack(`word ${i} "${WORDS[i].text}"`, Math.floor(board.start * FPS), lifeEnd, (f) => {
      const m = wordStateAt(board, i, f);
      const pm = prevM; prevM = m;
      if (m.hidden) return null;
      const cam = camForBlock(board, w.block, f);
      // the rig is exempt from the cap, so the word is also measured against the board (its previous pose through this camera)
      const relPrev = pm && !pm.hidden ? screenQuad(board, w, pm, f, cam) : undefined;
      const pid = L.blocks[w.block].def.on;
      const pp = pid ? board.panels?.find((x) => x.id === pid) : undefined;
      // KIT 89: type in a 3D turn is not held to the speed cap (brief item 11); under 'energy' no type is (below)
      const exemptType = m.turn || pm?.turn ? true : undefined;
      // KIT 91: a block whose emergence sets speedCap false is not held to the cap before its words are sung
      const uncapped = L.blocks[w.block].def.emerge?.speedCap === false && f <= w.sf ? true : undefined;
      return {opacity: m.opacity, quad: screenQuad(board, w, m, f, cam), state: m.colour ?? '', relPrev, swing: (pp ? panelSwingExempt(pp, f / FPS) : undefined) || exemptType || uncapped};
    }, {word: i, abruptOk: gradualFor(i) || !!L.blocks[w.block].def.on, screen: {w: WIDTH, h: HEIGHT}, maxOpacityStep: 1 / MIN_TRANSITION_FRAMES,
      // Legacy word motion treated retirement dimming as a continuous hold, separate from readability.
      visibilityThreshold: board.readingIntervals?.[i] ? VISIBLE_THRESHOLD : 0.25,
      // KIT 90 (Fable amendment): under transitRules 'energy' type in any flight, whip or turn is exempt from the speed cap
      exempt: [...(energy ? ['speed' as const] : []), ...(board.readingIntervals?.[i] ? ['min-visible' as const] : [])]});
    for (const v of viol) out.push({board: name, rule: v.rule, severity: 'error', word: i, text: WORDS[i].text, line: w.line, from: v.from, to: v.to, frames: v.frames, detail: v.detail});
  }
  // rules, panels and the tips of board paths are tracked automatically
  const autoTracks: TrackedElement[] = [...ruleTracks(board), ...panelTracks(board)];
  for (const path of board.paths ?? []) {
    const tipAt = path.tipAt;
    if (tipAt) autoTracks.push({id: `${path.label ?? 'path ' + path.id} tip`, exempt: ['abrupt'], sample: (t) => { const p = tipAt(t).p; return {opacity: 1, quad: rectQuad(p.x - 4, p.y - 4, 8, 8)}; }});
  }
  for (const el of [...(board.track ?? []), ...autoTracks]) {
    const f0 = (el.from ?? board.start) * FPS, f1 = el.to !== undefined ? el.to * FPS : lifeEnd;
    let prevW: Pt[] | null = null;
    const viol = checkTrack(el.id, f0, f1, (f) => {
      const s = el.sample(f / FPS);
      const pw = prevW; prevW = s ? s.quad : null;
      if (!s) return null;
      const cam = cameraAt(board, f);
      const relPrev = pw ? pw.map((p) => toScreen(cam, p)) : undefined;
      return {...s, quad: s.quad.map((p) => toScreen(cam, p)), relPrev};
    }, {exempt: el.exempt, screen: {w: WIDTH, h: HEIGHT}, maxOpacityStep: 1 / MIN_TRANSITION_FRAMES});
    for (const v of viol) out.push({board: name, rule: v.rule, severity: 'error', detail: `${el.id}: ${v.detail}`, from: v.from, to: v.to, frames: v.frames});
  }
  // Handoff frames (rule 81, rule 181.5)
  if (board.handoff?.start !== undefined) out.push(...checkHandoff(board, name, board.handoff.start, 'start'));
  if (board.handoff?.end !== undefined && board.handoff.end !== 'open') out.push(...checkHandoff(board, name, board.handoff.end, 'end'));
  out.push(...boardRuleChecks(board, {name, L, intervals, step, addPlan}));
  out.push(...motionRuleChecks(board, name, L));
  for (const [l, p] of plan) { const st = lineStats.get(l) ?? {line: l, transits: 0, peakBright: 0, peakVisible: 0}; st.plan = p; lineStats.set(l, st); }
  for (const st of lineStats.values()) st.transits = transits.filter((x) => lineAtFrame(x.start) === st.line).length;
  const lines = [...lineStats.values()].sort((a, b) => a.line - b.line);
  for (const ls of lines) {
    if (ls.peakBright > 15) out.push({board: name, rule: 'load', severity: 'warn', line: ls.line, detail: `${ls.peakBright} bright words in frame (max 15)`});
    if (ls.peakVisible > 26) out.push({board: name, rule: 'load', severity: 'warn', line: ls.line, detail: `${ls.peakVisible} words in frame (max 26)`});
  }
  // board.waive: named rules this board waives, with the reason; their errors are reported as warnings. KIT 83: a
  // waiver with `words` or `block` matches only violations reported on those words (a bare string, tolerated at run
  // time for hand-written boards, waives the rule board-wide with no reason)
  const waiverMatches = (x: Waiver | string, v: Violation) => {
    if (typeof x === 'string') return x === v.rule;
    if (x.rule !== v.rule) return false;
    if (x.words === undefined && x.block === undefined) return true;
    if (v.word === undefined) return false;
    if (x.words && (v.word < x.words[0] || v.word > x.words[1])) return false;
    if (x.block !== undefined && L.words.get(v.word)?.block !== x.block) return false;
    return true;
  };
  for (const v of out) {
    const wv = (board.waive as (Waiver | string)[] | undefined)?.find((x) => waiverMatches(x, v));
    if (wv && v.severity === 'error' && v.rule !== 'handoff-unknown') { v.severity = 'warn'; v.detail = `${v.detail} [waived: ${typeof wv === 'string' ? 'no reason given' : wv.why}]`; }
  }
  return {board: name, violations: out, lines};
};

/** Checks a board against a handoff frame at its start or end: the ground colour, the rig at rest for 3 frames, the
 *  vignette, and each handoff word's screen box (within HANDOFF_TOL px). Marks (a video's own graphics) are listed, not
 *  measured; a mark that names a board path needs that path on the board. */
export const checkHandoff = (board: Board, name: string, id: HandoffId, side: 'start' | 'end'): Violation[] => {
  const out: Violation[] = [];
  if (side === 'end' && id === 'open') return out;
  const H = handoffById(id);
  if (!H) return [{board: name, rule: 'handoff-unknown', severity: 'error',
    detail: `unknown ${side} handoff id ${JSON.stringify(id)}`}];
  const err = (detail: string, severity: Severity = 'error') => out.push({board: name, rule: 'handoff', severity, detail: `${id} (${side}): ${detail}`});
  const hf = Math.round(H.t * FPS);
  const f = side === 'start' ? hf : hf - 1;
  const edge = side === 'start' ? board.start : board.end;
  if (Math.abs(edge - H.t) * FPS > 1) err(`board ${side} ${edge.toFixed(2)} s is not at the handoff time ${H.t.toFixed(2)} s`);
  if (board.vignette === false) err('the vignette is off (every handoff has it on)');
  const g = groundAt(board, f / FPS);
  if (g.full.toLowerCase() !== H.bg.toLowerCase() || g.partial.length) err(`ground is ${g.full}${g.partial.length ? ' with a wipe in progress' : ''}; the handoff is ${H.bg}`);
  for (const m of rigMoves(board)) {
    const a = side === 'start' ? f : f - 3, b = side === 'start' ? f + 3 : f;
    if (m.dur > 0 && m.start < b + 1 && m.start + m.dur > a) err(`rig ${m.kind} at frame ${m.start.toFixed(0)} is moving within 3 frames of the handoff`);
  }
  const L = layoutBoard(board);
  const norm = (s: string) => s.toUpperCase().replace(/[^\p{L}\p{N}]/gu, '');
  for (const e of H.elements) {
    if (e.kind === 'word') {
      const want = {x: e.x, y: e.baseline - e.cap, w: e.w, h: e.cap, text: e.text};
      const cands = L.order.filter((i) => norm(L.words.get(i)!.text) === norm(want.text));
      let best: {d: number; box: number[]} | null = null;
      for (const i of cands) {
        const w = L.words.get(i)!, m = wordStateAt(board, i, f);
        if (m.hidden || m.opacity < 0.95) continue;
        const q = screenQuad(board, w, m, f);
        const xs = q.map((p) => p.x), ys = q.map((p) => p.y);
        const capY = Math.min(...ys), x0 = Math.min(...xs), x1 = Math.max(...xs);
        // the quad includes descenders (boxH); compare the cap box: top, left, width and the cap height scaled by the zoom
        const cam = camForBlock(board, w.block, f);
        const capH = w.h * Math.abs(m.sy) * cam.zoom;
        const box = [x0, capY, x1 - x0, capH];
        const d = Math.max(Math.abs(box[0] - want.x), Math.abs(box[1] - want.y), Math.abs(box[2] - want.w), Math.abs(box[3] - want.h));
        if (!best || d < best.d) best = {d, box};
      }
      if (!best) err(`no fully visible word "${want.text}" on the board at frame ${f}`);
      else if (best.d > HANDOFF_TOL) err(`"${want.text}" is at (${best.box.map((v) => v.toFixed(0)).join(', ')}) but the handoff has (${[want.x, want.y, want.w, want.h].map((v) => v.toFixed(0)).join(', ')}), off by ${best.d.toFixed(1)} px`);
    } else if (e.path !== undefined && !board.paths?.some((p) => p.id === e.path)) err(`the handoff has ${e.label} (path "${e.path}") but the board has no such path`);
    else err(`${e.label}: not measured by the validator; check the still`, 'warn');
  }
  return out;
};

/** Checks a module's boards. When the song defines handoffs, the module must start and end on one (rule 181.5). */
export const validateBoards = (boards: Board[], opts?: {step?: number}) => {
  const reports = boards.map((b) => validateBoard(b, opts));
  // the timeline `empty` warning, reported on the board where the empty run starts
  const usable = boards.filter((_, k) =>
    !reports[k].violations.some((v) => v.rule === 'emerge-anchor' && v.severity === 'error'));
  for (const e of emptyTimeline(usable, usable.map((b) => layoutBoard(b)))) {
    const k = Math.max(0, boards.findIndex((b) => e.from >= b.start * FPS && e.from < b.end * FPS));
    reports[k]?.violations.push({board: reports[k].board, rule: 'empty', severity: 'warn', from: e.from, to: e.to, frames: e.to - e.from + 1, detail: `${e.to - e.from + 1} frames with no unretired lyric word in frame (more than 12)`});
  }
  // display guard over the handoff pictures (displayed words are guarded where they are laid out)
  for (const [id, h] of Object.entries(HANDOFFS)) for (const e of h.elements) {
    if (e.kind !== 'word') continue;
    const b = bannedIn(e.text);
    if (b && reports.length) reports[0].violations.push({board: reports[0].board, rule: 'guard', severity: 'error', detail: `handoff ${id} shows "${e.text}", which holds the banned spelling "${b}"`});
  }
  if (Object.keys(HANDOFFS).length && reports.length) {
    if (!boards[0].handoff?.start) reports[0].violations.push({board: reports[0].board, rule: 'handoff', severity: 'error', detail: 'the first board of the module declares no start handoff (handoff.start)'});
    const n = boards.length - 1;
    if (!boards[n].handoff?.end) reports[n].violations.push({board: reports[n].board, rule: 'handoff', severity: 'error', detail: 'the last board of the module declares no end handoff (handoff.end)'});
  }
  return reports;
};

/** Human-readable report. */
export const formatReports = (reports: BoardReport[]) => {
  const rows: string[] = [];
  let errors = 0, warns = 0;
  for (const r of reports) {
    rows.push(`== ${r.board}`);
    for (const l of r.lines) {
      rows.push(`   L${String(l.line).padStart(2, '0')}: camera moves ${l.transits}, peak bright words ${l.peakBright}, peak words in frame ${l.peakVisible}`);
      for (const p of l.plan ?? []) rows.push(`        ${p}`);
    }
    if (!r.violations.length) rows.push('   no violations');
    for (const v of r.violations) {
      if (v.severity === 'error') errors++; else warns++;
      const who = v.word !== undefined ? ` word ${v.word} "${v.text ?? WORDS[v.word]?.text}"` : v.line !== undefined ? ` L${v.line}` : '';
      const when = v.from !== undefined ? ` frames ${v.from}-${v.to} (${v.frames} checked)` : '';
      rows.push(`   ${v.severity.toUpperCase()} ${v.rule}${who}${when}: ${v.detail}`);
    }
  }
  rows.push(`TOTAL: ${errors} errors, ${warns} warnings across ${reports.length} boards`);
  return rows.join('\n');
};

export {EXIT_FRAMES};
