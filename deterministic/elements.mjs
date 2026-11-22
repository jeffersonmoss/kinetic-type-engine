// Picture elements on the beat (generic engine mechanism, 22 November 2026).
// An element is an image (an SVG, or layers of SVGs composed on one canvas) standing for what is sung. It appears either
// in place of a word ("replace": it inherits the word's entrance, timing and reveal) or next to a word as an example of
// it ("beside"). A set lays any number of items over a base element, popping across the free beats in groups chosen by
// the scene; one item per beat is the special case. Elements may be placed in a screen slot (a rectangle of the frame
// at a given camera pose), carry opacity keys and leave with an exit slide. Nothing here knows about any particular
// video: every file, layer, beat, grouping, slot and timing comes from the video's own code.
import fs from 'node:fs';
import path from 'node:path';
import './interp.js';

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const ASPECT = 16 / 9, FRAME_H = 720, HALF_W = (FRAME_H * ASPECT) / 2, HALF_H = FRAME_H / 2;
// The viewer's pop: 1.1x at `on`, settling to full size two frames later (viewer.html stampScale). A pop that must
// arrive on a beat starts this many frames before it.
export const STAMP_SETTLE_FRAMES = 2;

// ---------- grouping ----------
// Split n items across the free beats. `grouping` is an explicit list of sizes (summing to n), or 'auto':
// one item per beat while beats last; otherwise sizes as even as possible, larger groups first.
export function groupAcrossBeats(n, beatCount, grouping = 'auto') {
  if (Array.isArray(grouping)) {
    if (grouping.reduce((a, b) => a + b, 0) !== n) throw Error(`grouping ${grouping} does not cover ${n} items`);
    if (grouping.length > beatCount) throw Error(`grouping needs ${grouping.length} beats, ${beatCount} free`);
    return grouping;
  }
  if (beatCount <= 0) throw Error('no free beats');
  const k = Math.min(n, beatCount), base = Math.floor(n / k), extra = n % k;
  return Array.from({ length: k }, (_, i) => base + (i < extra ? 1 : 0));
}

