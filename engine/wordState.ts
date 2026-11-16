// Word life: arrival, sung, held, retired, culled; board exits; then verb, panel and occlusion effects (rule 50,
// rule 168). Pure function of (board, word, frame). Used by the renderer and by validateBoard alike.
import {panelCover, panelWordMod} from './panels';
import {CULL_DISTANCE, FPS, HEIGHT, LINES, WIDTH, WORDS} from './config';
import {camForBlock, cameraAt, toScreen} from './camera';
import {rigTransits} from './rig';
import {wipeFullAt} from './ground';
import {MIN_VISIBLE_FRAMES} from './motion';
import {blockToWorld, layoutBoard, wordCorners} from './layout';
import type {Board, BoardLayout, Pt, VerbCue, WordGeom} from './types';
import {clamp, easeInQuad, easeOutCubic, rand, rot, sfOf} from './util';
import {SPEED_CAP} from './motion';
import {IDENTITY, composeMod, getVerb, type VerbCtxBase, type VerbDef, type WordMod} from './verbRegistry';
import './verbs';
import './emergence';

/** Board exit durations (all at least MIN_TRANSITION_FRAMES; leave and fall also respect the speed cap). */
export const EXIT_FRAMES: Record<Board['exit'], number> = {cut: 12, fall: 24, fade: 8, leave: 16, none: 0};
/** Is the board drawn at frame f (from its start until its exit has finished)? */
export const boardActive = (board: Board, f: number) => f >= board.start * FPS - 0.001 && f < board.end * FPS + EXIT_FRAMES[board.exit];

/** The resolved start (seconds) of a verb cue. */
export const cueAt = (cue: VerbCue, L: BoardLayout, def?: VerbDef) =>
  cue.at ?? def?.defaultAt?.(cue, L) ?? WORDS[cue.word].start_s + 10 / FPS;
export const cueAffects = (cue: VerbCue, L: BoardLayout, def?: VerbDef) =>
  (def?.affects?.(cue, L) ?? cue.words ?? [cue.word]).filter((i) => L.words.has(i)).sort((a, b) => a - b);

/** The verb cue the engine derives from a block's `emerge` declaration. The emergence move is a verb of the same
 *  name acting on the block's words; shove and hinge default to their modes 'push' and 'swing'. */
export const emergeCue = (board: Board, k: number): VerbCue | null => {
  const b = board.blocks[k];
  const e = b?.emerge;
  if (!e) return null;
  const words: number[] = [];
  for (let i = b.words[0]; i <= b.words[1]; i++) words.push(i);
  const mode = e.move === 'shove' ? {mode: 'push'} : e.move === 'hinge' ? {mode: 'swing'} : {};
  return {name: e.move, word: b.words[0], words, at: e.at, params: {...mode, ...(e.params ?? {}), from: e.from, block: k, showFrom: b.showFrom, emerged: true}};
};
const cueMemo = new WeakMap<Board, VerbCue[]>();
/** All verb cues of a board (from every block, plus the cues derived from emergence declarations). */
export const boardCues = (board: Board): VerbCue[] => {
  const hit = cueMemo.get(board);
  if (hit) return hit;
  const out = board.blocks.flatMap((b) => b.verb ?? []);
  board.blocks.forEach((_, k) => { const c = emergeCue(board, k); if (c) out.push(c); });
  cueMemo.set(board, out);
  return out;
};

// ---------------------------------------------------------------- word life (rule 50, rule 168)
/** Retired text dims to this opacity over RETIRE_FRAMES. */
export const RETIRE_OPACITY = 0.45;
export const RETIRE_FRAMES = 10;
/** Frames after its line's last word ends before a word is retired. */
export const RETIRE_AFTER = 6;
/** A retired word is culled once its box is farther than one frame diagonal from the frame centre. */
export {CULL_DISTANCE};
const lineEndF = (lineId: number) => { const l = LINES[lineId]; return l ? WORDS[l.words[l.words.length - 1]].end_s * FPS : 0; };
const retireMemo = new WeakMap<Board, Map<number, number>>();
/** Frame at which a word is retired: 6 frames after its line's last word ends, never before 20 frames
 *  after it is sung, kept for `keepUntil`, for verbs that hold it (morph sources, relit words), and for 10 frames after
 *  any rig transit that overlaps its sung window (rule 41: readable for 10 frames when the move ends). */
