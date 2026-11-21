// Word life: arrival, sung, held, retired, culled; board exits; then verb, panel and occlusion effects (rule 50,
// rule 168). Pure function of (board, word, frame). Used by the renderer and by validateBoard alike.
import {panelCover, panelWordMod} from './panels';
import {HANDOFF_CLEAR_FRAMES, handoffClearFrame} from './handoffWords';
import {CULL_DISTANCE, FPS, HEIGHT, LINES, WIDTH, WORDS} from './config';
import {camForBlock, cameraAt, toScreen, toWorld} from './camera';
import {carryClearOpacity} from './carry';
import {rigTransits} from './rig';
import {wipeFullAt} from './ground';
import {MIN_VISIBLE_FRAMES} from './motion';
import {blockToWorld, layoutBoard, wordCorners, worldToBlock} from './layout';
import type {Block, Board, BoardLayout, Emergence, Pt, SlideSource, VerbCue, WordGeom} from './types';
import {boardTurnExitFrames, boardTurnExitMod, turnWordMod} from './emergence/turn';
import {resolveAnchor} from './letters';
import {resolveTurn} from './turn3d';
import {clamp, easeInQuad, easeOutCubic, rand, rot, sfOf} from './util';
import {SPEED_CAP} from './motion';
import {IDENTITY, composeMod, resolveVerb, type VerbCtxBase, type VerbDef, type WordMod} from './verbRegistry';
import './verbs';
import './verbsSheet';
import './wah';
import './emergence';
import {groundClearClip, groundClearSpan} from './groundClear';

/** Board exit durations (all at least MIN_TRANSITION_FRAMES; leave and fall also respect the speed cap). */
export const EXIT_FRAMES: Record<Board['exit'], number> = {cut: 12, fall: 24, fade: 8, leave: 16, none: 0, turn: 10};
/** Frames of a board's exit: EXIT_FRAMES, except 'turn', whose length is its spec's (KIT 89). */
export const exitFramesOf = (board: Board) => (board.scoreExitFrames ?? (board.exit === 'turn' ? boardTurnExitFrames(board) : EXIT_FRAMES[board.exit]));
/** Is the board drawn at frame f (from its start until its exit has finished)? */
export const boardActive = (board: Board, f: number) => f >= board.start * FPS - 0.001 && f < board.end * FPS + exitFramesOf(board);

/** The resolved start (seconds) of a verb cue. */
export const cueAt = (cue: VerbCue, L: BoardLayout, def?: VerbDef) =>
  cue.at ?? def?.defaultAt?.(cue, L) ?? (WORDS[cue.word]?.start_s ?? L.board.start) + 10 / FPS;
export const cueAffects = (cue: VerbCue, L: BoardLayout, def?: VerbDef) =>
  (def?.affects?.(cue, L) ?? cue.words ?? [cue.word]).filter((i) => L.words.has(i)).sort((a, b) => a - b);
/** Does the cue replace word i's normal entrance (VerbDef.replacesEnter: true for all its words, or a list)? */
export const replacesEnterOf = (def: VerbDef, cue: VerbCue, L: BoardLayout, i: number): boolean => {
  const r = def.replacesEnter;
  if (!r) return false;
  if (r === true) return cueAffects(cue, L, def).includes(i);
  return r(cue, L).includes(i);
};

/** The verb cue the engine derives from a block's `emerge` declaration. The emergence move is a verb of the same
 *  name acting on the block's words; shove and hinge default to their modes 'push' and 'swing'. */
export const emergeCue = (board: Board, k: number): VerbCue | null => {
  const b = board.blocks[k];
  const e = b ? blockEmergence(b) : undefined;
  if (!e) return null;
  const words: number[] = [];
  for (let i = b.words[0]; i <= b.words[1]; i++) words.push(i);
  const mode = e.move === 'shove' ? {mode: 'push'} : e.move === 'hinge' ? {mode: 'swing'} : {};
  // KIT 89: a turn (or a turnSwap) carries its spec; a swap also names the element it turns away
  const turn = e.move === 'turn' ? (b.turnSwap ? {mode: 'swap', swapFrom: b.turnSwap.from, spec: {...(b.turnSwap.spec ?? {}), ...(e.turn ?? {})}} : {mode: 'in', spec: e.turn ?? {}}) : {};
  // KIT 91: speedCap false reaches the move's own frame count (capFrames) through its params
  const cap = e.speedCap === false ? {speedCap: false} : {};
  return {name: e.move === 'effect' ? e.name : e.move, word: b.words[0], words, at: e.at, params: {...mode, ...turn, ...(e.params ?? {}), ...cap, from: e.from, block: k, showFrom: b.showFrom, emerged: true}};
};
/** A block's emergence: its `emerge`, or (KIT 89) a 'turn' out of its turnSwap's outgoing element when it has none. */
export const blockEmergence = (b: Block): Emergence | undefined =>
  b.emerge ?? (b.turnSwap ? {move: 'turn', from: b.turnSwap.from} : undefined);