// ---------- SVG helpers ----------
export function svgViewBox(svg) {
  const m = svg.match(/viewBox="\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)\s*"/);
  if (!m) throw Error('SVG has no viewBox');
  return { x: +m[1], y: +m[2], w: +m[3], h: +m[4] };
}
// Balanced extent of the element carrying id="ID".
function elementSpan(svg, id) {
  const esc = id.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
  const m = new RegExp(`<([a-zA-Z]+)\\b[^>]*\\bid="${esc}"[^>]*>`).exec(svg);
  if (!m) return null;
  const tag = m[1], start = m.index;
  if (m[0].endsWith('/>')) return [start, start + m[0].length];
  let depth = 0, t;
  const re = new RegExp(`<${tag}\\b[^>]*?(/?)>|</${tag}>`, 'g');
  re.lastIndex = start;
  while ((t = re.exec(svg))) {
    if (t[0].startsWith('</')) { depth--; if (depth === 0) return [start, re.lastIndex]; }
    else if (t[1] !== '/') depth++;
  }
  throw Error(`unbalanced <${tag} id="${id}">`);
}
export const svgHasId = (svg, id) => !!elementSpan(svg, id);
const svgInner = svg => svg.replace(/^[\s\S]*?<svg\b[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const svgDefs = svg => (svg.match(/<defs\b[\s\S]*?<\/defs>/g) ?? []).join('\n');
const stripDefs = s => s.replace(/<defs\b[\s\S]*?<\/defs>/g, '').replace(/<title\b[\s\S]*?<\/title>/g, '');
// Keep only the named layers, or drop the named layers. A kept layer must not depend on an ancestor's transform.
export function svgLayer(svg, { only = null, drop = [] } = {}) {
  let out = svg;
  for (const id of drop) { const sp = elementSpan(out, id); if (sp) out = out.slice(0, sp[0]) + out.slice(sp[1]); }
  if (!only) return out;
  const head = out.match(/^[\s\S]*?<svg\b[^>]*>/)[0].replace(/^<\?xml[^>]*>\s*/, '');
  const parts = only.map(id => { const sp = elementSpan(out, id); if (!sp) throw Error(`layer ${id} not found`); return out.slice(sp[0], sp[1]); });
  return `${head}\n${svgDefs(out)}\n${parts.join('\n')}\n</svg>`;
}
// Rename every id in an SVG fragment (and its references) so pieces from different files cannot collide.
function prefixIds(text, p) {
  if (!p) return text;
  return text.replace(/\bid="([^"]+)"/g, `id="${p}$1"`).replace(/url\(#([^)]+)\)/g, `url(#${p}$1)`).replace(/href="#([^"]+)"/g, `href="#${p}$1"`);
}
function anchorRect(svg, id) {
  const sp = elementSpan(svg, id);
  if (!sp) return null;
  const tag = svg.slice(sp[0], sp[1]);
  const num = k => { const m = tag.match(new RegExp(`\\s${k}="([-\\d.]+)"`)); return m ? +m[1] : 0; };
  const rot = tag.match(/rotate\(\s*([-\d.]+)/);
  return { cx: num('x') + num('width') / 2, cy: num('y') + num('height') / 2, w: num('width'), h: num('height'), rotate: rot ? +rot[1] : 0 };
}
// The translate() on a layer's own opening tag: where the layer's local origin sits on its canvas.
function layerOrigin(part) {
  const m = part.match(/^<[^>]*transform="translate\(\s*([-\d.]+)[\s,]+([-\d.]+)\s*\)(?:\s*rotate\(\s*([-\d.]+)\s*\))?/);
  return m ? { x: +m[1], y: +m[2], rotate: m[3] ? +m[3] : 0 } : null;
}
export const svgDataUrl = svg => `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;

// ---------- art: pieces composed on one canvas ----------
// A piece is a list of fallback sources; the first one that can be used wins. Source forms:
//   { file, only?: [id or [alternative ids]], drop?: [ids] }   layers of a file drawn on the same canvas as the base
//   { file, only?, anchor: 'anchor-id', scale?, widthScale? }   moved so its own origin lands on the base's anchor rect (widthScale multiplies a whole file's anchor-width size)
//   { file, at: [x, y], width, rotate? }                        a whole file placed on the base canvas
export function resolvePiece(sources, artDir, baseSvg = null) {
  const tried = [];
  for (const src of sources) {
    const file = path.join(artDir, src.file);
    if (!fs.existsSync(file)) { tried.push(`${src.file}: missing`); continue; }
    let svg = fs.readFileSync(file, 'utf8');
    if (src.only) {
      const found = [].concat(src.only).map(alts => [].concat(alts).find(id => svgHasId(svg, id)));
      if (found.some(x => !x)) { tried.push(`${src.file}: layer ${[].concat(src.only).flat().join('/')} missing`); continue; }
      svg = svgLayer(svg, { only: found });
    }
    if (src.drop) svg = svgLayer(svg, { drop: [].concat(src.drop) });
    let body = stripDefs(svgInner(svg));
    if (src.anchor) {
      const a = baseSvg && anchorRect(baseSvg, src.anchor);
      if (!a) { tried.push(`${src.file}: base has no ${src.anchor}`); continue; }
      // A layer moves by its own origin (its translate); a whole file is centred on the anchor and sized to its width.
      const vb = svgViewBox(svg);
      const o = src.only ? (layerOrigin(body.trim()) ?? { x: 0, y: 0, rotate: 0 }) : { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2, rotate: 0 };
      const k = src.scale ?? (src.only ? 1 : (a.w / vb.w) * (src.widthScale ?? 1));
      body = `<g transform="translate(${a.cx} ${a.cy}) rotate(${a.rotate - o.rotate}) scale(${k}) translate(${-o.x} ${-o.y})">${body}</g>`;
    } else if (src.at) {
      const gv = svgViewBox(svg), k = src.width / gv.w;
      body = `<g transform="translate(${src.at[0]} ${src.at[1]}) rotate(${src.rotate ?? 0}) scale(${k}) translate(${-(gv.x + gv.w / 2)} ${-(gv.y + gv.h / 2)})">${body}</g>`;
    }
    return { file: src.file, source: src, viewBox: svgViewBox(svg), defs: svgDefs(svg), body, tried };
  }
  throw Error(`no art available: ${tried.join('; ')}`);
}
// Compose a base piece and layer pieces, then turn the canvas by a multiple of 90 degrees (clockwise positive).
export function composeArt(base, layers = [], rotate = 0) {
  const vb = base.viewBox;
  const defs = [base.defs], bodies = [base.body];
  layers.forEach((L, i) => {
    const p = L.file !== base.file ? `el${i}-` : '';
    if (p || !defs.includes(L.defs)) defs.push(prefixIds(L.defs, p));
    bodies.push(prefixIds(L.body, p));
  });
  const r = ((rotate % 360) + 360) % 360;
  if (r % 90) throw Error('element rotation must be a multiple of 90 degrees');
  const [W, H] = r % 180 ? [vb.h, vb.w] : [vb.w, vb.h];
  const turn = { 0: '', 90: `translate(${vb.h} 0) rotate(90)`, 180: `translate(${vb.w} ${vb.h}) rotate(180)`, 270: `translate(0 ${vb.w}) rotate(-90)` }[r];
  const inner = `<g transform="${turn} translate(${-vb.x} ${-vb.y})">${bodies.join('\n')}</g>`;
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">\n${defs.join('\n')}\n${inner}\n</svg>`, w: W, h: H, turn: r };
}
// A normalised box [x0, y0, x1, y1] (y down) on the unturned canvas, expressed on the turned canvas.
export function turnBox(b, r) {
  const [x0, y0, x1, y1] = b;
  return { 0: b, 90: [1 - y1, x0, 1 - y0, x1], 180: [1 - x1, 1 - y1, 1 - x0, 1 - y0], 270: [y0, 1 - x1, y1, 1 - x0] }[((r % 360) + 360) % 360];
}

// ---------- geometry ----------
export function readCorners(el) {
  const rb = el.read_box ?? [0, 0, 1, 1];
  return [[rb[0], rb[1]], [rb[2], rb[1]], [rb[2], rb[3]], [rb[0], rb[3]]].map(([x, y]) =>
    add(el.C, add(mul(el.R, (x - 0.5) * el.w), mul(el.U, (0.5 - y) * el.h))));
}
function inFrameShare(pts, pose, vfov) {
  const I = globalThis.KT_INTERP;
  let n = 0, ins = 0;
  const [a, b, , d] = pts;
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
    const p = add(a, add(mul(sub(b, a), i / 4), mul(sub(d, a), j / 4)));
    const q = I.project(p, pose, vfov); n++;
    if (q && Math.abs(q.x) <= 1.0001 && Math.abs(q.y) <= 1.0001) ins++;
  }
  return ins / n;
}
// World point where the screen point (x, y) of `pose` meets the plane through P0 with normal n.
function screenToPlane(x, y, pose, vfov, P0, n) {
  const tv = Math.tan((vfov * Math.PI) / 360);
  const dir = add(mul(pose.N, -1), add(mul(pose.R, x * tv * ASPECT), mul(pose.U, y * tv)));
  const t = dot(sub(P0, pose.position), n) / dot(dir, n);
  if (!(t > 0)) throw Error('slot is not on the plane in front of the camera');
  return add(pose.position, mul(dir, t));
}
// Place an element (canvas art.w x art.h, read box rb) so that its read box fits inside the screen rectangle
// slot = {frame, x: [x0, x1], y: [y0, y1], align: [ax, ay]} (frame units -1..1, y up) on the plane given.
function placeInSlot(slot, art, rb, plane, scene) {
  const I = globalThis.KT_INTERP, vfov = scene.meta.vfov;
  const pose = I.poseAt(scene.cams, slot.frame);
  if (dot(pose.R, plane.R) < 0.9 || dot(pose.U, plane.U) < 0.9) throw Error(`slot plane is not square to the camera at frame ${slot.frame}`);
  const rbW = (rb[2] - rb[0]) * art.w, rbH = (rb[3] - rb[1]) * art.h;
  const slotW = slot.x[1] - slot.x[0], slotH = slot.y[1] - slot.y[0];
  const hpx = Math.min(slotH * HALF_H, (slotW * HALF_W * rbH) / rbW), wpx = (hpx * rbW) / rbH;
  const wN = wpx / HALF_W, hN = hpx / HALF_H;
  const [ax, ay] = slot.align ?? [0.5, 0.5];
  const cx = slot.x[0] + wN / 2 + ax * (slotW - wN), cy = slot.y[0] + hN / 2 + ay * (slotH - hN);
  const Pc = screenToPlane(cx, cy, pose, vfov, plane.P0, plane.N);
  const Pt = screenToPlane(cx, cy + hN / 2, pose, vfov, plane.P0, plane.N), Pb = screenToPlane(cx, cy - hN / 2, pose, vfov, plane.P0, plane.N);
  const s = Math.hypot(...sub(Pt, Pb)) / rbH;
  const w = art.w * s, h = art.h * s;
  const dx = ((rb[0] + rb[2]) / 2 - 0.5) * w, dy = ((rb[1] + rb[3]) / 2 - 0.5) * h;
  return { C: add(sub(Pc, mul(plane.R, dx)), mul(plane.U, dy)), w, h, screen: { x: [cx - wN / 2, cx + wN / 2], y: [cy - hN / 2, cy + hN / 2] } };
}

