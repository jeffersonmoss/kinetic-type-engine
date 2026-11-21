import type {EngineContext} from '../context';
import type {EffectTable, Pt, RigKey, SlideSource, VerbCue, VerbDef} from '../engine/types';
import type {LetterMod, VerbWordCtx} from '../engine/verbRegistry';
import type {CameraCall, CascadeOptions, Env, Glyph, GlyphRef, LegacyCall, LegacyResolver, LineView, Pose, Unit, UnitCall} from './define';
import {clamp, glyphKey, maskFate, poseInk, unitOf} from './geometry';

export interface EffectTarget {
  word: number;
  row: number;
  glyphs: number;
  sungFrame?: number;
  /** Reading-order groups of glyph indices. Supply the sung frame when using the sung clock. */
  syllables?: readonly {glyphs: readonly number[]; sungFrame?: number}[];
  glyphFrames?: readonly number[];
}
interface Span {readonly start: number; readonly end: number}
export interface WordSchedule {
  readonly word: number;
  readonly span?: Span;
  readonly glyphs?: readonly Span[];
}
type Group = {targets: readonly {word: number; glyph?: number}[]; size: number; sung?: number};

function duration<P extends object>(call: UnitCall<P>, ctx: EngineContext, size: number): number {
  const frames = call.def.span?.(size, call.params, ctx) ?? call.def.duration(call.params, ctx);
  if (!Number.isSafeInteger(frames) || frames < 1) throw new Error(`${call.name}: duration must be a positive integer in frames`);
  return frames;
}
function groupsFor<P extends object>(call: UnitCall<P>, targets: readonly EffectTarget[]): Group[] {
  switch (call.cascade?.by) {
    case 'row': {
      const rows = new Map<number, EffectTarget[]>();
      for (const word of targets) {
        if (!rows.has(word.row)) rows.set(word.row, []);
        rows.get(word.row)!.push(word);
      }
      return [...rows.values()].map((row) => ({
        targets: row, size: Math.max(...row.map((target) => target.glyphs)),
        sung: Math.min(...row.map((target) => target.sungFrame ?? Infinity)),
      }));
    }
    case 'glyph':
      return targets.flatMap(({word, glyphs, glyphFrames}) => Array.from({length: glyphs}, (_, glyph) => ({
        targets: [{word, glyph}], size: 1, sung: glyphFrames?.[glyph],
      })));
    case 'syllable':
      return targets.flatMap(({word, glyphs, syllables}) => {
        const partition = syllables?.flatMap((syllable) => syllable.glyphs);
        if (!partition || syllables!.some((syllable) => !syllable.glyphs.length) ||
          partition.length !== glyphs || partition.some((glyph, index) => glyph !== index)) {
          throw new Error(`${call.name}: word ${word} needs a reading-order syllable partition`);
        }
        return syllables!.map((syllable) => ({
          targets: syllable.glyphs.map((glyph) => ({word, glyph})), size: 1, sung: syllable.sungFrame,
        }));
      });
    default:
      return targets.map((target) => ({targets: [target], size: target.glyphs, sung: target.sungFrame}));
  }
}

function orderGroups(groups: Group[], order: NonNullable<CascadeOptions['order']>): Group[] {
  if (order === 'reading') return groups;
  if (order === 'reverse') return groups.reverse();
  const middle = (groups.length - 1) / 2;
  const direction = order === 'centreOut' ? 1 : -1;
  return groups.map((group, index) => ({group, index}))
    .sort((a, b) => direction * (Math.abs(a.index - middle) - Math.abs(b.index - middle)))
    .map(({group}) => group);
}

/** Row and word cascades produce separate word timings. Glyph and syllable cascades share a word cue. */
export function scheduleUnit<P extends object>(call: UnitCall<P>, ctx: EngineContext,
  targets: readonly EffectTarget[], start: number): WordSchedule[] {
  if (!Number.isFinite(start) || !targets.length || new Set(targets.map(({word}) => word)).size !== targets.length
    || targets.some(({glyphs}) => !Number.isSafeInteger(glyphs) || glyphs < 1)) {
    throw new Error(`${call.name}: expected a finite start and distinct nonempty word targets`);
  }
  const options = call.cascade;
  const groups = orderGroups(groupsFor(call, targets), options?.order ?? 'reading');
  const gap = typeof options?.clock === 'number' ? options.clock : options ? options.gap ?? 2 : 0;
  const result = new Map<number, {word: number; span?: Span; glyphs?: Span[]}>();
  groups.forEach((group, index) => {
    const span = duration(call, ctx, group.size);
    if (options?.clock === 'sung' && !Number.isFinite(group.sung)) {
      throw new Error(`${call.name}: missing sung frame for ${options.by} of word ${group.targets[0].word}`);
    }
    const lead = call.def.kind === 'accent' ? Math.round(span * (call.def.hit ?? 0)) : span;
    const s = options?.clock === 'sung' ? group.sung! - lead : start + gap * index;
    const timing = {start: s, end: s + span};
    for (const {word, glyph} of group.targets) {
      const entry = result.get(word) ?? {word};
      if (glyph === undefined) entry.span = timing;
      else (entry.glyphs ??= [])[glyph] = timing;
      result.set(word, entry);
    }
  });
  const forward = [...result.values()];
  return call.reversed ? reverseSchedule(forward, start) : forward;
}

