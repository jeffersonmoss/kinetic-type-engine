// Phase 2 group 2 checks (Fable engine comparison items 33, 35, 36, 37, 38 and 45; ported from the Huang kit's
// validateSheet.ts and DOGE's sheet/validate.ts, with Jefferson's floor of 15 frames readable).
// The first five (and `empty`) run only on boards with sheetRules: they are the Huang and DOGE camera style and
// conflict with the first video's (6-frame steps, deliberate stills, transit-read).
//   fast-move        (error, Huang A9) a fast move (a transit of 20 frames or fewer): a pivot of 45 degrees or more, a push
//                    or pull of 1.5 times or more, or over 400 px of travel, outside 12 to 16 frames; any other outside 8 to
//                    14; two fast moves starting under 20 frames apart
//   still-camera     (error, Huang A5) the camera dead still for more than 30 frames (a chunk carry's motion and the
//                    frames the carry rule holds still excepted); waive it
//                    for a deliberate still (board.waive)
//   entrance-in-move (error, Huang A3) part of a word's entrance drawn during a fast move;
//   camera-rest      (warning, the same) a word sung during a fast move
//   slide-early      (error, Huang A4) a slideFrom word more than half in frame earlier than earlyOk (8) frames before
//                    it is sung
//   framing          (warning, DOGE) the sung line's widest row spans under 60 percent of the safe width on screen
//   prop-size        (error) a tracked element with `minSize` whose longer side is under it on screen while it is shown
//   empty            (warning, timeline) more than 12 frames with no unretired lyric word in frame (validateBoards)
import {FPS, HEIGHT, LIMITS, RIG_CENTRE, SAFE_BOX, WIDTH} from './config';
import {cameraAt, toScreen, toWorld} from './camera';
import {carrySpan, carryStillSpan} from './carry';
import {inkQuad} from './validateRules';
import {SLIDE_EARLY_OK} from './emergence/slide';
import {ENERGY_SLIDE_EARLY, energyRules} from './transitRules';
import {rigMoves, TRANSIT_KINDS} from './rig';
import type {Board, BoardLayout, Pt} from './types';
import {normDeg} from './util';
import type {WordMod} from './verbRegistry';
import {emergeCue, retireFrame, wordStateAt} from './wordState';
import type {Violation} from './validate';

export const FAST_FRAMES = 20;
export const FAST_SPACING = 20;
export const STILL_MAX = 30;
export const MIN_ROW_FILL = 0.6;
export const EMPTY_FRAMES = 12;


/** Allowed lengths of a fast move by its size (Huang amendment A9). */
export const fastLimits = (from: {x: number; y: number; zoom: number; rot: number}, to: {x: number; y: number; zoom: number; rot: number}) => {
  const turn = Math.abs(normDeg(to.rot - from.rot));
  const ratio = Math.max(to.zoom / from.zoom, from.zoom / to.zoom);
  const c = RIG_CENTRE;
  const q = toScreen(to, toWorld(from, c));
  const travel = Math.hypot(q.x - c.x, q.y - c.y);
  if (turn >= 45) return {min: 12, max: 16, what: `pivot of ${turn.toFixed(0)} degrees`};
  if (ratio >= 1.5 - 1e-6 || travel > LIMITS.fastTravel) return {min: 12, max: 16, what: `push or pull (${ratio.toFixed(2)} times, ${travel.toFixed(0)} px)`};
  return {min: 8, max: 14, what: 'fast move'};
};
export const fastMoves = (board: Board) => rigMoves(board).filter((m) => TRANSIT_KINDS.has(m.kind) && m.dur > 0 && m.dur <= FAST_FRAMES);

const fracInFrame = (q: Pt[]) => {
  const xs = q.map((p) => p.x), ys = q.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const a = Math.max(1e-6, (x1 - x0) * (y1 - y0));
  return (Math.max(0, Math.min(x1, WIDTH) - Math.max(x0, 0)) * Math.max(0, Math.min(y1, HEIGHT) - Math.max(y0, 0))) / a;
};