export const retireFrame = (board: Board, i: number): number => {
  let memo = retireMemo.get(board);
  if (!memo) { memo = new Map(); retireMemo.set(board, memo); }
  const hit = memo.get(i);
  if (hit !== undefined) return hit;
  const L = layoutBoard(board);
  const w = L.words.get(i);
  if (!w) return Infinity;
  memo.set(i, Infinity); // guard against cycles through binds
  let r = Math.max(lineEndF(w.line) + RETIRE_AFTER, w.sf + Math.max(20, MIN_VISIBLE_FRAMES));
  const ku = L.blocks[w.block].def.keepUntil;
  if (ku !== undefined) r = Math.max(r, ku * FPS);
  for (const cue of boardCues(board)) {
    const def = getVerb(cue.name);
    for (const h of def?.holds?.(cue, L) ?? []) if (h.word === i) r = Math.max(r, h.until);
    for (const b of def?.binds?.(cue, L) ?? []) if (b.display === i) {
      const sw = WORDS[b.sung];
      if (sw) r = Math.max(r, lineEndF(sw.line) + RETIRE_AFTER, sfOf(sw.start_s) + 20);
    }
  }
  const sungEnd = sfOf(WORDS[i].end_s);
  // strict: a word whose sung window ends on the frame a transit starts is not sung during it (a line's last word ends
  // exactly when the next line starts, and the transit that brings in the next line starts on that frame)
  for (const tr of rigTransits(board)) if (tr.start < sungEnd && tr.end > w.sf) r = Math.max(r, tr.end + 10);
  memo.set(i, r);
  return r;
};
const cullMemo = new WeakMap<Board, Map<number, number>>();
/** Frame from which a retired word is culled (Infinity if never): farther than a frame diagonal from the frame centre,
 *  or the board is cleared by a PORTAL (a ground wipe with `clears`). TIP and FOLD remove their words themselves. */
const carryMemo = new WeakMap<Board, Map<number, {from: number; to: number} | null>>();
const inFrame = (q: Pt[]) => q.every((p) => p.x >= -0.5 && p.x <= WIDTH + 0.5 && p.y >= -0.5 && p.y <= HEIGHT + 0.5);
const outOfFrame = (q: Pt[]) => q.every((p) => p.x <= 0) || q.every((p) => p.x >= WIDTH) || q.every((p) => p.y <= 0) || q.every((p) => p.y >= HEIGHT);
/** Carry-out (board.carryOut, Fable item 34): the frames over which word i fades out because a transit leaves it partly
 *  out of frame, or null. From the later of the move's start and the word's retire frame, to the move's end (at
 *  least 6 frames); a word already fully out of frame at the move's start is culled there. */
export const carryOutSpan = (board: Board, i: number): {from: number; to: number} | null => {
  if (!board.carryOut) return null;
  let memo = carryMemo.get(board);
  if (!memo) { memo = new Map(); carryMemo.set(board, memo); }
  if (memo.has(i)) return memo.get(i)!;
  const L = layoutBoard(board);
  const w = L.words.get(i)!;
  const b = L.blocks[w.block];
  const corners = wordCorners(b, {...w, h: w.boxH});
  const quad = (f: number) => { const cam = camForBlock(board, w.block, f); return corners.map((p) => toScreen(cam, p)); };
  const tr = rigTransits(board);
  const own = tr.filter((m) => m.end <= w.sf + 1e-6).length;
  const last = Math.ceil(board.end * FPS);
  let out: {from: number; to: number} | null = null;
  for (let k = 0; k < tr.length; k++) {
    const M = tr[k];
    if (M.end < w.sf + MIN_VISIBLE_FRAMES) continue;
    const holdEnd = Math.min((tr[k + 1]?.start ?? last) - 1, last);
    const aged = board.residueLife !== undefined && k + 1 - own > board.residueLife;
    if (!aged && inFrame(quad(M.end)) && inFrame(quad(holdEnd))) continue;
    if (outOfFrame(quad(M.start))) out = {from: M.start, to: M.start};
    else { const from = Math.max(M.start, retireFrame(board, i)); out = {from, to: Math.max(M.end, from + 6)}; }
    break;
  }
  memo.set(i, out);
  return out;
};
export const cullFrame = (board: Board, i: number): number => {
  let memo = cullMemo.get(board);
  if (!memo) { memo = new Map(); cullMemo.set(board, memo); }
  const hit = memo.get(i);
  if (hit !== undefined) return hit;
  const L = layoutBoard(board);
  const w = L.words.get(i)!;
  const ret = retireFrame(board, i);
  let out = carryOutSpan(board, i)?.to ?? Infinity;
  for (const g of board.ground ?? []) if (g.clears) { const fa = wipeFullAt(board, g) * FPS; if (ret <= fa) out = Math.min(out, fa); }
  const corners = wordCorners(L.blocks[w.block], {...w, h: w.boxH});
  const half = Math.hypot(w.w, w.boxH) / 2;
  const c = {x: (corners[0].x + corners[2].x) / 2, y: (corners[0].y + corners[2].y) / 2};
  const last = Math.min(out, Math.ceil(board.end * FPS) + 30);
  for (let f = Math.ceil(ret + RETIRE_FRAMES); f <= last; f++) {
    const cam = camForBlock(board, w.block, f);
    const s = toScreen(cam, c);
    if (Math.hypot(s.x - WIDTH / 2, s.y - HEIGHT / 2) - half * cam.zoom > CULL_DISTANCE) { out = Math.min(out, f); break; }
  }
  memo.set(i, out);
  return out;
};
/** Life stage of a word at a frame (rule 168). */
export type LifeStage = 'hidden' | 'arriving' | 'sung' | 'held' | 'retired' | 'culled';
export const lifeStage = (board: Board, i: number, f: number): LifeStage => {
  const L = layoutBoard(board);
  const w = L.words.get(i);
  if (!w) return 'hidden';
  if (f >= cullFrame(board, i)) return 'culled';
  if (f >= retireFrame(board, i)) return 'retired';
  const m = wordStateAt(board, i, f);
  if (m.hidden || m.opacity <= 0.05) return 'hidden';
  if (f < w.sf) return 'arriving';
  return f < sfOf(w.end) ? 'sung' : 'held';
};