/** Reflect a resolved entrance schedule, including a sung stagger, around its last landing. */
export function reverseSchedule(schedule: readonly WordSchedule[], start: number): WordSchedule[] {
  const end = Math.max(...schedule.flatMap((word) => word.span ? [word.span.end] : word.glyphs!.map((span) => span.end)));
  const reflect = (span: Span) => ({start: start + end - span.end, end: start + end - span.start});
  return schedule.map((word) => word.span ? {word: word.word, span: reflect(word.span)}
    : {word: word.word, glyphs: word.glyphs!.map(reflect)});
}

export function unitCues(name: string, schedule: readonly WordSchedule[], fps: number): VerbCue[] {
  const groups = new Map<number, number[]>();
  for (const word of schedule) {
    const frame = word.span?.start ?? Math.min(...word.glyphs!.map((span) => span.start));
    if (!groups.has(frame)) groups.set(frame, []);
    groups.get(frame)!.push(word.word);
  }
  return [...groups].sort(([a], [b]) => a - b)
    .map(([frame, words]) => ({name, word: words[0], words, at: frame / fps}));
}

export interface UnitBinding {
  readonly schedule: readonly WordSchedule[];
  readonly anchor?: SlideSource;
  /** Preserve the entrance's source frame when playing its schedule in reverse. */
  readonly sourceFrame?: number;
  /** Resolved target in block space, for example the computed dock margin. */
  readonly source?: Pt;
  readonly holdThrough?: number;
  readonly excludeGlyphs?: readonly GlyphRef[];
  readonly binds?: readonly {display: number; sung: number}[];
  readonly activeGlyphs?: ReadonlyMap<number, readonly number[]>;
}

const letter = (p: Pose): LetterMod => {
  if (p.clip || p.turn || p.marks || p.underlay || p.colour || p.tint || p.skewY || p.ghosts || p.letters) {
    throw new Error('A glyph cascade pose may only translate, rotate, scale or fade its glyph');
  }
  return {dx: p.dx ?? 0, dy: p.dy ?? 0, rot: p.rot ?? 0, s: 1, sx: p.sx ?? 1, sy: p.sy ?? 1, opacity: p.hidden ? 0 : p.opacity ?? 1};
};

/** Expose the same pose evaluation to the compiler and the lowered engine hook. */
export function unitPose<P extends object>(call: UnitCall<P>, progress: number, unit: Unit, env: Env): Pose {
  return call.def.pose(clamp(progress), unit, call.params, env);
}
function unitInk<P extends object>(call: UnitCall<P>, progress: number, unit: Unit, env: Env) {
  return call.def.ink(clamp(progress), unit, call.params, env);
}

