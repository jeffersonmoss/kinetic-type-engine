import {corners} from '../effects/geometry';
import {cameraAt, toScreen} from './camera';
import {FPS, HEIGHT, WIDTH} from './config';
import {blockToWorld, layoutBoard} from './layout';
import {hasCounter, letterBoxes, partOfBox} from './letters';
import {frameArea, readingGlyphs, wordCoverage} from './reading';
import {rigMoves} from './rig';
import type {Board, RigKind} from './types';
import {clipConvex, normDeg, polyArea, polysOverlap} from './util';
import type {BoardReport, Violation} from './validate';
import {wordStateAt} from './wordState';
import {worldWordBox} from './worldGeometry';
import {WORLD_DEFAULTS, isWorldAngle, isWorldReadAngle} from './worldSettings';

const ALLOWED_WORLD_RIG_KINDS = new Set<RigKind>(['cut', 'track', 'whip', 'roll', 'dive', 'soar', 'hold']);

export function validateWorld(board: Board): BoardReport {
  const name = board.id ?? `board@${board.start.toFixed(2)}`;
  const layout = layoutBoard(board);
  const start = Math.ceil(board.start * FPS - 1e-6);
  const end = Math.ceil(board.end * FPS - 1e-6);
  const screen = corners({x: 0, y: 0, width: WIDTH, height: HEIGHT});
  const hb = WORLD_DEFAULTS.hardBudgets;
  const violations: Violation[] = [];
  const seen = new Set<string>();
  const report = (rule: string, detail: string, word?: number, from?: number, to?: number) => {
    const key = word !== undefined ? `${rule}:${word}` : `${rule}:${from ?? '-'}`;
    if (seen.has(key)) return;
    seen.add(key);
    violations.push({board: name, rule, severity: 'error', detail, word, from, to});
  };

  // 1. Forbidden legacy board/block features (impossible even if constructed directly as a Board).
  if (board.motionStyle !== 'crisp') report('world-camera-style', 'world camera holds must be crisp (zero ambient drift)');
  if (board.exit !== 'none') report('world-forbidden-legacy', `world board exit "${board.exit}" is forbidden (must be "none")`);
  if (board.fadeToBlack) report('world-forbidden-legacy', 'fadeToBlack is forbidden in world mode');
  if (board.panels?.length) report('world-forbidden-legacy', 'panels are forbidden in world mode');
  if (board.carry?.length) report('world-forbidden-legacy', 'chunk carries are forbidden in world mode');
  if (board.effects && Object.keys(board.effects).length) report('world-forbidden-legacy', 'legacy effect tables are forbidden in world mode');
  for (const block of layout.blocks) {
    if (block.def.emerge || block.def.exit || block.def.turnSwap || block.def.verb?.length) {
      report('world-forbidden-legacy', `block ${block.index} uses forbidden legacy emergence/exit/verb in world mode`);
    }
  }

  // 2. Per-word geometry, 45°-grid angles, attachment causality, and counter containment.
  const words = layout.blocks.flatMap((block) => block.words.map((g) => {
    const w = board.world![g.i];
    const shape = corners(worldWordBox(g)).map((p) => blockToWorld(block, p));
    const interval = board.readingIntervals?.[g.i];
    if (!w || !Number.isSafeInteger(w.set) || w.set < start || w.set >= end) {
      report('world-set', `"${g.text}" has no integer set frame within the scene`, g.i);
    }
    if (w && w.arrival !== 'pop' && w.arrival !== 'preset') {
      report('world-arrival', `"${g.text}" has illegal arrival "${String(w.arrival)}" (allowed: pop, preset)`, g.i);
    }
    if (!isWorldAngle(block.angle)) {
      report('world-angle', `"${g.text}" angle ${block.angle.toFixed(2)}° is off the 45° orientation grid (small tilts are forbidden)`, g.i);
    }
    if (w?.sung && (!interval || interval.start < start || interval.end < interval.start || interval.end >= end
      || interval.start > g.sf || interval.end < g.sf)) {
      report('world-reading', `"${g.text}" requires a protected reading containing its sung onset`, g.i, g.sf);
    }
    if (w?.burst !== undefined && (!Number.isSafeInteger(w.burst) || w.burst <= (interval?.end ?? w.set))) {
      report('world-burst', `"${g.text}" must stay fixed through its protected reading before bursting`, g.i, w.burst);
    }
    if (w && w.attachment !== 'root' && w.attachment !== 'anchor') {
      const parent = w.parent !== undefined ? board.world![w.parent] : undefined;
      if (!parent || parent.set > w.set) {
        report('world-attachment', `"${g.text}" has no earlier canvas host`, g.i, w.set);
      }
      if (w.attachment === 'counter' && w.parent !== undefined) {
        const hostGeom = layout.words.get(w.parent);
        if (!hostGeom || w.letter === undefined) {
          report('world-attachment', `"${g.text}" counter attachment missing host letter`, g.i, w.set);
        } else {
          const lb = letterBoxes(hostGeom)[w.letter];
          const hostBlock = layout.blocks[hostGeom.block];
          if (!lb || !hasCounter(hostGeom.font, lb.ch)) {
            report('world-attachment', `"${g.text}" counter host glyph has no measured counter`, g.i, w.set);
          } else {
            const la = partOfBox(lb, 'counter', lb.ch, hostGeom.font);
            if (la.estimated || !la.box) {
              report('world-attachment', `"${g.text}" counter host glyph counter is estimated, not measured`, g.i, w.set);
            } else {
              const counterQuad = corners({x: la.box.x, y: la.box.y, width: la.box.w, height: la.box.h})
                .map((p) => blockToWorld(hostBlock, p));
              const inside = polyArea(clipConvex(shape, counterQuad));
              const ownArea = polyArea(shape);
              if (ownArea > 1e-6 && inside / ownArea < 0.99) {
                report('world-counter-fit', `"${g.text}" extends outside the measured counter of "${hostGeom.text}"`, g.i, w.set);
              }
            }
          }
        }
      }
    }
    return {g, w, angle: block.angle, shape, interval};
  }));

  const isCounterPair = (a: typeof words[number], b: typeof words[number]) =>
    (a.w?.attachment === 'counter' && a.w.parent === b.g.i) || (b.w?.attachment === 'counter' && b.w.parent === a.g.i);

  // 3. Exact oriented polygon overlap check (handles 45° and 135° words accurately).
  for (const [i, a] of words.entries()) for (const b of words.slice(0, i)) {
    if (isCounterPair(a, b)) continue;
    if (polysOverlap(a.shape, b.shape, 1e-3)) {
      report('world-overlap', `"${a.g.text}" overlaps "${b.g.text}" in world space`, a.g.i, a.w?.set);
    }
  }

  // 4. Camera invariants: allowed move kinds, zero drift, 45° angles, physical durations, and anti-dizziness budgets.
  const startCam = cameraAt(board, start);
  if (!isWorldAngle(startCam.rot)) {
    report('world-camera-angle', `initial camera rotation ${startCam.rot.toFixed(2)}° is off the 45° grid`, undefined, start);
  }
  const moves = rigMoves(board);
  const rolls: {start: number; end: number; absDeg: number}[] = [];
  for (const [i, move] of moves.entries()) {
    if (!ALLOWED_WORLD_RIG_KINDS.has(move.kind)) {
      report('world-camera-kind', `camera move kind "${move.kind}" is forbidden in world mode`, undefined, move.start);
    }
    if (move.start < start - 1e-6 || move.start + move.dur > end + 1e-6
      || (i > 0 && moves[i - 1].start + moves[i - 1].dur > move.start + 1e-6)) {
      report('world-camera-overlap', 'camera beats overlap or fall outside the scene', undefined, move.start);
    }
    if (move.driftRot || move.driftZoom) {
      report('world-camera-drift', 'ambient camera drift is forbidden in world mode', undefined, move.start);
    }
    if (!isWorldAngle(move.target.rot)) {
      report('world-camera-angle', `settled camera rotation ${move.target.rot.toFixed(2)}° is off the 45° grid`, undefined, move.start);
    }
    const durSec = move.dur / FPS;
    if (move.kind === 'cut' && move.dur !== 0) {
      report('world-camera-duration', `hard cut must have 0-frame duration (got ${move.dur})`, undefined, move.start);
    }
    if (move.kind === 'whip' && (durSec < hb.whipMin_s - 1e-6 || durSec > hb.whipMax_s + 1e-6)) {
      report('world-camera-duration', `whip duration ${durSec.toFixed(3)}s is outside physical bounds [${hb.whipMin_s}, ${hb.whipMax_s}]s`, undefined, move.start);
    }
    if (move.kind === 'roll' && (durSec < hb.rollMin_s - 1e-6 || durSec > hb.rollMax_s + 1e-6)) {
      report('world-camera-duration', `roll duration ${durSec.toFixed(3)}s is outside physical bounds [${hb.rollMin_s}, ${hb.rollMax_s}]s`, undefined, move.start);
    }
    const dRot = Math.abs(move.target.rot - move.from.rot);
    if (dRot >= 45 - 1e-6) {
      rolls.push({start: move.start, end: move.start + move.dur, absDeg: dRot});
      // Enforce crisp hold after every >=45° camera turn (unless right at scene end).
      const nextStart = moves[i + 1]?.start ?? end;
      const holdAfterSec = (nextStart - (move.start + move.dur)) / FPS;
      if (nextStart < end && holdAfterSec + 1e-6 < hb.minHoldAfterTurn_s) {
        report('world-dizzy-turn', `${dRot.toFixed(0)}° camera turn holds only ${holdAfterSec.toFixed(3)}s before next move (min ${hb.minHoldAfterTurn_s}s)`, undefined, move.start);
      }
    }
  }

  for (let i = 0; i < rolls.length; i++) {
    const cur = rolls[i];
    if (i > 0) {
      const prev = rolls[i - 1];
      if (prev.absDeg >= hb.forbidConsecutiveExtremeTurnsDeg - 1e-6 && cur.absDeg >= hb.forbidConsecutiveExtremeTurnsDeg - 1e-6) {
        report('world-dizzy-turn', `back-to-back ${prev.absDeg.toFixed(0)}° and ${cur.absDeg.toFixed(0)}° camera turns are forbidden`, undefined, cur.start);
      }
      const gapSec = (cur.start - prev.end) / FPS;
      if (prev.absDeg >= 90 - 1e-6 && cur.absDeg >= 90 - 1e-6 && gapSec + 1e-6 < hb.minBigTurnGap_s) {
        report('world-dizzy-turn', `consecutive >=90° camera turns separated by only ${gapSec.toFixed(3)}s (min ${hb.minBigTurnGap_s}s)`, undefined, cur.start);
      }
    }
    const winEnd = cur.start + hb.rollWindow_s * FPS;
    const sumDeg = rolls.filter((r) => r.start >= cur.start - 1e-6 && r.start <= winEnd + 1e-6).reduce((s, r) => s + r.absDeg, 0);
    if (sumDeg > hb.maxRollInWindowDeg + 1e-6) {
      report('world-dizzy-turn', `${sumDeg.toFixed(0)}° of camera rotation within ${hb.rollWindow_s}s exceeds ${hb.maxRollInWindowDeg}° anti-dizziness budget`, undefined, cur.start);
    }
  }

  // 5. Frame-by-frame reading, static set-once enforcement, active reading angles, coverage, overlap, and empty canvas checks.
  let empty: number | undefined;
  const maxEmptyFrames = Math.round(FPS * hb.maxEmptyGap_s);
  for (let f = start; f < end; f++) {
    const cam = cameraAt(board, f);
    const visible = words.flatMap((entry) => {
      const {g, w, shape, angle, interval} = entry;
      const state = wordStateAt(board, g.i, f);
      const bursting = w?.burst !== undefined && f >= w.burst;
      // Set-once enforcement: no fades, dissolves, slow type-on, slides, or slot animations after set.
      if (w && f >= w.set && !bursting && (state.hidden || state.opacity !== 1 || state.dx || state.dy || state.rot
        || state.sx !== 1 || state.sy !== 1 || state.skewY || state.turn || state.letters || state.clip)) {
        report('world-motion', `"${g.text}" changed after it was set (fades/slides/type-on are forbidden)`, g.i, f);
      }
      const reading = !!interval && f >= interval.start && f <= interval.end;
      if (state.hidden || state.opacity <= 0.05) {
        if (reading) report('world-reading', `"${g.text}" has no ink in its protected reading`, g.i, f);
        return [];
      }
      const glyphs = bursting ? readingGlyphs(board, g, f, state, layout, cam).filter(({opacity}) => opacity > 0.05) : undefined;
      const quad = shape.map((p) => toScreen(cam, p));
      const clipped = (glyphs?.map(({quad: part}) => part) ?? [quad]).map((part) => clipConvex(part, screen));
      const area = clipped.reduce((sum, part) => sum + polyArea(part), 0);
      if (reading) {
        const screenRoll = normDeg(cam.rot + angle + state.rot);
        if (!isWorldReadAngle(screenRoll, 0.5)) {
          report('world-read-angle', `"${g.text}" reads at ${screenRoll.toFixed(1)}° (must be 0°, ±45°, or ±90°; no small tilts or upside-down reads)`, g.i, f);
        }
        const minCov = w?.macro ? hb.minMacroWordCoverage : hb.minActiveWordCoverage;
        const coverage = glyphs ? wordCoverage(glyphs, screen) : area / polyArea(quad);
        if (coverage < minCov - 1e-6) {
          report('world-coverage', `"${g.text}" has only ${(coverage * 100).toFixed(1)}% on screen (needs ${(minCov * 100).toFixed(0)}%)`, g.i, f);
        }
      }
      return area > 1 ? [{entry, g, clipped, reading}] : [];
    });

    for (const {entry, g, clipped, reading} of visible) {
      if (reading && visible.some((other) => other.g !== g && !isCounterPair(entry, other.entry)
        && clipped.some((part) => part.length >= 3 && other.clipped.some((over) => over.length >= 3 && frameArea(part, over) > 1e-4)))) {
        report('world-reading-overlap', `"${g.text}" is overlapped in its protected reading`, g.i, f);
      }
    }
    if (visible.length) empty = undefined;
    else {
      empty ??= f;
      if (f - empty + 1 > maxEmptyFrames) {
        report('world-empty', `canvas has no visible type for more than ${hb.maxEmptyGap_s}s`, undefined, empty, f);
      }
    }
  }
  return {board: name, violations, lines: []};
}
