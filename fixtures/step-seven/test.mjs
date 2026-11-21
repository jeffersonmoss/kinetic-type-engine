import assert from 'node:assert/strict';
import {build, stop} from 'esbuild';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
try {
  const result = await build({stdin: {resolveDir: root, loader: 'tsx', contents: `
    import React from 'react';
    import {renderToStaticMarkup} from 'react-dom/server';
    import {compileScore, scoreContext} from './compile';
    import {withEngine} from './context';
    import {layoutBoard} from './engine/layout';
    import {insideSafe, readingGlyphs} from './engine/reading';
    import {checkFilm} from './check';
    import {FilmFrame, sizes} from './host';
    import {film, line, scene} from './score';
    import {editClock, mapVocal, songTimeAt} from './song';
    import {edgeMap, edgeScore, edgeEdits, heldMap, heldScore, nestMap, nestScore, crossMap, crossScore, badSourceMap, badSourceScore, fixtureSong} from './fixtures/step-seven/score';
    export const read = (score, map, format = 'wide', options = {}) => compileScore(scoreContext(format), score, map, options);
    export const held = (lag, dim) => read(heldScore(lag, dim), heldMap);
    export const nest = () => read(nestScore, nestMap);
    export const badSource = () => read(badSourceScore, badSourceMap);
    export const cross = (nth, format) => read(crossScore(nth), crossMap, format);
    export const edge = (clipped, format) => {
      const f = read(edgeScore(clipped), edgeMap, format, {edits: edgeEdits});
      return {f, check: checkFilm(f, edgeMap)};
    };
    export const glyphs = (film, board, word, frame) => withEngine(film.ctx, () => readingGlyphs(film.boards[board],
      layoutBoard(film.boards[board]).words.get(word), frame));
    export const markup = (film, frame) => renderToStaticMarkup(<FilmFrame film={film} frame={frame} {...sizes[film.format]}/>);
    export const missingExit = (draft) => read(film({scenes: [scene('h1', {lines: [line('h1.1', {})]}),
      scene('v1', {lines: [line('v1.1', {})]})]}), crossMap, 'wide', {draft});
    export const emphasis = (reason) => read(film({scenes: [scene('edge', {lines: [
      line('edge.1', {enter: heldScore().scenes[0].lines[0].card.enter, rows: ['Enter'], font: 'accent', case: 'mixed', reason})]})]}), edgeMap);
    export const clippedRow = () => {
      const text = 'MMMMM MMMMM MMMMM MMMMM';
      const anchor = 'edge.1';
      const map = fixtureSong([[anchor, Array.from({length: 4}, (_, i) => ['MMMMM', 40 + i * 5, 44 + i * 5])]]);
      return read(film({scenes: [scene('edge', {lines: [line(anchor, {
        enter: heldScore().scenes[0].lines[0].card.enter, rows: [text]})]})]}), map, 'portrait');
    };
    export const mapping = () => {
      const clock = editClock([{start: 11, end: 15}, {start: 21, end: 31}], 30);
      return {back: songTimeAt(162, clock, 30), vocal: mapVocal({start_s: 22.4, end_s: 22.6}, clock, 30)};
    };
  `}, bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', packages: 'external', write: false});
  const mod = {exports: {}};
  new Function('module', 'exports', 'require', result.outputFiles[0].text)(mod, mod.exports, createRequire(import.meta.url));
  const f = mod.exports;
  const read = f.held(1, false);
  assert.equal(read.diagnostics.filter(({severity}) => severity === 'error').length, 0, JSON.stringify(read.diagnostics));
  assert.deepEqual(read.readings[0].interval, {start: 41, end: 55});
  assert.equal(read.readings[1].interval.start, 49);
  assert.equal(read.readings[0].interval, read.boards[0].readingIntervals[0]);
  assert.equal(f.held(1, true).diagnostics.find(({code}) => code === 'visible')?.frame, 54);
  assert.equal(f.held(3, false).diagnostics.find(({code}) => code === 'visible' || code === 'first-readable')?.frame, 43);
  assert.ok(f.badSource().diagnostics.some(({code, line}) => code === 'source-visibility' && line === 'second'));
  console.log('Call holds through frame 55 with reply from frame 49; dimming at frame 54 fails. Onset +1 passes, +3 fails. Lost source fails.');
  assert.throws(() => f.cross(undefined, 'wide'), /ambiguous.*nth 1 = h1.1.token-2.*nth 2 = h1.1.token-3/);
  assert.throws(f.nest, (error) => {
    assert.match(error.message, /ROOM FOR ONE.*80% of the measured counter.*shortfall/);
    console.log(error.message);
    return true;
  });
  assert.throws(f.clippedRow, /portrait safe width.*shortfall/);
  assert.throws(() => f.missingExit(false), /h1: required field "exit" is missing/);
  const draft = f.missingExit(true);
  assert.ok(draft.diagnostics.some((d) => d.code === 'draft-fallback' && d.line === 'v1.1' && d.message.endsWith('from')));
  assert.equal(draft.boards[1].screenHandoffOut, undefined);
  assert.equal(f.emphasis().emphasisWords, 1);
  assert.ok(f.emphasis().diagnostics.some(({code}) => code === 'emphasis-reason'));
  assert.ok(!f.emphasis('this word changes voice').diagnostics.some(({code}) => code === 'emphasis-reason'));
  assert.ok(f.markup(f.emphasis('change of voice'), 56).includes('>Enter</text>'));
  assert.deepEqual(f.mapping(), {back: 22.4, vocal: {onset: 162, end: 168}});
  console.log('Ambiguous nth, missing scene exit, literal nest and portrait shortfall reject. Draft opener, emphasis and edit clock pass.');

  for (const format of ['wide', 'portrait']) {
    const cross = f.cross(2, format);
    const incoming = cross.readings.find(({line}) => line === 'v1.1');
    assert.equal(incoming.words.length, format === 'wide' ? 1 : 2);
    assert.equal(cross.readings.filter(({token}) => token === incoming.token).length, 1);
    const handoff = cross.boards[0].screenHandoffOut;
    assert.deepEqual(handoff.glyphs.map(({word}) => word), [2, 2, 2]);
    const carried = f.glyphs(cross, 0, 2, handoff.frame - 1);
    const wide = f.glyphs(cross, 1, incoming.words.at(-1), handoff.frame).slice(-3);
    assert.ok(f.glyphs(cross, 0, 2, handoff.frame).every(({opacity}) => opacity === 0));
    for (let i = 0; i < 3; i++) {
      assert.ok(Math.hypot(carried[i].quad[0].x - wide[i].quad[0].x, carried[i].quad[0].y - wide[i].quad[0].y) < 1e-5,
        JSON.stringify({format, carried: carried[i], wide: wide[i]}));
    }
    assert.ok(f.markup(cross, handoff.frame).includes(`width="${format === 'wide' ? 1280 : 720}"`));
    const good = f.edge(false, format);
    const bad = f.edge(true, format);
    const errors = good.check.diagnostics.filter(({severity}) => severity === 'error');
    assert.deepEqual(errors, [], JSON.stringify(errors));
    assert.ok(good.f.inspection.some(({reason, frame}) => reason.includes('pre-S frame-edge crossing') && frame < good.f.readings[0].interval.start),
      JSON.stringify(good.f.inspection));
    const crossing = good.f.inspection.find(({reason}) => reason.includes('pre-S frame-edge crossing')).frame;
    const crop = bad.f.diagnostics.find(({code, token, frame}) => code === 'margin' && token === 'edge.1.token-1' && Number.isInteger(frame));
    const interval = bad.f.readings[0].interval;
    assert.ok(crop && interval && crop.frame >= interval.start && crop.frame <= interval.end, JSON.stringify(bad.f.diagnostics));
    assert.ok(bad.f.inspection.some(({frame, reason}) => frame === crop.frame && reason.includes('margin inspection')));
    console.log(`${format}: three carried glyphs aligned at cut frame ${handoff.frame}; edge crossing frame ${crossing}; clipped rest failed at frame ${crop.frame} within [${interval.start}, ${interval.end}].`);
  }
} finally {
  stop();
}
