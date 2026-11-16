// Renders a static SVG contact sheet of the pictogram Figure look (props/Figure.tsx) with the same path math the
// engine uses: every kind, variant and pose, a pose change frame by frame, the stride cycle, and the stroke look for
// comparison. No browser needed.
// Usage: node tools/render-figure-sheet.mjs [output.svg]   (default: "Pictogram figures sheet.svg" in the engine root)
// The bundled copy goes in a temp folder that is deleted when the run ends (also on failure or Ctrl-C).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import * as esbuild from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outFile = path.resolve(process.cwd(), process.argv[2] ?? path.join(root, 'Pictogram figures sheet.svg'));
const PREFIX = 'kinetic-type-engine-figure-sheet-';
for (const d of fs.readdirSync(os.tmpdir())) {
  if (!d.startsWith(PREFIX)) continue;
  const p = path.join(os.tmpdir(), d);
  try { if (Date.now() - fs.statSync(p).mtimeMs > 3600e3) fs.rmSync(p, {recursive: true, force: true}); } catch {}
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), PREFIX));
const cleanup = () => { try { fs.rmSync(tmp, {recursive: true, force: true}); } catch {} };
process.on('SIGINT', () => { cleanup(); process.exit(130); });
fs.writeFileSync(path.join(tmp, 'TEMP_README.md'), `owner: tools/render-figure-sheet.mjs\nshared: no\npurpose: bundled copy of the Figure prop and the sheet layout\nmade: ${new Date().toISOString()} on this machine\nneeded until: the end of this run (deleted automatically)\ncostly to recreate: no\n`);

