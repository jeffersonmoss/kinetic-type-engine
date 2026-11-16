// The one validator command: runs validateBoards() over a boards module in node and prints the report.
// Usage (paths relative to the repo root, or absolute):
//   node tools/validate-boards.mjs example/boards.ts [EXPORT_NAME=BOARDS] [--step N] [--json] [--layout] [--at SECONDS]
//   --layout prints every block's placement and row sizes; --at T prints each word's screen box at song second T.
//   If the module also exports ELEMENTS (an array of TrackedElement for screen-space graphics), those are checked with
//   validateElements() and listed after the boards. Any error (board or element) sets exit code 1.
// The boards module must be data only (no font loading). It must import the video's song module first (the module
// that calls configureEngine), then engine pieces from engine/index.ts. It is bundled with esbuild into a temp folder
// that is deleted when the run ends (also on failure or Ctrl-C).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import * as esbuild from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const stepIdx = args.indexOf('--step');
const step = stepIdx >= 0 ? Number(args[stepIdx + 1]) : 1;
const atIdx = args.indexOf('--at');
const at = atIdx >= 0 ? Number(args[atIdx + 1]) : null;
const pos = args.filter((a, k) => !a.startsWith('--') && args[k - 1] !== '--step' && args[k - 1] !== '--at');
if (!pos[0]) { console.error('usage: node tools/validate-boards.mjs <boards module> [export name] [--step N] [--json]'); process.exit(2); }
const modPath = path.resolve(root, pos[0]);
const exportName = pos[1] ?? 'BOARDS';
const PREFIX = 'kinetic-type-engine-validate-';

// Remove stale leftovers from crashed earlier runs (older than an hour).
for (const d of fs.readdirSync(os.tmpdir())) {
  if (!d.startsWith(PREFIX)) continue;
  const p = path.join(os.tmpdir(), d);
  try { if (Date.now() - fs.statSync(p).mtimeMs > 3600e3) fs.rmSync(p, {recursive: true, force: true}); } catch {}
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), PREFIX));
const cleanup = () => { try { fs.rmSync(tmp, {recursive: true, force: true}); } catch {} };
process.on('SIGINT', () => { cleanup(); process.exit(130); });
fs.writeFileSync(path.join(tmp, 'TEMP_README.md'), `owner: tools/validate-boards.mjs\nshared: no\npurpose: bundled copy of ${pos[0]} for validateBoard\nmade: ${new Date().toISOString()} on this machine\nneeded until: the end of this run (deleted automatically)\ncostly to recreate: no\n`);

try {
  const engine = path.resolve(root, 'engine/index.ts');
  const entry = `
    import * as M from ${JSON.stringify(modPath)};
    import {validateBoards, formatReports, layoutBoard, cameraAt, toScreen, blockToWorld, wordStateAt, WORDS_FOR_TOOLS, validateElements, formatMotion, assertConfigured, FPS} from ${JSON.stringify(engine)};
    assertConfigured();
    const boards = (M as any)[${JSON.stringify(exportName)}];
    if (!Array.isArray(boards)) throw new Error('export ${exportName} is not an array of boards');
    export const run = (step: number) => { const r = validateBoards(boards, {step}); return {text: formatReports(r), reports: r, errors: r.reduce((a: number, x: any) => a + x.violations.filter((v: any) => v.severity === 'error').length, 0)}; };
    const els = (M as any).ELEMENTS;
    export const runElements = () => { if (!Array.isArray(els)) return null; const v = validateElements(els); return {text: formatMotion('ELEMENTS (' + els.length + ' screen-space elements)', v), violations: v}; };
    const f1 = (x: number) => x.toFixed(1);
    export const layout = () => boards.map((b: any) => {
      const L = layoutBoard(b);
      const rows = [\`== \${b.id ?? b.start} (\${b.start.toFixed(2)} to \${b.end.toFixed(2)} s, exit \${b.exit})\`];
      for (const k of L.blocks) rows.push(\`  block \${k.index} \${k.def.attach} words \${k.def.words[0]}-\${k.def.words[1]}: origin (\${f1(k.ox)}, \${f1(k.oy)}) angle \${k.angle} size \${f1(k.w)} x \${f1(k.h)}; rows: \${k.rows.map((r: any) => r.words.map((i: number) => WORDS_FOR_TOOLS[i].text).join(' ') + ' @' + f1(r.size)).join(' | ')}\`);
      return rows.join('\\n');
    }).join('\\n');
    export const snapshot = (t: number) => boards.filter((b: any) => t >= b.start && t < b.end + 0.3).map((b: any) => {
      const L = layoutBoard(b); const f = t * FPS; const cam = cameraAt(b, f);
      const rows = [\`== \${b.id} at \${t}s: camera (\${f1(cam.x)}, \${f1(cam.y)}) zoom \${cam.zoom.toFixed(3)} rot \${f1(cam.rot)}\`];
      for (const i of L.order) {
        const g = L.words.get(i)!; const k = L.blocks[g.block]; const m = wordStateAt(b, i, f);
        const p = [{x: g.x, y: g.y}, {x: g.x + g.w, y: g.y + g.boxH}].map((q) => toScreen(cam, blockToWorld(k, q)));
        rows.push(\`  \${i} \${g.text} tier \${g.tier} size \${f1(g.size)}: screen (\${f1(p[0].x)}, \${f1(p[0].y)})-(\${f1(p[1].x)}, \${f1(p[1].y)}) opacity \${m.opacity.toFixed(2)}\`);
      }
      return rows.join('\\n');
    }).join('\\n');
  `;
  const out = path.join(tmp, 'bundle.mjs');
  await esbuild.build({
    stdin: {contents: entry, resolveDir: root, loader: 'ts', sourcefile: 'validate-entry.ts'},
    bundle: true, platform: 'node', format: 'esm', outfile: out, jsx: 'automatic', logLevel: 'error',
    loader: {'.json': 'json'},
    banner: {js: "import {createRequire as __cr} from 'module'; const require = __cr(import.meta.url);"},
  });
  const {run, runElements, layout, snapshot} = await import(pathToFileURL(out).href);
  if (flags.has('--layout')) console.log(layout());
  if (at !== null) console.log(snapshot(at));
  const t0 = Date.now();
  const res = run(step);
  if (flags.has('--json')) console.log(JSON.stringify(res.reports, null, 1));
  else console.log(res.text);
  console.log(`(checked every ${step === 1 ? '' : step + 'th '}frame in ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  if (res.errors) process.exitCode = 1;
  const el = runElements();
  if (el) { console.log(flags.has('--json') ? JSON.stringify(el.violations, null, 1) : el.text); if (el.violations.length) process.exitCode = 1; }
} finally {
  cleanup();
}
