import assert from 'node:assert/strict';
import {build, stop} from 'esbuild';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
try {
  const result = await build({stdin: {resolveDir: root, loader: 'tsx', contents: `
    import React from 'react';
    import {renderToStaticMarkup} from 'react-dom/server';
    import {FilmFrame, sizes} from './host';
    export {checkFilm} from './check';
    import {compileScore, scoreContext} from './compile';
    import {withEngine} from './context';
    import {layoutBoard} from './engine/layout';
    import {camForBlock} from './engine/camera';
    import {readingGlyphs} from './engine/reading';
    import {wordStateAt} from './engine/wordState';
    export {getVerb, verbNames} from './engine';
    export {unitPose, rise, cascade, stamp} from './effects';
    export * from './fixtures/storyboard/score';
    export const read = (score, map, format = 'wide', options = {}) => compileScore(scoreContext(format), score, map, options);
    export const layout = (film, board = 0) => withEngine(film.ctx, () => layoutBoard(film.boards[board]));
    export const markup = (film, frame) => renderToStaticMarkup(<FilmFrame film={film} frame={frame} {...sizes[film.format]}/>);
    export const cam = (film, block, frame) => withEngine(film.ctx, () => camForBlock(film.boards[0], block, frame));
    export const glyphs = (film, word, frame, board = 0) => withEngine(film.ctx, () =>
      readingGlyphs(film.boards[board], layoutBoard(film.boards[board]).words.get(word), frame));
    export const state = (film, word, frame, board = 0) => withEngine(film.ctx, () => wordStateAt(film.boards[board], word, frame));
  `}, bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', packages: 'external', write: false});
  const mod = {exports: {}};
  new Function('module', 'exports', 'require', result.outputFiles[0].text)(mod, mod.exports, createRequire(import.meta.url));
  const f = mod.exports;

  const picture = f.read(f.embiidScore(), f.embiidMap);
  const [lead, draws, free] = f.layout(picture).blocks;
  assert.ok(draws.oy > lead.oy);
  assert.ok(free.ox > lead.ox + lead.w);
  const ids = picture.readings.slice(0, 6).map(({line}) => line);
  assert.deepEqual(ids, ['line-21', 'line-21', 'line-21.p1', 'line-21.p1', 'line-21.p2', 'line-21.p2']);
  assert.equal(picture.lineIndex['line-21.p1'].block, 1);
  assert.equal(picture.lineIndex['line-21.p2'].block, 2);
  assert.equal(picture.readings[3].preset, true);
  assert.ok(picture.boards[0].rig.some(({to}) => to?.frame?.blocks?.includes(2) && to.fill === 0.5));
  for (const reading of picture.readings) {
    assert.equal(picture.readings.filter(({token}) => token === reading.token).length, 1);
    assert.ok(reading.interval, JSON.stringify(reading));
    assert.equal(picture.boards[0].readingIntervals[reading.words[0]], reading.interval);
  }
  assert.ok(picture.diagnostics.some(({code, token}) => code === 'overlap' && token === 'line-21.token-1'));
  assert.ok(picture.diagnostics.some(({code, token}) => code === 'sung-cap' && token === 'line-21.token-5'));
  const tuned = f.read(f.embiidScore(f.tunedEmbiidCard), f.embiidMap);
  const legacyChecks = f.checkFilm(tuned, f.embiidMap).diagnostics.filter(({severity}) => severity === 'error');
  assert.ok(legacyChecks.some(({code}) => code === 'fast-move'));
  console.log(`Line 20 full validator: ${legacyChecks.length} errors across ${[...new Set(legacyChecks.map(({code}) => code))].join(', ')}.`);
  const errors = tuned.diagnostics.filter(({severity}) => severity === 'error');
  assert.deepEqual(errors, [], JSON.stringify(errors));
  console.log('Line 20: the literal card hits overlap and cap checks. The tuned wide shot passes protected reading.');
  const [a, b] = f.embiidCard.parts;
  assert.throws(() => f.read(f.embiidScore({...f.embiidCard, parts: [a, b, b]}), f.embiidMap), /at most two/);
  assert.throws(() => f.read(f.embiidScore({...f.embiidCard, parts: [b, a]}), f.embiidMap), /cannot bind.*somebody.*draws/i);
  assert.throws(() => f.read(f.embiidScore({...f.embiidCard, parts: [a]}), f.embiidMap), /missing sung tokens/);
  assert.throws(() => f.read(f.embiidScore({...f.embiidCard, parts: [{...a, from: undefined}, b]}), f.embiidMap), /p1: required field "from"/);

  const [hook] = f.splitScore.scenes;
  const [motifLine] = hook.lines;
  const interleaved = (cyclic) => ({scenes: [{...hook, lines: [{...motifLine, card: {...motifLine.card, parts: [
    {...motifLine.card.parts[0], from: {kind: 'row', line: 'h1.1.reply', row: 1}},
  ], reply: {...motifLine.card.reply, from: {kind: 'row', line: cyclic ? 'h1.1.p1' : 'h1.1', row: 1}}}}]}]});
  const replySource = f.read(interleaved(false), f.splitMap);
  assert.ok(replySource.lineIndex['h1.1.reply'].block < replySource.lineIndex['h1.1.p1'].block);
  assert.throws(() => f.read(interleaved(true), f.splitMap), /cyclic landmarks among h1.1.p1, h1.1.reply/);
  const portrait = f.read(f.splitScore, f.splitMap, 'portrait');
  const split = portrait.readings.find(({text}) => text === 'FORTY-ONE');
  assert.equal(split.line, 'h1.1.p1');
  assert.equal(split.words.length, 2);
  assert.equal(portrait.readings.filter(({token}) => token === split.token).length, 1);
  for (const word of split.words) assert.equal(portrait.boards[0].readingIntervals[word], split.interval);
  assert.ok(portrait.lineIndex['h1.1.reply']);
  const clipped = f.read(f.editPartsScore, f.splitMap, 'wide', {edits: [{start: 2, end: 4}]});
  assert.deepEqual(clipped.readings.map(({line, onset}) => [line, onset]), [['h1.1.p1', 15]]);
  assert.deepEqual(Object.keys(clipped.lineIndex), ['h1.1.p1']);
  console.log('Parts preserve lyric order, part/reply landmarks, preset, camera keys, and one shared reading interval through reflow and edits.');

  const night = f.read(f.inkScore('#0B1026'), f.inkMap);
  const colours = [...f.layout(night).words.values()].map(({text, opts}) => [text, opts.colour]);
  assert.deepEqual(colours, [['BITE', '#FF4058'], ['AND', '#F5B81C'], ['RUN', '#F5B81C'], ['AGAIN', '#F4EFE2'], ['OKAY', '#F5B81C']]);
  assert.deepEqual(night.diagnostics.filter(({severity}) => severity === 'error'), [], JSON.stringify(night.diagnostics));
  const markup = f.markup(night, 130);
  const painted = [...markup.matchAll(/<text[^>]*fill="([^"]+)"[^>]*>([^<]+)<\/text>/g)].map(([, colour, glyph]) => [glyph, colour]);
  assert.deepEqual(painted, colours.flatMap(([text, colour]) => [...text].map((glyph) => [glyph, colour])));
  const court = f.read(f.inkScore('#0A3A82'), f.inkMap);
  const lowContrast = court.diagnostics.filter(({code}) => code === 'contrast');
  assert.deepEqual(lowContrast.map(({token}) => token), ['inks.token-1']);
  assert.match(lowContrast[0].message, /below 4.5:1/);
  assert.deepEqual(f.read(f.inkScore('#0A3A82', false), f.inkMap).diagnostics.filter(({severity}) => severity === 'error'), []);
  const badPalette = f.inkScore('#0A3A82');
  badPalette.look.ink.hit = 'red';
  assert.throws(() => f.read(badPalette, f.inkMap), /ink "hit" needs a hex colour/);
  console.log(`Ink rendered all three role colours. Red on court failed: ${lowContrast[0].message}`);

  const bridges = f.read(f.interludeScore, f.interludeMap);
  assert.deepEqual(bridges.readings.map(({line, text}) => [line, text]), [
    ['hook', 'FOUR'], ['hook.reply', 'RING!'], ['out', 'PHILLY'], ['out.reply', 'ONE'],
  ]);
  const transitionFor = (film, id) => film.transitions.find(({line, cut}) => line === id && !cut);
  const open = transitionFor(bridges, 'open');
  assert.deepEqual([open.start, open.landing, open.interlude], [18, 83, true]);
  assert.equal(transitionFor(bridges, 'last').start, 398);
  for (const [word, fStart] of [18, 37, 56, 75].entries()) {
    assert.equal(f.state(bridges, word, fStart - 1).opacity, 0);
    assert.equal(f.state(bridges, word, fStart + 8).opacity, 1);
    assert.equal(bridges.boards[0].readingIntervals[word], undefined);
  }
  assert.ok(!f.markup(bridges, 0).includes('<text'));
  assert.ok(bridges.inspection.some(({frame, reason}) => frame === 83 && reason.includes('open · interlude landing')));
  for (const [i, frame] of [26, 45, 64, 83].entries()) {
    assert.ok(bridges.inspection.some((sample) => sample.frame === frame && sample.reason.includes(`open · echo row ${i + 1} landing`)));
  }
  const years = bridges.transitions.filter(({line}) => line.startsWith('year-'));
  assert.equal(years.length, 12);
  assert.deepEqual(years.map(({start}) => start), Array.from({length: 12}, (_, i) => 151 + 19 * i));
  const [first, last] = f.interludeScore.scenes;
  const stamped = {...f.interludeScore, scenes: [{...first, lines: first.lines.map((card) => card.id === 'year-1'
    ? {...card, card: {...card.card, enter: f.stamp({frames: 8})}} : card)}, last]};
  assert.ok(f.read(stamped, f.interludeMap).diagnostics.some(({code, token, frame}) =>
    code === 'overlap' && token === 'hook.token-2' && frame === 152));
  assert.ok(f.state(bridges, bridges.readings[1].words[0], 181).opacity >= 0.5, 'RING! must survive the year counter');
  const lastYear = f.layout(bridges).blocks[bridges.lineIndex['year-24'].block];
  assert.deepEqual(lastYear.words.map(({text}) => text), ['YEAR', '24']);
  const title = transitionFor(bridges, 'title');
  assert.deepEqual([title.start, title.release, title.landing], [560, 566, 572]);
  const oldOne = bridges.readings[3].words[0];
  const newOne = f.layout(bridges, 1).blocks[bridges.lineIndex.title.block].words.find(({text}) => text === 'ONE').i;
  assert.ok(f.glyphs(bridges, oldOne, 565, 1).every(({opacity}) => opacity >= 0.5));
  assert.ok(f.glyphs(bridges, newOne, 565, 1).every(({opacity}) => opacity === 0));
  assert.ok(f.glyphs(bridges, oldOne, 566, 1).every(({opacity}) => opacity === 0));
  const before = f.glyphs(bridges, oldOne, 565, 1);
  const after = f.glyphs(bridges, newOne, 566, 1);
  assert.ok(after.every(({opacity, quad}, i) => opacity === 1 && Math.hypot(
    quad[0].x - before[i].quad[0].x, quad[0].y - before[i].quad[0].y) < 1e-5));
  assert.ok(bridges.boards[1].blocks[bridges.lineIndex.title.block].verb.some(({name, at}) => name.startsWith('beatPunch') && Math.round(at * 30) === 572));
  assert.deepEqual(bridges.diagnostics.filter(({severity}) => severity === 'error'), [], JSON.stringify(bridges.diagnostics));
  const standing = f.read(f.standingScore, f.interludeMap, 'wide', {edits: [{start: 1, end: 3}]});
  assert.deepEqual([standing.transitions[0].start, standing.transitions[0].landing], [7, 21]);
  assert.equal(standing.readings.length, 0);
  assert.equal(f.state(standing, 0, 6).opacity, 0);
  assert.ok(f.state(standing, 0, 14).turn);
  const cross = f.read(f.echoCrossScore, f.echoCrossMap);
  assert.deepEqual(cross.boards[0].screenHandoffOut.glyphs.map(({word}) => word), [0, 0, 0]);
  assert.equal(cross.readings.length, 1);
  const stand = f.standingScore.scenes[0].lines[0];
  const badInterlude = (override) => ({scenes: [{...f.standingScore.scenes[0], lines: [{...stand, ...override}]}]});
  assert.throws(() => f.read(badInterlude({start: {beat: 99}}), f.interludeMap), /unknown song-map beat 99/);
  assert.throws(() => f.read(badInterlude({card: {...stand.card, rows: ['RING']}}), f.interludeMap), /only echo/);
  assert.throws(() => f.read(badInterlude({card: {...stand.card, enter: f.cascade(f.stamp(), {by: 'row', clock: 'sung'})}}),
    f.interludeMap), /cannot use sung timing/);
  assert.throws(() => f.read(badInterlude({card: {...stand.card, preset: true}}), f.interludeMap), /cannot declare sung-voice fields/);
  assert.throws(() => f.read(badInterlude({id: 'hook'}), f.interludeMap), /distinct from sung line IDs/);
  console.log('Interludes staged four rows and twelve year steps on beat frames, turned after an edit, and transferred ONE at frame 566 without a sung token.');

  const legacyNames = ['drawer', 'rush', 'spread', 'converge', 'swell', 'shove', 'vanish', 'fling', 'turn'];
  for (const name of legacyNames) assert.ok(f.getVerb(name), name);
  assert.ok(f.getVerb('slideFrom'));
  assert.ok(!f.getVerb('turnSwap'));
  console.log(`Registry: ${f.verbNames().length} registered names, including slideFrom; turnSwap is a mode, not a name.`);
  for (const [dir, dx, dy] of [['right', -1, 0], ['left', 1, 0], ['down', 0, -1], ['up', 0, 1]]) {
    const unit = {box: {x: 0, y: 0, width: 100, height: 60}, cap: 60, glyphs: []};
    const half = f.unitPose(f.rise({dir}), 0.25, unit, {ctx: tuned.ctx});
    assert.equal(half.opacity, 0.5);
    assert.equal(Math.sign(half.dx) || 0, dx);
    assert.equal(Math.sign(half.dy) || 0, dy);
    assert.ok(Math.abs(Math.hypot(half.dx, half.dy) - (dx ? 104 : 64) * 0.75 ** 3) < 0.0001);
  }
  const freeReading = tuned.readings.find(({text}) => text === 'free.');
  const freeWord = freeReading.words[0];
  const firstFree = freeReading.landing - 8;
  const displacement = (frame) => Math.abs(f.state(tuned, freeWord, frame).dx * f.cam(tuned, 2, frame).zoom);
  console.log(`All nine legacy names resolve. FREE rise: ${displacement(firstFree).toFixed(2)} screen px at opacity 0, ${displacement(firstFree + 2).toFixed(2)} px at opacity 0.5.`);
} finally {
  stop();
}