// ---------- tight composition ----------
// Defaults: keep this margin (times the neighbouring word's cap height) from every visible word; grow to at most
// TIGHT_MAX_GROW times the slot size and TIGHT_MAX_HEIGHT of the frame height; keep at least TIGHT_SHARE of the drawing in
// frame while growing.
export const TIGHT_MARGIN_CAPS = 0.35, TIGHT_MAX_GROW = 2.5, TIGHT_MAX_HEIGHT = 0.8, TIGHT_SHARE = 0.9;
// The check flags an element less than CHECK_MIN_SHARE in frame when a tight placement could show more than that.
export const CHECK_MIN_SHARE = 0.7;
// Screen boxes (frame units, y up) of words visible on any of the frames, each grown by margin x its cap height.
export function obstacleBoxes(scene, frames, skip = new Set(), marginCaps = TIGHT_MARGIN_CAPS) {
  const I = globalThis.KT_INTERP, vfov = scene.meta.vfov, tv = Math.tan((vfov * Math.PI) / 360), out = [];
  const vis = (v, f) => (f >= v.on && (v.off == null || f < v.off)) || (v.reveal_on != null && f >= v.reveal_on);
  for (const f of frames) {
    const pose = I.poseAt(scene.cams, f);
    for (const w of scene.words) {
      if (skip.has(w.id) || w.replaced_by || !vis(w, f)) continue;
      const X = w.motion?.length ? I.wordXform(w, f) : p => p;
      const r = mul(w.R, w.w / 2), u = mul(w.U, w.h / 2);
      const q = [add(add(w.C, r), u), add(sub(w.C, r), u), sub(sub(w.C, r), u), sub(add(w.C, r), u)].map(p => I.project(X(p), pose, vfov));
      if (q.some(x => !x)) continue;
      const b = { id: w.id, x0: Math.min(...q.map(p => p.x)), x1: Math.max(...q.map(p => p.x)), y0: Math.min(...q.map(p => p.y)), y1: Math.max(...q.map(p => p.y)) };
      if (b.x1 < -1 || b.x0 > 1 || b.y1 < -1 || b.y0 > 1) continue;
      const depth = q.reduce((a, p) => a + p.depth, 0) / 4, my = (marginCaps * w.cap) / (depth * tv), mx = my / ASPECT;
      out.push({ id: w.id, x0: b.x0 - mx, x1: b.x1 + mx, y0: b.y0 - my, y1: b.y1 + my });
    }
  }
  return out;
}
// Tight placement for an element whose `bleed` edge (left or right of the turned canvas) is a cut meant to run off the
// frame. The drawing (from the read box's far edge to the cut, across the read box's height) slides toward the empty
// space and grows until it is a margin from the nearest word, with the cut kept at or beyond the frame edge. Choice:
// the largest size (>= the slot size, capped) that keeps TIGHT_SHARE of the drawing in frame; if none does, the
// placement with the most of the drawing in frame. Returns the read box's screen rectangle and the drawing's share.
export function tightRect({ art, rb, bleed, sMinPx, obstacles, prefY = 0 }) {
  if (bleed !== 'right' && bleed !== 'left') throw Error('tight composition supports a left or right bleed edge');
  const sgn = bleed === 'right' ? 1 : -1;
  // Work as if the bleed were on the right: mirror x for a left bleed.
  const obs = obstacles.map(o => (sgn > 0 ? o : { ...o, x0: -o.x1, x1: -o.x0 }));
  const near = sgn > 0 ? rb[0] : 1 - rb[2];            // far edge of the drawing from the cut, as a canvas fraction
  const rbWfrac = rb[2] - rb[0], rbHfrac = rb[3] - rb[1];
  const len = (1 - near) * art.w, rbW = rbWfrac * art.w, rbH = rbHfrac * art.h; // art units
  const sMax = Math.min(TIGHT_MAX_GROW * sMinPx, (TIGHT_MAX_HEIGHT * 2 * HALF_H) / rbH);
  let best = null;
  for (let i = 0; i <= 30; i++) {
    const sp = sMinPx + ((Math.max(sMax, sMinPx) - sMinPx) * i) / 30;     // px per art unit
    const hN = (rbH * sp) / HALF_H, lenN = (len * sp) / HALF_W;
    for (let yc = -1 + hN / 2 + 0.02; yc <= 1 - hN / 2 - 0.02 + 1e-9; yc += 0.02) {
      const y0 = yc - hN / 2, y1 = yc + hN / 2;
      const band = obs.filter(o => o.y1 > y0 && o.y0 < y1);
      // The drawing spans [xf, frame edge]: every word in its band must lie wholly left of xf; the cut (xf + lenN)
      // stays at or beyond the edge; the read box must fit in frame.
      const xf = Math.max(1 - lenN, -0.98, ...band.map(o => o.x1));
      if (xf + (rbW * sp) / HALF_W > 0.995) continue;
      const share = Math.min(1, (1 - xf) / lenN);
      const cand = { sp, xf, yc, share };
      const eq = (a, b) => Math.abs(a - b) < 0.02; // shares this close count as equal; then prefer the slot's height
      const better = !best
        || (share >= TIGHT_SHARE) !== (best.share >= TIGHT_SHARE) ? (!best || share >= TIGHT_SHARE)
        : share >= TIGHT_SHARE ? (sp > best.sp + 1e-9 || (Math.abs(sp - best.sp) < 1e-9 && (share > best.share + 1e-9 || (Math.abs(share - best.share) < 1e-9 && Math.abs(yc - prefY) < Math.abs(best.yc - prefY)))))
        : (eq(share, best.share) ? (sp > best.sp + 1e-9 || (Math.abs(sp - best.sp) < 1e-9 && Math.abs(yc - prefY) < Math.abs(best.yc - prefY))) : share > best.share);
      if (better) best = cand;
    }
  }
  if (!best) return null;
  const rbWN = (rbW * best.sp) / HALF_W, rbHN = (rbH * best.sp) / HALF_H;
  const x0 = best.xf; // the read box starts at the drawing's far edge (the fingertips)
  let rect = { x: [x0, x0 + rbWN], y: [best.yc - rbHN / 2, best.yc + rbHN / 2] };
  if (sgn < 0) rect = { x: [-rect.x[1], -rect.x[0]], y: rect.y };
  return { rect, share: best.share, grow: best.sp / sMinPx, px: rbH * best.sp };
}

