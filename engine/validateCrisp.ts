import {cameraAt, camForBlock} from './camera';
import {FPS, WORDS} from './config';
import {frameArea, readingGlyphs} from './reading';
import type {Board, BoardLayout, CameraState, WordGeom} from './types';
import {normDeg} from './util';
import type {Violation} from './validate';
import {letterIdentity, type WordMod} from './verbRegistry';
import {boardCues, verbFor, wordStateAt} from './wordState';

const DRIFT_FRAMES = 6;
const SLOW_PX = 2, SLOW_DEGREES = 0.1, SLOW_SCALE = 0.002;
const EXACT = 1e-6;
const MIN_INK_AREA = 1;

type Delta = {travel: number; angle: number; scale: number};
const changed = (d: Delta) => Math.max(d.travel, d.angle, d.scale) > EXACT;
const decisive = (d: Delta) => d.travel >= SLOW_PX || d.angle >= SLOW_DEGREES || d.scale >= SLOW_SCALE;
const scaleDelta = (a: number, b: number) => Math.abs(b - a) / Math.max(1, Math.abs(a), Math.abs(b));
const angleDelta = (a: number, b: number) => Math.abs(normDeg(b - a));

function cameraDelta(a: CameraState, b: CameraState): Delta {
  return {travel: Math.hypot(b.x - a.x, b.y - a.y) * b.zoom,
    angle: angleDelta(a.rot, b.rot), scale: scaleDelta(a.zoom, b.zoom)};
}
function wordDelta(a: WordMod, b: WordMod, zoom: number): Delta {
  const turnAngle = (m: WordMod) => m.turn?.plane === 'hidden' ? 90 : m.turn?.plane?.theta ?? 0;
  return {travel: Math.hypot(b.dx - a.dx, b.dy - a.dy) * zoom,
    angle: Math.max(angleDelta(a.rot, b.rot), angleDelta(turnAngle(a), turnAngle(b))),
    scale: Math.max(scaleDelta(a.sx, b.sx), scaleDelta(a.sy, b.sy))};
}

