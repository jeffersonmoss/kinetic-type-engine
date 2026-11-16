// Measures letter counters and the real ascender and descender of display fonts from their glyph outlines (rules 169
// and 191, rulings 194.1 and 194.11), and writes them into a font metrics file (fonts/*.metrics.json).
// No browser: it reads the TrueType files directly (cmap format 4, loca, glyf with simple and composite glyphs, hmtx).
//
// Usage:
//   node tools/measure-outlines.mjs <metrics.json> <key>=<font.ttf> [<key>=<font.ttf> ...]
// for example: fonts/anton-dmserif-barlow.metrics.json anton=Anton.ttf serif=DMSerifDisplay-Italic.ttf barlow=BarlowCondensed-Bold.ttf
// The keys are the engine's font keys (already in the metrics file); the files are the builds the render loads.
//
// For each letter and digit with an enclosed hole, the hole (a contour inside another contour) is written as a box
// [x0, y0, x1, y1] and as an outline (a closed polygon, quadratic curves flattened, written as "x,y x,y ..."), in the letter-box units that
// letters.ts uses: x as a fraction of the glyph's advance width, y as a fraction of the cap height measured down from
// the cap line (0 at the top of a capital, 1 on the baseline). A letter with two holes (B, 8, g) gets `counter` for the
// upper one and `counter2` for the lower. Ascender and descender are the highest and lowest ink of the lower case and
// punctuation, as fractions of the font size, so that rows of a wrapped block are set without touching.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const [metricsArg, ...fontArgs] = process.argv.slice(2);
const FONT_FILES = fontArgs.map((a) => { const k = a.indexOf('='); return k > 0 ? [a.slice(0, k), a.slice(k + 1)] : null; });
if (!metricsArg || !FONT_FILES.length || FONT_FILES.some((x) => !x)) {
  console.error('usage: node tools/measure-outlines.mjs <metrics.json> <key>=<font.ttf> [<key>=<font.ttf> ...]');
  process.exit(2);
}