const sungOrder = scene => [...scene.words].filter(w => !w.reveal_copy_of && !w.echo).sort((a, b) => Number(a.id.replace(/\D/g, '')) - Number(b.id.replace(/\D/g, '')));
export function findWord(scene, ref) {
  const w = sungOrder(scene).filter(x => x.text === ref.text)[(ref.n ?? 1) - 1];
  if (!w) throw Error(`word ${ref.text} #${ref.n ?? 1} not in scene`);
  return w;
}

// Hold the reveal (and every camera key from its start on) back so it begins at `frame`. Frames before the old
// start are untouched; the clip grows by the same amount.
export function holdRevealUntil(scene, frame, log = []) {
  const rev = scene.cams.find(c => c.kind === 'reveal');
  if (!rev || frame <= rev.f0) return 0;
  const old = rev.f0, delta = frame - old;
  for (const c of scene.cams) if (c.f0 >= old) { c.f0 += delta; c.f1 += delta; }
  for (const v of [...scene.plaques, ...scene.words, ...(scene.elements ?? [])]) {
    if (v.reveal_on != null) v.reveal_on += delta;
    if (v.off != null && v.off >= old) v.off += delta;
  }
  scene.meta.frames += delta; scene.end = +(scene.end + delta / scene.meta.fps).toFixed(4);
  log.push(`reveal held back ${delta} frames (${old} -> ${frame}); clip now ${scene.end} s, ${scene.meta.frames} frames`);
  return delta;
}

