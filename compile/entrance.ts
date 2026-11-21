import type {EngineContext} from '../context';
import {cameraKeys, effectTable, lowerLegacy, lowerPair, lowerUnit, scheduleUnit, unitCues, unitOf,
  type BlockView, type EffectTarget, type Glyph, type GlyphRef, type WordSchedule} from '../effects';
import {rotate} from '../effects/geometry';
import {camForBlock, toScreen} from '../engine/camera';
import {blockToWorld, layoutBoard} from '../engine/layout';
import type {Board, VerbDef} from '../engine/types';
import {getVerb} from '../engine';
import {wordStateAt} from '../engine/wordState';
import {follow} from '../effects';
import {isPair, isUnit, type BoundLine} from './bind';
import type {StageCue} from '../score';
import type {Located, Source} from './place';
import {inferredTargets, syllableTargets, type SyllableTarget} from './syllables';

export interface BoundTarget extends EffectTarget {
  stressSyllables?: SyllableTarget[];
}

export interface SceneWork {
  board: Board & {effects?: Board['effects']};
  lines: BoundLine[];
  blocks: BlockWork[];
  entries: [string, VerbDef][];
}
export interface BlockWork extends Located {
  scene: SceneWork;
  source: Source;
  authored: BoundLine;
  start: number;
  landing: number;
  release: number;
  targets: BoundTarget[];
  schedule?: WordSchedule[];
  kept?: readonly GlyphRef[];
  landingByWord: Map<number, number>;
}

export const spans = (schedule: readonly WordSchedule[]) => schedule.flatMap((w) => w.span ? [w.span] : w.glyphs!);
export function targetsFor(work: BlockWork): BoundTarget[] {
  const layout = layoutBoard(work.board);
  const syllables = work.item.card.syllables;
  return work.item.runs.map(run => {
    const {i, text, vocal} = run;
    const g = layout.words.get(i)!;
    const parts = vocal && syllables?.[vocal.token.id];
    const count = [...text].length;
    if (work.item.start !== undefined) return {word: i, row: g.row, glyphs: count};
    const sungFrame = vocal?.onset ?? g.sf;
    const stressSyllables = inferredTargets(run, work.item.runs);
    const partition = parts?.length ? syllableTargets(run, work.item.runs, parts.map(({text, offsetFrames}) =>
      ({text, frame: sungFrame + (offsetFrames ?? 0)}))) : stressSyllables?.map(part => ({
        ...part, sungFrame: part.sungFrame ?? sungFrame,
      }));
    return {word: i, row: g.row, glyphs: count, sungFrame: Math.round(sungFrame),
      glyphFrames: Array.from({length: count}, () => sungFrame),
      syllables: partition ?? [{glyphs: Array.from({length: count}, (_, i) => i), sungFrame}], stressSyllables};
  });
}
function blockView(work: Located, reference = work.board): BlockView {
  const shape = layoutBoard(reference).blocks[work.index];
  return {
    units: shape.words.map(unitOf),
    space(pin, frame) {
      if (pin === 'board') return {origin: {x: shape.ox, y: shape.oy}, angle: shape.angle, scale: 1};
      const cam = camForBlock(reference, shape.index, frame);
      return {origin: toScreen(cam, blockToWorld(shape, {x: 0, y: 0})), angle: shape.angle + cam.rot, scale: cam.zoom};
    },
  };
}

function keptRefs(view: BlockView, keep: string, source?: Source): GlyphRef[] | undefined {
  if (!source?.runs) return undefined;
  const chosen = new Set(source.runs.map(({i}) => i));
  const glyphs = view.units.flatMap((unit) => unit.glyphs.filter((g) => !/^\s$/u.test(g.text)));
  const target = keep.replace(/\s+/gu, '');
  const candidates = glyphs.flatMap((_, i) => {
    const slice = glyphs.slice(i, i + [...target].length);
    if (slice.map(({text}) => text).join('') !== target || !slice.every((g) => chosen.has(g.word))) return [];
    return [slice.map(({word, index}) => ({word, index}))];
  });
  if (candidates.length > 1) throw new Error(`ambiguous kept run "${keep}" in source landmark`);
  return candidates[0];
}

