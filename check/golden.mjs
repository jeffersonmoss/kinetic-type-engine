import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as esbuild from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const baseline = new URL('../fixtures/golden/sha256.json', import.meta.url);
const args = process.argv.slice(2);
assert(args.length <= 1 && args.every((arg) => ['--update', '--self-test', '--print', '--frame-core'].includes(arg)),
  'usage: node check/golden.mjs [--update | --self-test | --print | --frame-core]');

const tmp = mkdtempSync(join(tmpdir(), 'kte-build-golden-'));
const cleanup = () => rmSync(tmp, {recursive: true, force: true});
const interrupt = () => {
  cleanup();
  process.exit(130);
};
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);

try {
  writeFileSync(join(tmp, 'TEMP_README.md'), [
    'owner: check/golden.mjs', 'shared: no', 'purpose: node-only golden frame bundle',
    `date: ${new Date().toISOString()}`, 'until: this run ends', 'expensive to recreate: no', '',
  ].join('\n'));
  const bundle = join(tmp, 'golden.cjs');
  await esbuild.build({
    stdin: {
      resolveDir: root, sourcefile: 'golden-entry.tsx', loader: 'tsx',
      contents: `
        import {renderToStaticMarkup} from 'react-dom/server';
        import {BOARDS} from './example/boards';
        import {configureEngine, FPS} from './engine/config';
        import {TypeStage} from './engine/TypeStage';
        export {checkFrameCore} from './fixtures/golden/frame-core';
        import {pureTypeBoard, pureTypeConfig} from './fixtures/golden/pure-type';

        const sample = (board, boards, fixture) => {
          const first = Math.ceil(board.start * FPS);
          const last = Math.ceil(board.end * FPS) - 1;
          return Array.from({length: 12}, (_, i) => {
            const frame = first + Math.round((last - first) * i / 11);
            const t = frame / FPS;
            const markup = renderToStaticMarkup(<TypeStage boards={boards} t={t} />);
            const recoloured = fixture === 'pure type' && i === 6
              ? renderToStaticMarkup(<TypeStage boards={[{...board, colour: '#4EDEA2'}]} t={t} />)
              : undefined;
            return {fixture, board: board.id, frame, markup, recoloured};
          });
        };

        export function renderSamples() {
          const example = BOARDS.flatMap((board) => sample(board, BOARDS, 'example'));
          configureEngine(pureTypeConfig);
          return [...example, ...sample(pureTypeBoard, [pureTypeBoard], 'pure type')];
        }
      `,
    },
    bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', outfile: bundle,
  });
  const {renderSamples, checkFrameCore} = createRequire(import.meta.url)(bundle);
  if (args.includes('--frame-core')) checkFrameCore();
  else checkGoldens(renderSamples());
} finally {
  cleanup();
  esbuild.stop();
  process.off('SIGINT', interrupt);
  process.off('SIGTERM', interrupt);
}

function checkGoldens(samples) {
  const sha256 = (markup) => createHash('sha256').update(markup).digest('hex');
  const frames = samples.map(({fixture, board, frame, markup}) => {
    assert(markup.startsWith('<svg'), `${fixture}/${board} frame ${frame} did not render SVG`);
    return {fixture, board, frame, sha256: sha256(markup)};
  });
  const result = {method: 'react-dom/server renderToStaticMarkup', frames};
  const json = JSON.stringify(result, null, 2) + '\n';
  if (args.includes('--print')) {
    process.stdout.write(json);
  } else if (args.includes('--update')) {
    writeFileSync(baseline, json);
    console.log(`Updated ${frames.length} SSR frame hashes.`);
  } else {
    const expected = JSON.parse(readFileSync(baseline, 'utf8'));
    assert.equal(expected.method, result.method);
    assert.equal(expected.frames.length, frames.length);
    for (const [i, frame] of frames.entries()) {
      assert.deepEqual(frame, expected.frames[i], `${frame.fixture}/${frame.board} frame ${frame.frame} changed`);
    }
    console.log(`Matched ${frames.length} SSR frame hashes.`);
    if (args.includes('--self-test')) {
      const changed = samples.filter(({markup, recoloured}) => recoloured !== undefined && sha256(markup) !== sha256(recoloured));
      assert.equal(changed.length, 1, 'one colour change must alter one frame hash');
      console.log(`One colour change altered ${changed[0].board} frame ${changed[0].frame}.`);
    }
  }
}