/** Derive a runtime exit cue from either the legacy style or a lowered effect. */
export const blockExitCue = (board: Board, k: number): VerbCue | null => {
  const b = board.blocks[k];
  const x = b?.exit;
  if (!x) return null;
  const [a, z] = x.words ?? b.words;
  const words: number[] = [];
  for (let i = Math.max(a, b.words[0]); i <= Math.min(z, b.words[1]); i++) {
    if (!x.targets || x.targets.includes(i)) words.push(i);
  }
  if (!words.length) return null;
  const params = x.style === 'turn' ? {mode: 'out', spec: x.turn ?? {}}
    : x.style === 'effect' ? x.params : {mode: 'blockExit'};
  // Direct scene styles retain a fallback for callers without an effect table.
  const name = x.style === 'effect' ? x.name : x.style === 'turn' || Object.hasOwn(board.effects ?? {}, x.style)
    ? x.style : '@block-exit/' + x.style;
  return {name, word: words[0], words, at: x.at, params: {...params, block: k}};
};
const cueMemo = new WeakMap<Board, VerbCue[]>();
/** All verb cues of a board (from every block, plus the cues derived from emergence declarations and block exits). */
export const boardCues = (board: Board): VerbCue[] => {
  const hit = cueMemo.get(board);
  if (hit) return hit;
  const out = board.blocks.flatMap((b) => b.verb ?? []);
  board.blocks.forEach((_, k) => { const c = emergeCue(board, k); if (c) out.push(c); });
  board.blocks.forEach((_, k) => { const c = blockExitCue(board, k); if (c) out.push(c); });
  cueMemo.set(board, out);
  return out;
};

// ---------------------------------------------------------------- word life (rule 50, rule 168)
/** Retired text dims to this opacity over RETIRE_FRAMES. */
export const RETIRE_OPACITY = 0.45;
export const RETIRE_FRAMES = 10;
/** Frames after its line's last word ends before a word is retired. */
export const RETIRE_AFTER = 6;
/** Below this drawn opacity a word counts as gone for the validator's per-frame passes (overlap, ink, crop, framing):
 *  the same threshold the hidden and fade exits already use. */
export const GONE_OPACITY = 0.05;
/** KIT 83: the opacity the render actually draws a word's ink at: its word opacity times its brightest letter. A verb
 *  that fades only the letters (`vanish`, `closeIn`) leaves the word opacity at 1, so without this the validator kept
 *  a vanished word on screen until a later exit. Computed from the same WordMod the render uses (wordStateAt), so the
 *  timing is the render's own (per-letter delay and MIN_TRANSITION_FRAMES fade). */
export const inkOpacity = (m: {hidden?: boolean; opacity: number; letters?: {opacity: number}[]}): number =>
  m.hidden ? 0 : m.opacity * (m.letters?.length ? Math.max(...m.letters.map((l) => l.opacity)) : 1);