// Whole art box of an element (all four canvas corners), posed at frame f.
function artCorners(el) {
  const r = mul(el.R, el.w / 2), u = mul(el.U, el.h / 2);
  return [add(add(el.C, mul(r, -1)), u), add(add(el.C, r), u), add(sub(el.C, u), r), sub(sub(el.C, u), r)];
}
const posedAt = (el, f, pts) => { const X = el.motion && el.motion.length ? globalThis.KT_INTERP.wordXform(el, f) : (p => p); return pts.map(X); };
function boxInFrame(pts, pose, vfov) {
  const I = globalThis.KT_INTERP;
  const q = pts.map(p => I.project(p, pose, vfov));
  if (q.every(x => !x)) return false;
  if (q.some(x => !x)) return true; // straddles the camera plane: treat as possibly in frame
  const xs = q.map(p => p.x), ys = q.map(p => p.y);
  return Math.max(...xs) > -1 && Math.min(...xs) < 1 && Math.max(...ys) > -1 && Math.min(...ys) < 1;
}
// One frame of an element: is any of its art in frame, does a cut edge of the art show inside the frame, and is its read
// box drawn partly behind a visible panel (which would give the invisible panels away)?
export function elementFrameState(el, scene, f) {
  const I = globalThis.KT_INTERP, vfov = scene.meta.vfov, pose = I.poseAt(scene.cams, f);
  const vis = (v, g) => (g >= v.on && (v.off == null || g < v.off)) || (v.reveal_on != null && g >= v.reveal_on);
  const A = posedAt(el, f, artCorners(el));
  const inFrame = boxInFrame(A, pose, vfov);
  const edgeIdx = { top: [0, 1], right: [1, 2], bottom: [3, 2], left: [0, 3] };
  let cut = false;
  for (const c of el.cut_edges ?? []) {
    const [i, j] = edgeIdx[c];
    for (let k = 0; k <= 10 && !cut; k++) {
      const q = I.project(add(A[i], mul(sub(A[j], A[i]), k / 10)), pose, vfov);
      if (q && Math.abs(q.x) < 0.995 && Math.abs(q.y) < 0.995) cut = true;
    }
  }
  const R = posedAt(el, f, readCorners(el));
  let shown = 0, hidden = 0;
  for (let a = 0; a <= 4; a++) for (let b = 0; b <= 4; b++) {
    const S = add(R[0], add(mul(sub(R[1], R[0]), a / 4), mul(sub(R[3], R[0]), b / 4)));
    const q = I.project(S, pose, vfov);
    if (!q || Math.abs(q.x) > 1 || Math.abs(q.y) > 1) continue;
    const d = sub(S, pose.position);
    const blocked = scene.plaques.some(p => {
      if (p.id === el.plaque || p.surface !== 'panel' || !vis(p, f)) return false;
      const den = dot(d, p.N); if (Math.abs(den) < 1e-9) return false;
      const t = dot(sub(p.C, pose.position), p.N) / den; if (!(t > 0 && t < 0.999)) return false;
      const H = sub(add(pose.position, mul(d, t)), p.C), m = Math.max(150, 0.3 * Math.min(p.w, p.h)); // viewer's panel growth
      return Math.abs(dot(H, p.R)) < p.w / 2 + m && Math.abs(dot(H, p.U)) < p.h / 2 + m;
    });
    if (blocked) hidden++; else shown++;
  }
  return { inFrame, cut, occluded: hidden > 0 && shown > 0 };
}
// Hide frame: after the element has been seen cleanly, the first frame at which it is wholly out of frame, shows a cut
// edge, or is partly behind a panel (it is leaving the shot). null if that never happens before `off`.
export function leavesFrameAt(el, scene) {
  const end = Math.min(el.off ?? scene.meta.frames, scene.meta.frames);
  let seen = false;
  for (let f = el.on; f < end; f++) {
    const st = elementFrameState(el, scene, f);
    const clean = st.inFrame && !st.cut && !st.occluded;
    if (clean) seen = true; else if (seen) return f;
  }
  return null;
}

