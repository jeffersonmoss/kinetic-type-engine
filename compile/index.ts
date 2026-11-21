import {withEngine, type EngineContext} from '../context';
import {lowerAccents, type AccentSample} from './accents';
import {isPair, isUnit, bind, type Diagnostic} from './bind';
import {boundContext} from './defaults';
import {finalizeEffects, lowerEntrance, setCamera, type BlockWork, type SceneWork} from './entrance';
import {lowerFates} from './fates';
import {layoutWorld} from './worldLayout';
import {worldCamera} from './worldCamera';
import {placeBlock, sourceOf, type Located} from './place';
import {checkSource, inspect, readBoard} from './read';
import {editClock, mapVocal, type EditRange, type SongMap} from '../song';
import {layoutBoard} from '../engine/layout';
import {fade, lowerUnit} from '../effects';
import type {Board} from '../engine/types';
import {WORLD_ARRIVALS, WORLD_ATTACHMENTS, WORLD_CAMERA_MOVES, WORLD_DEFAULTS, WORLD_SCALE_TIERS, isWorldAngle, isWorldReadAngle} from '../engine/worldSettings';
import type {Film, Format, Ink, WorldOptions, WorldWordOverride} from '../score';
import type {CompiledFilm, LineIndex, TokenReading, Transition} from './types';

function checkAllowedKeys(scope: string, obj: Record<string, unknown>, allowed: readonly string[]) {
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) {
      throw new Error(`${scope}: [world-unknown-option] "${k}" is not part of the world-mode vocabulary`);
    }
  }
}

