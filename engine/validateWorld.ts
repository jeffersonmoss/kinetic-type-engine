import {bounds, corners} from '../effects/geometry';
import {cameraAt, toScreen} from './camera';
import {FPS, HEIGHT, WIDTH} from './config';
import {blockToWorld, layoutBoard} from './layout';
import {frameArea, MIN_READING_COVERAGE, readingGlyphs, wordCoverage} from './reading';
import {rigMoves} from './rig';
import type {Board} from './types';
import {clipConvex, normDeg, polyArea} from './util';
import type {BoardReport, Violation} from './validate';
import {wordStateAt} from './wordState';
import {worldWordBox} from './worldGeometry';

export function validateWorld(board: Board): BoardReport {
  const name = board.id ?? `board@${board.start.toFixed(2)}`;
  const layout = layoutBoard(board);
  const start = Math.ceil(board.start * FPS - 1e-6);
  const end = Math.ceil(board.end * FPS - 1e-6);
  const screen = corners({x: 0, y: 0, width: WIDTH, height: HEIGHT});
  const violations: Violation[] = [];
  const seen = new Set<string>();
  const report = (rule: string, detail: string, word?: number, from?: number, to?: number) => {
    const key = `${rule}:${word ?? '-'}`;
    if (seen.has(key)) return;
    seen.add(key);
    violations.push({board: name, rule, severity: 'error', detail, word, from, to});
  };
  const words = layout.blocks.flatMap((block) => block.words.map((g) => {
    const w = board.world![g.i];
    const shape = corners(worldWordBox(g)).map((p) => blockToWorld(block, p));
    const interval = board.readingIntervals?.[g.i];
    if (!w || !Number.isSafeInteger(w.set) || w.set < start || w.set >= end) {
      report('world-set', `"${g.text}" has no set frame within the scene`, g.i);
    }
    if (Math.abs(normDeg(block.angle - 90 * Math.round(block.angle / 90))) > 1e-6) {
      report('world-angle', `"${g.text}" is off the world quarter-turn grid`, g.i);
    }
    if (w?.sung && (!interval || interval.start < start || interval.end < interval.start || interval.end >= end
      || interval.start > g.sf || interval.end < g.sf)) {
      report('world-reading', `"${g.text}" requires a protected reading containing its sung onset`, g.i, g.sf);
    }
    if (w?.burst !== undefined && (!Number.isSafeInteger(w.burst) || w.burst <= (interval?.end ?? w.set))) {
      report('world-burst', `"${g.text}" must stay fixed through its protected reading`, g.i, w.burst);
    }
    if (w && w.attachment !== 'root') {
      const parent = w.parent !== undefined ? board.world![w.parent] : undefined;
      if (!parent || parent.set > w.set) report('world-attachment', `"${g.text}" has no earlier canvas host`, g.i, w.set);
    }
    return {g, w, angle: block.angle, shape, box: bounds(shape), interval};
  }));
  for (const [i, {g, box, w}] of words.entries()) for (const other of words.slice(0, i)) {
    const b = other.box;
    if (Math.min(box.x + box.width, b.x + b.width) - Math.max(box.x, b.x) > 1e-5
      && Math.min(box.y + box.height, b.y + b.height) - Math.max(box.y, b.y) > 1e-5) {
      report('world-overlap', `"${g.text}" overlaps "${other.g.text}" in world space`, g.i, w?.set);
    }
  }
  const moves = rigMoves(board);
  if (board.motionStyle !== 'crisp') report('world-camera', 'world camera holds must be crisp');
  for (const [i, move] of moves.entries()) {
    if (move.start < start - 1e-6 || move.start + move.dur > end + 1e-6
      || (i > 0 && moves[i - 1].start + moves[i - 1].dur > move.start + 1e-6)
      || move.driftRot || move.driftZoom) {
      report('world-camera', 'camera beats overlap or lack crisp motion and holds', undefined, move.start);
    }
  }

  let empty: number | undefined;
  for (let f = start; f < end; f++) {
    const cam = cameraAt(board, f);
    const visible = words.flatMap(({g, w, shape, angle, interval}) => {
      const state = wordStateAt(board, g.i, f);
      const bursting = w?.burst !== undefined && f >= w.burst;
      if (w && f >= w.set && !bursting && (state.hidden || state.opacity !== 1 || state.dx || state.dy || state.rot
        || state.sx !== 1 || state.sy !== 1 || state.skewY || state.turn || state.letters || state.clip)) {
        report('world-motion', `"${g.text}" changed after it was set`, g.i, f);
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
        const roll = Math.abs(normDeg(cam.rot + angle + state.rot));
        if (roll > 5 + 1e-6) report('world-upright', `"${g.text}" reads at ${roll.toFixed(1)}°`, g.i, f);
        const coverage = glyphs ? wordCoverage(glyphs, screen) : area / polyArea(quad);
        if (coverage < MIN_READING_COVERAGE - 1e-6) {
          report('world-coverage', `"${g.text}" has only ${(coverage * 100).toFixed(1)}% on screen`, g.i, f);
        }
      }
      return area > 1 ? [{g, clipped, reading}] : [];
    });
    for (const {g, clipped, reading} of visible) {
      if (reading && visible.some((other) => other.g !== g
        && clipped.some((part) => part.length >= 3 && other.clipped.some((over) => over.length >= 3 && frameArea(part, over) > 1e-4)))) {
        report('world-reading-overlap', `"${g.text}" is overlapped in its protected reading`, g.i, f);
      }
    }
    if (visible.length) empty = undefined;
    else {
      empty ??= f;
      if (f - empty + 1 > Math.round(FPS * 0.3)) {
        report('world-empty', 'canvas has no visible type for more than 0.3 seconds', undefined, empty, f);
      }
    }
  }
  return {board: name, violations, lines: []};
}
