import type {EngineContext} from '../context';
import {dockExit, effectTable, lowerLegacy, lowerUnit, retractExit, reverseSchedule, scheduleUnit, type GlyphRef} from '../effects';
import {camForBlock, toWorld} from '../engine/camera';
import {layoutBoard, worldToBlock} from '../engine/layout';
import {getVerb} from '../engine';
import type {Block, Board, VerbDef} from '../engine/types';
import type {Exit, Fate} from '../score';
import {isPair, isUnit} from './bind';
import {spans, type BlockWork, type SceneWork} from './entrance';
import type {TokenReading} from './types';

export function lowerFates(ctx: EngineContext, scene: SceneWork, works: readonly BlockWork[], readings: readonly TokenReading[], exit?: Exit): Board {
  const entries = [...scene.entries];
  const board: Board = {...scene.board, blocks: scene.board.blocks.map((b) => ({...b, verb: b.verb && [...b.verb]})),
    readingIntervals: Object.fromEntries(readings.flatMap(({words, interval}) => !interval ? [] : words.map((word) => [word, interval])))};
  const intervals = board.readingIntervals!;
  const wordsOf = (work: BlockWork) => work.targets.map(({word}) => word);
  const holds = new Map<number, number>();
  for (const using of works) {
    if (using.source.origin?.board !== scene.board || !using.source.runs) continue;
    const source = using.source.anchor;
    const targets = 'word' in source && source.letter !== undefined ? [source.word] : using.source.runs.map(({i}) => i);
    for (const i of targets) holds.set(i, Math.max(holds.get(i) ?? -Infinity, using.release));
  }
  function attach(block: Block, name: string, def: VerbDef, words: number[], frame: number, params?: Record<string, unknown>) {
    if (!words.length) return;
    entries.push([name, def]);
    (block.verb ??= []).push({name, word: words[0], words, at: frame / ctx.fps, params});
  }
  function apply(work: BlockWork, fate: Fate, incoming: BlockWork, useMask: readonly GlyphRef[], pastReading: number) {
    const block = board.blocks[work.index];
    const targets = work.targets;
    const words = wordsOf(work);
    const kept = new Set(useMask.map(({word}) => word));
    const start = fate.kind === 'stay' ? pastReading : Math.max(incoming.start, pastReading);
    const releaseFor = (word: number) => Math.max(start, (holds.get(word) ?? -Infinity) + 1);
    if (fate.kind === 'stay') {
      const name = `stay · ${work.item.id}`;
      attach(block, name, {effectName: 'stay', gradual: true, affects: () => words, modify(c) {
        const dim = Math.max(0, Math.min(1, (c.f - releaseFor(c.i) + 1) / 10));
        return {opacity: 1 - 0.55 * dim};
      }}, words, start);
      return;
    }
    const lastHold = Math.max(start, ...words.filter((word) => !kept.has(word)).map(releaseFor));
    const entrance = work.item.card.enter;
    const base = fate.kind === 'dock' ? dockExit({to: fate.to}) : fate.kind === 'clear' ? fate.effect
      : isUnit(entrance) && work.schedule ? retractExit(entrance) : undefined;
    if (!base) throw new Error(`${work.item.id}: retract requires a reversible unit entrance`);
    const name = `${base.name} · fate · ${work.item.id}`;
    if ('kind' in base) {
      attach(block, name, lowerLegacy(base, getVerb), words.filter((word) => !kept.has(word)), lastHold, {...base.params});
      return;
    }
    if (base.def.kind !== 'exit') throw new Error(`${work.item.id}: ${base.name} is not an exit`);
    const scheduled = fate.kind === 'retract' ? reverseSchedule(work.schedule!, start) : scheduleUnit(base, ctx, targets, start);
    const schedule = scheduled.map((word) => {
      const delay = kept.has(word.word) ? 0 : releaseFor(word.word) - start;
      const shift = (span: {start: number; end: number}) => ({start: span.start + delay, end: span.end + delay});
      return word.span ? {...word, span: shift(word.span)} : {...word, glyphs: word.glyphs!.map(shift)};
    });
    const shape = layoutBoard(scene.board).blocks[work.index];
    const point = fate.kind === 'dock' ? worldToBlock(shape, toWorld(camForBlock(scene.board, work.index, lastHold), {
      x: ctx.safeBox.x + ctx.safeBox.width * (fate.to === 'margin' ? 0.14 : 0.5),
      y: ctx.safeBox.y + ctx.safeBox.height * 0.18,
    })) : undefined;
    const def = lowerUnit(base, ctx, {schedule, source: point, anchor: work.source.anchor, sourceFrame: work.start, excludeGlyphs: useMask});
    attach(block, name, def, words, Math.min(...spans(schedule).map(({start}) => start)));
  }

  for (let i = 1; i < scene.lines.length; i++) {
    const line = scene.lines[i];
    const old = scene.lines[i - 1];
    const incoming = scene.blocks.find((work) => work.item === line.lead)!;
    const enter = line.lead.card.enter;
    const fate = line.card.old;
    if (fate?.kind === 'dock' && line.blocks.some(({card}) => card.place === 'turnCW' || card.place === 'turnCCW')) {
      throw new Error(`${line.id}: dock cannot accompany turned placement`);
    }
    const dismisses = isPair(enter) && enter.def.dismissesOld;
    const parts = scene.blocks.filter((work) => work.authored === old);
    const pastReading = Math.max(...parts.flatMap((work) => wordsOf(work).map((word) =>
      intervals[word]?.end ?? (work.landingByWord.get(word) ?? work.landing) + (work.item.start === undefined ? 14 : 0)))) + 1;
    for (const work of parts) {
      const kept = works.filter((using) => using.board === work.board && using.source.origin?.item === work.item)
        .flatMap((using) => using.kept ?? []);
      // The transform owns its source block. Other blocks of that line still share its retirement.
      const effective = dismisses && incoming.source.origin?.item === work.item ? undefined : fate;
      if (effective) apply(work, effective, incoming, kept, pastReading);
      else if (dismisses && incoming.source.origin?.item !== work.item) apply(work, {kind: 'stay'}, incoming, [], pastReading);
    }
  }
  if (exit && !('kind' in exit)) {
    if (exit.def.kind !== 'exit') throw new Error(`${board.id}: ${exit.name} is not a scene exit`);
    const exitStart = Math.round(board.end * ctx.fps);
    let exitEnd = exitStart + exit.def.duration(exit.params, ctx);
    for (const work of scene.blocks) {
      const name = `${exit.name} · scene exit · ${work.item.id}`;
      const schedule = scheduleUnit(exit, ctx, work.targets, exitStart);
      exitEnd = Math.max(exitEnd, ...spans(schedule).map(({end}) => end));
      attach(board.blocks[work.index], name, lowerUnit(exit, ctx, {schedule}), wordsOf(work), exitStart);
    }
    board.scoreExitFrames = Math.max(0, Math.ceil(exitEnd - exitStart));
  } else if (exit) {
    if (!['cut', 'fall', 'fade', 'leave', 'turn'].includes(exit.name)) throw new Error(`${board.id}: unsupported legacy scene exit ${exit.name}`);
    board.exit = exit.name as Board['exit'];
  }
  return {...board, effects: effectTable(entries)};
}
