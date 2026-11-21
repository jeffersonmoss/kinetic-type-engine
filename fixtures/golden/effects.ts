import type {EngineContext} from '../../context';
import {createEngineContext, withEngine} from '../../context';
import {camForBlock, toScreen} from '../../engine/camera';
import {SHORT_916, WIDE, type FrameFormat} from '../../engine/format';
import {resolveAnchor} from '../../engine/letters';
import {layoutBoard} from '../../engine/layout';
import type {Block, Board, ReadingInterval, SlideSource, TurnSpec, VerbDef} from '../../engine/types';
import {wordStateAt} from '../../engine/wordState';
import {
  beatPunch, bindRepeatStack, cameraKeys, cascade, createEffectScope, defineEffect, dockExit, effectTable,
  fade, fall, follow, lowerPair, lowerUnit, matchCut, nest, repeatStack, retractExit, reverseSchedule,
  rise, scheduleUnit, slotRoll, stamp, turnIn, type as typeOn, unitCues, unitOf, zoomLadder,
  type BlockView, type EffectTarget, type GlyphRef, type UnitBinding, type UnitCall,
} from '../../effects';
import {pureTypeConfig} from './pure-type';

interface Row {
  text: string[];
  onset: number[];
  cap: number;
  at: Block['at'];
  rows?: number[];
}
export const opening: SlideSource = {point: {x: 245, y: 200}, reason: 'fixture opening'};
const row = (text: string, onset: number[], x: number, y: number, cap = 62, angle = 0): Row =>
  ({text: text.split(' '), onset, cap, at: {x, y, angle}});

function setup(id: string, rows: Row[], format: FrameFormat = WIDE) {
  const words: typeof pureTypeConfig.words = [];
  const lines: typeof pureTypeConfig.lines = [];
  const blocks: Block[] = [];
  const targets: EffectTarget[][] = [];
  const readingIntervals: Record<number, ReadingInterval> = {};
  rows.forEach((r, line) => {
    const first = words.length;
    const end = Math.max(...r.onset) + 14;
    let n = 0;
    const counts = r.rows ?? [r.text.length];
    targets.push(counts.flatMap((count, row) => Array.from({length: count}, () => {
      const j = n++;
      const text = r.text[j];
      const sungFrame = r.onset[j];
      const word = words.length;
      words.push({text, start_s: sungFrame / 30, end_s: (sungFrame + 14) / 30, line});
      readingIntervals[word] = {start: sungFrame, end: sungFrame + 14};
      return {word, row, glyphs: [...text].length, sungFrame};
    })));
    lines.push({id: line, text: r.text.join(' '), start_s: r.onset[0] / 30, end_s: end / 30,
      words: words.slice(first).map((_, j) => first + j)});
    blocks.push({words: [first, words.length - 1], attach: 'FREE', at: r.at, cap: r.cap, rows: counts});
  });
  const ctx = createEngineContext({
    format, fonts: pureTypeConfig.fonts, fontMetrics: pureTypeConfig.metrics,
    look: {palette: pureTypeConfig.palette}, words, lines,
  });
  const board: Board = {
    id, start: 0, end: 5, blocks, readingIntervals, bg: ctx.look.palette.ground, exit: 'none', smearType: false,
    rigStart: {x: ctx.safeBox.x + ctx.safeBox.width / 2, y: ctx.safeBox.y + ctx.safeBox.height / 2, zoom: 1},
    rig: [{t: 0, kind: 'hold', still: true}],
  };
  return {ctx, board, targets};
}
type Fixture = ReturnType<typeof setup>;
type Entry = [string, VerbDef];

function attach<P extends object>(fixture: Fixture, entries: Entry[], block: number, call: UnitCall<P>, at: number,
  binding: Omit<UnitBinding, 'schedule'> = {}, targets = fixture.targets[block], name = call.name) {
  const schedule = scheduleUnit(call, fixture.ctx, targets, at);
  entries.push([name, lowerUnit(call, fixture.ctx, {...binding, schedule})]);
  const def = fixture.board.blocks[block];
  def.verb = [...def.verb ?? [], ...unitCues(name, schedule, fixture.ctx.fps)];
  return schedule;
}
function view(fixture: Fixture, block: number): BlockView {
  const {board} = fixture;
  const b = layoutBoard(board).blocks[block];
  return {
    units: b.words.map(unitOf),
    space(pin, frame) {
      const origin = {x: b.ox, y: b.oy};
      if (pin === 'board') return {origin, angle: b.angle, scale: 1};
      const cam = camForBlock(board, block, frame);
      return {origin: toScreen(cam, origin), angle: b.angle + cam.rot, scale: cam.zoom};
    },
  };
}
const withTable = (f: Fixture, entries: Entry[]) => Object.freeze({...f.board, effects: effectTable(entries)});

