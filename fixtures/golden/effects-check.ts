import type {strict as assertType} from 'node:assert';
import {withEngine} from '../../context';
import {camForBlock, toScreen} from '../../engine/camera';
import {blockToWorld, layoutBoard} from '../../engine/layout';
import {textWidth} from '../../engine/metrics';
import {resolveAnchor} from '../../engine/letters';
import type {Board, VerbDef} from '../../engine/types';
import {validateBoard} from '../../engine/validate';
import {getVerb, verbNames} from '../../engine/verbRegistry';
import {boardCues, verbFor, wordStateAt} from '../../engine/wordState';
import {
  cascade, cameraKeys, createEffectScope, defineEffect, effectTable, extendEffect, follow, legacy, lowerLegacy, lowerUnit,
  matchCut, reverse, rise, scheduleUnit, slotRoll, stamp, turnIn, unitOf,
} from '../../effects';
import {effectsFixtures, opening, readingOpacity} from './effects';

type Assert = typeof assertType;
function glyphPoint(board: Board, word: number, index: number, frame: number, pin: 'screen' | 'board') {
  const L = layoutBoard(board);
  const w = L.words.get(word)!;
  const b = L.blocks[w.block];
  const glyph = unitOf(w).glyphs[index];
  const state = wordStateAt(board, word, frame);
  const mod = state.letters?.[index];
  const point = blockToWorld(b, {x: glyph.box.x + glyph.box.width / 2 + (mod?.dx ?? 0),
    y: glyph.box.y + glyph.cap / 2 + (mod?.dy ?? 0)});
  return pin === 'screen' ? toScreen(camForBlock(board, b.index, frame), point) : point;
}