export const motionRuleChecks = (board: Board, name: string, L: BoardLayout): Violation[] => {
  const out: Violation[] = [];
  const startF = Math.ceil(board.start * FPS), endF = Math.floor(board.end * FPS) - 1;
  const memo = new Map<string, WordMod>();
  const st = (i: number, f: number) => { const k = `${i}@${f}`; let m = memo.get(k); if (!m) { m = wordStateAt(board, i, f); memo.set(k, m); } return m; };

  const fast = fastMoves(board);
  const sheet = !!board.sheetRules;
  // fast-move lengths and spacing
  if (sheet) fast.forEach((m, k) => {
    const lim = fastLimits(m.from, m.target);
    if (m.dur < lim.min - 1e-6 || m.dur > lim.max + 1e-6) out.push({board: name, rule: 'fast-move', severity: 'error', from: m.start, to: m.start + m.dur, frames: m.dur, detail: `${m.key.label ?? m.kind}: a ${lim.what} in ${m.dur.toFixed(0)} frames (${lim.min} to ${lim.max}, Huang A9)`});
    const prev = fast[k - 1];
    if (prev && m.start - prev.start < FAST_SPACING) out.push({board: name, rule: 'fast-move', severity: 'error', from: prev.start, to: m.start, detail: `fast moves start ${(m.start - prev.start).toFixed(0)} frames apart (at least ${FAST_SPACING})`});
  });

  // still-camera: dead still for more than 30 frames; a chunk carry's motion and the frames the carry rule requires
  // still (carryStillSpan: B to B+44 on the outgoing side) are not counted and end a run
  const spans = (board.carry ?? []).flatMap((c): [number, number][] => { try { return [carrySpan(c), carryStillSpan(c)]; } catch { return []; } });
  let run = 0, runStart = startF;
  let prev = cameraAt(board, startF);
  for (let f = startF + 1; sheet && f <= endF + 1; f++) {
    const c = f <= endF ? cameraAt(board, f) : null;
    const still = !!c && Math.abs(c.x - prev.x) * c.zoom < 0.02 && Math.abs(c.y - prev.y) * c.zoom < 0.02 && Math.abs(c.zoom / prev.zoom - 1) < 1e-5 && Math.abs(c.rot - prev.rot) < 1e-3;
    const carried = spans.some(([a, b]) => f >= a && f <= b);
    if (still && !carried) { if (!run) runStart = f - 1; run++; }
    else {
      if (run > STILL_MAX) out.push({board: name, rule: 'still-camera', severity: 'error', from: runStart, to: runStart + run, frames: run, detail: `the camera is dead still for ${run} frames (at most ${STILL_MAX}, Huang A5): end the still hold sooner, or waive it for a deliberate still`});
      run = 0;
    }
    if (c) prev = c;
  }

  const inFast = (f: number) => fast.find((m) => f >= m.start && f < m.start + m.dur);
  const cues = L.blocks.map((_, k) => emergeCue(board, k));
  for (const i of L.order) {
    const w = L.words.get(i)!;
    const cue = cues[w.block];
    // entrance-in-move and camera-rest (opt-in)
    if (sheet) {
      const lo = Math.max(startF, Math.floor(w.sf - 60));
      let bad = -1;
      for (let f = lo; f < w.sf; f++) { const m = st(i, f); if (!m.hidden && m.opacity > 0.05 && inFast(f)) { bad = f; break; } }
      if (bad >= 0) out.push({board: name, rule: 'entrance-in-move', severity: 'error', word: i, text: w.text, from: bad, detail: 'part of its entrance is drawn during a fast move (Huang A3): start the entrance after the move, or make the move slower than 20 frames'});
      const mv = inFast(w.sf);
      if (mv) out.push({board: name, rule: 'camera-rest', severity: 'warn', word: i, text: w.text, from: w.sf, detail: `sung during the fast move at frames ${mv.start.toFixed(0)} to ${(mv.start + mv.dur).toFixed(0)}`});
    }
    // slide-early
    if (cue?.name === 'slideFrom' && cue.params?.from && 'edge' in (cue.params.from as object)) {
      const ok0 = (cue.params?.earlyOk as number | undefined) ?? SLIDE_EARLY_OK;
      // KIT 90 (Fable amendment): under transitRules 'energy' a flying word lands on its sung frame or at most 6 before
      const ok = energyRules(board) ? Math.min(ok0, ENERGY_SLIDE_EARLY) : ok0;
      for (let f = Math.max(startF, Math.floor(w.sf - 90)); f < w.sf - ok; f++) {
        const m = st(i, f);
        if (m.hidden || m.opacity <= 0.05) continue;
        if (fracInFrame(inkQuad(board, L, w, m, f)) > 0.5) { out.push({board: name, rule: 'slide-early', severity: 'error', word: i, text: w.text, from: f, detail: `more than half in frame ${(w.sf - f).toFixed(0)} frames before it is sung (at most ${ok}, Huang A4)`}); break; }
      }
    }
  }

  // framing: the sung line's widest row against the safe width
  const safeW = SAFE_BOX.width;
  const lines = [...new Set(L.order.map((i) => L.words.get(i)!.line))];
  for (const ln of sheet ? lines : []) {
    const ids = L.order.filter((i) => L.words.get(i)!.line === ln);
    const a = Math.max(startF, Math.min(...ids.map((i) => L.words.get(i)!.sf))), z = Math.min(endF, Math.max(...ids.map((i) => retireFrame(board, i))));
    let worst = Infinity, at = a;
    for (let f = a; f <= z; f += 2) {
      let widest = 0;
      for (const b of L.blocks) for (const r of b.rows) {
        const ws = r.words.filter((i) => ids.includes(i) && L.words.get(i)!.sf <= f);
        if (!ws.length) continue;
        const q0 = inkQuad(board, L, L.words.get(r.words[0])!, st(r.words[0], f), f), q1 = inkQuad(board, L, L.words.get(r.words[r.words.length - 1])!, st(r.words[r.words.length - 1], f), f);
        widest = Math.max(widest, Math.hypot(q1[1].x - q0[0].x, q1[1].y - q0[0].y));
      }
      if (widest > 0 && widest < worst) { worst = widest; at = f; }
    }
    if (Number.isFinite(worst) && worst < MIN_ROW_FILL * safeW - 0.5) out.push({board: name, rule: 'framing', severity: 'warn', line: ln, from: at, to: at, detail: `the sung line's widest row spans ${((worst / safeW) * 100).toFixed(0)} percent of the safe width on screen (DOGE: at least ${MIN_ROW_FILL * 100})`});
  }

  // prop-size: tracked elements with a minimum on-screen size
  for (const el of board.track ?? []) {
    if (!el.minSize) continue;
    const a = Math.ceil((el.from ?? board.start) * FPS), z = Math.floor((el.to ?? board.end) * FPS);
    let worst = Infinity, at = a;
    for (let f = a; f <= z; f += 2) {
      const s = el.sample(f / FPS);
      if (!s || s.opacity < 0.5) continue;
      const cam = cameraAt(board, f);
      const q = s.quad.map((p) => toScreen(cam, p));
      const e = (k: number) => Math.hypot(q[(k + 1) % q.length].x - q[k].x, q[(k + 1) % q.length].y - q[k].y);
      const v = Math.max(e(0), e(1));
      if (v < worst) { worst = v; at = f; }
    }
    if (worst < el.minSize - 0.5) out.push({board: name, rule: 'prop-size', severity: 'error', from: at, detail: `${el.id}: longer side ${worst.toFixed(0)} screen px while shown (at least ${el.minSize})`});
  }
  return out;
};

