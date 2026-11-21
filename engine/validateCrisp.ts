import {cameraAt, camForBlock} from './camera';
import {FPS, HEIGHT, WIDTH} from './config';
import {frameArea, readingGlyphs, type ReadingGlyph} from './reading';
import type {Board, BoardLayout, CameraState, WordGeom} from './types';
import type {Violation} from './validate';
import {letterIdentity, type WordMod} from './verbRegistry';
import {boardCues, verbFor, wordStateAt} from './wordState';

const DRIFT_FRAMES = 6;
const SLOW_PX = 2, SLOW_DEGREES = 0.1, SLOW_SCALE = 0.002;
const EXACT = 1e-6;
const MIN_INK_AREA = 1;

type Delta = {travel: number; angle: number; scale: number};
type SampledGlyph = ReadingGlyph & {area: number};
const changed = (d: Delta) => Math.max(d.travel, d.angle, d.scale) > EXACT;
const decisive = (d: Delta) => d.travel >= SLOW_PX || d.angle >= SLOW_DEGREES || d.scale >= SLOW_SCALE;
const scaleDelta = (a: number, b: number) => Math.abs(b - a) / Math.max(1, Math.abs(a), Math.abs(b));
const angleDelta = (a: number, b: number) => Math.abs(b - a);

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
function glyphTurnAngle(m: WordMod, index: number): number {
  const plane = m.turn?.letters?.[index];
  return plane === 'hidden' ? 90 : plane?.theta ?? 0;
}
function glyphDelta(a: WordMod, b: WordMod, index: number, zoom: number): Delta {
  const x = a.letters?.[index] ?? letterIdentity(), y = b.letters?.[index] ?? letterIdentity();
  return {
    travel: Math.hypot(y.dx - x.dx, y.dy - x.dy) * zoom,
    angle: Math.max(angleDelta(x.rot, y.rot), angleDelta(glyphTurnAngle(a, index), glyphTurnAngle(b, index))),
    scale: Math.max(scaleDelta(x.s * (x.sx ?? 1), y.s * (y.sx ?? 1)), scaleDelta(x.s * (x.sy ?? 1), y.s * (y.sy ?? 1))),
  };
}
const maybeShown = (m: WordMod) => !m.hidden && m.opacity > 0.02 && m.turn?.plane !== 'hidden';