/** Previously drawn glyph poses must be sampled before outgoing ownership is removed. */
function carrierView(out: BlockView, source: Located, frame: number, board: Board): BlockView {
  const layout = layoutBoard(board);
  const shape = layout.blocks[source.index];
  return {...out, units: out.units.map((unit) => {
    const g = layout.words.get(unit.word)!;
    const state = wordStateAt(board, g.i, frame);
    return {...unit, glyphs: unit.glyphs.map((glyph): Glyph => {
      const l = state.letters?.[glyph.index];
      const pivot = {x: unit.box.x + unit.box.width / 2, y: unit.box.y + unit.cap / 2};
      const gx = glyph.box.x + glyph.box.width / 2, gy = glyph.box.y + glyph.cap / 2;
      const offset = rotate({x: (gx - pivot.x + (l?.dx ?? 0)) * state.sx, y: (gy - pivot.y + (l?.dy ?? 0)) * state.sy}, state.rot);
      const width = glyph.box.width * Math.abs(state.sx * (l?.s ?? 1) * (l?.sx ?? 1));
      const cap = glyph.cap * Math.abs(state.sy * (l?.s ?? 1) * (l?.sy ?? 1));
      return {...glyph, cap, box: {x: pivot.x + offset.x + state.dx - width / 2, y: pivot.y + offset.y + state.dy - cap / 2,
        width, height: cap}};
    })};
  }), space(pin) {
    if (pin === 'board') return out.space(pin, frame);
    const cam = camForBlock(board, shape.index, frame);
    return {origin: toScreen(cam, blockToWorld(shape, {x: 0, y: 0})), angle: shape.angle + cam.rot, scale: cam.zoom};
  }};
}

export function setCamera(ctx: EngineContext, work: SceneWork, draft: boolean) {
  const {board, blocks} = work;
  const first = blocks[0];
  const firstAngle = board.blocks[0].at!.angle;
  const viewFor = (target: BlockWork, previousAngle: number, start: number) => ({
    block: target.index, placement: target.item.card.place, angle: board.blocks[target.index].at!.angle, previousAngle, start,
  });
  const firstCall = first.item.camera;
  const hasAuthoredCamera = blocks.some((block) => block.item.camera);
  const draftBoard = draft && !hasAuthoredCamera && blocks.every((block) => block.item.start === undefined &&
    block.authored.blocks.filter((item) => !item.reply).length === 1) &&
    blocks.every((block) => block.item.card.from.kind === 'opening' || block.item.card.from.kind === 'row');
  board.rig = [];
  if (draftBoard) {
    // An unfilled draft tracks between call/reply pairs on the sung clock.
    // Keeping unit zoom preserves the second tier's exact reading floor.
    const layout = layoutBoard({...board});
    const targetFor = (target: BlockWork) => {
      const subset = blocks.filter((block) => block.authored === target.authored).map(({index}) => index);
      const rows = subset.map((index) => layout.blocks[index]);
      const left = Math.min(...rows.map((b) => b.ox));
      const top = Math.min(...rows.map((b) => b.oy));
      const right = Math.max(...rows.map((b) => b.ox + b.w));
      const bottom = Math.max(...rows.map((b) => b.oy + b.h));
      return {x: (left + right) / 2, y: (top + bottom) / 2, rot: 0, zoom: 1};
    };
    board.rigStart = targetFor(first);
    for (const block of blocks.slice(1).filter((item) => !item.item.reply)) {
      const end = Math.round(Math.min(...block.item.runs.map(({i}) => layout.words.get(i)!.sf)));
      const start = Math.max(board.start * ctx.fps, end - 10);
      board.rig.push({t: start / ctx.fps, kind: 'dive', frames: 10, to: targetFor(block)});
      board.rig.push({t: end / ctx.fps, kind: 'hold', still: true, frames: 0, to: targetFor(block)});
    }
    return;
  }
  const firstReply = blocks.find((block) => block.authored === first.authored && block.item.reply);
  const focus = firstReply ? {blocks: [first.index, firstReply.index]} : {block: first.index};
  board.rigStart = {frame: focus, rot: -firstAngle, zoom: 1};
  board.rig.push({t: board.start, kind: 'hold', still: true, frames: 0, to: board.rigStart});
  if (firstCall) board.rig.push(...cameraKeys(firstCall,
    viewFor(first, firstAngle, first.item.start ?? Math.ceil(board.start * ctx.fps)), ctx));
  let previousAngle = firstAngle;
  for (const work of blocks.slice(1)) {
    if (work.item.reply || (work.item !== work.authored.lead || work.item.start !== undefined) && !work.item.camera) continue;
    const call = work.item.camera ?? follow();
    const predicted = Math.min(...work.item.runs.map((run) => run.vocal?.onset ?? Infinity));
    const time = work.item.start ?? Math.max(Math.ceil(board.start * ctx.fps), predicted - call.def.duration(call.params, ctx));
    const other = blocks.find((block) => block.authored === work.authored && block.item.reply);
    const keys = cameraKeys(call, viewFor(work, previousAngle, time), ctx);
    for (const k of keys) {
      if (!k.to) continue;
      if (work.item !== work.authored.lead) {
        // A part's camera frames the phrases already introduced, including the new target.
        k.to = {...k.to, frame: {blocks: blocks.filter((block) => block.authored === work.authored && block.index <= work.index)
          .map(({index}) => index)}};
      } else if (!work.item.camera) {
        k.to = {...k.to, fill: undefined, zoom: 1, frame: other ? {blocks: [work.index, other.index]} : {block: work.index}};
      }
    }
    board.rig.push(...keys);
    previousAngle = board.blocks[work.index].at!.angle;
  }
}

