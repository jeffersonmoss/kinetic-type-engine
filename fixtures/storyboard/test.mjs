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
    import {compileScore, scoreContext} from './compile';
    import {withEngine} from './context';
    import {layoutBoard} from './engine/layout';
    import {camForBlock} from './engine/camera';
    import {readingGlyphs} from './engine/reading';
    import {wordStateAt} from './engine/wordState';
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
} finally {
  stop();
}
