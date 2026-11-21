import {createRequire} from 'node:module';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {build} from 'esbuild';

export interface Runtime {root: string; beatWorker: string}
export function evaluate<T>(source: string, root: string, name: string): T {
  const module = {exports: {}};
  // The source is the local score/engine bundle supplied by the caller, just like loading the film's .ts module.
  const require = createRequire(join(root, name));
  new Function('module', 'exports', 'require', source)(module, module.exports, require);
  return module.exports as T;
}

export async function bundleSource(source: string, root: string, output?: string) {
  const result = await build({
    stdin: {contents: source, resolveDir: root, sourcefile: 'Film entry.ts'},
    bundle: true, format: output ? 'esm' : 'cjs', platform: output ? 'browser' : 'node',
    packages: 'external', jsx: 'automatic', write: !!output, outfile: output,
    alias: {kte: root}, absWorkingDir: root,
  });
  return result.outputFiles?.[0]?.text;
}

export async function withScratch<T>(label: string, run: (dir: string, signal: AbortSignal) => Promise<T> | T): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), `kte-build-${label}-`));
  const cleanup = () => rmSync(dir, {recursive: true, force: true});
  const stop = new AbortController();
  const interrupt = () => {process.exitCode = 130; stop.abort(new Error('Interrupted'));};
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  try {
    writeFileSync(join(dir, 'TEMP_README.md'), `owner: kte ${label}\nshared: no\npurpose: ${label} scratch files\ncreated by: kte on ${process.platform}\ndate: ${new Date().toISOString()}\nuntil: command exits\nexpensive to recreate: no\n`);
    const result = await run(dir, stop.signal);
    stop.signal.throwIfAborted();
    return result;
  } finally {
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', interrupt);
    cleanup();
  }
}
