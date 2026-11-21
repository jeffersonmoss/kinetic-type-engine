import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const file = name => fileURLToPath(new URL(name, import.meta.url));
const result = await build({
  entryPoints: [file('main.ts')], bundle: true, format: 'esm', platform: 'node', write: false,
});
const {run} = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
run(process.argv.slice(2), file('measure-beats.py'));