/** Unit vector, in a block's frame, pointing screen-down for a camera rotation. */
export const downIn = (blockAngle: number, camRot: number): Pt => rot({x: 0, y: 1}, -(camRot + blockAngle));

export const baseCtx = (cue: VerbCue, L: BoardLayout, f: number): VerbCtxBase => {
  const def = getVerb(cue.name);
  const at = cueAt(cue, L, def);
  return {cue, at, f, t: f / FPS, df: f - at * FPS, L, affected: cueAffects(cue, L, def), camAt: (x: number) => cameraAt(L.board, x)};
};

/** Full render state of word i on a board at frame f (absolute, fractional allowed). */
export const wordStateAt = (board: Board, i: number, f: number): WordMod => {
  const L = layoutBoard(board);
  const w = L.words.get(i);
  if (!w) return {...IDENTITY, hidden: true, opacity: 0};
  const n = w.adv.length;
  const cues = boardCues(board);
  // a word a verb only holds (a morph's source) keeps its own entrance: only the verbs that bring the word in replace it
  const replacers = cues.filter((c) => {
    const def = getVerb(c.name);
    return def?.replacesEnter && cueAffects(c, L, def).includes(i) && !(def.holds?.(c, L) ?? []).some((h) => h.word === i);
  });
  const replaced = replacers.length > 0;
  // A word whose entrance a verb replaces stays hidden until that verb's lead window opens (it used to show at full
  // opacity from the board's start, vanish at the lead window, then enter: a blink).
  const hideBefore = replaced ? Math.min(...replacers.map((c) => baseCtx(c, L, 0).at * FPS - (getVerb(c.name)?.lead ?? 0))) : -Infinity;
  if (f < hideBefore) return {...IDENTITY, hidden: true, opacity: 0};
  let m: WordMod = {...IDENTITY};
  if (w.opts.tilt) m = composeMod(m, {rot: w.opts.tilt}, n);
  // arrival: there is no default entrance (no slam, pop or slide and no opacity ramp). A word printed on a panel is
  // shown by its panel (open, cover, fold); a block whose emergence does not replace the entrance (HINGE swing or leaf,
  // SWELL) is shown by that verb; a block with no emergence at all is hidden until its sung frame and then simply
  // there, which the validator reports (`emerge`, `arrival-pop`) instead of covering it with a fade.
  if (!replaced) {
    const bd = L.blocks[w.block].def;
    if (!bd.on && !bd.emerge && f < w.sf) return {...IDENTITY, hidden: true, opacity: 0};
  }
  // K4 growOnRepeat
  m = composeMod(m, repeatMod(L, w, f), n);
  // verbs (collected first so a verb can ask to keep the word alive)
  let v: WordMod = {...IDENTITY};
  for (const cue of cues) {
    const def = getVerb(cue.name);
    if (!def?.modify) continue;
    const base = baseCtx(cue, L, f);
    const k = base.affected.indexOf(i);
    if (k < 0 || base.df < -(def.lead ?? 0)) continue;
    const block = L.blocks[w.block];
    const down = downIn(block.angle, camForBlock(board, w.block, base.at * FPS).rot);
    v = composeMod(v, def.modify({...base, i, k, geom: w, block, down}), n);
  }
  // retired 6 frames after its line ends, dims to 45 percent over 10 frames, stays on the board; culled far away
  if (f >= cullFrame(board, i)) return {...IDENTITY, hidden: true, opacity: 0};
  const ret = retireFrame(board, i);
  if (f > ret) m = composeMod(m, {opacity: 1 - (1 - RETIRE_OPACITY) * clamp((f - ret) / RETIRE_FRAMES)}, n);
  const co = carryOutSpan(board, i);
  if (co && f >= co.from) m = composeMod(m, {opacity: 1 - clamp((f - co.from) / Math.max(1, co.to - co.from))}, n);
  // board exit
  const endF = board.end * FPS;
  if (f >= endF) {
    if (board.exit === 'fade') m = composeMod(m, {opacity: 1 - clamp((f - endF) / EXIT_FRAMES.fade)}, n);
    if (board.exit === 'fall') {
      // Words drop in reading order (one frame apart, at most 6), each falling 18 frames on an ease-in that peaks at
      // the speed cap, fading over its last 12 frames, so all are gone when the exit ends.
      const k = Math.min(6, L.order.indexOf(i));
      const df = f - endF - k;
      if (df > 0) {
        const b = L.blocks[w.block];
        const cam = cameraAt(board, endF);
        const down = downIn(b.angle, cam.rot);
        const dist = (SPEED_CAP * 18) / 2 / Math.max(0.01, cam.zoom); // easeInQuad peaks at twice the average speed
        const g = dist * easeInQuad(df / 18);
        m = composeMod(m, {dx: down.x * g, dy: down.y * g, rot: (rand('fall', i) - 0.5) * 20 * clamp(df / 18), opacity: 1 - clamp((df - 6) / 12)}, n);
      }
    }
  }
  // a word printed on a board panel takes the panel's transform (and is hidden while the panel is)
  let out = composeMod(m, v, n);
  if (L.blocks[w.block].def.on) {
    const pm = panelWordMod(board, L, w, f);
    if (pm?.hidden) return {...IDENTITY, hidden: true, opacity: 0};
    out = composeMod(out, pm, n);
  }
  // occlusion by the panels drawn above the word (panels.ts, panelCover)
  if (board.panels?.length && !out.hidden) {
    const b = L.blocks[w.block];
    const cx = w.x + w.w / 2, cy = w.y + w.boxH / 2;
    const quad = [[w.x, w.y], [w.x + w.w, w.y], [w.x + w.w, w.y + w.boxH], [w.x, w.y + w.boxH]].map(([x, y]) => {
      const q = rot({x: (x - cx) * out.sx, y: (y - cy) * out.sy}, out.rot);
      return blockToWorld(b, {x: q.x + cx + out.dx, y: q.y + cy + out.dy});
    });
    const pc = panelCover(board, L, w, f, quad);
    if (pc?.hidden) return {...IDENTITY, hidden: true, opacity: 0};
    if (pc?.clip && !out.clip) out = {...out, clip: pc.clip};
  }
  return out;
};