export function crispChecks(board: Board, name: string, layout: BoardLayout): Violation[] {
  if (board.motionStyle !== 'crisp') return [];
  const first = Math.round(board.start * FPS);
  const cut = Math.round(board.end * FPS);
  if (cut <= first) return [];
  const len = cut - first;
  const frameBox = [{x: 0, y: 0}, {x: WIDTH, y: 0}, {x: WIDTH, y: HEIGHT}, {x: 0, y: HEIGHT}];
  const result: Violation[] = [];
  const motion = new Set<number>();
  const ink = new Set<number>();
  function audit(label: string, read: (f: number) => Delta | undefined, word?: WordGeom) {
    let run = 0;
    let maxTravel = 0, maxAngle = 0, maxScale = 0;
    for (let f = first + 1; f <= cut; f++) {
      const delta = f < cut ? read(f) : undefined;
      if (delta && decisive(delta)) motion.add(f);
      if (delta && changed(delta) && !decisive(delta)) {
        run++;
        maxTravel = Math.max(maxTravel, delta.travel);
        maxAngle = Math.max(maxAngle, delta.angle);
        maxScale = Math.max(maxScale, delta.scale);
        continue;
      }
      if (run > DRIFT_FRAMES) result.push({board: name, rule: 'wobble', severity: 'error', word: word?.i,
        from: f - run - 1, to: f - 1, frames: run,
        detail: `${label} moves below 2 px, 0.1 degrees and 0.2% scale per frame for ${run} frames (peak ${maxTravel.toFixed(2)} px, ${maxAngle.toFixed(3)} deg, ${(maxScale * 100).toFixed(3)}%)`});
      run = 0;
      maxTravel = maxAngle = maxScale = 0;
    }
  }

  const cameras = Array.from({length: len}, (_, i) => cameraAt(board, first + i));
  audit('camera', (f) => cameraDelta(cameras[f - first - 1], cameras[f - first]));
  const transits = cameras.map((cam, i) => i > 0 && changed(cameraDelta(cameras[i - 1], cam)));
  let screenCams: CameraState[] | undefined;
  let screenTransits: boolean[] | undefined;
  const camsForBlock = (block: number) => {
    if (board.blocks[block]?.pin !== 'screen') return {cams: cameras, moving: transits};
    screenCams ??= Array.from({length: len}, (_, i) => camForBlock(board, block, first + i));
    screenTransits ??= screenCams.map((cam, i) => i > 0 && changed(cameraDelta(screenCams![i - 1], cam)));
    return {cams: screenCams, moving: screenTransits};
  };

  const transfer = new Set<string>();
  for (const cue of boardCues(board)) {
    for (const {frame, from, to} of verbFor(board, cue.name)?.inkTransfers ?? []) {
      const fromWord = layout.words.get(from.word);
      const toWord = layout.words.get(to.word);
      if (!fromWord || !toWord) continue;
      const old = readingGlyphs(board, fromWord, frame - 0.00001, undefined, layout).find((g) => g.index === from.index);
      const next = readingGlyphs(board, toWord, frame + 0.00001, undefined, layout).find((g) => g.index === to.index);
      if (!old || !next || old.opacity < 0.95 || next.opacity < 0.95 ||
        old.quad.some((p, k) => Math.hypot(p.x - next.quad[k].x, p.y - next.quad[k].y) > 0.2)) continue;
      const sample = Math.ceil(frame - EXACT);
      transfer.add(`${sample}:${from.word}:${from.index}`);
      transfer.add(`${sample}:${to.word}:${to.index}`);
    }
  }

  const notes: [number, number][] = [];
  for (const w of layout.words.values()) {
    const {cams: blockCams, moving: blockTransits} = camsForBlock(w.block);
    const reading = board.readingIntervals?.[w.i];
    if (reading) {
      let badFirst = -1, badLast = -1, badCount = 0;
      const lo = Math.max(1, reading.start - first + 1);
      const hi = Math.min(len - 1, reading.end - first);
      for (let i = lo; i <= hi; i++) {
        if (!blockTransits[i]) continue;
        const f = first + i;
        if (badFirst < 0) badFirst = f;
        badLast = f;
        badCount++;
      }
      if (badCount > 0) result.push({board: name, rule: 'camera-reading', severity: 'error', word: w.i,
        from: badFirst, to: badLast, frames: badCount,
        detail: `camera moves during the protected reading of "${w.text}" (frames ${reading.start}-${reading.end})`});
      const onset = w.sf;
      const end = Math.round(w.end * FPS);
      if (end - onset >= FPS) notes.push([onset, end]);
    }

    const states = Array.from({length: len}, (_, i) => wordStateAt(board, w.i, first + i));
    const glyphCache: (SampledGlyph[] | undefined)[] = new Array(len);
    const visibleFlags = new Uint8Array(len);
    const sampleGlyphs = (i: number): SampledGlyph[] => {
      let cached = glyphCache[i];
      if (!cached) {
        cached = readingGlyphs(board, w, first + i, states[i], layout, blockCams[i])
          .map((g) => ({...g, area: frameArea(g.quad, frameBox)}));
        glyphCache[i] = cached;
      }
      return cached;
    };
    let hasPerLetter = false;
    for (let i = 0; i < len; i++) {
      const m = states[i];
      if (m.letters || m.turn?.letters) hasPerLetter = true;
      if (!maybeShown(m)) continue;
      const glyphs = sampleGlyphs(i);
      let vis = false;
      for (const g of glyphs) {
        if (g.opacity >= 0.5 && g.area >= 4) ink.add(first + i);
        if (g.opacity > 0.02 && g.area >= MIN_INK_AREA) vis = true;
      }
      if (vis) visibleFlags[i] = 1;
    }

    audit(`"${w.text}"`, (f) => {
      const i = f - first;
      return visibleFlags[i - 1] && visibleFlags[i] ? wordDelta(states[i - 1], states[i], blockCams[i].zoom) : undefined;
    }, w);

    if (hasPerLetter) {
      const refGlyphs = sampleGlyphs(0);
      for (const [glyphIndex, glyph] of refGlyphs.entries()) {
        audit(`"${w.text}" glyph ${glyph.index + 1}`, (f) => {
          const i = f - first;
          if (!visibleFlags[i - 1] || !visibleFlags[i]) return undefined;
          const a = sampleGlyphs(i - 1)[glyphIndex], b = sampleGlyphs(i)[glyphIndex];
          if (!(a.opacity > 0.02 && a.area >= MIN_INK_AREA) || !(b.opacity > 0.02 && b.area >= MIN_INK_AREA)) return undefined;
          return glyphDelta(states[i - 1], states[i], glyph.index, blockCams[i].zoom);
        }, w);
      }
    }

    const inPlacePops = new Set<number>();
    const snapPops = new Set<number>();
    for (let f = first + 1; f < cut; f++) {
      const i = f - first;
      const aM = states[i - 1], bM = states[i];
      if (!maybeShown(aM) && !maybeShown(bM)) continue;
      const aGlyphs = sampleGlyphs(i - 1), bGlyphs = sampleGlyphs(i);
      const zoom = blockCams[i].zoom;
      const stillWord = !changed(wordDelta(aM, bM, zoom));
      for (const [k, now] of bGlyphs.entries()) {
        const before = aGlyphs[k];
        if (Math.abs(now.opacity - before.opacity) < EXACT || transfer.has(`${f}:${w.i}:${now.index}`)) continue;
        const onBefore = before.opacity > 0.02 && before.area >= MIN_INK_AREA;
        const onNow = now.opacity > 0.02 && now.area >= MIN_INK_AREA;
        if (!onBefore && !onNow) continue;
        const x = aM.letters?.[now.index] ?? letterIdentity(), y = bM.letters?.[now.index] ?? letterIdentity();
        if (stillWord && !changed(glyphDelta(aM, bM, now.index, zoom))) {
          inPlacePops.add(f);
          continue;
        }
        if (!aM.clip && !bM.clip) {
          if (!onBefore && onNow && now.opacity - before.opacity > 0.5) {
            const fromEdgeOn = aM.turn?.plane === 'hidden' || aM.turn?.letters?.[now.index] === 'hidden';
            const fromZeroScale = Math.abs(aM.sx) <= 1e-4 || Math.abs(aM.sy) <= 1e-4
              || Math.abs(x.s * (x.sx ?? 1)) <= 1e-4 || Math.abs(x.s * (x.sy ?? 1)) <= 1e-4;
            if (!fromEdgeOn && !fromZeroScale) snapPops.add(f);
          } else if (onBefore && !onNow && before.opacity - now.opacity > 0.5 && now.area >= MIN_INK_AREA) {
            const toEdgeOn = bM.turn?.plane === 'hidden' || bM.turn?.letters?.[now.index] === 'hidden';
            const toZeroScale = Math.abs(bM.sx) <= 1e-4 || Math.abs(bM.sy) <= 1e-4
              || Math.abs(y.s * (y.sx ?? 1)) <= 1e-4 || Math.abs(y.s * (y.sy ?? 1)) <= 1e-4;
            if (!toEdgeOn && !toZeroScale) snapPops.add(f);
          }
        }
      }
    }
    if (inPlacePops.size) result.push({board: name, rule: 'pop', severity: 'error', word: w.i,
      from: Math.min(...inPlacePops), to: Math.max(...inPlacePops), frames: inPlacePops.size,
      detail: `"${w.text}" changes ink opacity in place`});
    if (snapPops.size) result.push({board: name, rule: 'pop', severity: 'error', word: w.i,
      from: Math.min(...snapPops), to: Math.max(...snapPops), frames: snapPops.size,
      detail: `"${w.text}" appears or vanishes on screen without entering from off-screen, edge-on turn, or zero scale`});
  }

  const fadeStart = board.fadeToBlack && Number.isFinite(board.fadeToBlack.from) ? board.fadeToBlack.from * FPS : Infinity;
  let empty = first;
  for (let f = first; f <= cut; f++) {
    if (f < cut && !ink.has(f) && f < fadeStart) continue;
    if (f - empty > 12) result.push({board: name, rule: 'empty', severity: 'warn', from: empty, to: f - 1,
      frames: f - empty, detail: `${f - empty} frames without visible type`});
    empty = f + 1;
  }

  let hold = first;
  for (let f = first + 1; f <= cut; f++) {
    if (f < cut && !motion.has(f) && !notes.some(([a, b]) => f >= a && f <= b) && f < fadeStart) continue;
    if (f - hold > FPS) result.push({board: name, rule: 'motion-gap', severity: 'warn', from: hold, to: f - 1,
      frames: f - hold, detail: `${f - hold} frames with no decisive camera or type movement outside sustained notes`});
    hold = f;
  }
  return result;
}