function hookOpening() {
  const f = setup('hook opening and retract', [
    {...row('FOUR RINGS ON HIS HAND', [16, 23, 30, 37, 44], 150, 170, 64), rows: [1, 4]},
    {...row('YEAR TWENTY-FOUR', [75, 83], 450, 210, 64), rows: [1, 1]},
    row('STILL NOT DONE', [103, 110, 118], 470, 410, 55),
  ]);
  return withEngine(f.ctx, () => {
    const entries: Entry[] = [];
    const stamps = cascade(stamp(), {by: 'word', clock: 'sung'});
    const stampSchedule = attach(f, entries, 0, stamps, 0, {anchor: opening});
    attach(f, entries, 0, beatPunch('HAND'), 46, {}, [f.targets[0][4]]);
    const match = lowerPair(matchCut({keep: 'FOUR', pin: 'screen'}), f.ctx, {out: view(f, 0), inc: view(f, 1), at: 63,
      incoming: [{word: 5, start: 70, end: 75}, {word: 6, start: 78, end: 83}]});
    entries.push(['matchCut', match.definition]);
    attach(f, entries, 2, cascade(rise(), {by: 'word', clock: 'sung'}), 0, {anchor: {word: 6, part: 'foot'}});
    f.board.blocks[1].emerge = {move: 'effect', name: 'matchCut', from: {word: 0}};
    const schedule = reverseSchedule(stampSchedule.filter(({word}) => word !== 0), 63);
    entries.push(['retractExit', lowerUnit(retractExit(stamps), f.ctx, {schedule, anchor: opening, sourceFrame: 0})]);
    f.board.blocks[0].exit = {style: 'effect', name: 'retractExit', at: 63 / 30, targets: [1, 2, 3, 4]};
    return {...f, board: withTable(f, entries), frames: [8, 14, 16, 23, 44, 50, 60, 65, 68, 69, 74, 85, 108, 118], match};
  });
}

function turnedHook() {
  const f = setup('turned still and slot roll', [
    {...row('STILL NOT DONE', [21, 25, 29], 200, 270), rows: [3]},
    {...row("WHO'S STILL CHASING?", [66, 70, 81], 690, 215, 66, 90), rows: [2, 1]},
    {...row("WHAT'S HE CHASING?", [124, 127, 131], 690, 215, 66, 90), rows: [2, 1]},
  ]);
  f.board.rig!.push(...cameraKeys(follow(), {block: 1, placement: 'turnCW', start: 58}, f.ctx));
  return withEngine(f.ctx, () => {
    const entries: Entry[] = [];
    attach(f, entries, 0, cascade(rise(), {by: 'word', clock: 'sung'}), 0, {anchor: opening});
    const turned = lowerPair(matchCut({keep: 'STILL', pin: 'board'}), f.ctx, {out: view(f, 0), inc: view(f, 1), at: 60,
      incoming: [{word: 3, start: 61, end: 66}, {word: 5, start: 76, end: 81}]});
    const slots = lowerPair(slotRoll({keep: 'CHASING?'}), f.ctx, {out: view(f, 1), inc: view(f, 2), at: 109,
      incoming: [{word: 6, start: 120, end: 124}, {word: 7, start: 123, end: 127}]});
    // CHASING? is already on screen through the slotRoll; also protect its preset window.
    f.board.readingIntervals = {...f.board.readingIntervals, 8: {start: 125, end: 145}};
    entries.push(['turned still', turned.definition], ['slot roll', slots.definition]);
    f.board.blocks[1].emerge = {move: 'effect', name: 'turned still', from: {word: 0}};
    f.board.blocks[2].emerge = {move: 'effect', name: 'slot roll', from: {block: 1, corner: 'tl'}};
    return {...f, board: withTable(f, entries), frames: [20, 30, 51, 58, 62, 65, 66, 69, 81, 109, 112, 114, 115, 118, 131], turned, slots};
  });
}

