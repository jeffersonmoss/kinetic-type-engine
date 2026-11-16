// validateBoard (rule 181): checks every frame of every word's reading interval. Pure; runs in node through
// tools/validate-boards.mjs. Words are read from their display frame to their retire frame (retired text is exempt from
// readability); rig transits are exempt and the words sung during one are checked when it ends; speed is the smaller
// of screen and board-relative speed (the rig is exempt from the cap); every block must declare its emergence from a
// resolvable anchor; stances, handoffs and rig keys are checked.
import {FPS, HANDOFFS, HEIGHT, LINES, WIDTH, WORDS} from './config';
import {camForBlock, cameraAt, toScreen} from './camera';
import {groundAt} from './ground';
import {blockToWorld, layoutBoard} from './layout';
import {describeAnchor, resolveAnchor} from './letters';
import {MIN_TRANSITION_FRAMES, rectQuad} from './motion';
import {clipConvex, polyArea} from './validateRules';
import {RIG_FRAME_RANGE, rigMoves, rigTransits} from './rig';
import {ruleTracks} from './rules';
import type {Board, CameraState, Handoff, HandoffId, Pt, WordGeom} from './types';
import {normDeg, polysOverlap, rot} from './util';
import {getVerb, type WordMod} from './verbRegistry';
import {checkTrack, type TrackedElement} from './motionCheck';
import {panelTracks, separatingPanel} from './panels';
import {panelGoneAt, panelQuad, panelSwingExempt, panelSwinging} from './panel';
import {boardRuleChecks} from './validateRules';
import {EXIT_FRAMES, RETIRE_AFTER, baseCtx, boardCues, cueAffects, cueAt, retireFrame, wordStateAt} from './wordState';

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
  const local = [{x: w.x, y: w.y}, {x: w.x + w.w, y: w.y}, {x: w.x + w.w, y: w.y + w.boxH}, {x: w.x, y: w.y + w.boxH}].map((p) => {
    const q = rot({x: (p.x - cx) * m.sx, y: (p.y - cy) * m.sy}, m.rot);
    return {x: q.x + cx + m.dx, y: q.y + cy + m.dy};
  });
  return local.map((p) => toScreen(cam, blockToWorld(b, p)));
};

type Agg = {v: Violation; worst: number};

