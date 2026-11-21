import {withEngine, type EngineContext} from '../context';
import {lowerAccents, type AccentSample} from './accents';
import {isPair, isUnit, bind, type Diagnostic} from './bind';
import {boundContext} from './defaults';
import {finalizeEffects, lowerEntrance, setCamera, type BlockWork, type SceneWork} from './entrance';
import {lowerFates} from './fates';
import {placeBlock, sourceOf, type Located} from './place';
import {checkSource, inspect, readBoard} from './read';
import {editClock, mapVocal, type EditRange, type SongMap} from '../song';
import {layoutBoard} from '../engine/layout';
import {fade, lowerUnit} from '../effects';
import type {Board} from '../engine/types';
import type {Film, Format, Ink} from '../score';
import type {CompiledFilm, LineIndex, TokenReading, Transition} from './types';

export {defaultLook, formatFor, scoreContext} from './defaults';
export type {CompiledFilm, InspectionFrame, LineIndex, TokenReading, Transition} from './types';
export type {Diagnostic} from './bind';

export interface CompileOptions {
  draft?: boolean;
  edits?: readonly EditRange[];
  display?: readonly (readonly [string, string])[];
  allowShadow?: boolean;
}

function frozen<T>(value: T, memo = new WeakMap<object, unknown>()): T {
  if (value === null || typeof value !== 'object') return value;
  const existing = memo.get(value);
  if (existing) return existing as T;
  const proto = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) return value;
  const copy: Record<string, unknown> = Array.isArray(value) ? [] : Object.create(proto);
  memo.set(value, copy);
  for (const [key, item] of Object.entries(value)) Object.defineProperty(copy, key,
    {value: frozen(item, memo), enumerable: true, configurable: true, writable: true});
  return Object.freeze(copy) as T;
}