/** Lower one resolved effect instance. Give each instance its own table key when schedules or parameters differ. */
export function lowerUnit<P extends object>(call: UnitCall<P>, ctx: EngineContext, binding: UnitBinding): VerbDef {
  const {anchor, sourceFrame, holdThrough} = binding;
  const dockPoint = binding.source && {...binding.source};
  const excluded = new Set(binding.excludeGlyphs?.map(glyphKey));
  const partiallyKept = new Set(binding.excludeGlyphs?.map((glyph) => glyph.word));
  const binds = binding.binds?.map((pair) => ({...pair}));
  const schedule = new Map(binding.schedule.map((word) => [word.word, word.span ? [{...word.span}] : word.glyphs!.map((span) => ({...span}))]));
  const whole = new Set(binding.schedule.filter((word) => word.span).map((word) => word.word));
  const masks = new Map([...(binding.activeGlyphs ?? [])].map(([word, glyphs]) => [word, new Set(glyphs)]));
  const isEntry = call.def.kind === 'enter';
  const isExit = call.def.kind === 'exit';
  const first = Math.min(...[...schedule.values()].flatMap((spans) => spans.map((span) => span.start)));
  const end = Math.max(...[...schedule.values()].flatMap((spans) => spans.map((span) => span.end)));
  if (!Number.isFinite(first) || !Number.isFinite(end)) throw new Error(`${call.name}: missing schedule`);
  const anchorWord = anchor && 'word' in anchor ? anchor.word : undefined;
  const release = first + (end - first) * (call.def.release ?? 1);

  function evaluate(c: VerbWordCtx, withInk = false): {pose: Pose; ink?: ReturnType<typeof poseInk>} {
    const spans = schedule.get(c.i);
    if (!spans) return {pose: {}};
    const unit = unitOf(c.geom);
    const frame = c.f;
    const env = (span: Span, glyph: boolean): Env => ({
      ctx, frame, start: span.start, span: span.end - span.start, anchor,
      source: dockPoint ?? (anchor && c.source?.(anchor, sourceFrame ?? span.start)),
      blockCentre: {x: c.block.w / 2, y: c.block.h / 2},
      edge: anchor && 'edge' in anchor ? anchor.edge : undefined,
      down: c.down, zoom: c.camAt(span.start).zoom, projectTurn: glyph ? undefined : c.projectTurn,
    });
    const progress = (span: Span) => (frame - span.start) / (span.end - span.start);
    if (whole.has(c.i)) {
      const span = spans[0];
      if (frame < span.start) return {pose: isEntry ? {hidden: true, opacity: 0} : {}};
      const e = env(span, false);
      const pose = unitPose(call, progress(span), unit, e);
      if (isExit && partiallyKept.has(c.i)) return {pose: maskFate(unit, pose, excluded)};
      return {pose, ink: withInk ? unitInk(call, progress(span), unit, e) : undefined};
    }
    if (spans.length !== unit.glyphs.length) throw new Error(`${call.name}: glyph schedule does not match word ${c.i}`);
    if (isEntry && frame < Math.min(...spans.map((span) => span.start))) return {pose: {hidden: true, opacity: 0}};
    const mask = masks.get(c.i);
    const glyphPose = (glyph: Glyph, span: Span) => frame < span.start || (mask && !mask.has(glyph.index))
      ? (isEntry ? {opacity: 0} : {})
      : unitPose(call, progress(span), {...glyph, glyphs: [{...glyph, index: 0}]}, env(span, true));
    return {pose: {letters: unit.glyphs.map((glyph, index) => letter(isExit && excluded.has(glyphKey(glyph)) ? {} : glyphPose(glyph, spans[index])))}};
  }

  return {
    effectName: call.def.name,
    early: true, gradual: true, replacesEnter: isEntry,
    affects: (cue) => (cue.words ?? [cue.word]).filter((i) => schedule.has(i)),
    defaultAt: () => first / ctx.fps,
    holds: call.def.holdsSource && anchorWord !== undefined && !call.reversed
      ? () => [{word: anchorWord, until: Math.max(release, holdThrough ?? -Infinity)}] : undefined,
    binds: binds ? () => binds.map((pair) => ({...pair})) : undefined,
    overlapExempt: call.def.name === 'nest' && anchorWord !== undefined
      ? (cue) => (cue.words ?? [cue.word]).map((word) => [anchorWord, word]) : undefined,
    removesAt: isExit && !call.def.persistent
      ? ({i}) => partiallyKept.has(i) ? null : Math.max(...(schedule.get(i) ?? []).map((span) => span.end)) : undefined,
    modify: (c) => evaluate(c).pose,
    ink: (c) => {
      const sampled = evaluate(c, true);
      return sampled.ink ?? poseInk(unitOf(c.geom), sampled.pose);
    },
  };
}

/** Adapt any built-in or film-registered legacy verb without importing the registry from effects/. */
export function lowerLegacy(call: LegacyCall, resolve: LegacyResolver): VerbDef {
  const def = resolve(call.name);
  if (!def) throw new Error(`legacy(${call.name}): no such registered verb`);
  return {...def, ink: def.ink ?? ((c) => unitOf(c.geom).box)};
}
export function legacyCue(call: LegacyCall, cue: Omit<VerbCue, 'name' | 'params'>): VerbCue {
  return {...cue, name: call.name, params: {...call.params}};
}
export function effectTable(entries: Iterable<readonly [string, VerbDef]>): EffectTable {
  const table: Record<string, Readonly<VerbDef>> = Object.create(null);
  for (const [name, def] of entries) {
    if (Object.hasOwn(table, name)) throw new Error(`Duplicate board effect "${name}"`);
    table[name] = Object.freeze({...def});
  }
  return Object.freeze(table);
}
export function cameraKeys<P extends object>(call: CameraCall<P>, line: LineView, ctx: EngineContext): RigKey[] {
  return call.def.keys(line, call.params, {ctx, start: line.start});
}