// Apply a video's element plan to a built scene. Returns { scene, log }.
// plan = { artDir, holdRevealUntil?, elements: [...], sets: [...] }; the video's own script shows every field in use.
export function applyElements(scene, plan) {
  const I = globalThis.KT_INTERP;
  const fps = scene.meta.fps, vfov = scene.meta.vfov, zStep = 0.2;
  const log = [];
  const out = structuredClone(scene);
  out.elements = out.elements ?? [];
  if (plan.holdRevealUntil != null) holdRevealUntil(out, plan.holdRevealUntil, log);
  const byId = new Map(), specById = new Map();
  const note = (id, p) => { if (p.tried.length) log.push(`${id}: used ${p.file} (${p.tried.join('; ')})`); };

  for (const spec of plan.elements ?? []) {
    const base = resolvePiece(spec.art, plan.artDir);
    note(spec.id, base);
    const baseSvg = fs.readFileSync(path.join(plan.artDir, base.file), 'utf8');
    const layers = (spec.layers ?? []).map(L => { const p = resolvePiece(L, plan.artDir, baseSvg); note(spec.id, p); return p; });
    const art = composeArt(base, layers, spec.rotate ?? 0);
    const rb = turnBox(spec.read_box ?? [0, 0, 1, 1], art.turn);
    const w = findWord(out, spec.replace ?? spec.beside);
    const plane = { P0: add(w.C, mul(w.N, zStep)), R: w.R, U: w.U, N: w.N };
    let place;
    if (spec.slot) {
      place = placeInSlot(spec.slot, art, rb, plane, out);
      // Tight composition (default for an element with a cut edge on its left or right): slide toward the empty space
      // and grow until it is a margin from the nearest word, keeping the cut beyond the frame edge.
      const bleed = [].concat(spec.cut ?? []).find(c => c === 'left' || c === 'right');
      if (bleed && spec.tight !== false) {
        const sMinPx = ((place.screen.y[1] - place.screen.y[0]) * HALF_H) / ((rb[3] - rb[1]) * art.h);
        const k = spec.keep_clear?.frames ?? [spec.slot.frame, spec.slot.frame];
        const frames = []; for (let f = k[0]; f <= k[1]; f++) frames.push(f);
        const obstacles = obstacleBoxes(out, frames, new Set(spec.replace ? [w.id] : []));
        const t = tightRect({ art, rb, bleed, sMinPx, obstacles, prefY: (place.screen.y[0] + place.screen.y[1]) / 2 });
        if (t) {
          place = placeInSlot({ frame: spec.slot.frame, x: t.rect.x, y: t.rect.y, align: [0.5, 0.5] }, art, rb, plane, out);
          log.push(`${spec.id}: tight composition, read box x ${t.rect.x.map(v => v.toFixed(2)).join(' to ')}, y ${t.rect.y.map(v => v.toFixed(2)).join(' to ')}, ${t.grow.toFixed(2)}x the slot size, ${(t.share * 100).toFixed(0)}% of the drawing in frame`);
        } else log.push(`${spec.id}: tight composition found no room; kept the slot placement`);
      }
    }
    else {
      const s = Math.min(w.w / ((rb[2] - rb[0]) * art.w), w.h / ((rb[3] - rb[1]) * art.h)) * (spec.scale ?? 1);
      const ww = art.w * s, hh = art.h * s, dx = ((rb[0] + rb[2]) / 2 - 0.5) * ww, dy = ((rb[1] + rb[3]) / 2 - 0.5) * hh;
      place = { C: add(sub(plane.P0, mul(w.R, dx)), mul(w.U, dy)), w: ww, h: hh };
    }
    const el = {
      id: spec.id, kind: 'element', src: svgDataUrl(art.svg), art_w: art.w, art_h: art.h, read_box: rb,
      min_read_px: spec.min_read_px ?? 65, plaque: w.plaque, C: place.C, R: w.R, U: w.U, N: w.N, w: place.w, h: place.h,
      art_used: [base.file, ...layers.map(l => l.file)],
      ...(spec.slot ? { slot: { ...spec.slot, read_screen: place.screen } } : {}),
    };
    if (spec.replace) {
      // In place of the word: inherits its entrance (motion, clips), timing and reveal.
      Object.assign(el, { on: w.on, stamp: w.stamp, off: w.off, reveal_on: spec.reveal ? w.reveal_on : null, reveal_stamp: w.reveal_stamp, replaces: w.id,
        motion: structuredClone(w.motion ?? []), clip: structuredClone(w.clip ?? []) });
      w.replaced_by = spec.id;
      log.push(`${spec.id} replaces ${w.id} ${w.text}: on ${el.on}, off ${el.off}, reveal_on ${el.reveal_on}`);
    } else {
      const on = spec.on != null ? (typeof spec.on === 'number' ? spec.on : findWord(out, spec.on).on) : w.on;
      Object.assign(el, { on, stamp: true, off: w.off, reveal_on: spec.reveal ? w.reveal_on : null, reveal_stamp: w.reveal_stamp, of: w.id, motion: [], clip: [] });
      log.push(`${spec.id} beside ${w.id} ${w.text}: on ${on}`);
    }
    if (spec.exit) {
      // Leave by sliding off the frame edge in the given screen direction; it does not come back for the reveal.
      const pose = I.poseAt(out.cams, spec.exit.f0), toward = spec.exit.toward ?? 'right';
      const horiz = toward === 'right' || toward === 'left';
      const dir = { right: pose.R, left: mul(pose.R, -1), up: pose.U, down: mul(pose.U, -1) }[toward];
      const depth = -dot(sub(el.C, pose.position), pose.N), tv = Math.tan((vfov * Math.PI) / 360);
      const dist = (horiz ? 2 * tv * ASPECT : 2 * tv) * depth + Math.max(el.w, el.h);
      el.motion.push({ f0: spec.exit.f0, f1: spec.exit.f1, kind: 'shift', from: [0, 0, 0], to: mul(dir, dist), ease: { a: 3, b: 1.5, x0: 0.5 } });
      el.off = spec.exit.f1; el.reveal_on = null;
      log.push(`${spec.id} exits ${toward} over frames ${spec.exit.f0}-${spec.exit.f1 - 1}; gone from frame ${spec.exit.f1}`);
    }
    if (spec.keep_clear) el.keep_clear = spec.keep_clear;
    if (spec.cut) el.cut_edges = [].concat(spec.cut);
    // Default: once the element has been seen and then leaves the frame, it is hidden for good (and it is left out of
    // the reveal unless spec.reveal). spec.stay_after_leaving keeps it for a later shot that is meant to show it.
    if (!spec.stay_after_leaving) {
      const left = leavesFrameAt(el, out);
      if (left != null && (el.off == null || left < el.off)) { el.off = left; log.push(`${spec.id} hidden from ${left}, the first frame it starts to leave the shot (out of frame, cut edge showing or behind a panel)`); }
    }
    out.elements.push(el); byId.set(el.id, el); specById.set(el.id, spec);
  }

  for (const set of plan.sets ?? []) {
    // Items laid over a base element (same canvas, same turn), popping across beats in groups.
    const baseEl = byId.get(set.over), baseSpec = specById.get(set.over);
    if (!baseEl) throw Error(`set over unknown element ${set.over}`);
    const basePiece = resolvePiece(baseSpec.art, plan.artDir);
    const baseSvg = fs.readFileSync(path.join(plan.artDir, basePiece.file), 'utf8');
    // Beats in seconds. arrive_on_beat: the pop reaches full size on the beat's frame (it starts STAMP_SETTLE_FRAMES
    // early); otherwise it starts lead_frames early.
    const lead = set.arrive_on_beat ? STAMP_SETTLE_FRAMES : (set.lead_frames ?? 0);
    const beats = set.beats.map(b => (typeof b === 'number' ? Math.round(b * fps) - lead : findWord(out, b).on));
    const sizes = groupAcrossBeats(set.items.length, beats.length, set.grouping ?? 'auto');
    let k = 0;
    sizes.forEach((n, bi) => {
      for (let j = 0; j < n; j++, k++) {
        const item = set.items[k];
        const piece = resolvePiece(item.art, plan.artDir, baseSvg);
        note(item.id, piece);
        const art = composeArt({ file: basePiece.file, viewBox: basePiece.viewBox, defs: '', body: '' }, [piece], baseSpec.rotate ?? 0);
        const el = {
          id: item.id, kind: 'element', src: svgDataUrl(art.svg), art_w: art.w, art_h: art.h,
          read_box: item.read_box ? turnBox(item.read_box, art.turn) : baseEl.read_box, art_used: [piece.file],
          min_read_px: item.min_read_px ?? 0, set_item: true, over: baseEl.id, plaque: baseEl.plaque,
          C: add(baseEl.C, mul(baseEl.N, zStep * (k + 1))), R: baseEl.R, U: baseEl.U, N: baseEl.N, w: baseEl.w, h: baseEl.h,
          on: beats[bi], stamp: true, off: baseEl.off, reveal_on: baseEl.reveal_on, reveal_stamp: baseEl.reveal_stamp,
          motion: structuredClone(baseEl.motion ?? []), clip: [],
          ...(item.opacity ? { opacity: item.opacity } : {}),
        };
        out.elements.push(el); byId.set(el.id, el);
        log.push(`${item.id} pops onto ${baseEl.id} at frame ${beats[bi]} (beat ${bi + 1}, group of ${n})${item.opacity ? `; opacity keys ${JSON.stringify(item.opacity)}` : ''}`);
      }
    });
  }
  out.meta.elements_version = 1;
  return { scene: out, log };
}

