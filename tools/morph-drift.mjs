// K7 numeric check (KIT.md 20): how far the kept letters of every MORPH in a boards module move, in screen px.
// Usage (paths relative to the current directory, or absolute):
//   node tools/morph-drift.mjs <boards module> [EXPORT_NAME=BOARDS] [--after FRAMES=20] [--limit PX=1]
// For each morph cue it prints the largest corner distance of any kept glyph from its landed place (the source letter
// until the morph ends, then the target letter), from the source word's sung frame to FRAMES past the morph's end,
// with every verb applied (wah included), through the board camera (morphKeptDrift in engine/morphPin.ts). It is the
// engine's geometry, not rendered pixels. Exit code 1 when any morph with `pin` drifts more than --limit; morphs
// without `pin` are listed for information only. The bundle goes in a temp folder deleted when the run ends.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import * as esbuild from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const args = process.argv.slice(2);
const opt = (name, dflt) => { const k = args.indexOf(name); return k >= 0 ? Number(args[k + 1]) : dflt; };
const after = opt('--after', 20);
const limit = opt('--limit', 1);
const pos = args.filter((a, k) => !a.startsWith('--') && !['--after', '--limit'].includes(args[k - 1]));
if (!pos[0]) { console.error('usage: node tools/morph-drift.mjs <boards module> [export name] [--after FRAMES] [--limit PX]'); process.exit(2); }
const modPath = path.resolve(process.cwd(), pos[0]);
const exportName = pos[1] ?? 'BOARDS';
const PREFIX = 'kinetic-type-engine-morph-drift-';

for (const d of fs.readdirSync(os.tmpdir())) {
  if (!d.startsWith(PREFIX)) continue;
  const p = path.join(os.tmpdir(), d);
  try { if (Date.now() - fs.statSync(p).mtimeMs > 3600e3) fs.rmSync(p, {recursive: true, force: true}); } catch {}
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), PREFIX));
const cleanup = () => { try { fs.rmSync(tmp, {recursive: true, force: true}); } catch {} };
process.on('SIGINT', () => { cleanup(); process.exit(130); });
fs.writeFileSync(path.join(tmp, 'TEMP_README.md'), `owner: tools/morph-drift.mjs\nshared: no\npurpose: bundled copy of ${pos[0]} for morphKeptDrift\nmade: ${new Date().toISOString()} on this machine\nneeded until: the end of this run (deleted automatically)\ncostly to recreate: no\n`);

try {
  const engine = path.resolve(root, 'engine/index.ts');
  const entry = `
    import * as M from ${JSON.stringify(modPath)};
    import {boardMorphDrifts, assertConfigured, WORDS_FOR_TOOLS} from ${JSON.stringify(engine)};
    assertConfigured();
    const boards = (M as any)[${JSON.stringify(exportName)}];
    if (!Array.isArray(boards)) throw new Error('export ${exportName} is not an array of boards');
    export const run = (after: number) => boards.map((b: any) => ({id: b.id ?? String(b.start), rows: boardMorphDrifts(b, after).map(({cue, drift}: any) => ({
      word: cue.word, text: WORDS_FOR_TOOLS[cue.word].text, from: ((cue.params.fromWords ?? []) as number[]).map((i) => WORDS_FOR_TOOLS[i].text).join(' '), pin: !!cue.params.pin, drift}))}));
  `;
  const out = path.join(tmp, 'bundle.mjs');
  await esbuild.build({
    stdin: {contents: entry, resolveDir: root, loader: 'ts', sourcefile: 'morph-drift-entry.ts'},
    bundle: true, platform: 'node', format: 'esm', outfile: out, jsx: 'automatic', logLevel: 'error',
    loader: {'.json': 'json'},
    banner: {js: "import {createRequire as __cr} from 'module'; const require = __cr(import.meta.url);"},
  });
  const {run} = await import(pathToFileURL(out).href);
  let worst = 0, n = 0, bad = 0;
  for (const b of run(after)) {
    if (!b.rows.length) continue;
    console.log(`== ${b.id}`);
    for (const r of b.rows) {
      const d = r.drift;
      n++;
      if (r.pin) worst = Math.max(worst, d.max);
      const over = r.pin && d.max > limit;
      if (over) bad++;
      console.log(`   ${over ? 'OVER ' : ''}${r.from} > ${r.text}${r.pin ? ' (pin)' : ''}: ${d.pairs} kept letters, max drift ${d.max.toFixed(3)} px` +
        (d.max >= 0.0005 ? ` (letter ${d.letter}, frame ${d.frame})` : '') + `, frames ${d.from} to ${d.to}`);
    }
  }
  console.log(`TOTAL: ${n} morphs; pinned ones drift at most ${worst.toFixed(3)} px; ${bad} over ${limit} px`);
  if (bad) process.exitCode = 1;
} finally {
  cleanup();
}