// Board-level cut/leave have a per-block equivalent. They conceal the word without moving the rest of the board.
const blockExitVerbs = new Map<string, VerbDef>();
for (const style of ['fade', 'fall', 'cut', 'leave'] as const) {
  const duration = EXIT_FRAMES[style];
  blockExitVerbs.set('@block-exit/' + style, {
    gradual: true,
    removesAt: (c) => c.at * FPS + duration,
    modify: (c) => {
      const u = clamp(c.df / duration);
      if (style === 'cut') return {opacity: u < 1 ? 1 : 0};
      if (style === 'fade') return {opacity: 1 - u};
      const dist = style === 'fall' ? SPEED_CAP * duration / (2 * c.camAt(c.at * FPS).zoom) : c.geom.boxH * 2;
      const travel = dist * (style === 'fall' ? u * u : u);
      return {dx: c.down.x * travel, dy: c.down.y * travel, opacity: 1 - u};
    },
  });
}
/** Resolve board, legacy registry and block-only fallback definitions in priority order. */
export const verbFor = (board: Board, name: string): VerbDef | undefined =>
  resolveVerb(name, board.effects) ?? blockExitVerbs.get(name);

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
  let r = board.scoreLife ? Infinity : Math.max(lineEndF(w.line) + RETIRE_AFTER, w.sf + Math.max(20, MIN_VISIBLE_FRAMES));
  // A legacy hold may outlast protected reading. Never let implicit retirement dim a protected word.
  const reading = board.readingIntervals?.[i];
  if (reading) r = Math.max(r, reading.end + 1);
  const ku = L.blocks[w.block].def.keepUntil;
  if (ku !== undefined) r = Math.max(r, ku * FPS);
  for (const cue of boardCues(board)) {
    const def = verbFor(L.board, cue.name);
    for (const h of def?.holds?.(cue, L) ?? []) if (h.word === i) r = Math.max(r, h.until);
    for (const b of def?.binds?.(cue, L) ?? []) if (b.display === i) {
      const sw = WORDS[b.sung];
      if (sw) r = Math.max(r, lineEndF(sw.line) + RETIRE_AFTER, sfOf(sw.start_s) + 20, (board.readingIntervals?.[b.sung]?.end ?? -Infinity) + 1);
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
  // (a clearing disc with a `keep` list retires by its edge instead, K4: the word is culled once the disc covers it)
  for (const g of board.ground ?? []) if (g.clears && g.keep === undefined) { const fa = wipeFullAt(board, g) * FPS; if (ret <= fa) out = Math.min(out, fa); }
  const gc = groundClearSpan(board, i);
  if (gc) out = Math.min(out, gc.cover);
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
const clearMemo = new WeakMap<Board, Map<number, number>>();
/** Kit pass 21: the frame from which word i fades out for the end handoff (handoffWords.ts), or Infinity when it does
 *  not need to: it is in the handoff picture, culled by then, or (its laid-out box, at the camera of the board's last
 *  frame) out of frame anyway. */
export const handoffClearAt = (board: Board, i: number): number => {
  let memo = clearMemo.get(board);
  if (!memo) { memo = new Map(); clearMemo.set(board, memo); }
  const hit = memo.get(i);
  if (hit !== undefined) return hit;
  let out = handoffClearFrame(board, i);
  if (out < Infinity) {
    const lastF = out + HANDOFF_CLEAR_FRAMES;
    const L = layoutBoard(board);
    const w = L.words.get(i)!;
    const cam = camForBlock(board, w.block, lastF);
    const q = wordCorners(L.blocks[w.block], {...w, h: w.boxH}).map((p) => toScreen(cam, p));
    const xs = q.map((p) => p.x), ys = q.map((p) => p.y);
    const inFrame = Math.max(...xs) > 0 && Math.min(...xs) < WIDTH && Math.max(...ys) > 0 && Math.min(...ys) < HEIGHT;
    if (cullFrame(board, i) <= lastF || !inFrame) out = Infinity;
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
  const def = verbFor(L.board, cue.name);
  const at = cueAt(cue, L, def);
  return {cue, at, f, t: f / FPS, df: f - at * FPS, L, affected: cueAffects(cue, L, def), camAt: (x: number) => cameraAt(L.board, x)};
};

function sourceInBlock(L: BoardLayout, block: number, anchor: SlideSource, frame: number): Pt {
  const b = L.blocks[block];
  const cam = camForBlock(L.board, block, frame);
  if (!('edge' in anchor)) {
    const source = resolveAnchor(L, anchor, frame / FPS);
    const sourceCam = source.block === undefined ? cameraAt(L.board, frame) : camForBlock(L.board, source.block, frame);
    return worldToBlock(b, toWorld(cam, toScreen(sourceCam, source.p)));
  }
  const centre = toScreen(cam, blockToWorld(b, {x: b.w / 2, y: b.h / 2}));
  const point = anchor.edge === 'bottom' ? {...centre, y: HEIGHT}
    : anchor.edge === 'top' ? {...centre, y: 0}
    : {...centre, x: anchor.edge === 'left' ? 0 : WIDTH};
  return worldToBlock(b, toWorld(cam, point));
}

interface WordCueEntry {cue: VerbCue; def: VerbDef; at: number; affected: number[]; k: number}
interface WordCuePlan {replaced: boolean; hasHide: boolean; hideBefore: number; cues: WordCueEntry[]}
const EMPTY_PLAN: WordCuePlan = {replaced: false, hasHide: false, hideBefore: -Infinity, cues: []};
const cuePlanMemo = new WeakMap<Board, Map<number, WordCuePlan>>();
const wordCuePlans = (board: Board, L: BoardLayout): Map<number, WordCuePlan> => {
  const hit = cuePlanMemo.get(board);
  if (hit) return hit;
  const plans = new Map<number, WordCuePlan>();
  const get = (word: number) => {
    let p = plans.get(word);
    if (!p) { p = {replaced: false, hasHide: false, hideBefore: -Infinity, cues: []}; plans.set(word, p); }
    return p;
  };
  for (const cue of boardCues(board)) {
    const def = verbFor(board, cue.name);
    if (!def) continue;
    const affected = def.modify || def.replacesEnter === true ? cueAffects(cue, L, def) : [];
    let at: number | undefined;
    const atOf = () => (at ??= cueAt(cue, L, def));
    const lead = def.lead ?? 0;
    const holds = def.replacesEnter && def.holds ? new Set(def.holds(cue, L).map((h) => h.word)) : undefined;
    const rep = def.replacesEnter === true ? affected : typeof def.replacesEnter === 'function' ? def.replacesEnter(cue, L) : [];
    for (const word of rep) {
      if (holds?.has(word)) continue;
      const p = get(word);
      p.replaced = true;
      const hb = atOf() * FPS - lead;
      p.hideBefore = p.hasHide ? Math.min(p.hideBefore, hb) : hb;
      p.hasHide = true;
    }
    if (def.hiddenBefore) {
      for (const word of def.hiddenBefore(cue, L)) {
        const p = get(word);
        const hb = atOf() * FPS - lead;
        p.hideBefore = p.hasHide ? Math.min(p.hideBefore, hb) : hb;
        p.hasHide = true;
      }
    }
    if (def.modify) {
      const cueStart = atOf();
      for (let k = 0; k < affected.length; k++) {
        if (k > 0 && affected[k] === affected[k - 1]) continue;
        get(affected[k]).cues.push({cue, def, at: cueStart, affected, k});
      }
    }
  }
  cuePlanMemo.set(board, plans);
  return plans;
};

/** Full render state of word i on a board at frame f (absolute, fractional allowed). */
export const wordStateAt = (board: Board, i: number, f: number): WordMod => {
  const L = layoutBoard(board);
  const w = L.words.get(i);
  if (!w) return {...IDENTITY, hidden: true, opacity: 0};
  const n = w.adv.length;
  const plan = wordCuePlans(board, L).get(i) ?? EMPTY_PLAN;
  const replaced = plan.replaced;
  if (f < plan.hideBefore - (board.effects ? 1e-6 : 0)) return {...IDENTITY, hidden: true, opacity: 0};
  // K2: a picture word is drawn by its graphic, never as type (its box keeps its place in the row)
  if (w.opts.picture !== undefined) return {...IDENTITY, hidden: true, opacity: 0};
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
  let effectKeepsAlive = false;
  if (plan.cues.length) {
    const block = L.blocks[w.block];
    const camAt = (x: number) => cameraAt(board, x);
    const t = f / FPS;
    for (const entry of plan.cues) {
      const df = f - entry.at * FPS;
      if (df < -(entry.def.lead ?? 0) - (board.effects ? 1e-6 : 0)) continue;
      const down = downIn(block.angle, camForBlock(board, w.block, entry.at * FPS).rot);
      const mod = entry.def.modify!({
        cue: entry.cue, at: entry.at, f, t, df, L, affected: entry.affected, camAt,
        i, k: entry.k, geom: w, block, down,
        source: (anchor, frame) => sourceInBlock(L, w.block, anchor, frame),
        projectTurn: (spec, progress) => {
          const resolved = resolveTurn(spec);
          return turnWordMod(L, i, entry.at * FPS + progress * resolved.frames, 'in', entry.at * FPS, resolved, entry.affected);
        },
      });
      if (mod?.keepAlive && Object.hasOwn(board.effects ?? {}, entry.cue.name)) effectKeepsAlive = true;
      v = composeMod(v, mod, n);
    }
  }
  // retired 6 frames after its line ends, dims to 45 percent over 10 frames, stays on the board; culled far away
  if (!effectKeepsAlive && f >= cullFrame(board, i)) return {...IDENTITY, hidden: true, opacity: 0};
  // an outgoing chunk carry with `clear` fades the board's type after its motion and then hides it (carry.ts)
  const cc = carryClearOpacity(board, f);
  if (cc <= 0) return {...IDENTITY, hidden: true, opacity: 0};
  const ret = retireFrame(board, i);
  if (f > ret && !effectKeepsAlive) m = composeMod(m, {opacity: 1 - (1 - RETIRE_OPACITY) * clamp((f - ret) / RETIRE_FRAMES)}, n);
  // the end handoff shows only its picture (rule 81.7): every other word fades out over the board's last frames
  const hc = handoffClearAt(board, i);
  if (f >= hc) m = composeMod(m, {opacity: 1 - clamp((f - hc) / HANDOFF_CLEAR_FRAMES)}, n);
  const co = carryOutSpan(board, i);
  if (co && f >= co.from) m = composeMod(m, {opacity: 1 - clamp((f - co.from) / Math.max(1, co.to - co.from))}, n);
  if (cc < 1) m = composeMod(m, {opacity: cc}, n);
  // board exit
  const endF = board.end * FPS;
  if (f >= endF) {
    if (board.exit === 'fade') m = composeMod(m, {opacity: 1 - clamp((f - endF) / EXIT_FRAMES.fade)}, n);
    // KIT 89: every block turns away (board.turn), the same turn as a block's exit
    if (board.exit === 'turn') m = composeMod(m, boardTurnExitMod(board, L, w, f), n);
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
  const handoff = board.screenHandoffOut;
  if (handoff && f >= handoff.frame) {
    const kept = handoff.glyphs.filter((ref) => ref.word === i);
    if (kept.length) out = composeMod(out, {letters: Array.from({length: n}, (_, index) => ({
      dx: 0, dy: 0, rot: 0, s: 1, opacity: kept.some((ref) => ref.index === index) ? 0 : 1,
    }))}, n);
  }
  if (L.blocks[w.block].def.on) {
    const pm = panelWordMod(board, L, w, f);
    if (pm?.hidden) return {...IDENTITY, hidden: true, opacity: 0};
    out = composeMod(out, pm, n);
  }
  // occlusion by the panels drawn above the word (panels.ts, panelCover)
  if (board.panels?.length && !out.hidden) {
    const b = L.blocks[w.block];
    const cx = w.x + w.w / 2, cy = w.y + w.boxH / 2;
    // Paper Trail K2: a spread word's box reaches past its advance (out.extend; undefined for every other word)
    const x0 = w.x - (out.extend?.l ?? 0), x1 = w.x + w.w + (out.extend?.r ?? 0);
    const quad = [[x0, w.y], [x1, w.y], [x1, w.y + w.boxH], [x0, w.y + w.boxH]].map(([x, y]) => {
      const q = rot({x: (x - cx) * out.sx, y: (y - cy) * out.sy}, out.rot);
      return blockToWorld(b, {x: q.x + cx + out.dx, y: q.y + cy + out.dy});
    });
    const pc = panelCover(board, L, w, f, quad);
    if (pc?.hidden) return {...IDENTITY, hidden: true, opacity: 0};
    if (pc?.clip && !out.clip) out = {...out, clip: pc.clip};
  }
  // K4: a clearing disc's travelling edge masks the word as it crosses it (a word already masked by its own move keeps
  // that mask; it is still hidden when the disc covers it, through cullFrame)
  if (board.ground?.length && !out.hidden && !out.clip) {
    const gc = groundClearClip(board, i, f);
    if (gc) out = {...out, clip: gc};
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