function validateWorldOptions(sceneId: string, options: WorldOptions, knownIds: ReadonlySet<string>) {
  checkAllowedKeys(sceneId, options as unknown as Record<string, unknown>, ['seed', 'mode', 'words']);
  if (options.mode !== undefined && options.mode !== 'normal' && options.mode !== 'climax') {
    throw new Error(`${sceneId}: [world-mode] mode must be "normal" or "climax" (got ${String(options.mode)})`);
  }
  const hb = WORLD_DEFAULTS.hardBudgets;
  for (const [id, rawOverride] of Object.entries(options.words ?? {})) {
    if (!knownIds.has(id)) throw new Error(`${sceneId}: [world-token] unknown world word ID "${id}"`);
    const override = rawOverride as WorldWordOverride;
    const scope = `${sceneId} / ${id}`;
    checkAllowedKeys(scope, override as unknown as Record<string, unknown>, ['attachment', 'cap', 'arrival', 'burst', 'camera', 'ink', 'font', 'case', 'reason']);
    if (override.cap !== undefined && (!Number.isFinite(override.cap) || override.cap <= 0)) {
      throw new Error(`${scope}: [world-cap] cap must be a positive finite number`);
    }
    if (override.arrival !== undefined && !(WORLD_ARRIVALS as readonly string[]).includes(override.arrival)) {
      throw new Error(`${scope}: [world-arrival] arrival "${String(override.arrival)}" is not expressible (allowed: pop, preset)`);
    }
    if (override.ink !== undefined && !['call', 'reply', 'hit'].includes(override.ink)) {
      throw new Error(`${scope}: [world-ink] unknown ink role "${String(override.ink)}"`);
    }
    if (override.attachment) {
      const att = override.attachment as Record<string, unknown>;
      if (!(WORLD_ATTACHMENTS as readonly string[]).includes(String(att.kind))) {
        throw new Error(`${scope}: [world-attachment] unknown attachment kind "${String(att.kind)}"`);
      }
      if (att.kind === 'baseline') checkAllowedKeys(scope, att, ['kind', 'to']);
      else if (att.kind === 'stack') {
        checkAllowedKeys(scope, att, ['kind', 'to', 'side', 'align']);
        if (att.side !== undefined && att.side !== 'below' && att.side !== 'above') {
          throw new Error(`${scope}: [world-attachment] stack side must be "below" or "above"`);
        }
        if (att.align !== undefined && att.align !== 'left' && att.align !== 'right' && att.align !== 'center') {
          throw new Error(`${scope}: [world-attachment] stack align must be "left", "right", or "center"`);
        }
      } else if (att.kind === 'edge') {
        checkAllowedKeys(scope, att, ['kind', 'to', 'side', 'turn']);
        if (att.side !== undefined && !['right', 'left', 'top', 'bottom'].includes(String(att.side))) {
          throw new Error(`${scope}: [world-attachment] edge side must be right, left, top, or bottom`);
        }
        if (att.turn !== undefined) {
          const turn = Number(att.turn);
          if (!isWorldAngle(turn) || Math.abs(turn) < 1e-6) {
            throw new Error(`${scope}: [world-angle] edge turn ${String(att.turn)}° must be a non-zero multiple of 45°`);
          }
        }
      } else if (att.kind === 'letter') {
        checkAllowedKeys(scope, att, ['kind', 'to', 'letter', 'side']);
        if (att.side !== undefined && att.side !== 'below' && att.side !== 'above') {
          throw new Error(`${scope}: [world-attachment] letter side must be "below" or "above"`);
        }
        if (att.letter !== undefined && (!Number.isSafeInteger(att.letter) || (att.letter as number) < 0)) {
          throw new Error(`${scope}: [world-attachment] letter index must be a non-negative integer`);
        }
      } else if (att.kind === 'counter') {
        checkAllowedKeys(scope, att, ['kind', 'to', 'letter']);
        if (att.letter !== undefined && (!Number.isSafeInteger(att.letter) || (att.letter as number) < 0)) {
          throw new Error(`${scope}: [world-attachment] counter letter index must be a non-negative integer`);
        }
      } else if (att.kind === 'anchor') {
        checkAllowedKeys(scope, att, ['kind', 'turn', 'direction']);
        if (att.turn !== undefined && !isWorldAngle(Number(att.turn))) {
          throw new Error(`${scope}: [world-angle] anchor turn ${String(att.turn)}° must be a multiple of 45°`);
        }
        if (att.direction !== undefined && !['right', 'below', 'above', 'diagonal'].includes(String(att.direction))) {
          throw new Error(`${scope}: [world-attachment] anchor direction must be right, below, above, or diagonal`);
        }
      }
      if (typeof att.to === 'string' && !knownIds.has(att.to)) {
        throw new Error(`${scope}: [world-attachment] unknown attachment host "${att.to}"`);
      }
    }
    if (override.burst) {
      checkAllowedKeys(scope, override.burst as unknown as Record<string, unknown>, ['after']);
      if (override.burst.after !== undefined && (!Number.isFinite(override.burst.after) || override.burst.after < 0)) {
        throw new Error(`${scope}: [world-burst] burst.after must be non-negative seconds`);
      }
    }
    if (override.camera) {
      const cam = override.camera as Record<string, unknown>;
      checkAllowedKeys(scope, cam, ['move', 'angle', 'readAngle', 'scale', 'frame', 'duration', 'pullBack']);
      if (cam.move !== undefined && !(WORLD_CAMERA_MOVES as readonly string[]).includes(String(cam.move))) {
        throw new Error(`${scope}: [world-camera-move] "${String(cam.move)}" is not an allowed camera move`);
      }
      if (cam.angle !== undefined && !isWorldAngle(Number(cam.angle))) {
        throw new Error(`${scope}: [world-angle] camera.angle ${String(cam.angle)}° must be a multiple of 45°`);
      }
      if (cam.readAngle !== undefined && !isWorldReadAngle(Number(cam.readAngle))) {
        throw new Error(`${scope}: [world-read-angle] camera.readAngle ${String(cam.readAngle)}° must be 0, ±45, or ±90`);
      }
      if (cam.scale !== undefined) {
        if (typeof cam.scale === 'string') {
          if (!(WORLD_SCALE_TIERS as readonly string[]).includes(cam.scale)) {
            throw new Error(`${scope}: [world-scale] unknown scale tier "${cam.scale}"`);
          }
        } else if (typeof cam.scale === 'number') {
          const [lo, hi] = WORLD_DEFAULTS.scale.fullRange;
          if (!Number.isFinite(cam.scale) || cam.scale < lo || cam.scale > hi) {
            throw new Error(`${scope}: [world-scale] numeric scale ${cam.scale} must be within [${lo}, ${hi}]`);
          }
        } else {
          throw new Error(`${scope}: [world-scale] scale must be a tier name or number`);
        }
      }
      if (cam.frame !== undefined && cam.frame !== 'word' && cam.frame !== 'phrase') {
        if (!Array.isArray(cam.frame) || !cam.frame.length || cam.frame.some((ref) => typeof ref !== 'string' || !knownIds.has(ref))) {
          throw new Error(`${scope}: [world-camera-frame] camera.frame must be "word", "phrase", or a non-empty list of known word IDs`);
        }
      }
      if (cam.duration !== undefined) {
        const d = Number(cam.duration);
        if (!Number.isFinite(d) || d < 0 || d > hb.moveMax_s) {
          throw new Error(`${scope}: [world-camera-duration] duration ${String(cam.duration)}s is outside [0, ${hb.moveMax_s}]`);
        }
        if (cam.move === 'cut' && d !== 0) {
          throw new Error(`${scope}: [world-camera-duration] hard cut must have duration 0`);
        }
        if (cam.move === 'whip' && (d < hb.whipMin_s || d > hb.whipMax_s)) {
          throw new Error(`${scope}: [world-camera-duration] whip duration ${d}s must be within [${hb.whipMin_s}, ${hb.whipMax_s}]`);
        }
        if (cam.move === 'roll' && (d < hb.rollMin_s || d > hb.rollMax_s)) {
          throw new Error(`${scope}: [world-camera-duration] roll duration ${d}s must be within [${hb.rollMin_s}, ${hb.rollMax_s}]`);
        }
      }
      if (cam.pullBack !== undefined && typeof cam.pullBack !== 'boolean') {
        if (!cam.pullBack || typeof cam.pullBack !== 'object') {
          throw new Error(`${scope}: [world-pullback] pullBack must be boolean or pullBack object`);
        }
        const pb = cam.pullBack as Record<string, unknown>;
        checkAllowedKeys(scope, pb, ['scope', 'hold', 'move']);
        if (pb.scope !== undefined && pb.scope !== 'cluster' && pb.scope !== 'world') {
          throw new Error(`${scope}: [world-pullback] pullBack.scope must be "cluster" or "world"`);
        }
        if (pb.move !== undefined && pb.move !== 'pull' && pb.move !== 'whip' && pb.move !== 'cut') {
          throw new Error(`${scope}: [world-pullback] pullBack.move must be "pull", "whip", or "cut"`);
        }
        if (pb.hold !== undefined && (!Number.isFinite(pb.hold) || Number(pb.hold) < WORLD_DEFAULTS.physicalConstants.minReadableHold_s)) {
          throw new Error(`${scope}: [world-pullback] pullBack.hold must be at least ${WORLD_DEFAULTS.physicalConstants.minReadableHold_s}s`);
        }
      }
    }
  }
}

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
    const worldReadings = new Map<Board, TokenReading[]>();
    const knownTokens = new Map(song.tokens.map(({id, lineId}) => [id, lineId]));
    const firstOf = (scene: typeof scenes[number]) => Math.min(...scene.lines[0].lead.runs.map((run) => run.vocal?.onset ?? Infinity));
    const nominalEnd = (scene: typeof scenes[number]) => Math.max(...scene.lines.flatMap(({blocks}) =>
      blocks.flatMap(({runs}) => runs.flatMap(({vocal}) => vocal ? [vocal.end, vocal.onset + 14] : []))));
    const starts = scenes.map((scene, index) => {
      const item = scene.lines[0].lead;
      if (item.start !== undefined) return index === 0 && !('line' in item.card.from) ? 0 : item.start;
      if (scene.scene.world) {
        const earliest = Math.min(...scene.lines.flatMap(({blocks}) => blocks.map((block) =>
          block.start ?? Math.min(...block.runs.map(({vocal}) => vocal?.onset ?? Infinity)))));
        return index === 0 ? 0 : Math.max(0, earliest - Math.round(0.2 * ctx.fps));
      }
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
      if (scene.world) {
        const rawScene = scene as unknown as Record<string, unknown>;
        if (rawScene.stage || rawScene.exit) throw new Error(`${scene.id}: [world-forbidden-field] world scenes use their own staging and cut`);
        const options: WorldOptions = scene.world === true ? {} : scene.world;
        const authoredLines = new Set(scene.lines.map(({id}) => id));
        const knownWorldIds = new Set<string>();
        for (const [tokenId, lineId] of knownTokens) {
          if (authoredLines.has(lineId)) knownWorldIds.add(tokenId);
        }
        for (const boundLine of lines) for (const item of boundLine.blocks) {
          if (item.start === undefined) continue;
          let tick = 0;
          for (const row of item.rows) for (const _run of row.runs) {
            tick++;
            knownWorldIds.add(`${item.id}.echo-${tick}`);
          }
        }
        validateWorldOptions(scene.id, options, knownWorldIds);
        board.motionStyle = 'crisp';
        const {placed, rate} = layoutWorld(ctx, board, lines, ink, options);
        board.worldMeta = {wMed_s: rate.wMed_s, phraseThreshold_s: rate.phraseThreshold_s, seed: options.seed};
        const tokens = worldCamera(ctx, board, placed, rate, options);
        worldReadings.set(board, tokens);
        const firstBlocks = new Map<import('./bind').BoundBlock, typeof placed[number]>();
        for (const cue of placed) if (!firstBlocks.has(cue.item)) firstBlocks.set(cue.item, cue);
        for (const [item, cue] of firstBlocks) {
          const landing = tokens.find((token) => token.line === item.id)?.landing ?? cue.onset;
          const block: BlockWork = {board, index: cue.index, item, source: {anchor: {word: cue.runs[0].i}},
            scene: work, authored: cue.line, start: board.world![cue.runs[0].i]!.set, landing,
            release: landing, targets: [], landingByWord: new Map()};
          work.blocks.push(block);
          byId.set(item.id, block);
        }
        for (const key of board.rig ?? []) {
          const f = Math.round(key.t * ctx.fps);
          accents.push({frame: f + Math.floor(key.frames! / 2), reason: `${scene.id} · ${key.label}`});
        }
        if (i) transitions.push({line: placed[0].item.id, board: scene.id, start, landing: start, release: start, cut: true});
        continue;
      }
      for (const authored of lines) {
        for (const item of authored.blocks) {
          if (byId.has(item.id)) throw new Error(`${item.id}: duplicate block ID`);
          let source;
          try {source = sourceOf(board, item.card.from, byId);}
          catch (error) {throw new Error(`${item.id}: ${(error as Error).message}`);}
          if (source.origin?.board.world && isPair(item.card.enter)) {
            throw new Error(`${item.id}: a paired transition cannot transfer ink out of a fixed world scene`);
          }
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
      const worldTokens = worldReadings.get(work.board);
      if (worldTokens) {
        boardsById.set(work.board.id!, work.board);
        readings.push(...worldTokens);
        for (const block of work.blocks) {
          const reading = worldTokens.find(({line}) => line === block.item.id);
          lineIndex[block.item.id] = {scene: work.board.id!, block: block.index,
            ...(reading ? {first: reading.interval!.start} : {}), landing: block.landing};
        }
        continue;
      }
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