/** K4: the keyed word of a repeated block grows to 1.0 / 1.25 / 1.5 (by index) 12 frames after it lands, over 8 frames,
 *  anchored at its top edge and centred horizontally; rows below in the block, and blocks hung under it by D, are pushed down by the height gained. */
export const repeatScale = (L: BoardLayout, blockIndex: number, f: number) => {
  const r = L.blocks[blockIndex]?.def.repeat;
  if (!r) return 1;
  const kw = L.words.get(r.word);
  if (!kw) return 1;
  return 1 + ([0, 0, 0.25, 0.5][r.index] ?? 0) * easeOutCubic((f - kw.sf - 12) / 8);
};
const repeatMod = (L: BoardLayout, w: WordGeom, f: number): Partial<WordMod> | null => {
  // Pushed too: words in blocks hung under the growing block by an unbroken chain of D attachments.
  for (let b = w.block; b >= 0; b--) {
    const r = L.blocks[b].def.repeat;
    if (r) {
      const kw = L.words.get(r.word);
      if (!kw || kw.block !== b) return null;
      const s = repeatScale(L, b, f);
      if (s === 1) return null;
      if (w.i === r.word) return {sx: s, sy: s, dy: (kw.h * (s - 1)) / 2};
      if (b < w.block || w.row > kw.row) return {dy: kw.boxH * (s - 1)};
      return null;
    }
    if (L.blocks[b].def.attach !== 'D') return null;
  }
  return null;
};