function repeatedReply() {
  const f = setup('second king becomes ring', [
    row('CHASING?', [14], 220, 160, 100),
    {...row('THE KING! THE KING!', [32, 39, 51, 58], 400, 300, 58), rows: [2, 2]},
    {...row('ONE MORE RING!', [98, 104, 110], 700, 200, 60), rows: [2, 1]},
  ]);
  return withEngine(f.ctx, () => {
    const entries: Entry[] = [];
    attach(f, entries, 0, rise(), 6, {anchor: opening});
    const layout = layoutBoard(f.board);
    const copies = bindRepeatStack(['THE', 'KING!'], f.targets[1].map(({word, sungFrame}) => ({
      word, sungFrame: sungFrame!, text: layout.words.get(word)!.text,
    })));
    attach(f, entries, 1, repeatStack({clock: 'sung'}), 0, {anchor: {word: 0, letter: 6, part: 'foot'}}, copies);
    const second = view(f, 1).units.find(({word}) => word === 4)!;
    const matched = lowerPair(matchCut({keep: 'ING!', pin: 'screen'}), f.ctx, {
      out: view(f, 1), inc: view(f, 2), at: 82,
      incoming: [{word: 5, start: 93, end: 98}, {word: 6, start: 99, end: 104}, {word: 7, start: 105, end: 110}],
      keepFrom: second.glyphs.slice(1).map(({word, index}): GlyphRef => ({word, index})),
    });
    entries.push(['king to ring', matched.definition]);
    f.board.blocks[2].emerge = {move: 'effect', name: 'king to ring', from: {word: 4}};
    const exit = fade();
    entries.push(['changed letters fade', lowerUnit(exit, f.ctx, {
      schedule: scheduleUnit(exit, f.ctx, [copies[3]], 82), excludeGlyphs: matched.keptMask,
    })]);
    f.board.blocks[1].exit = {style: 'effect', name: 'changed letters fade', at: 82 / 30, targets: [4]};
    return {...f, board: withTable(f, entries), frames: [12, 34, 42, 59, 78, 84, 87, 88, 92, 97, 112], copies, matched};
  });
}

function verse(format: FrameFormat) {
  const portrait = format.id === SHORT_916.id;
  const f = setup(`hook to verse ${format.id}`, [
    row('ONE', [15], 220, 280, 68),
    {...row(portrait ? 'AT FORTY- ONE' : 'AT FORTY-ONE', portrait ? [44, 44, 44] : [44, 44],
      portrait ? 120 : 530, 440, 68), rows: portrait ? [1, 1, 1] : [1, 1]},
  ], format);
  return withEngine(f.ctx, () => {
    const entries: Entry[] = [];
    attach(f, entries, 0, rise(), 7, {anchor: opening});
    const from = view(f, 0);
    const into = view(f, 1);
    const cut = lowerPair(matchCut({keep: 'ONE', pin: 'screen'}), f.ctx, {out: from, inc: into, at: 32, carryIn: true,
      incoming: f.targets[1].map(({word}) => ({word, start: 39, end: 44}))});
    entries.push(['cross-scene one', cut.definition]);
    // At the cut the incoming board takes over the screen-pinned run. Each board has only its own words.
    const cutTime = 32 / f.ctx.fps;
    const prior: Board = {...f.board, blocks: [f.board.blocks[0]], end: cutTime, effects: effectTable(entries.slice(0, 1)),
      readingIntervals: {0: f.board.readingIntervals![0]!}};
    f.board.blocks[1].verb = [{name: 'cross-scene one', word: 1, words: f.targets[1].map(({word}) => word)}];
    const incoming: Board = {...f.board, start: cutTime, blocks: [f.board.blocks[1]], effects: effectTable(entries.slice(1)),
      readingIntervals: Object.fromEntries(f.targets[1].map(({word}) => [word, f.board.readingIntervals![word]]))};
    return {...f, prior, board: incoming, frames: [16, 23, 28, 31, 32, 35, 38, 41, 44, 60], cut};
  });
}

