import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {build, stop} from 'esbuild';

const file = (name) => fileURLToPath(new URL(name, import.meta.url));
try {
  const result = await build({
    entryPoints: [file('main.ts')], bundle: true, format: 'cjs', platform: 'node', packages: 'external', write: false,
  });
  const module = {exports: {}};
  new Function('module', 'exports', 'require', result.outputFiles[0].text)(module, module.exports, createRequire(import.meta.url));
  await module.exports.run(process.argv.slice(2), {root: file('../'), beatWorker: file('measure-beats.py')});
} finally {
  stop();
}