export function compileScore(base: EngineContext, film: Film, song: SongMap, options: CompileOptions = {}): CompiledFilm {
  const {draft = false} = options;
  const format: Format = base.format.id === 'wide' ? 'wide' : 'portrait';
  if (film.formats && !film.formats.includes(format)) throw new Error(`Score does not enable ${format}`);
  const lastVocal = Math.max(0, ...song.tokens.map(({end_s}) => end_s));
  const clock = editClock(options.edits ?? [{start: 0, end: Math.max(lastVocal + 0.55, song.analysis.duration_s ?? lastVocal + 2)}], base.fps);
  if (!clock.length) throw new Error('The film edit list is empty');
  const duration = clock.at(-1)!.output + clock.at(-1)!.frames;
  const {scenes, diagnostics, words, lines} = bind(film, song, format, clock, base.fps, draft);
  const guard = options.display?.map(([pattern]) => new RegExp(pattern, 'iu'));
  const beats = song.analysis.beats.flatMap(({t}) => {
    const time = mapVocal({start_s: t, end_s: t}, clock, base.fps);
    return time ? [{t: time.onset / base.fps}] : [];
  });
  const ctx = boundContext(base, {words, lines, beats, guard});
  const ink: Record<Ink, string> = {call: ctx.look.palette.paper, reply: '#F5B81C', hit: '#FF4058', ...film.look?.ink};
  for (const [role, colour] of Object.entries(ink)) {
    if (typeof colour !== 'string' || !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/iu.test(colour)) {
      throw new Error(`ink "${role}" needs a hex colour`);
    }
  }
  if (ctx.look.shadow && !options.allowShadow) diagnostics.push({severity: 'error', code: 'shadow', message: 'The film must explicitly allow its look to enable shadows'});

  return withEngine(ctx, () => {
    const works: SceneWork[] = [];
    const byId = new Map<string, Located>();
    const lineIndex: Record<string, LineIndex> = Object.create(null);
    const transitions: Transition[] = [];
    const accents: AccentSample[] = [];
    const readings: TokenReading[] = [];
    const firstOf = (scene: typeof scenes[number]) => Math.min(...scene.lines[0].lead.runs.map((run) => run.vocal?.onset ?? Infinity));
    const nominalEnd = (scene: typeof scenes[number]) => Math.max(...scene.lines.flatMap(({blocks}) =>
      blocks.flatMap(({runs}) => runs.flatMap(({vocal}) => vocal ? [vocal.end, vocal.onset + 14] : []))));
    const starts = scenes.map((scene, index) => {
      const item = scene.lines[0].lead;
      if (item.start !== undefined) return index === 0 && !('line' in item.card.from) ? 0 : item.start;
      const earliest = firstOf(scene);
      const enter = item.card.enter;
      const cross = 'line' in item.card.from;
      const lead = isUnit(enter) ? Math.max(...item.runs.map((run) => enter.def.span?.([...run.text].length, enter.params, ctx) ?? enter.def.duration(enter.params, ctx)))
        : isPair(enter) ? 6 : 8;
      if (cross && index) return Math.max(0, earliest - 6, nominalEnd(scenes[index - 1]) + 1);
      return Math.max(0, earliest - lead);
    });

    for (const [i, {scene, lines}] of scenes.entries()) {
      const start = starts[i];
      const end = starts[i + 1] ?? duration;
      if (end <= start) throw new Error(`${scene.id}: scenes must advance on the output timeline (frames ${start}–${end})`);
      const board: SceneWork['board'] = {id: scene.id, bg: !scene.ground || scene.ground === 'night' ? ctx.look.palette.ground : scene.ground,
        start: start / ctx.fps, end: end / ctx.fps, blocks: [], exit: 'none', rules: scene.rules && [...scene.rules],
        scoreLife: true, sheetRules: true, transitRules: 'energy', vignette: false,
        ...(scene.motionStyle ? {motionStyle: scene.motionStyle} : {}),
        ...(scene.scaleStyle ? {scaleStyle: scene.scaleStyle} : {}),
        ...(scene.fadeToBlack ? {fadeToBlack: {...scene.fadeToBlack}} : {})};
      const work: SceneWork = {board, lines, blocks: [], entries: []};
      works.push(work);
      for (const authored of lines) {
        for (const item of authored.blocks) {
          if (byId.has(item.id)) throw new Error(`${item.id}: duplicate block ID`);
          let source;
          try {source = sourceOf(board, item.card.from, byId);}
          catch (error) {throw new Error(`${item.id}: ${(error as Error).message}`);}
          if (source.origin?.board === board && work.blocks.length === 0) throw new Error(`${item.id}: opener cannot reference its own scene`);
          if (item.card.from.kind === 'free') diagnostics.push({severity: 'warn', code: 'free-placement', line: item.id, message: item.card.from.reason});
          const index = board.blocks.length;
          board.blocks.push(placeBlock(ctx, board, item, source, ink, scene.rowWidth));
          const block: BlockWork = {board, index, item, source, scene: work, authored, start: 0, landing: 0, release: 0,
            targets: [], landingByWord: new Map()};
          work.blocks.push(block);
          byId.set(item.id, block);
        }
      }
      const stage = scenes[i].scene.stage;
      const stagePlan = stage?.(board, layoutBoard({...board}), work.blocks.map(({item, index}) => ({
        id: item.id, index, start: item.start,
        words: item.runs.map(({i, vocal}) => ({index: i, onset: vocal?.onset ?? item.start!,
          end: vocal?.end ?? item.start!, sung: !!vocal})),
      })), ctx);
      if (board.fadeToBlack) {
        const {from, to} = board.fadeToBlack;
        if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
          throw new Error(`${board.id}: fadeToBlack requires finite from < to (got from=${from}, to=${to})`);
        }
      }
      if (!stage) setCamera(ctx, work, draft);
      if (board.scaleStyle === 'lockup') {
        board.scoreStyleGroups = Object.fromEntries(work.blocks.filter(({item}) => item.start === undefined)
          .map(({index, authored}) => [index, words[authored.lead.runs[0].i].line]));
      }
      const consumedEnter = new Set<number>();
      for (const block of work.blocks) {
        if (block.item.start !== undefined && block.item.start >= end) {
          throw new Error(`${block.item.id}: interlude start frame ${block.item.start} is outside scene ${scene.id}`);
        }
        lowerEntrance(ctx, block, works[i - 1], stagePlan?.enter);
        for (const {word} of block.targets) if (stagePlan?.enter?.has(word)) consumedEnter.add(word);
        const {item} = block;
        transitions.push({line: item.id, board: scene.id, start: block.start, landing: block.landing, release: block.release,
          edge: item.card.from.kind === 'edge', handoff: isPair(item.card.enter), interlude: item.start !== undefined});
      }
      for (const word of stagePlan?.enter?.keys() ?? []) {
        if (!consumedEnter.has(word)) {
          throw new Error(`${board.id}: staged entrance names word ${word}, which is not on this board`);
        }
      }
      for (const authored of lines) lowerAccents(ctx, work, authored, diagnostics, accents);
      for (const [word, cues] of stagePlan?.accents ?? []) {
        const block = board.blocks.find(({words: [lo, hi]}) => word >= lo && word <= hi);
        if (!block) throw new Error(`${board.id}: staged accent names word ${word}, which is not on this board`);
        for (const [k, {start, frames, effect}] of cues.entries()) {
          if (!Number.isSafeInteger(start)) throw new Error(`${board.id}: staged accent for word ${word} requires an integer start frame (got ${start})`);
          if (!Number.isSafeInteger(frames) || frames < 1) throw new Error(`${board.id}: staged accent for word ${word} requires integer frames >= 1 (got ${frames})`);
          if (effect?.def?.kind !== 'accent') throw new Error(`${board.id}: staged accent for word ${word} requires an accent effect (got ${effect?.name ?? String(effect)} with kind "${effect?.def?.kind}")`);
          const name = `${effect.name} · staged accent · ${word}.${k + 1}`;
          (block.verb ??= []).push({name, word, at: start / ctx.fps});
          work.entries.push([name, lowerUnit(effect, ctx, {schedule: [{word, span: {start, end: start + frames}}]})]);
          accents.push({frame: start + Math.floor(frames / 2), reason: name});
        }
      }
      for (const [word, {start, frames, effect}] of stagePlan?.retire ?? []) {
        const block = board.blocks.find(({words: [lo, hi]}) => word >= lo && word <= hi);
        if (!block) throw new Error(`${board.id}: staged retirement names word ${word}, which is not on this board`);
        if (!Number.isSafeInteger(start)) throw new Error(`${board.id}: staged retirement for word ${word} requires an integer start frame (got ${start})`);
        if (!Number.isSafeInteger(frames) || frames < 0) throw new Error(`${board.id}: staged retirement for word ${word} requires integer frames >= 0 (got ${frames})`);
        if (effect && frames === 0) throw new Error(`${board.id}: staged retirement for word ${word} cannot combine frames === 0 with exit effect "${effect.name}"`);
        if (effect && effect.def?.kind !== 'exit') throw new Error(`${board.id}: staged retirement for word ${word} requires an exit effect (got "${effect.name}" with kind "${effect.def?.kind}")`);
        const name = `staged retirement · ${word}`;
        const at = start / ctx.fps;
        (block.verb ??= []).push({name, word, at});
        work.entries.push([name, frames === 0 ? {early: true, gradual: true, removesAt: () => start, modify: () => ({hidden: true, opacity: 0})}
          : lowerUnit(effect ?? fade(), ctx, {schedule: [{word, span: {start, end: start + frames}}]})]);
      }
      finalizeEffects(work);
      if (i) transitions.push({line: work.blocks[0].item.id, board: scene.id, start, landing: start, release: start,
        cut: true, handoff: works[i - 1].board.screenHandoffOut?.frame === start});
    }

    const allBlocks = works.flatMap((work) => work.blocks);
    const boardsById = new Map<string, Board>();
    for (const [i, work] of works.entries()) {
      const exit = scenes[i].scene.exit;
      let timing = readBoard(ctx, work.board, work.blocks).readings;
      let board: Board;
      let accepted: ReturnType<typeof readBoard>;
      const signature = (samples: TokenReading[]) => samples.map(({interval}) => interval?.start ?? '-').join(',');
      // A retiring run can unblock incoming ink. Resolve against the final render state, then give every
      // consumer the same interval objects. Bounded iteration catches conflicting cues without emitting a false pass.
      for (let attempt = 0; ; attempt++) {
        board = lowerFates(ctx, work, allBlocks, timing, exit);
        accepted = readBoard(ctx, board, work.blocks);
        if (signature(timing) === signature(accepted.readings)) break;
        if (attempt === 3) {
          diagnostics.push({severity: 'error', code: 'reading-cycle', message: `${board.id}: fates and protected readings did not settle`});
          break;
        }
        timing = accepted.readings;
      }
      board = {...board, readingIntervals: Object.fromEntries(accepted.readings.flatMap(({words, interval}) =>
        interval ? words.map((word) => [word, interval]) : []))};
      boardsById.set(board.id!, board);
      readings.push(...accepted.readings);
      diagnostics.push(...accepted.diagnostics);
      for (const block of work.blocks) {
        const first = Math.min(...accepted.readings.filter((reading) => reading.line === block.item.id).map((reading) => reading.interval?.start ?? Infinity));
        lineIndex[block.item.id] = {scene: board.id!, block: block.index, ...(Number.isFinite(first) ? {first} : {}), landing: block.landing};
      }
    }
    for (const block of allBlocks) {
      const sourceBoard = block.source.origin?.board.id;
      if (sourceBoard) checkSource(ctx, block, boardsById.get(sourceBoard)!, diagnostics);
    }

    const boards = film.scenes.flatMap((entry) => {
      if (entry.kind === 'raw') return entry.build(ctx);
      const board = boardsById.get(entry.id);
      return board ? [board] : [];
    });
    if (!boards.length) throw new Error('The selected edit has no score boards');
    const emphasisWords = new Set(allBlocks.flatMap(({item}) => item.runs.flatMap((run) =>
      run.emphasis && run.vocal ? [run.vocal.token.id] : []))).size;
    const inspection = inspect(ctx, format, duration, boardsById, allBlocks, readings, transitions, diagnostics, accents);
    const result = frozen({format, boards, lineIndex, readings, transitions, diagnostics, inspection, clock, duration,
      rawBoards: boards.length - works.length, emphasisWords});
    // The context carries a private registration key, so keep the original identity.
    return Object.freeze({...result, ctx});
  });
}