// Step opacity: the value of the latest key at or before f (1 before the first key).
export function opacityAt(el, f) {
  let v = 1;
  for (const [kf, kv] of el.opacity ?? []) if (f >= kf) v = kv;
  return v;
}

// ---------- checks: the words' readability and no-flash rules, applied to each element's read box ----------
// A readable frame: visible, opacity >= 0.5, not moving, read box >= 90% in frame, facing within 40 degrees, read box at
// least min_read_px tall (set items: 0). Needs 15 readable frames and 8 still in a row before the reveal (or before it
// leaves); the first sighting must last 4 frames. keep_clear: during the listed frames no other visible word or element
// enters the strip from the element's read box to the named frame edge.
export function checkElements(scene) {
  const I = globalThis.KT_INTERP;
  const vfov = scene.meta.vfov;
  const rev = scene.cams.find(c => c.kind === 'reveal');
  const revealF0 = rev ? rev.f0 : scene.meta.frames;
  const failures = [], stats = {};
  const vis = (v, f) => (f >= v.on && (v.off == null || f < v.off)) || (v.reveal_on != null && f >= v.reveal_on);
  const cos40 = Math.cos((40 * Math.PI) / 180);
  const posed = (v, f, corners) => { const X = v.motion && v.motion.length ? I.wordXform(v, f) : (p => p); return corners.map(X); };
  const wordCorners = w => { const r = mul(w.R, w.w / 2), u = mul(w.U, w.h / 2); return [add(add(w.C, r), u), add(sub(w.C, r), u), sub(sub(w.C, r), u), sub(add(w.C, r), u)]; };
  const screenBox = (pts, pose) => { const q = pts.map(p => I.project(p, pose, vfov)); if (q.some(x => !x)) return null; const xs = q.map(p => p.x), ys = q.map(p => p.y); return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }; };
  for (const el of scene.elements ?? []) {
    let firstSeen = -1, firstRun = 0, firstOpen = true, readable = 0, still = 0, bestStill = 0;
    for (let f = el.on; f < revealF0; f++) {
      if (!vis(el, f)) break;
      const pose = I.poseAt(scene.cams, f);
      const pts = posed(el, f, readCorners(el));
      const box = screenBox(pts, pose);
      const seen = !!box && dot(el.N, sub(pose.position, el.C)) > 0 && box.x1 > -1 && box.x0 < 1 && box.y1 > -1 && box.y0 < 1 && opacityAt(el, f) >= 0.5;
      if (firstSeen < 0 && seen) firstSeen = f;
      if (firstSeen >= 0 && firstOpen) { if (seen) firstRun++; else firstOpen = false; }
      const moving = (el.motion ?? []).some(m => f >= m.f0 && f < m.f1);
      const px = box ? ((box.y1 - box.y0) / 2) * FRAME_H : 0;
      const ok = seen && !moving && inFrameShare(pts, pose, vfov) >= 0.9 && dot(el.N, pose.N) >= cos40 && px >= (el.min_read_px ?? 65);
      if (ok) {
        readable++;
        const prev = f > el.on ? I.poseAt(scene.cams, f - 1) : null;
        const same = prev && ['position', 'N', 'U'].every(k => prev[k].every((x, i) => Math.abs(x - pose[k][i]) < 1e-6));
        const prevOk = still > 0;
        still = same && prevOk ? still + 1 : 1; bestStill = Math.max(bestStill, still);
      } else still = 0;
    }
    stats[el.id] = { on: el.on, off: el.off, firstSeen, firstRun, readable, bestStill };
    if (firstSeen < 0) failures.push(`${el.id}: never seen before the reveal`);
    else if (firstRun < 4) failures.push(`${el.id}: first seen at ${firstSeen} for only ${firstRun} frames (flash)`);
    if (readable < 15 || bestStill < 8) failures.push(`${el.id}: ${readable} readable frames, ${bestStill} still in a row (needs 15 and 8)`);
    if (!el.set_item) {
      // Overlap with words on its plaque, in the plaque plane, while both are up (set items sit on their base by design).
      const loc = pts => pts.map(p => [dot(sub(p, el.C), el.R), dot(sub(p, el.C), el.U)]);
      const bb = pts => { const l = loc(pts); return { x0: Math.min(...l.map(t => t[0])), x1: Math.max(...l.map(t => t[0])), y0: Math.min(...l.map(t => t[1])), y1: Math.max(...l.map(t => t[1])) }; };
      const A = bb(readCorners(el));
      for (const w of scene.words) {
        if (w.plaque !== el.plaque || w.id === el.replaces || w.replaced_by) continue;
        const B = bb(wordCorners(w));
        const together = Math.max(el.on, w.on) < Math.min(el.off ?? Infinity, w.off ?? Infinity);
        if (together && A.x0 < B.x1 && A.x1 > B.x0 && A.y0 < B.y1 && A.y1 > B.y0) failures.push(`${el.id}: read box overlaps ${w.id} ${w.text}`);
      }
    }
    // Cut edges and occlusion on every frame the element is drawn before the reveal: a cut edge of the art may show
    // only beyond the frame edge, and the element may not be drawn partly behind a panel.
    {
      const cutHits = [], occHits = [];
      for (let f = el.on; f < Math.min(revealF0, el.off ?? revealF0); f++) {
        if (!vis(el, f)) continue;
        const st = elementFrameState(el, scene, f);
        if (st.cut) cutHits.push(f);
        if (st.occluded) occHits.push(f);
      }
      stats[el.id].cut_edge_frames = cutHits.length; stats[el.id].occluded_frames = occHits.length;
      if (cutHits.length) failures.push(`${el.id}: cut edge in frame on ${cutHits.length} frames (${cutHits[0]}-${cutHits.at(-1)})`);
      if (occHits.length) failures.push(`${el.id}: drawn partly behind a panel on ${occHits.length} frames (${occHits[0]}-${occHits.at(-1)})`);
    }
    // Wasted space: at the start of each still stretch, an element with a left or right cut that has less than
    // CHECK_MIN_SHARE of its drawing in frame is flagged when a tight placement there could show more than that.
    const bleed = (el.cut_edges ?? []).find(c => c === 'left' || c === 'right');
    if (bleed && !el.set_item) {
      const rb = el.read_box, lo = bleed === 'right' ? rb[0] : 0, hi = bleed === 'right' ? 1 : rb[2];
      const wasted = [];
      let shareMin = 1;
      // Every frame of the hold that starts at f (camera still, element up): words arriving later in the hold count.
      const holdFrames = f => {
        const fs = [f], p0 = I.poseAt(scene.cams, f);
        for (let g = f + 1; g < Math.min(revealF0, el.off ?? revealF0); g++) {
          const p = I.poseAt(scene.cams, g);
          if (!['position', 'N', 'U'].every(k => p[k].every((x, i) => Math.abs(x - p0[k][i]) < 1e-6))) break;
          fs.push(g);
        }
        return fs;
      };
      for (let f = el.on; f < Math.min(revealF0, el.off ?? revealF0); f++) {
        if (!vis(el, f)) continue;
        const pose = I.poseAt(scene.cams, f), prev = I.poseAt(scene.cams, f - 1);
        const still = ['position', 'N', 'U'].every(k => prev[k].every((x, i) => Math.abs(x - pose[k][i]) < 1e-6));
        const next = I.poseAt(scene.cams, f + 1);
        const stillNext = ['position', 'N', 'U'].every(k => next[k].every((x, i) => Math.abs(x - pose[k][i]) < 1e-6));
        if (still || !stillNext || (el.motion ?? []).some(m => f >= m.f0 && f < m.f1)) continue; // first frame of a hold
        const X = el.motion && el.motion.length ? I.wordXform(el, f) : (p => p);
        const at = (u, v) => X(add(el.C, add(mul(el.R, (u - 0.5) * el.w), mul(el.U, (0.5 - v) * el.h))));
        let n = 0, inn = 0;
        for (let a = 0; a <= 8; a++) for (let b = 0; b <= 2; b++) {
          const q = I.project(at(lo + ((hi - lo) * a) / 8, rb[1] + ((rb[3] - rb[1]) * b) / 2), pose, vfov); n++;
          if (q && Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1) inn++;
        }
        const share = inn / n; shareMin = Math.min(shareMin, share);
        if (share >= CHECK_MIN_SHARE) continue;
        const R = readCorners(el).map(X).map(p => I.project(p, pose, vfov));
        if (R.some(x => !x)) continue;
        const sMinPx = ((Math.max(...R.map(p => p.y)) - Math.min(...R.map(p => p.y))) * HALF_H) / ((rb[3] - rb[1]) * el.art_h);
        const t = tightRect({ art: { w: el.art_w, h: el.art_h }, rb, bleed, sMinPx, obstacles: obstacleBoxes(scene, holdFrames(f), new Set(el.replaces ? [el.replaces] : [])) });
        if (t && t.share >= CHECK_MIN_SHARE && t.share > share + 0.05) wasted.push(`frame ${f}: ${(share * 100).toFixed(0)}% in frame, ${(t.share * 100).toFixed(0)}% possible`);
      }
      stats[el.id].drawing_in_frame_min = +shareMin.toFixed(2);
      if (wasted.length) failures.push(`${el.id}: mostly off screen beside empty space (${wasted.join('; ')})`);
    }
    if (el.keep_clear) {
      // Keep a strip of the frame clear, from the read box to a frame edge, while the listed frames run.
      const { frames: [k0, k1], edge = 'right' } = el.keep_clear;
      const hits = [];
      for (let f = k0; f <= k1; f++) {
        const pose = I.poseAt(scene.cams, f);
        const A = screenBox(posed(el, f, readCorners(el)), pose);
        if (!A) continue;
        const strip = { x0: edge === 'left' ? -1 : A.x0, x1: edge === 'right' ? 1 : A.x1, y0: edge === 'down' ? -1 : A.y0, y1: edge === 'up' ? 1 : A.y1 };
        for (const o of [...scene.words, ...(scene.elements ?? [])]) {
          if (o === el || o.id === el.replaces || o.replaced_by || o.over === el.id || !vis(o, f)) continue;
          const B = screenBox(posed(o, f, o.kind === 'element' ? readCorners(o) : wordCorners(o)), pose);
          if (B && B.x0 < strip.x1 && B.x1 > strip.x0 && B.y0 < strip.y1 && B.y1 > strip.y0) hits.push(`${o.id} ${o.text ?? ''} at frame ${f}`);
        }
      }
      stats[el.id].keep_clear = { frames: [k0, k1], edge, intrusions: hits.length };
      if (hits.length) failures.push(`${el.id}: strip to the ${edge} edge not clear in ${hits.length} word-frames (first: ${hits[0]})`);
    }
  }
  return { pass: failures.length === 0, failures, stats };
}