export function crispChecks(board: Board, name: string, layout: BoardLayout): Violation[] {
  if (board.motionStyle !== 'crisp') return [];
  const first = Math.round(board.start * FPS);
  const cut = Math.round(board.end * FPS);
  const result: Violation[] = [];
  const motion = new Set<number>();
  const ink = new Set<number>();
  function audit(label: string, read: (f: number) => Delta | undefined, word?: WordGeom) {
    let run = 0;
    for (let f = first + 1; f <= cut; f++) {
      const delta = f < cut ? read(f) : undefined;
      if (delta && decisive(delta)) motion.add(f);
      if (delta && changed(delta) && !decisive(delta)) {run++; continue;}
      if (run > DRIFT_FRAMES) result.push({board: name, rule: 'wobble', severity: 'error', word: word?.i,
        from: f - run - 1, to: f - 1, frames: run, detail: `${label} moves below 2 px, 0.1 degrees and 0.2% scale per frame for ${run} frames`});
      run = 0;
    }
  }

  const cameras = Array.from({length: cut - first}, (_, i) => cameraAt(board, first + i));
  audit('camera', (f) => cameraDelta(cameras[f - first - 1], cameras[f - first]));
  const transits = cameras.map((cam, i) => i > 0 && changed(cameraDelta(cameras[i - 1], cam)));
  const transfer = new Set<string>();
  for (const cue of boardCues(board)) {
    for (const {frame, from, to} of verbFor(board, cue.name)?.inkTransfers ?? []) {
      const old = readingGlyphs(board, layout.words.get(from.word)!, frame - 0.00001).find((g) => g.index === from.index);
      const next = readingGlyphs(board, layout.words.get(to.word)!, frame + 0.00001).find((g) => g.index === to.index);
      if (!old || !next || old.opacity < 0.95 || next.opacity < 0.95 ||
        old.quad.some((p, k) => Math.hypot(p.x - next.quad[k].x, p.y - next.quad[k].y) > 0.2)) continue;
      const sample = Math.ceil(frame - EXACT);
      transfer.add(`${sample}:${from.word}:${from.index}`);
      transfer.add(`${sample}:${to.word}:${to.index}`);
    }
  }

  const notes: [number, number][] = [];
  for (const w of layout.words.values()) {
    const reading = board.readingIntervals?.[w.i];
    if (reading) {
      const during = transits.findIndex((m, i) => m && first + i >= reading.start && first + i <= reading.end);
      if (during >= 0) result.push({board: name, rule: 'camera-reading', severity: 'error', word: w.i,
        from: first + during, detail: `camera moves during the protected reading of "${w.text}"`});
      const onset = Math.round(WORDS[w.i].start_s * FPS);
      const end = Math.round(w.end * FPS);
      if (end - onset >= FPS) notes.push([onset, end]);
    }

    const states = Array.from({length: cut - first}, (_, i) => wordStateAt(board, w.i, first + i));
    const samples = states.map((m, i) => {
      const f = first + i;
      const glyphs = readingGlyphs(board, w, f, m).map((g) => ({...g, area: frameArea(g.quad)}));
      if (glyphs.some((g) => g.opacity >= 0.5 && g.area >= 4)) ink.add(f);
      return {m, glyphs, zoom: camForBlock(board, w.block, f).zoom};
    });
    const local = (f: number) => [samples[f - first - 1], samples[f - first]] as const;
    const visible = (s: typeof samples[number]) => s.glyphs.some((g) => g.opacity > 0.02 && g.area >= MIN_INK_AREA);
    audit(`"${w.text}"`, (f) => {
      const [a, b] = local(f);
      return visible(a) && visible(b) ? wordDelta(a.m, b.m, b.zoom) : undefined;
    }, w);

    for (const glyph of samples[0].glyphs) {
      const letterDelta = (a: WordMod, b: WordMod, zoom: number): Delta => {
        const x = a.letters?.[glyph.index] ?? letterIdentity(), y = b.letters?.[glyph.index] ?? letterIdentity();
        return {travel: Math.hypot(y.dx - x.dx, y.dy - x.dy) * zoom, angle: angleDelta(x.rot, y.rot),
          scale: Math.max(scaleDelta(x.s * (x.sx ?? 1), y.s * (y.sx ?? 1)), scaleDelta(x.s * (x.sy ?? 1), y.s * (y.sy ?? 1)))};
      };
      const onScreen = (g: typeof glyph) => g.opacity > 0.02 && g.area >= MIN_INK_AREA;
      const glyphIndex = samples[0].glyphs.indexOf(glyph);
      audit(`"${w.text}" glyph ${glyph.index + 1}`, (f) => {
        const [a, b] = local(f);
        if (!onScreen(a.glyphs[glyphIndex]) || !onScreen(b.glyphs[glyphIndex])) return undefined;
        return letterDelta(a.m, b.m, b.zoom);
      }, w);
    }

    const pops = new Set<number>();
    for (let f = first + 1; f < cut; f++) {
      const [a, b] = local(f);
      const stillWord = !changed(wordDelta(a.m, b.m, b.zoom));
      for (const [k, now] of b.glyphs.entries()) {
        const before = a.glyphs[k];
        if (!stillWord || Math.abs(now.opacity - before.opacity) < EXACT ||
          !((now.opacity > 0.02 && now.area >= MIN_INK_AREA) || (before.opacity > 0.02 && before.area >= MIN_INK_AREA)) ||
          transfer.has(`${f}:${w.i}:${now.index}`)) continue;
        const x = a.m.letters?.[now.index] ?? letterIdentity(), y = b.m.letters?.[now.index] ?? letterIdentity();
        if (Math.abs(x.dx - y.dx) + Math.abs(x.dy - y.dy) + angleDelta(x.rot, y.rot) +
          scaleDelta(x.s * (x.sx ?? 1), y.s * (y.sx ?? 1)) + scaleDelta(x.s * (x.sy ?? 1), y.s * (y.sy ?? 1)) <= EXACT) pops.add(f);
      }
    }
    if (pops.size) result.push({board: name, rule: 'pop', severity: 'error', word: w.i, from: Math.min(...pops),
      to: Math.max(...pops), frames: pops.size, detail: `"${w.text}" changes ink opacity in place`});
  }

  let empty = first;
  for (let f = first; f <= cut; f++) {
    if (f < cut && !ink.has(f) && !(board.fadeToBlack && f >= board.fadeToBlack.from * FPS)) continue;
    if (f - empty > 12) result.push({board: name, rule: 'empty', severity: 'warn', from: empty, to: f - 1,
      frames: f - empty, detail: `${f - empty} frames without visible type`});
    empty = f + 1;
  }

  let hold = first;
  for (let f = first + 1; f <= cut; f++) {
    if (f < cut && !motion.has(f) && !notes.some(([a, b]) => f >= a && f <= b) &&
      !(board.fadeToBlack && f >= board.fadeToBlack.from * FPS)) continue;
    if (f - hold > FPS) result.push({board: name, rule: 'motion-gap', severity: 'warn', from: hold, to: f - 1,
      frames: f - hold, detail: `${f - hold} frames with no decisive camera or type movement outside sustained notes`});
    hold = f;
  }
  return result;
}