try {
  const entry = `
    import React from 'react';
    import {renderToStaticMarkup} from 'react-dom/server';
    import {Figure, figureQuad, FIGURE_CHANGE_FRAMES} from ${JSON.stringify(path.join(root, 'props/Figure.tsx'))};
    import type {FigureProps} from ${JSON.stringify(path.join(root, 'props/Figure.tsx'))};
    const PAPER = '#F2EFE6', GROUND = '#1B2430', LINE = '#4B5A6B', TEXT = '#9FB0C2';
    const items: React.ReactNode[] = [];
    const label = (x: number, y: number, s: string, size = 11, anchor = 'middle') => items.push(<text key={items.length} x={x} y={y} fill={TEXT} fontFamily="Helvetica, Arial, sans-serif" fontSize={size} textAnchor={anchor as any}>{s}</text>);
    const cell = (cx: number, base: number, w: number, props: FigureProps, box = true) => {
      items.push(<line key={items.length} x1={cx - w / 2} x2={cx + w / 2} y1={base} y2={base} stroke={LINE} strokeWidth={1} />);
      items.push(<Figure key={items.length} look="pictogram" {...props} x={cx} y={base} tone={PAPER} />);
      if (box) items.push(<polygon key={items.length} points={figureQuad({look: 'pictogram', ...props, x: cx, y: base}).map((q) => q.x.toFixed(1) + ',' + q.y.toFixed(1)).join(' ')} fill="none" stroke="#E0584B" strokeWidth={0.6} strokeDasharray="3 3" />);
    };
    let y = 40;
    label(20, y, 'Pictogram Figure look: every kind, variant and pose (dashed red = figureQuad)', 15, 'start');
    // 1. poses
    const poses = [['stand', {pose: 'stand'}], ['lean', {pose: 'lean'}], ['stride 0.0', {pose: 'lean', stride: 0}], ['stride 1.6', {pose: 'lean', stride: 1.6}], ['sit', {pose: 'sit'}], ['lie', {pose: 'lie'}]] as const;
    const colW = 175;
    const rows: [string, any][] = [['adult man', {kind: 'adult', variant: 'man'}], ['adult woman', {kind: 'adult', variant: 'woman'}], ['child man', {kind: 'child', variant: 'man'}], ['child woman', {kind: 'child', variant: 'woman'}]];
    y += 25;
    poses.forEach(([n], k) => label(130 + k * colW + colW / 2, y, n));
    rows.forEach(([n, base], r) => {
      const ground = y + 20 + 170 * (r + 1) - 20;
      label(20, ground - 60, n, 12, 'start');
      poses.forEach(([, pp], k) => cell(130 + k * colW + colW / 2, ground, colW - 10, {...base, ...pp, size: base.kind === 'adult' ? 150 : 87}));
    });
    y += 20 + 170 * 4 + 10;
    // 2. a pose change, stand to sit to lie, frame by frame
    label(20, y, 'Pose change (14 frames, every joint eased): stand to sit at frames 0, 3, 7, 10, 14; then sit to lie', 13, 'start');
    const t0 = 1, f = (n: number) => t0 + n / 30;
    const frames = [0, 3, 7, 10, 14];
    [['man', 'adult'], ['woman', 'adult'], ['woman', 'child']].forEach(([v, kd], r) => {
      const ground = y + 20 + 165 * (r + 1) - 10;
      label(20, ground - 60, kd + ' ' + v, 12, 'start');
      frames.forEach((n, k) => cell(130 + k * 120 + 60, ground, 110, {kind: kd as any, variant: v as any, pose: 'stand', changes: [{at: t0, to: 'sit'}], t: f(n), size: kd === 'adult' ? 150 : 87}));
      frames.forEach((n, k) => cell(130 + 5 * 120 + 30 + k * 135 + 70, ground, 125, {kind: kd as any, variant: v as any, pose: 'sit', changes: [{at: t0, to: 'lie'}], t: f(n), size: kd === 'adult' ? 150 : 87}));
    });
    y += 20 + 165 * 3 + 10;
    // 3. the stride cycle
    label(20, y, 'Stride cycle (lean pose, phase 0 to 2 pi in eight steps), man then woman, flip = facing left in the last two', 13, 'start');
    for (let r = 0; r < 2; r++) {
      const ground = y + 20 + 170 * (r + 1) - 20;
      for (let k = 0; k < 8; k++) cell(40 + k * 125 + 62, ground, 115, {kind: 'adult', variant: r === 0 ? 'man' : 'woman', pose: 'lean', stride: (k * Math.PI) / 4, flip: false, size: 150}, false);
    }
    y += 20 + 170 * 2 + 10;
    // 4. a mixed crowd by default variant, children and adults, facing both ways
    label(20, y, 'Default variants (no variant given: chosen from the anchor, so a row is mixed and stable), and the stroke look for comparison (right)', 13, 'start');
    const ground = y + 20 + 150;
    for (let k = 0; k < 9; k++) cell(60 + k * 85, ground, 80, {kind: k % 3 === 2 ? 'child' : 'adult', pose: 'stand', flip: k % 2 === 1, look: 'pictogram', size: k % 3 === 2 ? 87 : 150}, false);
    [['adult', 'stand'], ['child', 'stand'], ['adult', 'sit']].forEach(([kd, ps], k) => cell(900 + k * 110, ground, 100, {kind: kd as any, pose: ps as any, look: 'stroke', size: kd === 'adult' ? 150 : 87}, false));
    y += 20 + 150 + 30;
    const H = y;
    export const svg = renderToStaticMarkup(<svg xmlns="http://www.w3.org/2000/svg" width={1500} height={H} viewBox={'0 0 1500 ' + H}><rect width="1500" height={H} fill={GROUND} />{items}</svg>);
  `;
  const entryFile = path.join(tmp, 'entry.tsx');
  fs.writeFileSync(entryFile, entry);
  const res = await esbuild.build({entryPoints: [entryFile], bundle: true, write: false, platform: 'node', format: 'cjs', loader: {'.tsx': 'tsx'}, absWorkingDir: root, jsx: 'automatic', nodePaths: [path.join(root, 'node_modules')]});
  const bundle = path.join(tmp, 'bundle.cjs');
  fs.writeFileSync(bundle, res.outputFiles[0].text);
  const m = createRequire(import.meta.url)(bundle);
  fs.writeFileSync(outFile, m.svg);
  console.log('wrote', outFile);
} finally {
  cleanup();
}