const parseFont = (file) => {
  const buf = fs.readFileSync(file);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const u16 = (o) => dv.getUint16(o), i16 = (o) => dv.getInt16(o), u32 = (o) => dv.getUint32(o);
  const tables = {};
  const n = u16(4);
  for (let k = 0; k < n; k++) { const o = 12 + 16 * k; tables[buf.toString('latin1', o, o + 4)] = {off: u32(o + 8), len: u32(o + 12)}; }
  const head = tables.head.off;
  const upem = u16(head + 18);
  const locFmt = i16(head + 50);
  const numGlyphs = u16(tables.maxp.off + 4);
  const loca = [];
  for (let g = 0; g <= numGlyphs; g++) loca.push(locFmt === 0 ? u16(tables.loca.off + 2 * g) * 2 : u32(tables.loca.off + 4 * g));
  const numH = u16(tables.hhea.off + 34);
  const adv = (g) => u16(tables.hmtx.off + 4 * Math.min(g, numH - 1));
  // cmap format 4 (Windows Unicode BMP)
  const cmapOff = tables.cmap.off;
  let sub = -1;
  for (let k = 0; k < u16(cmapOff + 2); k++) {
    const o = cmapOff + 4 + 8 * k;
    const pid = u16(o), eid = u16(o + 2), so = u32(o + 4);
    if (u16(cmapOff + so) === 4 && (pid === 3 && eid === 1 || pid === 0)) { sub = cmapOff + so; break; }
  }
  const glyphOf = (code) => {
    const segX2 = u16(sub + 6);
    const ends = sub + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
    for (let s = 0; s < segX2 / 2; s++) {
      const end = u16(ends + 2 * s), start = u16(starts + 2 * s);
      if (code < start || code > end) continue;
      const delta = i16(deltas + 2 * s), ro = u16(ranges + 2 * s);
      if (ro === 0) return (code + delta) & 0xffff;
      const g = u16(ranges + 2 * s + ro + 2 * (code - start));
      return g === 0 ? 0 : (g + delta) & 0xffff;
    }
    return 0;
  };
  // glyph contours as point lists {x, y, on}
  const contoursOf = (g, depth = 0) => {
    const o = tables.glyf.off + loca[g];
    if (loca[g + 1] === loca[g] || depth > 4) return [];
    const nc = i16(o);
    if (nc < 0) {
      // composite: components with x, y offsets (scale ignored: none of the measured letters uses one)
      const out = [];
      let p = o + 10, more = true;
      while (more) {
        const flags = u16(p), gi = u16(p + 2); p += 4;
        let dx, dy;
        if (flags & 1) { dx = i16(p); dy = i16(p + 2); p += 4; } else { dx = dv.getInt8(p); dy = dv.getInt8(p + 1); p += 2; }
        if (flags & 8) p += 2; else if (flags & 0x40) p += 4; else if (flags & 0x80) p += 8;
        for (const c of contoursOf(gi, depth + 1)) out.push(c.map((q) => ({...q, x: q.x + dx, y: q.y + dy})));
        more = !!(flags & 0x20);
      }
      return out;
    }
    const endPts = [];
    for (let k = 0; k < nc; k++) endPts.push(u16(o + 10 + 2 * k));
    const nPts = nc ? endPts[nc - 1] + 1 : 0;
    let p = o + 10 + 2 * nc;
    p += 2 + u16(p); // instructions
    const flags = [];
    while (flags.length < nPts) { const f = buf[p++]; flags.push(f); if (f & 8) { let r = buf[p++]; while (r-- > 0) flags.push(f); } }
    const xs = [], ys = [];
    let v = 0;
    for (const f of flags) { if (f & 2) { const d = buf[p++]; v += f & 16 ? d : -d; } else if (!(f & 16)) { v += i16(p); p += 2; } xs.push(v); }
    v = 0;
    for (const f of flags) { if (f & 4) { const d = buf[p++]; v += f & 32 ? d : -d; } else if (!(f & 32)) { v += i16(p); p += 2; } ys.push(v); }
    const out = [];
    let s = 0;
    for (const e of endPts) { const c = []; for (let k = s; k <= e; k++) c.push({x: xs[k], y: ys[k], on: !!(flags[k] & 1)}); out.push(c); s = e + 1; }
    return out;
  };
  return {upem, glyphOf, adv, contoursOf};
};

/** Flattens a TrueType contour (on and off curve points) into a polygon. */
const flatten = (c) => {
  if (!c.length) return [];
  const pts = [];
  const n = c.length;
  // start on an on-curve point (or the midpoint of two off-curve points)
  let k0 = c.findIndex((q) => q.on);
  let start;
  if (k0 < 0) { start = {x: (c[0].x + c[1].x) / 2, y: (c[0].y + c[1].y) / 2}; k0 = 0; } else start = c[k0];
  pts.push({x: start.x, y: start.y});
  let prev = start, ctrl = null;
  for (let j = 1; j <= n; j++) {
    const q = c[(k0 + j) % n];
    if (q.on) {
      if (ctrl) { for (let s = 1; s <= 6; s++) { const t = s / 6; pts.push({x: (1 - t) ** 2 * prev.x + 2 * (1 - t) * t * ctrl.x + t * t * q.x, y: (1 - t) ** 2 * prev.y + 2 * (1 - t) * t * ctrl.y + t * t * q.y}); } ctrl = null; }
      else pts.push({x: q.x, y: q.y});
      prev = q;
    } else if (ctrl) {
      const mid = {x: (ctrl.x + q.x) / 2, y: (ctrl.y + q.y) / 2};
      for (let s = 1; s <= 6; s++) { const t = s / 6; pts.push({x: (1 - t) ** 2 * prev.x + 2 * (1 - t) * t * ctrl.x + t * t * mid.x, y: (1 - t) ** 2 * prev.y + 2 * (1 - t) * t * ctrl.y + t * t * mid.y}); }
      prev = mid; ctrl = q;
    } else ctrl = q;
  }
  if (ctrl) for (let s = 1; s <= 6; s++) { const t = s / 6; pts.push({x: (1 - t) ** 2 * prev.x + 2 * (1 - t) * t * ctrl.x + t * t * start.x, y: (1 - t) ** 2 * prev.y + 2 * (1 - t) * t * ctrl.y + t * t * start.y}); }
  return pts;
};
const inside = (p, poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
};
const bbox = (poly) => ({x0: Math.min(...poly.map((p) => p.x)), x1: Math.max(...poly.map((p) => p.x)), y0: Math.min(...poly.map((p) => p.y)), y1: Math.max(...poly.map((p) => p.y))});