export function checkEffects(assert: Assert): string[] {
  const results: string[] = [];
  const fixtures = effectsFixtures();
  const [openingFixture, turning, repeat, wide, portrait, exits, nested] = fixtures;
  assert.throws(() => verifyBadAxis(), /turnIn.*parameter "axis"/);
  assert.throws(() => stamp({frames: 1}), /stamp.*parameter "frames"/);
  assert.throws(() => matchCut({keep: '', pin: 'screen'}), /matchCut.*parameter "keep"/);
  assert.throws(() => Reflect.apply(slotRoll, null, [{keep: 'ONE', pin: 'screen'}]), /slotRoll.*unknown parameter "pin"/);
  assert.equal(slotRoll.def.dismissesOld, true);
  const scope = createEffectScope();
  extendEffect(rise, 'film:rise', {}, scope);
  assert.throws(() => extendEffect(rise, 'film:rise', {}, scope), /already defined/);
  extendEffect(rise, 'film:rise', {}, createEffectScope());
  const legacyNames = verbNames();
  assert(legacyNames.length > 30);
  assert.equal(getVerb('repeatStack'), undefined);
  for (const name of legacyNames) {
    const def = lowerLegacy(legacy(name), getVerb);
    assert.equal(def.modify, getVerb(name)?.modify);
    assert.equal(typeof def.ink, 'function');
  }
  assert.throws(() => lowerLegacy(legacy('missing'), getVerb), /no such registered verb/);
  assert.throws(() => effectTable([['dup', {}], ['dup', {}]]), /Duplicate board effect/);
  results.push(`Load validation names the bad parameter; all ${legacyNames.length} legacy verbs adapt; duplicate board and definition names fail.`);

  withEngine(openingFixture.ctx, () => {
    const {board, ctx, match} = openingFixture;
    const geom = layoutBoard(board).words.get(0)!;
    const unit = unitOf(geom);
    const r = rise({frames: 8});
    const back = reverse(r);
    const env = {ctx};
    assert.equal(back.def.kind, 'exit');
    assert.deepEqual(back.def.pose(1, unit, back.params, env), r.def.pose(0, unit, r.params, env));
    // Exercise the lowerer as well as the definition. Freeze and render via the normal word state path.
    const low = lowerUnit(r, ctx, {schedule: scheduleUnit(r, ctx, [{word: 0, row: 0, glyphs: 4}], 0)});
    const high = lowerUnit(back, ctx, {schedule: scheduleUnit(back, ctx, [{word: 0, row: 0, glyphs: 4}], 35)});
    const original = board.blocks[0];
    const testBoard: Board = {...board, blocks: [{...original, words: [0, 0], rows: [1], exit: undefined,
      verb: [{name: 'rise', word: 0, at: 0}, {name: 'back', word: 0, at: 35 / ctx.fps}]}], effects: effectTable([['rise', low], ['back', high]])};
    assert.equal(verbFor(testBoard, 'rise'), testBoard.effects!.rise);
    assert.equal(verbFor({...board, effects: effectTable([])}, 'rise'), getVerb('rise'));
    const before = wordStateAt(testBoard, 0, 0);
    const reversed = wordStateAt(testBoard, 0, 43);
    assert.equal(reversed.dx, before.dx);
    assert.equal(reversed.dy, before.dy);
    assert.equal(reversed.opacity, before.opacity);
    assert.equal(reversed.opacity, r.def.pose(0, unit, r.params, env).opacity);
    assert.equal(match.keptMask.length, 4);
    assert.equal(match.keptTargets[0].word, 6);
    for (const [k, g] of match.keptMask.entries()) {
      const target = match.keptTargets[k];
      const from = glyphPoint(board, g.word, g.index, match.releaseFrame - 1, 'screen');
      const to = glyphPoint(board, target.word, target.index, match.releaseFrame, 'screen');
      assert(Math.hypot(from.x - to.x, from.y - to.y) < 1e-7);
    }
    assert(wordStateAt(board, 4, 50).sx > 1.11);
    assert.equal(wordStateAt(board, 4, 50).opacity, 1);
    assert.equal(wordStateAt(board, 4, 108).opacity, 0);
    assert.equal(readingOpacity(board, 5, 70), 0);
    assert.equal(readingOpacity(board, 5, 75), 1);
    assert.equal(readingOpacity(board, 6, 78), 0);
    assert.equal(readingOpacity(board, 6, 83), 1);
  });
  results.push('Reverse rise matches its forward start through wordStateAt; HAND punches at full opacity; FOUR transfers within 0.000001 screen px.');

  withEngine(turning.ctx, () => {
    const {board, ctx, slots, turned} = turning;
    assert.equal(camForBlock(board, 1, 71).rot, -90);
    assert.equal(cameraKeys(follow(), {block: 1, placement: 'turnCCW', start: 10}, ctx)[0].to!.rot, 90);
    const a = turned.keptMask[0];
    const b = turned.keptTargets[0];
    const x = glyphPoint(board, a.word, a.index, turned.releaseFrame - 1, 'board');
    const y = glyphPoint(board, b.word, b.index, turned.releaseFrame, 'board');
    assert(Math.hypot(x.x - y.x, x.y - y.y) < 1e-7);
    assert(slots.dismissesOld);
    assert.equal(slots.keptMask.length, 'CHASING?'.length);
    assert.equal(readingOpacity(board, 5, slots.releaseFrame), 0);
    assert.equal(readingOpacity(board, 8, slots.releaseFrame), 1);
    const before = glyphPoint(board, 5, 0, slots.releaseFrame - 1, 'board');
    const after = glyphPoint(board, 8, 0, slots.releaseFrame, 'board');
    assert(Math.hypot(before.x - after.x, before.y - after.y) < 1e-7);
  });
  withEngine(repeat.ctx, () => {
    const {board, matched, copies} = repeat;
    assert.deepEqual(copies.map(({row}) => row), [0, 0, 1, 1]);
    assert(matched.keptMask.every(({word}) => word === 4));
    assert.equal(wordStateAt(board, 4, 87).letters![0].opacity, 0.375);
    assert.equal(wordStateAt(board, 4, 87).letters![1].opacity, 1);
    assert.equal(wordStateAt(board, 4, 88).letters![1].opacity, 0);
  });
  for (const f of [wide, portrait]) withEngine(f.ctx, () => {
    const target = f.cut.keptTargets[0];
    const from = glyphPoint(f.prior, 0, 0, 31, 'screen');
    const atCut = glyphPoint(f.board, target.word, target.index, 32, 'screen');
    assert(Math.hypot(from.x - atCut.x, from.y - atCut.y) < 1e-7);
    assert.equal(wordStateAt(f.board, target.word, 32).letters![target.index].opacity, 1);
    assert.equal(target.word, f === wide ? 2 : 3);
  });
  results.push('STILL pins in board space during the camera roll; both turn directions verified; CHASING? survives slotRoll; only the second KING! supplies ING!; ONE survives the cut in wide and split portrait.');

  withEngine(exits.ctx, () => {
    const {board} = exits;
    assert.equal(wordStateAt(board, 0, 8).turn?.plane, 'hidden');
    assert.equal(typeof wordStateAt(board, 0, 15).turn?.plane, 'object');
    assert(camForBlock(board, 0, 57).zoom > camForBlock(board, 0, 30).zoom);
    assert(Math.abs(wordStateAt(board, 0, 78).sx - 0.45) < 1e-7);
    assert(Math.abs(wordStateAt(board, 0, 78).opacity - 0.45) < 1e-7);
    assert(wordStateAt(board, 1, 103).dy > 0);
    assert.equal(readingOpacity(board, 1, 114), 0);
    assert.equal(readingOpacity(board, 2, 110), 0);
    assert.deepEqual(boardCues(board).filter((cue) => cue.name === 'fall').map((cue) => cue.words), [[1]]);
  });
  results.push('A bottom-edge X turn uses the projected renderer; ladder zoom increases; dock persists at 0.45 opacity; fall, fade and legacy turn exits are block-local.');

  withEngine(nested.ctx, () => {
    const {board, ctx} = nested;
    assert(Object.isFrozen(board.effects));
    assert(Object.values(board.effects!).every(Object.isFrozen));
    assert.equal(getVerb('film:letters'), undefined);
    assert.equal(wordStateAt(board, 0, 48).opacity, 1);
    const check = (frame: number) => wordStateAt(board, 2, frame).letters!;
    for (let k = 0; k < 5; k++) {
      const landing = 52 + k * 3;
      const transit = check(landing - 1)[k];
      const rest = check(landing)[k];
      assert(transit.opacity < 1 && transit.dx < 0 && transit.dy > 0 && transit.rot < 0 && transit.sx! < 1 && transit.sy! < 1);
      assert.deepEqual(rest, {dx: 0, dy: 0, rot: 0, s: 1, sx: 1, sy: 1, opacity: 1});
    }
    assert(!validateBoard(board).violations.some(({rule}) => rule === 'unknown-verb' || rule === 'nest-width'));
    assert.equal(getVerb('film:letters'), undefined);
    const alternate = extendEffect(rise, 'film:letters', {pose: () => ({opacity: 0.7})}, createEffectScope());
    const timing = scheduleUnit(alternate(), ctx, nested.targets[2], 46);
    const entries = Object.entries(board.effects!).flatMap(([name, def]): [string, VerbDef][] =>
      def && name !== 'film:letters' ? [[name, def]] : []);
    entries.push(['film:letters', lowerUnit(alternate(), ctx, {schedule: timing, anchor: opening})]);
    const isolated: Board = {...board, effects: effectTable(entries)};
    assert.equal(wordStateAt(isolated, 2, 64).opacity, 0.7);
    assert.equal(wordStateAt(board, 2, 64).opacity, 1);
    const counter = resolveAnchor(layoutBoard(board), {word: 0, letter: 0, part: 'counter'});
    const allowed = 0.8 * counter.w! * ctx.limits.capTiers.hero / layoutBoard(board).words.get(0)!.h;
    const needed = textWidth('ROOM FOR ONE', 'anton', ctx.limits.sungMinCap / ctx.fontMetrics.fonts.anton.cap);
    assert(needed > allowed);
    results.push(`The literal Anton ROOM FOR ONE needs ${needed.toFixed(2)} px at the 46.8 px cap floor; the hero O allows ${allowed.toFixed(2)} px with the nest rule.`);
    const syl = cascade(rise(), {by: 'syllable', clock: 'sung'});
    const timingSyl = scheduleUnit(syl, ctx, [{word: 2, row: 0, glyphs: 5,
      syllables: [{glyphs: [0, 1], sungFrame: 52}, {glyphs: [2, 3, 4], sungFrame: 64}]}], 0);
    assert.deepEqual(timingSyl[0].glyphs!.map(({end}) => end), [52, 52, 64, 64, 64]);
    const rowTiming = scheduleUnit(cascade(rise(), {by: 'row', order: 'reverse', clock: 5}), ctx,
      [{word: 0, row: 0, glyphs: 1}, {word: 1, row: 1, glyphs: 1}, {word: 2, row: 1, glyphs: 5}], 4);
    assert.equal(rowTiming.find(({word}) => word === 0)!.span!.start, 9);
    assert.equal(rowTiming.find(({word}) => word === 1)!.span!.start, 4);
    assert.equal(rowTiming.find(({word}) => word === 2)!.span!.start, 4);
  });
  results.push('Five glyphs land independently on frames 52, 55, 58, 61 and 64 with offset, rotation, scale and opacity; the film-local name stays out of the registry and can differ on another board.');

  let checked = 0;
  for (const fixture of fixtures) withEngine(fixture.ctx, () => {
    const boards = 'prior' in fixture ? [fixture.prior, fixture.board] : [fixture.board];
    for (const board of boards) for (const [word, interval] of Object.entries(board.readingIntervals!)) {
      if (!interval) continue;
      for (let frame = interval.start; frame <= interval.end; frame++) {
        const opacity = readingOpacity(board, Number(word), frame);
        assert(opacity >= 0.5, `${board.id}: word ${word} at frame ${frame} has opacity ${opacity}`);
        checked++;
      }
    }
  });
  results.push(`Protected reading opacity passed at ${checked} word-frames across the fixtures.`);
  return results;
}

const verifyBadAxis = () => Reflect.apply(turnIn, null, [{axis: 'z'}]);