function exitAndCamera() {
  const f = setup('edge turn dock fall and ladder', [
    row('FOUR', [21], 270, 240, 74),
    row('RINGS', [72], 650, 190, 72),
    row('HAND', [70], 760, 260, 71),
  ]);
  f.board.rig!.push(...cameraKeys(zoomLadder({steps: 2}), {block: 0, start: 18, repeats: [18, 45]}, f.ctx));
  f.board.rig!.push(...cameraKeys(follow({fill: 0.22}), {block: 2, start: 58}, f.ctx));
  return withEngine(f.ctx, () => {
    const entries: Entry[] = [];
    const edge: SlideSource = {edge: 'bottom'};
    const turn = turnIn({axis: 'x'});
    const t = scheduleUnit(turn, f.ctx, f.targets[0], 8);
    entries.push([turn.name, lowerUnit(turn, f.ctx, {schedule: t, anchor: edge})]);
    f.board.blocks[0].emerge = {move: 'effect', name: turn.name, from: edge};
    attach(f, entries, 1, typeOn(), 60);
    attach(f, entries, 2, stamp({frames: 8}), 62, {anchor: {word: 1}});
    const dock = dockExit({to: 'margin'});
    const falling = fall();
    entries.push([dock.name, lowerUnit(dock, f.ctx, {schedule: scheduleUnit(dock, f.ctx, f.targets[0], 60), source: {x: 360, y: 60}})]);
    entries.push([falling.name, lowerUnit(falling, f.ctx, {schedule: scheduleUnit(falling, f.ctx, f.targets[1], 90)})]);
    f.board.blocks[0].exit = {style: 'effect', name: dock.name, at: 2};
    f.board.blocks[1].exit = {style: 'fall', at: 3};
    f.board.blocks[2].exit = {style: 'fade', at: 3.4};
    return {...f, board: withTable(f, entries), frames: [8, 11, 15, 21, 30, 51, 58, 69, 78, 92, 103, 108, 128]};
  });
}

function nestedReply() {
  const f = setup('nested glyph and film local cascade', [
    row('O', [16], 240, 100, 310),
    row('I', [29], 321, 216, 50),
    row('MOVES', [64], 540, 250),
  ]);
  f.board.blocks[0].pin = 'screen';
  f.board.blocks[1].pin = 'screen';
  return withEngine(f.ctx, () => {
    const entries: Entry[] = [];
    const anchor = {word: 0, letter: 0, part: 'counter'} as const;
    const counter = resolveAnchor(layoutBoard(f.board), anchor);
    f.board.blocks[1].at = {x: counter.p.x - 6, y: counter.p.y - 25, angle: 0};
    const open = stamp({frames: 8});
    entries.push([open.name, lowerUnit(open, f.ctx, {schedule: scheduleUnit(open, f.ctx, f.targets[0], 8)})]);
    f.board.blocks[0].emerge = {move: 'effect', name: open.name, from: opening};
    const inCounter = nest();
    entries.push([inCounter.name, lowerUnit(inCounter, f.ctx, {anchor, holdThrough: 48,
      schedule: scheduleUnit(inCounter, f.ctx, f.targets[1], 26)})]);
    f.board.blocks[1].emerge = {move: 'effect', name: inCounter.name, from: anchor};
    const turn: TurnSpec = {axis: 'x', frames: 8};
    const local = defineEffect({
      name: 'film:letters', kind: 'enter', source: 'none', params: {}, duration: () => 6,
      pose: (u) => ({dx: -12 * (1 - u), dy: 13 * (1 - u), rot: -15 * (1 - u), sx: 0.6 + 0.4 * u,
        sy: 0.7 + 0.3 * u, opacity: u}),
      ink: (_u, unit) => ({...unit.box, x: unit.box.x - 12, width: unit.box.width + 38, height: unit.box.height + 38}),
    }, createEffectScope());
    const glyphs = cascade(local(), {by: 'glyph', clock: 3});
    attach(f, entries, 2, glyphs, 46);
    f.board.blocks[2].exit = {style: 'turn', at: 3.2, turn};
    return {...f, board: withTable(f, entries), frames: [14, 22, 27, 29, 45, 50, 52, 55, 58, 61, 64, 100, 106]};
  });
}

export function effectsFixtures() {
  return [hookOpening(), turnedHook(), repeatedReply(), verse(WIDE), verse(SHORT_916), exitAndCamera(), nestedReply()] as const;
}

/** Worst glyph opacity is the protected reading criterion, including a letter revealed by a cascade. */
export function readingOpacity(board: Board, i: number, f: number) {
  const m = wordStateAt(board, i, f);
  const g = layoutBoard(board).words.get(i)!;
  const opacity = [...g.text].reduce((min, ch, k) => /^\s$/u.test(ch) ? min :
    Math.min(min, m.turn?.letters?.[k] === 'hidden' ? 0 : m.letters?.[k]?.opacity ?? 1), 1);
  return m.hidden || m.turn?.plane === 'hidden' ? 0 : m.opacity * opacity;
}
