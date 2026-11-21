import {constants, copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {extname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build, stop} from 'esbuild';

const [parent, audioSource] = process.argv.slice(2);
if (!parent || !audioSource || process.argv.length !== 4) {
  throw new Error('Usage: node fixtures/step-seven/make-edge.mjs EXISTING_KTE_TEMP_FOLDER AUDIO_FILE');
}
const workspace = resolve(parent);
if (!statSync(workspace).isDirectory() || !readFileSync(join(workspace, 'TEMP_README.md'), 'utf8').includes('shared: no')) {
  throw new Error('Supply the labeled, private temp folder for this test run');
}
const source = resolve(audioSource);
if (!statSync(source).isFile()) throw new Error('Supply an audio file');
const root = fileURLToPath(new URL('../../', import.meta.url));
const fixture = fileURLToPath(new URL('./score.ts', import.meta.url));
try {
  const result = await build({stdin: {contents: 'export {edgeMap, edgeEdits} from "./fixtures/step-seven/score";', resolveDir: root},
    bundle: true, jsx: 'automatic', platform: 'node', packages: 'external', format: 'cjs', write: false});
  const mod = {exports: {}};
  new Function('module', 'exports', 'require', result.outputFiles[0].text)(mod, mod.exports, createRequire(import.meta.url));
  const {edgeMap, edgeEdits} = mod.exports;
  for (const clipped of [false, true]) {
    const title = clipped ? 'Edge Move Clipped' : 'Edge Move Clean';
    const output = join(workspace, title);
    mkdirSync(output);
    for (const name of ['analysis', 'audio', 'score', 'reviews', 'renders']) mkdirSync(join(output, name));
    const audio = 'audio/Fixture' + (extname(source) || '.mp3');
    const json = (file, body) => writeFileSync(join(output, file), JSON.stringify(body, null, 2) + '\n', {flag: 'wx'});
    copyFileSync(source, join(output, audio), constants.COPYFILE_EXCL);
    json('film.json', {engine: 'dev', title, audio, formats: ['wide', 'portrait'], edits: edgeEdits});
    json('song.json', {song: title, audio});
    json('analysis/song-map.json', {...edgeMap, song: title, audio});
    json('analysis/ear-check.json', []);
    writeFileSync(join(output, 'score', 'index.ts'), `import {edgeScore} from ${JSON.stringify(fixture)};\nexport default edgeScore(${clipped});\n`, {flag: 'wx'});
    console.log(output);
  }
} finally {
  stop();
}
