// Measures a video's display fonts in Chrome and writes its font metrics file (fonts/*.metrics.json), which both the
// validator (node) and the render (browser) read through configureEngine({metrics}).
// Why not @remotion/layout-utils measureText at render time: it needs the DOM, so the node validator would lay
// words out with different numbers than the render. Measuring once and checking the JSON in keeps both identical.
//
// The fonts spec is a JSON file {css, fonts: {key: {family, style, weight}}} (fonts/anton-dmserif-barlow.fonts.json is
// the first video's); the keys are the engine's font keys. The words file is any JSON with a `words` array of {text}
// (a songmap).
// Step 1 (any machine):   node tools/measure-fonts.mjs page <fonts spec.json> <words.json>
//   writes tools/measure-fonts.html (character set and the kerning pairs that occur in the lyrics).
// Step 2 (outside any sandbox; Chrome with a throwaway profile, network on for Google Fonts):
//   "<Chrome binary>" --headless=new --user-data-dir="$(mktemp -d)" --virtual-time-budget=20000 \
//     --dump-dom "file://$PWD/tools/measure-fonts.html" > /tmp/measure-fonts-dump.html
// Step 3:                 node tools/measure-fonts.mjs apply <fonts spec.json> /tmp/measure-fonts-dump.html <metrics.json>
//   checks the dump and writes the metrics file (measured: true), keeping its letter anatomy (`anchors`).
// Then run the validator again: row sizes and camera frames will shift slightly.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const [mode, specPath, a3, a4] = process.argv.slice(2);
if (!specPath) { console.error('usage: node tools/measure-fonts.mjs page <fonts spec.json> <words.json> | apply <fonts spec.json> <dumped html> <metrics.json>'); process.exit(2); }
const SPEC = JSON.parse(fs.readFileSync(path.resolve(specPath), 'utf8'));
const FONTS = SPEC.fonts;
const CSS = SPEC.css;

if (mode === 'page' && a3) {
  const map = JSON.parse(fs.readFileSync(path.resolve(a3), 'utf8'));
  const chars = new Set();
  for (let c = 32; c < 127; c++) chars.add(String.fromCharCode(c));
  for (const c of '‘’“”…é') chars.add(c);
  const pairs = new Set();
  for (const w of map.words) for (const form of [w.text, w.text.toUpperCase(), w.text.replace(/^"|"$/g, ''), w.text.toUpperCase().replace(/^"|"$/g, '')]) {
    const cs = [...form];
    for (const c of cs) chars.add(c);
    for (let k = 0; k + 1 < cs.length; k++) pairs.add(cs[k] + cs[k + 1]);
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>measure fonts</title>
<link rel="stylesheet" href="${CSS}"></head><body>
<pre id="metrics">PENDING</pre>
<script>
const FONTS = ${JSON.stringify(FONTS)};
const CHARS = ${JSON.stringify([...chars])};
const PAIRS = ${JSON.stringify([...pairs])};
const S = 1000;
(async () => {
  const out = {source: '', measured: true, fonts: {}};
  const ctx = document.createElement('canvas').getContext('2d');
  const errors = [];
  for (const [key, f] of Object.entries(FONTS)) {
    const spec = f.style + ' ' + f.weight + ' ' + S + 'px "' + f.family + '"';
    await document.fonts.load(spec, 'AHgjpqy');
    if (!document.fonts.check(spec, 'AHgjpqy')) { errors.push(key + ' did not load'); continue; }
    ctx.font = spec;
    const w = (s) => ctx.measureText(s).width / S;
    const adv = {}; for (const c of CHARS) adv[c] = +w(c).toFixed(4);
    const kern = {};
    for (const p of PAIRS) { const d = w(p) - w(p[0]) - w(p[1]); if (Math.abs(d) > 0.002) kern[p] = +d.toFixed(4); }
    const H = ctx.measureText('H'), D = ctx.measureText('gjpqy');
    const vals = Object.values(adv);
    out.fonts[key] = {cap: +(H.actualBoundingBoxAscent / S).toFixed(4), desc: +(D.actualBoundingBoxDescent / S).toFixed(4),
      space: adv[' '], fallback: +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(4), adv, kern};
  }
  out.source = 'measured in ' + navigator.userAgent.replace(/^.*(Chrome\\/[0-9.]+).*$/, '$1') + ' with canvas measureText at ' + S + ' px from Google Fonts';
  document.getElementById('metrics').textContent = errors.length ? 'ERROR ' + errors.join('; ') : JSON.stringify(out);
})().catch((e) => { document.getElementById('metrics').textContent = 'ERROR ' + e; });
</script></body></html>
`;
  fs.writeFileSync(path.join(here, 'measure-fonts.html'), html);
  console.log(`wrote tools/measure-fonts.html (${chars.size} characters, ${pairs.size} pairs)`);
} else if (mode === 'apply' && a3 && a4) {
  const dump = fs.readFileSync(a3, 'utf8');
  const m = dump.match(/<pre id="metrics">([\s\S]*?)<\/pre>/);
  if (!m) { console.error('no <pre id="metrics"> in the dump'); process.exit(1); }
  const text = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  if (!text.startsWith('{')) { console.error('page did not finish: ' + text.slice(0, 200)); process.exit(1); }
  const data = JSON.parse(text);
  for (const k of Object.keys(FONTS)) {
    const f = data.fonts[k];
    if (!f || !(f.cap > 0.4 && f.cap < 1.2) || !(f.adv.H > 0.1)) { console.error(`implausible metrics for ${k}`); process.exit(1); }
    console.log(`${k}: cap ${f.cap}, desc ${f.desc}, space ${f.space}, H ${f.adv.H}, ${Object.keys(f.kern).length} kerning pairs`);
  }
  // Keep the letter anatomy table (letter anchors): the dump only measures widths and heights.
  const metricsPath = path.resolve(a4);
  try { const old = JSON.parse(fs.readFileSync(metricsPath, 'utf8')); if (old.anchors && !data.anchors) data.anchors = old.anchors; } catch {}
  fs.writeFileSync(metricsPath, JSON.stringify(data, null, 1) + '\n');
  console.log('wrote ' + metricsPath + ' (' + data.source + ')');
} else {
  console.error('usage: node tools/measure-fonts.mjs page <fonts spec.json> <words.json> | apply <fonts spec.json> <dumped html> <metrics.json>');
  process.exit(2);
}