/** Checks one board. `opts.step` samples every n-th frame (default 1: every frame). */
export const validateBoard = (board: Board, opts: {step?: number} = {}): BoardReport => {
  const step = opts.step ?? 1;
  const name = board.id ?? `board@${board.start.toFixed(2)}`;
  const L = layoutBoard(board);
  const out: Violation[] = [];
  const agg = new Map<string, Agg>();
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
  const isExempt = (a: number, b: number) => exempt.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  const replacedEnter = (i: number) => cues.some((c) => getVerb(c.name)?.replacesEnter && cueAffects(c, L, getVerb(c.name)).includes(i));
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
      const e = b.def.emerge;
      const first = b.words[0]?.i;
      if (!e) { out.push({board: name, rule: 'emerge', severity: 'error', word: first, text: first !== undefined ? WORDS[first].text : undefined, detail: `block ${b.index} declares no emergence (every block comes out of text, a rule, a panel or a path)`}); continue; }
      let ok = true, desc = '';
      try { const r = resolveAnchor(L, e.from, (e.at ?? (first !== undefined ? L.words.get(first)!.sf / FPS : board.start))); desc = describeAnchor(L, e.from); if (r.estimated) out.push({board: name, rule: 'anchor-estimated', severity: 'warn', word: first, detail: `block ${b.index}: ${desc} has no counter in the font table; a central box was guessed`});
        if (e.move === 'nest' && r.w !== undefined && b.w > 0.8 * r.w + 0.5) out.push({board: name, rule: 'nest-width', severity: 'error', word: first, detail: `block ${b.index} is ${b.w.toFixed(0)} px wide, more than 80 percent of the counter it nests in (${r.w.toFixed(0)} px)`});
      } catch (err) { ok = false; out.push({board: name, rule: 'emerge-anchor', severity: 'error', word: first, detail: `block ${b.index} (${e.move}): ${(err as Error).message}`}); }
      if (ok && first !== undefined) addPlan(L.words.get(first)!.line, `block ${b.index} "${b.words.map((w) => w.text).join(' ')}": ${e.move.toUpperCase()} from ${desc}`);
    }
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
  for (const i of L.order) {
    const w = L.words.get(i)!;
    const req = retireFrame(board, i);
    const rem = removal.get(i) ?? Infinity;
    // the reading interval is half-open, [sung frame, retire or removal frame): from that frame the word is retired
    // (dimmed, exempt) or gone
    const end = Math.min(req, rem, endF) - 1e-6;
    const d = displayFrom.get(i);
    if (d !== undefined && d > w.sf + 0.5) out.push({board: name, rule: 'display-late', severity: 'error', word: i, text: w.text, line: w.line, detail: `its emergence finishes ${(d - w.sf).toFixed(1)} frames after the word is sung (a morph must be done by the sung frame)`});
    intervals.set(i, [w.sf, end]);
    if (endF < Math.min(req, rem) - 0.5)
      out.push({board: name, rule: 'min-life', severity: 'warn', word: i, text: w.text, line: w.line, detail: `board exits at frame ${endF.toFixed(0)}, ${(Math.min(req, rem) - endF).toFixed(0)} frames before the word's required life ends (${req})`});
    if (w.sf < startF) out.push({board: name, rule: 'board-start', severity: 'error', word: i, text: w.text, detail: `word starts at frame ${w.sf}, before the board appears (${startF})`});
  }

  // Relight binds: the displayed word is read while the bound word is sung
  for (const bd of binds) {
    const sw = WORDS[bd.sung];
    if (!sw || !L.words.has(bd.display)) { out.push({board: name, rule: 'relight', severity: 'error', word: bd.display, detail: `relight binds word ${bd.sung} to word ${bd.display}, which is not on this board (or the sung word does not exist)`}); continue; }
    const s0 = Math.round(sw.start_s * FPS), s1 = Math.round(sw.end_s * FPS);
    const iv = intervals.get(bd.display)!;
    if (iv[1] < s1 - 0.5) out.push({board: name, rule: 'relight', severity: 'error', word: bd.display, text: WORDS[bd.display].text, detail: `retires at frame ${iv[1].toFixed(0)}, before the bound word "${sw.text}" finishes (frame ${s1})`});
    intervals.set(bd.display, [iv[0], Math.max(iv[1], Math.min(s1, endF))]);
    addPlan(sw.line, `relight: "${sw.text}" (${bd.sung}) sung on "${WORDS[bd.display].text}" (${bd.display}) from frame ${s0}`);
  }
  // Words sung during a rig transit must still be read at its end plus 10 frames (rule 181.2)
  for (const tr of transits) for (const i of L.order) {
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
    if (c === undefined) { const w = L.words.get(i)!; const m = wordStateAt(board, i, w.sf); c = w.h * Math.abs(m.sy) * camForBlock(board, w.block, w.sf).zoom; capMemo.set(i, c); }
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
    const states = new Map<number, {m: WordMod; quad: Pt[]; vis: boolean}>();
    for (const i of L.order) {
      const w = L.words.get(i)!;
      const m = wordStateAt(board, i, f);
      const vis = !m.hidden && m.opacity > 0.05;
      states.set(i, {m, quad: vis ? screenQuad(board, w, m, f) : [], vis});
    }
    const clear = board.keepClear?.(f / FPS) ?? [];
    const clearScreen = clear.map((poly) => poly.map((p) => toScreen(cam, p)));
    const overlapPass = (i: number, w: WordGeom, s: {m: WordMod; quad: Pt[]; vis: boolean}, f: number, base: Violation) => {
      for (const j of L.order) {
        if (j === i) continue;
        const o = states.get(j)!;
        if (!o.vis || isExempt(i, j)) continue;
        if (f < w.sf || f < L.words.get(j)!.sf) continue; // a word still making its entrance may pass over a neighbour
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
      const b = L.blocks[w.block];
      const s = states.get(i)!;
      const bcam = camForBlock(board, w.block, f);
      if (moving && b.def.pin !== 'screen') continue; // rule 181.2: checked when the transit ends
      const base: Violation = {board: name, rule: '', severity: 'error', word: i, text: WORDS[i].text, line: w.line, detail: ''};
      // rule 58: a held morph source waits exempt from the readability rules, but nothing may touch its ink (Fable
      // item 30 overruled the overlap exemption of KIT 79.4)
      if (waiting(i, f)) { if (s.vis) overlapPass(i, w, s, f, base); continue; }
      const threshold = f === w.sf && !replacedEnter(i) ? 0.9 : 0.45;
      // Fable item 38a: a word printed on a page that a page above uncovers by folding (a DOOR flip) may complete up to
      // PANEL_REVEAL_GRACE frames after its sung frame; after that, and for anything else, the visibility check applies
      if (!s.vis && b.def.on && f < w.sf + PANEL_REVEAL_GRACE && (board.panels ?? []).some((p) => p.id !== b.def.on && panelSwinging(p, f / FPS))) continue;
      if (!s.vis || s.m.opacity < threshold) { note(`vis${i}`, {...base, rule: 'visible', detail: `opacity ${s.m.opacity.toFixed(2)} (needs ${threshold})`}, f, 1 - s.m.opacity); continue; }
      const xs = s.quad.map((p) => p.x), ys = s.quad.map((p) => p.y);
      const over = Math.max(SAFE - Math.min(...xs), Math.max(...xs) - (WIDTH - SAFE), SAFE - Math.min(...ys), Math.max(...ys) - (HEIGHT - SAFE));
      const capPx = w.h * Math.abs(s.m.sy) * bcam.zoom;
      // Fable item 29: a word stays whole inside the margin for 12 frames after its sung frame
      // if its cap is 200 px or more on screen (20 frames otherwise); after that it may be cropped, but never to less
      // than half its height in frame while its own line is still being sung (`crop-half`)
      const wholeFor = capAtSung(i) >= MARGIN_BIG_CAP ? MARGIN_WHOLE_BIG : MARGIN_WHOLE;
      if (over > 0.5 && f < w.sf + wholeFor) note(`margin${i}`, {...base, rule: 'margin', detail: `outside the 48 px safe margin within ${wholeFor} frames of its sung frame`}, f, over);
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
      clearScreen.forEach((poly, k) => { if (polysOverlap(s.quad, poly, 3)) note(`gr${i}-${k}`, {...base, rule: 'overlap', detail: `overlaps keepClear graphic ${k}`}, f, 1); });
    }
    // Reading load per line
    if (f > fEndReading) continue;
    const started = L.order.filter((i) => L.words.get(i)!.sf <= f);
    const curLine = WORDS[started.length ? started[started.length - 1] : L.order[0]].line;
    let bright = 0, visible = 0;
    for (const i of L.order) {
      const s = states.get(i)!;
      if (!s.vis) continue;
      const c = s.quad.reduce((a, p) => ({x: a.x + p.x / 4, y: a.y + p.y / 4}), {x: 0, y: 0});
      if (c.x < 0 || c.x > WIDTH || c.y < 0 || c.y > HEIGHT) continue;
      visible++;
      if (s.m.opacity > 0.75) bright++;
    }
    const st = lineStats.get(curLine) ?? {line: curLine, transits: 0, peakBright: 0, peakVisible: 0};
    st.peakBright = Math.max(st.peakBright, bright); st.peakVisible = Math.max(st.peakVisible, visible);
    lineStats.set(curLine, st);
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
  const lineAtFrame = (f: number) => { const started = L.order.filter((i) => L.words.get(i)!.sf <= f + 4); return WORDS[started.length ? started[started.length - 1] : L.order[0]].line; };
  for (const m of rigMoves(board)) {
    const dRot = m.target.rot - m.from.rot;
    const l = lineAtFrame(m.start);
    addPlan(l, `rig ${m.kind}${m.key.label ? ' (' + m.key.label + ')' : ''} at frame ${m.start.toFixed(0)} for ${m.dur} frames: R ${m.target.rot.toFixed(1)}, zoom ${m.target.zoom.toFixed(2)}`);
    if (m.stretchedFrom !== undefined) out.push({board: name, rule: 'rig-stretched', severity: 'warn', line: l, detail: `${m.kind} at frame ${m.start.toFixed(0)} asked for ${m.stretchedFrom} frames; lengthened to ${m.dur}`});
    const rg = RIG_FRAME_RANGE[m.kind];
    const slowRoll = m.kind === 'roll' && m.dur >= 24 && m.dur <= 36;
    if (rg && !slowRoll && (m.dur < rg[0] || m.dur > rg[1])) out.push({board: name, rule: 'rig-frames', severity: 'warn', line: l, detail: `${m.kind} at frame ${m.start.toFixed(0)} takes ${m.dur} frames (style bible: ${rg[0]} to ${rg[1]}${m.kind === 'roll' ? ', or a slow roll of 24 to 36' : ''})`});
    if (Math.abs(dRot) >= 80 && m.dur < 8) out.push({board: name, rule: 'rig-turn', severity: 'error', line: l, detail: `${m.kind} turns ${dRot.toFixed(0)} degrees in ${m.dur} frames (a quarter turn takes at least 8)`});
    const changes = Math.abs(dRot) > 0.01 || Math.abs(m.target.zoom / Math.max(1e-6, m.from.zoom) - 1) > 0.001 || Math.hypot(m.target.x - m.from.x, m.target.y - m.from.y) > 0.5;
    if (changes && m.dur > 0 && m.dur < 6) out.push({board: name, rule: 'rig-frames', severity: 'error', line: l, detail: `${m.kind} at frame ${m.start.toFixed(0)} changes the camera in ${m.dur} frames (transitions take at least 6)`});
  }
  // Motion legibility (brief 12.1 to 12.3): every word, and every tracked element, over the board's whole life.
  const lifeEnd = endF + EXIT_FRAMES[board.exit] - 1;
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
      return {opacity: m.opacity, quad: screenQuad(board, w, m, f, cam), state: m.colour ?? '', relPrev, swing: pp ? panelSwingExempt(pp, f / FPS) : undefined};
    }, {word: i, abruptOk: gradualFor(i) || !!L.blocks[w.block].def.on, screen: {w: WIDTH, h: HEIGHT}, maxOpacityStep: 1 / MIN_TRANSITION_FRAMES});
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
  if (board.handoff?.start) out.push(...checkHandoff(board, name, board.handoff.start, 'start'));
  if (board.handoff?.end && board.handoff.end !== 'open') out.push(...checkHandoff(board, name, board.handoff.end, 'end'));
  out.push(...boardRuleChecks(board, {name, L, intervals, step, addPlan}));
  for (const [l, p] of plan) { const st = lineStats.get(l) ?? {line: l, transits: 0, peakBright: 0, peakVisible: 0}; st.plan = p; lineStats.set(l, st); }
  for (const st of lineStats.values()) st.transits = transits.filter((x) => lineAtFrame(x.start) === st.line).length;
  const lines = [...lineStats.values()].sort((a, b) => a.line - b.line);
  for (const ls of lines) {
    if (ls.peakBright > 15) out.push({board: name, rule: 'load', severity: 'warn', line: ls.line, detail: `${ls.peakBright} bright words in frame (max 15)`});
    if (ls.peakVisible > 26) out.push({board: name, rule: 'load', severity: 'warn', line: ls.line, detail: `${ls.peakVisible} words in frame (max 26)`});
  }
  return {board: name, violations: out, lines};
};

/** Checks a board against a handoff frame at its start or end: the ground colour, the rig at rest for 3 frames, the
 *  vignette, and each handoff word's screen box (within HANDOFF_TOL px). Marks (a video's own graphics) are listed, not
 *  measured; a mark that names a board path needs that path on the board. */
export const checkHandoff = (board: Board, name: string, id: HandoffId, side: 'start' | 'end'): Violation[] => {
  const out: Violation[] = [];
  const H: Handoff | undefined = HANDOFFS[id];
  if (!H) return out; // a handoff the song does not define (the film's own start and end)
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