const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'];
const r4 = (v) => Math.round(v * 10000) / 10000;
const measure = (file) => {
  const F = parseFont(file);
  const polysOf = (ch) => F.contoursOf(F.glyphOf(ch.codePointAt(0))).map(flatten).filter((p) => p.length > 2);
  const capTop = Math.max(...polysOf('H').flat().map((p) => p.y));
  const counters = {}, counter2 = {}, outlines = {}, outlines2 = {};
  for (const ch of LETTERS) {
    const g = F.glyphOf(ch.codePointAt(0));
    if (!g) continue;
    const adv = F.adv(g);
    const polys = polysOf(ch);
    // a hole is a contour inside an odd number of the others
    const holes = polys.filter((p, k) => polys.filter((q, j) => j !== k && inside(p[0], q)).length % 2 === 1);
    if (!holes.length) continue;
    holes.sort((a, b) => bbox(b).y1 - bbox(a).y1); // upper first (font y is up)
    const norm = (p) => ({x: r4(p.x / adv), y: r4((capTop - p.y) / capTop)});
    const box = (h) => { const b = bbox(h); return [r4(b.x0 / adv), r4((capTop - b.y1) / capTop), r4(b.x1 / adv), r4((capTop - b.y0) / capTop)]; };
    const thin = (h) => h.filter((_, k) => k % 2 === 0 || h.length < 40).map(norm).map((p) => `${p.x},${p.y}`).join(' ');
    counters[ch] = box(holes[0]); outlines[ch] = thin(holes[0]);
    if (holes[1]) { counter2[ch] = box(holes[1]); outlines2[ch] = thin(holes[1]); }
  }
  const inkOf = (chars) => polysOf(chars).flat();
  // (the curly quotes of DM Serif are composites with a 2 by 2 transform, which this reader does not apply)
  const ascChars = [...'bdfhklt\''];
  const descChars = [...'gjpqy,;Q'];
  const asc = Math.max(...ascChars.flatMap((c) => inkOf(c).map((p) => p.y)), capTop) / F.upem;
  const desc = -Math.min(...descChars.flatMap((c) => inkOf(c).map((p) => p.y)), 0) / F.upem;
  if (process.env.DEBUG_ASC) for (const c of ascChars) console.log(c, Math.max(...inkOf(c).map((p) => p.y)) / F.upem);
  return {counters, counter2, outlines, outlines2, asc: r4(asc), inkDesc: r4(desc), capMeasured: r4(capTop / F.upem)};
};

const out = path.resolve(metricsArg);
const M = JSON.parse(fs.readFileSync(out, 'utf8'));
M.anchors = M.anchors ?? {};
for (const [key, file] of FONT_FILES) {
  if (!M.fonts[key]) { console.error(`the metrics file has no font "${key}"`); process.exit(2); }
  const r = measure(file);
  const A = M.anchors[key] ?? {counters: {}, stem: {}, tail: {}, terminal: {}};
  A.counters = r.counters;
  A.counter2 = r.counter2;
  A.counterOutline = r.outlines;
  A.counter2Outline = r.outlines2;
  A.countersMeasured = `glyph outlines of ${path.basename(file)} (tools/measure-outlines.mjs)`;
  M.anchors[key] = A;
  M.fonts[key].asc = r.asc;
  M.fonts[key].inkDesc = r.inkDesc;
  console.log(`${key}: cap ${r.capMeasured} (json ${M.fonts[key].cap}), asc ${r.asc}, ink descender ${r.inkDesc}; counters ${Object.keys(r.counters).join('')}; O ${JSON.stringify(r.counters.O)}`);
}
fs.writeFileSync(out, JSON.stringify(M, null, 1) + '\n');
console.log(`wrote ${out}`);