/** The timeline `empty` warning over a module's boards: more than 12 frames with no unretired lyric word in frame. */
export const emptyTimeline = (boards: Board[], layouts: BoardLayout[]): {from: number; to: number}[] => {
  const keep = boards.map((b, k) => k).filter((k) => boards[k].sheetRules);
  layouts = keep.map((k) => layouts[k]);
  boards = keep.map((k) => boards[k]);
  if (!boards.length) return [];
  const a = Math.ceil(Math.min(...boards.map((b) => b.start)) * FPS), z = Math.floor(Math.max(...boards.map((b) => b.end)) * FPS) - 1;
  const out: {from: number; to: number}[] = [];
  let run = 0, s0 = a;
  for (let f = a; f <= z + 1; f++) {
    const any = f <= z && boards.some((b, k) => {
      if (f < b.start * FPS || f >= b.end * FPS) return false;
      const L = layouts[k];
      return L.order.some((i) => {
        const w = L.words.get(i)!;
        const reading = b.readingIntervals?.[i];
        if (reading ? f < reading.start || f > reading.end : f < w.sf || f >= retireFrame(b, i)) return false;
        const m = wordStateAt(b, i, f);
        return !m.hidden && m.opacity >= 0.5 && fracInFrame(inkQuad(b, L, w, m, f)) > 0;
      });
    });
    if (any || f > z) { if (run > EMPTY_FRAMES) out.push({from: s0, to: s0 + run - 1}); run = 0; }
    else { if (!run) s0 = f; run++; }
  }
  return out;
};
