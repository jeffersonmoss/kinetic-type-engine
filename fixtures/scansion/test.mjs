import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build, stop} from 'esbuild';

const root = fileURLToPath(new URL('../../', import.meta.url));
try {
  const result = await build({stdin: {resolveDir: root, loader: 'tsx', contents: `
    import React from 'react';
    import {renderToStaticMarkup} from 'react-dom/server';
    import {checkFilm} from './check';
    import {compileScore, scoreContext} from './compile';
    import {withEngine} from './context';
    import {beatPunch, cascade, onStress, type} from './effects';
    import {wordStateAt} from './engine/wordState';
    import {FilmFrame, sizes} from './host';
    import {film, line, scene} from './score';
    import {importSong, timeScansion} from './song';

    const analysis = {status: 'unavailable', beats: [], duration_s: null, downbeat_phase: null, tempo_bpm: null};
    const input = (word, end_s) => importSong({alignment: {words: [{word, start_s: 7, end_s}]},
      config: {song: 'Scansion'}, audio: 'fixture.mp3', earChecks: [], analysis});
    function compile(map, card, format = 'wide', edits = [{start: 5, end: 9}]) {
      const score = film({scenes: [scene('scansion', {lines: [line('line-1', card)]})]});
      return compileScore(scoreContext(format), score, map, {edits});
    }
    const wordEntrance = cascade(type({gap: 0, fade: 1}), {by: 'word', clock: 'sung'});
    export function embiid(mode, override = false, clipped = false) {
      let {map, scansion} = input('EMBIID', 7.4);
      if (override) {
        const decision = scansion[map.tokens[0].id];
        decision.syllables[0].sungStress = 2;
        decision.syllables[1].sungStress = 0;
        map = timeScansion(map, scansion);
      }
      const call = mode === 'legacy' ? beatPunch('EMBIID') : mode === 'all'
        ? cascade(beatPunch('EMBIID'), {by: 'syllable'}) : beatPunch(onStress({word: 'EMBIID'}));
      const edits = clipped ? [{start: 5, end: 7.1}, {start: 7.15, end: 9}] : undefined;
      const picture = compile(map, {enter: wordEntrance, accents: [call]}, 'wide', edits);
      return {picture, report: checkFilm(picture, map)};
    }
    export function split(format) {
      const {map} = input('TWENTY-FOUR!', 7.6);
      return compile(map, {enter: wordEntrance, portrait: {rows: ['TWENTY-', 'FOUR!']},
        accents: [beatPunch(onStress({level: 2}))]}, format);
    }
    export function chasing(end) {
      const {map} = input('CHASING', end);
      return compile(map, {enter: cascade(type({gap: 0, fade: 1}), {by: 'syllable'})});
    }
    export const state = (picture, word, frame) => withEngine(picture.ctx, () => wordStateAt(picture.boards[0], word, frame));
    export const markup = (picture, frame) => renderToStaticMarkup(
      <FilmFrame film={picture} frame={frame} {...sizes[picture.format]}/>);
  `}, bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', packages: 'external', write: false});
  const mod = {exports: {}};
  new Function('module', 'exports', 'require', result.outputFiles[0].text)(mod, mod.exports, createRequire(import.meta.url));
  const {embiid, split, chasing, state, markup} = mod.exports;
  const inspected = picture => picture.inspection.filter(({reason}) => reason.includes('beatPunch')).map(({frame}) => frame);

  const {picture, report} = embiid('selected');
  assert.deepEqual(inspected(picture), [66]);
  const scales = state(picture, 0, 66).letters.map(letter => letter.sx);
  assert.deepEqual(scales, [1, 1, 1.12, 1.12, 1.12, 1.12]);
  assert.match(markup(picture, 66), /scale\(1\.12 1\.12\)/u);
  assert.deepEqual(inspected(embiid('selected', true).picture), [60]);
  assert.deepEqual(inspected(embiid('selected', false, true).picture), []);
  assert.equal(report.diagnostics.filter(({code}) => code === 'unstressed-accent').length, 0);
  assert.deepEqual(report.sync[0].syllables.map(({stress}) => stress), [0, 1]);
  for (const kind of ['legacy', 'all']) {
    const warnings = embiid(kind).report.diagnostics.filter(({code}) => code === 'unstressed-accent');
    assert.deepEqual(warnings.map(({severity, token, frame}) => [severity, token, frame]),
      [['warn', 'line-1.token-1', 60]]);
  }
  console.log('EMBIID peaks on BIID at frame 66 after the edit. The override moves the peak to EM at frame 60. A clipped syllable emits no cue.');

  for (const format of ['wide', 'portrait']) {
    const picture = split(format);
    assert.deepEqual(inspected(picture), [72]);
    const [reading] = picture.readings;
    const last = reading.words.at(-1);
    assert.equal(reading.words.length, format === 'wide' ? 1 : 2);
    const letters = state(picture, last, 72).letters;
    assert.ok(letters.slice(-5).every(({sx}) => sx === 1.12));
    assert.ok(letters.slice(0, -5).every(({sx}) => sx === 1));
  }
  console.log('TWENTY-FOUR keeps one reading interval and accents only FOUR at frame 72, in wide and split portrait rows.');

  const short = chasing(7.12);
  const [reading] = short.readings;
  assert.equal(reading.landing, 62);
  assert.equal(short.diagnostics.filter(({severity}) => severity === 'error').length, 0, JSON.stringify(short.diagnostics));
  assert.deepEqual(state(short, 0, 60).letters.map(({opacity}) => opacity), [1, 1, 1, 1, 0, 0, 0]);
  assert.ok(chasing(8).diagnostics.some(({code}) => code === 'landing'));
  console.log('CHASING cascades with CHAS at frame 60 and ING at frame 62. The longer entrance still hits the protected-reading deadline check.');
} finally {
  stop();
}