export function lowerEntrance(ctx: EngineContext, work: BlockWork, previous?: SceneWork,
  staged?: ReadonlyMap<number, StageCue>) {
  const {board, item, source, scene} = work;
  const {enter} = item.card;
  work.targets = targetsFor(work);
  const overrides = work.targets.flatMap(({word}) => {
    const cue = staged?.get(word);
    if (!cue) return [];
    if (!isUnit(enter)) throw new Error(`${item.id}: staged entrance override for word ${word} requires a unit block entrance (got "${enter.name}")`);
    if (cue.effect?.def?.kind !== 'enter') throw new Error(`${item.id}: staged entrance for word ${word} requires an enter effect (got "${cue.effect?.name ?? String(cue.effect)}" with kind "${cue.effect?.def?.kind}")`);
    if (cue.effect.def.source !== 'none') throw new Error(`${item.id}: staged entrance "${cue.effect.name}" for word ${word} requires source "none" (got "${cue.effect.def.source}"); use pushIn, diveIn, or quarterTurnIn`);
    if (!Number.isSafeInteger(cue.start)) throw new Error(`${item.id}: staged entrance for word ${word} requires an integer start frame (got ${cue.start})`);
    if (!Number.isSafeInteger(cue.frames) || cue.frames < 1) throw new Error(`${item.id}: staged entrance for word ${word} requires integer frames >= 1 (got ${cue.frames})`);
    return [{word, cue}];
  });
  const echoStart = item.start;
  const first = echoStart ?? Math.min(...work.targets.map((target) => target.sungFrame!));
  const block = board.blocks[work.index];
  const name = `${enter.name} · ${item.id}`;
  const add = (def: VerbDef) => scene.entries.push([name, def]);
  const at = (frame: number) => frame / ctx.fps;
  const sourceOnBoard = source.origin?.board === board;
  const cross = !!source.origin && !sourceOnBoard;
  if (isPair(enter)) {
    if (!source.origin) throw new Error(`${item.id}: ${enter.name} needs an outgoing text landmark`);
    if (cross && (work.index !== 0 || source.origin.board !== previous?.board || enter.params.pin !== 'screen')) {
      throw new Error(`${item.id}: cross-scene landmarks require a screen-pinned transform from the previous scene on the opener`);
    }
    const span = enter.def.duration(enter.params, ctx);
    const until = Math.max(-Infinity, ...source.origin.item.runs.flatMap(({vocal}) =>
      vocal ? [vocal.end, vocal.onset + 14] : []));
    const lead = Math.ceil(span * (enter.def.release ?? 0.5));
    const start = echoStart ?? (cross ? Math.round(board.start * ctx.fps)
      : Math.max(first - lead, until + 1 - (enter.def.dismissesOld ? 0 : lead)));
    const priorBoard = cross ? {...source.origin.board, end: (start + 1) / ctx.fps} : source.origin.board;
    const view = blockView(source.origin, priorBoard);
    const out = cross ? carrierView(view, source.origin, start, priorBoard) : view;
    const inc = blockView(work);
    const keepFrom = typeof enter.params.keep === 'string' ? keptRefs(out, enter.params.keep, source) : undefined;
    if (source.runs?.length && !keepFrom && (item.card.from.kind === 'word' || item.card.from.kind === 'glyph') && typeof enter.params.keep === 'string') {
      throw new Error(`${item.id}: source landmark does not contain kept run "${enter.params.keep}"`);
    }
    const lowered = lowerPair(enter, ctx, {out, inc, at: start, keepFrom, carryIn: cross,
      incoming: echoStart !== undefined ? undefined : work.targets.map(({word, sungFrame}) => {
        const end = Math.max(start + 1, sungFrame! + 3);
        return {word, start: Math.max(start, end - 6), end};
      })});
    work.kept = lowered.keptMask;
    work.start = start;
    work.release = cross ? start : Math.ceil(lowered.releaseFrame);
    work.landing = echoStart !== undefined ? start + span : Math.max(start + span, ...work.targets.map((target) => target.sungFrame! + 3));
    const keptWords = new Set(lowered.keptTargets.map(({word}) => word));
    const fullyKept = new Set(inc.units.filter((unit) => unit.glyphs.every((g) =>
      /^\s$/u.test(g.text) || lowered.keptTargets.some((ref) => ref.word === g.word && ref.index === g.index))).map(({word}) => word));
    work.targets.forEach(({word, sungFrame}) => work.landingByWord.set(word, echoStart !== undefined ? work.landing : keptWords.has(word)
      ? Math.max(start + span, fullyKept.has(word) ? start : sungFrame! + 3) : Math.max(start + 1, sungFrame! + 3)));
    add(lowered.definition);
    block.emerge = {move: 'effect', name, from: cross ? {point: {x: 0, y: 0}, reason: 'screen-pinned scene handoff'} : source.anchor, at: at(start)};
    if (cross) source.origin.board.screenHandoffOut = {frame: start, glyphs: lowered.keptMask};
    return;
  }
  if (cross) throw new Error(`${item.id}: cross-scene landmarks require a screen-pinned transform`);
  if (!isUnit(enter)) {
    const def = lowerLegacy(enter, getVerb);
    const start = echoStart ?? first - (def.lead ?? 8);
    const cue = echoStart === undefined ? start : start + (def.lead ?? 0);
    work.start = start;
    work.release = work.landing = echoStart === undefined ? first : cue;
    work.targets.forEach(({word}) => work.landingByWord.set(word, work.landing));
    add(echoStart === undefined ? def : {...def, replacesEnter: true});
    block.emerge = {move: 'effect', name, from: source.anchor, at: at(cue), params: {...enter.params}};
    return;
  }
  if (enter.def.kind !== 'enter') throw new Error(`${item.id}: ${enter.name} is not an entrance`);
  if (enter.def.source === 'edge' && !('edge' in source.anchor)) throw new Error(`${item.id}: ${enter.name} requires edge()`);
  const firstDuration = enter.def.span?.(work.targets[0].glyphs, enter.params, ctx) ?? enter.def.duration(enter.params, ctx);
  const lead = enter.def.source === 'edge' && !enter.cascade ? Math.min(firstDuration, 9) : firstDuration;
  const schedule = scheduleUnit(enter, ctx, work.targets, echoStart ?? first - lead);
  const overridden = new Set(overrides.map(({word}) => word));
  const standard = schedule.filter(({word}) => !overridden.has(word));
  const explicit = overrides.map(({word, cue}) => ({word, span: {start: cue.start, end: cue.start + cue.frames}}));
  const ranges = spans([...standard, ...explicit]);
  work.schedule = overrides.length ? undefined : schedule;
  work.start = Math.min(...ranges.map((span) => span.start));
  work.landing = Math.max(...ranges.map((span) => span.end));
  work.release = Math.ceil(work.start + (work.landing - work.start) * (enter.def.release ?? 1));
  for (const entry of [...standard, ...explicit]) work.landingByWord.set(entry.word, Math.max(...spans([entry]).map(({end}) => end)));
  if (standard.length) {
    add(lowerUnit(enter, ctx, {schedule: standard, anchor: source.anchor}));
    block.emerge = {move: 'effect', name, from: source.anchor, at: at(work.start)};
  }
  for (const [i, {word, cue}] of overrides.entries()) {
    const key = `${cue.effect.name} · staged entrance · ${item.id}.${word}`;
    scene.entries.push([key, lowerUnit(cue.effect, ctx, {schedule: [explicit[i]]})]);
    if (standard.length === 0 && i === 0) block.emerge = {move: 'effect', name: key, from: source.anchor, at: at(cue.start)};
    else (block.verb ??= []).push({name: key, word, at: at(cue.start)});
  }

}

export function finalizeEffects(work: SceneWork) {
  work.board.effects = effectTable(work.entries);
}
